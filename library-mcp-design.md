# 图书馆访问 MCP 技术方案

## 1. 项目背景

### 问题
学校图书馆需要登录访问，导致 Claude Code 等 AI 工具只能从公开网站爬取文献，无法访问：
- 需要 Shibboleth/CARSI 认证的数据库
- 学校购买的付费资源（IEEE、Springer、CNKI 等）
- 需要多级跳转的访问流程

### 现有方案的局限
- **Playwright/Puppeteer MCP**：启动新浏览器，需要重新登录，无法复用 session
- **mcp-chrome**：通用浏览器控制，但每次都让 LLM 理解页面，速度慢（13-20秒/操作）

### 核心创新
**浏览器插件 + 规则引擎 + MCP**：
1. 复用用户已登录的浏览器 session
2. 规则化脚本执行，无需 LLM 理解页面（1秒/操作）
3. LLM 只负责论文摘要筛选，不处理网页操作

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│  用户浏览器 (已登录学校账号)                          │
│  ├── 浏览器插件 (Chrome Extension)                   │
│  │   ├── Background Script (WebSocket 客户端)       │
│  │   ├── Content Script (脚本执行引擎)              │
│  │   └── 规则库 (rules/*.json)                      │
└──────────────────┬──────────────────────────────────┘
                   │ WebSocket (localhost:8765)
┌──────────────────▼──────────────────────────────────┐
│  MCP Server (Python)                                │
│  ├── WebSocket Server                               │
│  ├── MCP Tools (search_papers, download_paper)      │
│  └── 规则管理 (learn_rule, update_rule)             │
└──────────────────┬──────────────────────────────────┘
                   │ stdio (MCP Protocol)
┌──────────────────▼──────────────────────────────────┐
│  AI 客户端 (Claude Code / ResearchClaw)             │
└─────────────────────────────────────────────────────┘
```

### 2.2 两阶段工作流

#### 阶段 1：规则学习（慢，只执行一次）
```
用户首次访问新图书馆
  ↓
LLM 分析页面结构
  ↓
生成规范化脚本 (JSON)
  ↓
用户确认 → 保存规则
```

#### 阶段 2：规则执行（快，重复使用）
```
用户请求文献
  ↓
MCP 读取规则
  ↓
插件执行脚本 (无需 LLM)
  ↓
返回论文摘要列表
  ↓
LLM 筛选论文
  ↓
插件下载 PDF
```

---

## 3. 核心组件

### 3.1 规范化脚本格式

所有操作用 JSON 描述，便于 LLM 生成和理解：

```json
{
  "site": "library.bit.edu.cn",
  "version": "1.0",
  "databases": {
    "ieee": {
      "name": "IEEE Xplore",
      "entry_url": "https://lib.bit.edu.cn/goto/ieee",
      
      "auth_flow": {
        "type": "shibboleth",
        "steps": [
          {
            "action": "navigate",
            "url": "{entry_url}"
          },
          {
            "action": "wait_for_redirect",
            "expected_domain": "ieeexplore.ieee.org",
            "timeout": 10000
          },
          {
            "action": "check_element",
            "selector": ".institutional-access",
            "description": "验证机构授权"
          }
        ]
      },
      
      "search": {
        "steps": [
          {
            "action": "fill_input",
            "selector": "input[name='queryText']",
            "value": "{query}"
          },
          {
            "action": "click",
            "selector": "button.search-btn"
          },
          {
            "action": "wait_for_selector",
            "selector": ".document-item",
            "timeout": 5000
          }
        ]
      },
      
      "extract": {
        "result_items": ".document-item",
        "fields": {
          "title": {
            "selector": ".document-title a",
            "attribute": "textContent"
          },
          "abstract": {
            "selector": ".abstract-text",
            "attribute": "textContent"
          },
          "pdf_url": {
            "selector": "a.pdf-btn[href*='stamp.jsp']",
            "attribute": "href"
          },
          "authors": {
            "selector": ".authors span",
            "attribute": "textContent",
            "multiple": true
          }
        }
      }
    }
  }
}
```

### 3.2 脚本执行引擎

插件端 `content.js` 实现通用执行器：

```javascript
class ScriptExecutor {
  async execute(script) {
    switch (script.action) {
      case 'navigate':
        location.href = script.url;
        break;
      
      case 'wait_for_redirect':
        await this.waitForDomain(script.expected_domain, script.timeout);
        break;
      
      case 'fill_input':
        document.querySelector(script.selector).value = script.value;
        break;
      
      case 'click':
        document.querySelector(script.selector).click();
        break;
      
      case 'wait_for_selector':
        await this.waitForElement(script.selector, script.timeout);
        break;
      
      case 'extract':
        return this.extractData(script);
        break;
    }
  }
  
  async waitForDomain(domain, timeout) {
    const start = Date.now();
    while (!location.hostname.includes(domain)) {
      if (Date.now() - start > timeout) throw new Error('Timeout');
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  extractData(config) {
    const items = document.querySelectorAll(config.result_items);
    return Array.from(items).map(item => {
      const data = {};
      for (const [key, field] of Object.entries(config.fields)) {
        if (field.multiple) {
          data[key] = Array.from(item.querySelectorAll(field.selector))
            .map(el => el[field.attribute]);
        } else {
          const el = item.querySelector(field.selector);
          data[key] = el ? el[field.attribute] : null;
        }
      }
      return data;
    });
  }
}
```

### 3.3 MCP 工具定义

```python
# mcp-server/tools.py

@mcp.tool()
async def search_papers(
    database: str,
    query: str,
    max_results: int = 10
) -> list[dict]:
    """
    在指定数据库搜索论文，返回标题、摘要、PDF链接
    
    Args:
        database: 数据库名称 (ieee/springer/cnki)
        query: 搜索关键词
        max_results: 最大结果数
    
    Returns:
        [{"title": "...", "abstract": "...", "pdf_url": "..."}]
    """
    # 1. 加载规则
    rule = load_rule(database)
    
    # 2. 发送给插件执行
    result = await extension_client.call("executeRule", {
        "rule": rule,
        "query": query,
        "max_results": max_results
    })
    
    return result


@mcp.tool()
async def download_paper(pdf_url: str) -> str:
    """
    下载论文 PDF
    
    Args:
        pdf_url: PDF 下载链接
    
    Returns:
        本地文件路径
    """
    result = await extension_client.call("downloadFile", {
        "url": pdf_url
    })
    return result["path"]


@mcp.tool()
async def learn_site_rule(
    site_url: str,
    database_name: str
) -> dict:
    """
    学习新网站的访问规则（LLM 辅助）
    
    Args:
        site_url: 网站入口 URL
        database_name: 数据库名称
    
    Returns:
        生成的规则 JSON
    """
    # 1. 获取页面内容
    page_html = await extension_client.call("getPageHTML", {"url": site_url})
    
    # 2. 调用 LLM 分析
    prompt = f"""
    分析以下学术数据库页面，生成访问规则：
    
    页面 HTML：
    {page_html}
    
    请生成 JSON 格式的规则，包含：
    1. 搜索框选择器
    2. 搜索按钮选择器
    3. 结果列表选择器
    4. 标题/摘要/PDF链接的提取规则
    """
    
    rule = await llm_client.generate(prompt)
    
    # 3. 保存规则
    save_rule(database_name, rule)
    
    return rule
```

---

## 4. 性能对比

| 操作 | mcp-chrome (LLM理解) | 本方案 (规则执行) | 提升 |
|------|---------------------|------------------|------|
| 跳转到数据库 | 5-10s | 0.1s | **50-100x** |
| 等待认证跳转 | 3-5s | 1s | **3-5x** |
| 搜索论文 | 5s | 0.5s | **10x** |
| 提取结果 | 5s | 0.01s | **500x** |
| **总耗时** | **18-25s** | **~2s** | **9-12x** |

**Token 消耗**：
- mcp-chrome：每次操作 ~50KB HTML → LLM
- 本方案：只发送论文摘要 ~3KB → LLM（省 94% Token）

---

## 5. 实现路线图

### MVP (北理工图书馆原型)

**目标**：跑通完整流程

**功能**：
- ✅ 浏览器插件 + WebSocket 通信
- ✅ 规范化脚本执行引擎
- ✅ MCP Server 基础框架
- ✅ 北理工图书馆 IEEE 访问规则
- ✅ `search_papers` 和 `download_paper` 工具

**时间**：1-2 天

### V1.0 (多数据库支持)

**功能**：
- 支持 IEEE、Springer、CNKI、万方
- 规则库管理（增删改查）
- 错误处理和日志记录
- 用户反馈接口

**时间**：1 周

### V2.0 (LLM 辅助学习)

**功能**：
- `learn_site_rule` 工具（LLM 分析页面生成规则）
- 规则测试和验证
- 规则版本管理
- 失败案例自动修复

**时间**：2 周

### V3.0 (社区生态)

**功能**：
- 规则社区仓库（GitHub）
- 用户贡献规则
- 规则评分和反馈
- 自动更新机制

**时间**：1 个月

---

## 6. 技术栈

### 浏览器插件
- **Manifest V3** (Chrome Extension)
- **WebSocket** 通信
- **原生 JavaScript**（无框架，最小化体积）

### MCP Server
- **Python 3.11+**
- **websockets** (WebSocket 服务器)
- **mcp** (Model Context Protocol SDK)
- **httpx** (HTTP 客户端，用于 LLM 调用)

### 规则存储
- **JSON 文件**（本地存储，便于版本控制）
- 未来可扩展到 SQLite/PostgreSQL

---

## 7. 目录结构

```
library-access-mcp/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── rule-format.md
│   └── contributing.md
│
├── extension/                  # 浏览器插件
│   ├── manifest.json
│   ├── background.js           # WebSocket 客户端
│   ├── content.js              # 脚本执行引擎
│   ├── popup.html              # 插件弹窗（规则管理）
│   ├── popup.js
│   └── rules/                  # 规则库
│       ├── bit-ieee.json       # 北理工 IEEE
│       ├── bit-springer.json
│       └── template.json       # 规则模板
│
├── mcp-server/                 # MCP 服务器
│   ├── server.py               # 主入口
│   ├── tools.py                # MCP 工具定义
│   ├── websocket_client.py     # 与插件通信
│   ├── rule_manager.py         # 规则管理
│   ├── requirements.txt
│   └── config.yaml
│
├── rules-community/            # 社区规则库
│   ├── README.md
│   ├── tsinghua/               # 清华大学
│   ├── pku/                    # 北京大学
│   └── bit/                    # 北理工
│       ├── ieee.json
│       ├── springer.json
│       └── cnki.json
│
└── tests/
    ├── test_executor.py
    ├── test_tools.py
    └── test_rules.py
```

---

## 8. 关键设计决策

### 8.1 为什么用 WebSocket 而非 Native Messaging？

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| Native Messaging | Chrome 官方机制，更安全 | 需要注册 manifest，配置复杂 | ❌ |
| WebSocket | 实现简单，调试方便 | 需要占用端口，需要验证来源 | ✅ |

**决策**：MVP 阶段用 WebSocket，V2.0 可选支持 Native Messaging。

### 8.2 为什么规则用 JSON 而非 JavaScript？

- ✅ LLM 更容易生成和理解 JSON
- ✅ 声明式，安全性高（不执行任意代码）
- ✅ 便于版本控制和 diff
- ✅ 跨语言（Python/JS 都能解析）

### 8.3 为什么不直接用 mcp-chrome？

mcp-chrome 是**通用浏览器控制**，每次都需要 LLM 理解页面。

本方案是**领域专用**（学术文献访问），通过规则引擎实现：
- **10x+ 速度提升**
- **94% Token 节省**
- **更高可靠性**（规则确定，不依赖 LLM 理解）

---

## 9. 安全考虑

### 9.1 WebSocket 认证

```python
# 生成随机密钥
SECRET_KEY = secrets.token_urlsafe(32)

# 插件连接时验证
async def handle_connection(websocket):
    auth_msg = await websocket.recv()
    if auth_msg != SECRET_KEY:
        await websocket.close()
        return
```

### 9.2 规则沙箱

- ❌ 不允许执行任意 JavaScript
- ✅ 只允许预定义的 action 类型
- ✅ 选择器白名单验证

### 9.3 用户隐私

- ✅ 所有数据本地处理
- ✅ 不上传用户浏览历史
- ✅ 规则贡献时脱敏（移除学校特定信息）

---

## 10. 与 ResearchClaw 集成

### 10.1 作为 Literature Source

```python
# researchclaw/literature/sources.py

class LibraryMCPSource(LiteratureSource):
    def __init__(self, mcp_client):
        self.mcp = mcp_client
    
    async def search(self, query: str, max_results: int = 10) -> List[Paper]:
        # 调用 MCP 工具
        results = await self.mcp.call_tool(
            "search_papers",
            database="ieee",  # 可配置
            query=query,
            max_results=max_results
        )
        
        return [Paper(
            title=r["title"],
            abstract=r["abstract"],
            pdf_url=r["pdf_url"]
        ) for r in results]
    
    async def fetch_fulltext(self, pdf_url: str) -> str:
        local_path = await self.mcp.call_tool(
            "download_paper",
            pdf_url=pdf_url
        )
        return Path(local_path).read_text()
```

### 10.2 配置

```yaml
# config.arc.yaml
literature:
  sources:
    - type: library_mcp
      priority: 1  # 最高优先级
      databases:
        - ieee
        - springer
        - cnki
    - type: openalex
      priority: 2
```

---

## 11. 开源策略

### 11.1 许可证
- **MIT License**（宽松，鼓励商业使用和贡献）

### 11.2 社区建设
- GitHub Discussions（用户交流）
- 规则贡献指南
- 每月发布 Newsletter（新增规则、功能更新）

### 11.3 推广渠道
- 学术圈：发布到各高校 BBS、学术论坛
- 技术圈：Product Hunt、Hacker News
- AI 圈：MCP 官方社区、Claude 用户群

---

## 12. 成功指标

### MVP 阶段
- ✅ 北理工 IEEE 访问成功率 > 95%
- ✅ 单次搜索耗时 < 3 秒
- ✅ 与 Claude Code 集成成功

### V1.0 阶段
- 支持 5+ 数据库
- 10+ 高校规则库
- 100+ GitHub Stars

### V2.0 阶段
- LLM 生成规则准确率 > 80%
- 社区贡献规则 50+
- 1000+ 用户

---

## 13. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 网站频繁改版 | 规则失效 | 版本管理 + 自动检测 + 社区更新 |
| 反爬虫机制 | 访问被封 | 限流 + User-Agent 轮换 + 人工验证 |
| 浏览器兼容性 | Firefox/Edge 不支持 | 优先 Chrome，后续扩展 |
| 用户隐私担忧 | 采用率低 | 开源 + 本地运行 + 隐私声明 |

---

## 14. 参考资料

### 现有项目
- **mcp-chrome** (hangwin/mcp-chrome) — 通用浏览器控制
- **browser-control-mcp** (eyalzh/browser-control-mcp) — Firefox 安全设计
- **browser-mcp** (djyde/browser-mcp) — 轻量级实现

### 技术文档
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### 学术资源
- [Shibboleth 认证协议](https://www.shibboleth.net/)
- [CARSI 联盟](https://www.carsi.edu.cn/)

---

## 15. 下一步行动

1. **创建新项目仓库** `library-access-mcp`
2. **实现 MVP**（北理工 IEEE 访问）
3. **测试验证**（真实环境测试）
4. **文档完善**（用户指南、开发文档）
5. **开源发布**（GitHub + 社区推广）

---

**文档版本**：v1.0  
**最后更新**：2026-03-31  
**作者**：yangkunlong
