# 开发与多校支持指南 (Development Guide)

如果你想为新的学校或数据库添加支持，请遵循以下流程。

## 1. 架构理解

Library Access MCP 采用 **"Provider - Rule"** 架构：
- **Provider**: 处理特定学校的认证逻辑 (如 CAS/Shibboleth)。
- **Rule**: 定义特定学术数据库的操作脚本 (搜索、提取、导航)。

## 2. 添加新学校 (Add New University)

### 第一步：创建 Provider
在 `extension/providers/` 目录下创建一个新的类 (参考 `bit-provider.js`)：
1. 继承 `BaseProvider`。
2. 实现 `login()` 方法：定义学校的统一身份认证入口。
3. 实现 `getDiscoveryUrl()`: 定义图书馆资源发现系统的入口。

### 第二步：在 `background.js` 注册
1. 导入你的新 provider 文件。
2. 在 `Providers` 对象中添加实例，Key 为学校代码 (例如 `'THU'`)。

## 3. 添加新数据库支持 (Add New Database)

目前的搜索功能基于 **超星/智真系统 (Zhizhen)**。如需添加 IEEE Xplore 或 CNKI 的原生支持：

### 第一步：编写规则脚本 (JSON)
在 `extension/rules/` 目录下定义操作逻辑：
- `auth_flow`: 如何从主页跳转到认证页面。
- `search`: 输入关键词并点击搜索的 DOM 选择器。
- `extract`: 元数据提取规则 (标题、作者、摘要等)。

### 第二步：更新 MCP 工具
在 `mcp-server/server.py` 中更新工具参数，使其支持新的数据库目标。

## 4. 调试技巧

- **插件后台**: 在 `chrome://extensions/` 点击插件的 "service worker" 查看实时通信日志。
- **页面注入**: 抓取详情时，插件会设置 `active: true`。你可以按 F12 查看 `[Injected]` 前缀的日志，检查模糊匹配是否成功定位到了元数据。
- **WebSocket**: 服务端会打印所有 `TASK` 和 `RESULT` 的原始 JSON，用于排查通信故障。

## 5. 常见问题排查 (Troubleshooting)

- **Task timeout**: 通常是插件 Service Worker 休眠或 WebSocket 断连。检查 `background.js` 的心跳机制。
- **未获取到详情**: 目标页面结构可能发生了改变。请检查 `handleGetPaperDetail` 中的模糊匹配关键词。

---
*欢迎提交 Pull Request 来增加更多学校的支持！*