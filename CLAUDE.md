# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**Library Access MCP** - 通过浏览器插件 + MCP 服务器实现 AI 工具访问需要认证的学术数据库（IEEE、Springer、CNKI 等）。

核心创新：
- 复用用户已登录的浏览器 session（无需重新登录）
- 规则引擎执行脚本化操作（1秒/操作，无需 LLM 理解页面）
- LLM 只负责论文筛选，不处理网页操作

## 架构

三层架构：
1. **浏览器插件** (Chrome Extension) - 执行脚本、管理规则
2. **MCP Server** (Python) - WebSocket 服务器、MCP 工具接口
3. **AI 客户端** - Claude Code / ResearchClaw

通信链路：
```
浏览器插件 <--WebSocket(localhost:8765)--> MCP Server <--HTTP(localhost:8766/mcp)--> AI 客户端
```

## 核心概念

### 规范化脚本
所有网页操作用 JSON 描述，包含：
- `auth_flow` - 认证流程（Shibboleth/CARSI）
- `search` - 搜索步骤
- `extract` - 数据提取规则

### 两阶段工作流
1. **规则学习**（慢，首次）：LLM 分析页面 → 生成 JSON 规则 → 用户确认
2. **规则执行**（快，重复）：读取规则 → 插件执行 → 返回结果

## 核心工作流规范

- **学术资产固化 (Mandatory)**: 
  - 在获取到论文详情后，应主动引导用户使用 `persist_paper` 工具。
  - 所有本地文献记录必须通过 `persist_paper` 工具生成，以确保 `Research/papers/` 详情与 `Research/README.md` 索引实时同步。
  - 资产命名规范：`[dxid]_[标题关键部分].md`（由工具自动处理）。

## 技术栈

- **浏览器插件**: Manifest V3, WebSocket 客户端
- **MCP Server**: Python, websockets, mcp
- **规则格式**: JSON (支持变量替换 `{query}`)
- **认证**: Shibboleth, CARSI, OAuth

## 多校 Provider 架构

每个学校的登录逻辑封装在独立的 Provider 文件中（`extension/providers/`），继承 `LoginProvider` 基类。

### 已验证的两种认证模式

| 模式 | 代表学校 | 流程 | 是否需要凭证 |
|------|---------|------|-------------|
| CAS + Session 同步 | BIT（北理工） | CAS 登录 → 图书馆验证 → syncSession 同步发现系统 | 否（复用浏览器 session） |
| CARSI/Shibboleth | BUAA（北航） | Shibboleth IdP 跳转 → 学校 SSO 填写凭证 → 回调智真 | 是（username + password） |

### 新增学校步骤

1. 新建 `extension/providers/xxx-provider.js`，继承 `LoginProvider`
2. 实现 `getName()`、`getLoginUrl()`、`login(taskId, payload)`
3. 在 `background.js` 的 `Providers` 对象中注册
4. 无需修改服务端代码

## 开发计划

当前状态：**MVP 阶段** (2026-04-06 多校登录架构已验证)

MVP 目标：
- [x] 实现智真系统 (Zhizhen/超星发现) 元数据深度抓取 (单位, 基金, 核心收录等)
- [x] 修复 WebSocket 任务解包协议 (支持 `TASK` 类型的封装指令)
- [x] 多校 Provider 架构 (BIT CAS + BUAA CARSI 两种模式验证通过)
- [ ] 实现北理工 IEEE Xplore 访问

## 项目结构

```
library-access-mcp/
├── extension/              # Chrome 插件
│   ├── manifest.json
│   ├── background.js       # WebSocket 客户端 + Provider 注册
│   ├── content.js          # 脚本执行引擎
│   ├── providers/          # 多校登录 Provider
│   │   ├── base-provider.js    # 基类（checkAuth 等通用方法）
│   │   ├── bit-provider.js     # 北理工（CAS + Session 同步）
│   │   ├── buaa-provider.js    # 北航（CARSI/Shibboleth）
│   │   └── manual-provider.js  # 手动登录兜底
│   └── rules/              # 规则库 (*.json)
├── mcp-server/             # Python MCP 服务器
│   ├── server.py
│   ├── websocket_server.py
│   └── rule_manager.py
└── docs/                   # 文档
```

## 关键设计决策

- **数据提取策略**: 采用“模糊匹配 + 递归搜索”算法，取代静态 DOM 选择器。通过搜索关键词定位元数据，有效应对动态结构和 iframe 嵌套页面。
- **调试机制**: 抓取失败时保留 active 标签页不关闭，便于用户手动干预或查看 console 日志 (带有 `[Injected]` 和 `[MCP]` 前缀)。
- **为什么不用 Playwright MCP**：无法复用已登录 session
- **为什么不用 mcp-chrome**：每次让 LLM 理解页面太慢（13-20秒）
- **为什么用规则引擎**：脚本化执行快（1秒），规则可复用
- **为什么用 WebSocket**：插件与 MCP 服务器实时双向通信
- **为什么用 HTTP transport 而非 stdio**：server 常驻不随 Claude Code 进程重启，端口冲突从架构上消失，支持多客户端复用同一 server 实例

## 安全考虑

- 本地运行（localhost:8765/8766）
- BIT 模式不传输用户凭证（复用浏览器 session）
- BUAA 等 CARSI 模式凭证仅在本地 localhost 传输，不经过外部服务器
- 规则需用户确认
- 开源透明

## 开发环境要求

- **PowerShell**: 必须使用 PowerShell 7（pwsh.exe），不使用旧版 powershell.exe
- **原因**: PowerShell 7 默认 UTF-8 编码，避免中文乱码和 BOM 错误
- **执行命令**: 优先使用 `pwsh -Command` 而非 `powershell -Command`
