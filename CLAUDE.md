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
浏览器插件 <--WebSocket(localhost:8765)--> MCP Server <--stdio(MCP)--> AI 客户端
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

## 技术栈

- **浏览器插件**: Manifest V3, WebSocket 客户端
- **MCP Server**: Python, websockets, mcp
- **规则格式**: JSON (支持变量替换 `{query}`)
- **认证**: Shibboleth, CARSI, OAuth

## 开发计划

当前状态：**设计阶段**（仅有设计文档）

MVP 目标：
- 实现北理工 IEEE Xplore 访问
- 基础 MCP 工具：`search_papers`, `download_paper`
- 规则学习工具：`learn_rule`

## 项目结构（规划）

```
library-access-mcp/
├── extension/          # Chrome 插件
│   ├── manifest.json
│   ├── background.js   # WebSocket 客户端
│   ├── content.js      # 脚本执行引擎
│   └── rules/          # 规则库 (*.json)
├── mcp-server/         # Python MCP 服务器
│   ├── server.py
│   ├── websocket_server.py
│   └── rule_manager.py
└── docs/               # 文档
```

## 关键设计决策

- **为什么不用 Playwright MCP**：无法复用已登录 session
- **为什么不用 mcp-chrome**：每次让 LLM 理解页面太慢（13-20秒）
- **为什么用规则引擎**：脚本化执行快（1秒），规则可复用
- **为什么用 WebSocket**：插件与 MCP 服务器实时双向通信

## 安全考虑

- 本地运行（localhost:8765）
- 不传输用户凭证
- 规则需用户确认
- 开源透明
