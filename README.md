# Library Access MCP

> 让 AI 直接访问需要认证的学术数据库。

浏览器插件 + MCP 服务器，AI 助手通过已登录的浏览器 Session 搜索论文、抓取元数据，无需重新登录、无需暴露密码。

## 解决的问题

- **反复认证**：VPN 断了、Session 过期、跨库跳转——全部自动处理
- **手动搬运**：摘要、作者、DOI、影响因子、基金项目——一键抓取
- **AI 爬虫被拦**：直接复用浏览器已有的学术权限，绕过反爬

## 核心特性

- **复用浏览器 Session**：不传账号密码，AI 借用你已登录的权限
- **自动登录兜底**：Session 过期时自动重新认证，对 AI 透明
- **元数据深度抓取**：单位、基金、核心收录（核/源）、影响因子、标准引文格式
- **资产固化**：论文自动转为结构化 Markdown，实时同步研究索引
- **本地运行**：全程 localhost，不上传任何数据

## 工作原理

```
Claude Code ──HTTP──> MCP Server (localhost:8766)
                           │
                        WebSocket (localhost:8765)
                           │
                      浏览器插件 ──> 学术数据库（带认证）
```

## 安装

### 下载

从 [Releases](https://github.com/yang-kun-long/library-access-mcp/releases) 下载最新的 `library-access-mcp-vX.X.X.zip`，解压后包含：

```
library-access-mcp/
├── extension/          # Chrome 插件目录
└── mcp-server.exe      # Windows 服务端（托盘运行）
```

### 安装插件

1. 打开 `chrome://extensions/`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**，选择解压后的 `extension/` 目录

### 启动服务端

**Windows（推荐）**：双击 `mcp-server.exe`，系统托盘出现图标即表示运行中。

**源码运行**：
```bash
cd mcp-server
pip install -r requirements.txt
python server.py
```

服务端启动后监听：
- `http://localhost:8766/mcp` — MCP 端点（供 Claude Code 连接）
- `ws://localhost:8765` — WebSocket 端点（供插件连接）

### 注册到 Claude Code

```bash
claude mcp add --transport http \
  -H "Authorization: Bearer library-access-for-LiuWen" \
  --scope user \
  -- library-access http://localhost:8766/mcp
```

或手动在 `~/.claude.json` 的 `mcpServers` 中添加：

```json
"library-access": {
  "type": "http",
  "url": "http://localhost:8766/mcp",
  "headers": {
    "Authorization": "Bearer library-access-for-LiuWen"
  }
}
```

### 注册到 OpenCode

在 OpenCode 配置文件 `~/.config/opencode/opencode.json` 的 `mcp` 字段中添加：

```json
{
  "mcp": {
    "library-access": {
      "type": "remote",
      "url": "http://localhost:8766/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer library-access-for-LiuWen"
      }
    }
  }
}
```

**注意**：OpenCode 使用 `"type": "remote"` 而不是 `"type": "http"`。

## 使用

连接成功后，在 Claude Code 中直接对话即可：

> "帮我搜索近三年关于大模型的综述论文"
> "获取第一篇的详情并保存"

AI 会自动处理登录、搜索、抓取、保存全流程。

## 可用工具

| 工具 | 说明 |
|------|------|
| `ping_test` | 测试插件连接状态 |
| `login_library` | 登录图书馆（支持自动兜底同步发现系统 Session） |
| `search_papers` | 搜索论文（自动检测登录状态） |
| `get_paper_detail` | 抓取论文完整元数据 |
| `download_paper` | 下载论文 PDF |
| `persist_paper` | 将论文固化为本地 Markdown 笔记 |

## 支持的学校

当前已配置：
- **北京理工大学**（已完整测试，包含校外自动认证）

欢迎提交 PR 添加更多学校。

## 排错

**插件连接不上**：
```bash
curl http://localhost:8766/health
# {"status":"ok","plugins":1}   plugins=1 表示插件已连接
```

**校外访问失败**：调用 `login_library` 工具，会自动完成 CAS 认证和发现系统 Session 同步。

## 开发状态

当前版本：**v0.2.5**

- [x] WebSocket 通信与心跳保活
- [x] 智真发现系统深度元数据抓取
- [x] 校外自动登录兜底（SSO 重定向构造）
- [x] 搜索前自动检测登录状态
- [x] Windows 托盘二进制打包
- [ ] IEEE Xplore 支持
- [ ] 更多高校 Provider

## 文档

- [安装指南](./INSTALL.md)
- [多校支持开发指南](./DEVELOPMENT.md)
- [技术实现日志](./TECH_LOG.md)

## 许可

MIT License
