# MVP 验证全流程记录

**验证日期**: 2026-04-03  
**目的**: 验证"本地 HTTP MCP Server + 浏览器插件 WebSocket"方案可行性，作为主服务器改造的依据。

---

## 架构

```
Claude Code
  │
  │  HTTP POST（带 Authorization: Bearer token）
  ▼
MCP Server（FastAPI，localhost:8766）
  │  /mcp  — MCP JSON-RPC 端点（需认证）
  │  /ws   — WebSocket 端点（供插件连接）
  │  /health — 健康检查
  │
  │  WebSocket（ws://localhost:8766/ws）
  ▼
浏览器插件（Chrome Extension，Manifest V3）
  │
  │  chrome.tabs.create / 其他浏览器 API
  ▼
浏览器操作结果 → 沿原路返回
```

---

## 一、依赖安装

```bash
pip install fastapi uvicorn[standard] websockets
```

验证：
```bash
pip show fastapi uvicorn websockets
```

---

## 二、启动 MCP Server

```bash
cd demo/server
python server.py
```

Server 监听：
- `http://localhost:8766/mcp`（MCP JSON-RPC，需 Bearer token）
- `ws://localhost:8766/ws`（插件 WebSocket）
- `http://localhost:8766/health`（健康检查，无需认证）

确认启动：
```bash
curl --noproxy localhost http://localhost:8766/health
# → {"status":"ok","plugins":0}
```

> **注意**：如果系统开了代理（Clash 等），curl 需加 `--noproxy localhost` 才能直连。浏览器插件连 localhost 不受影响。

---

## 三、安装浏览器插件

1. Chrome 地址栏输入 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」
4. 选择 `demo/extension/` 目录

插件加载后会自动连接 `ws://localhost:8766/ws`。

**验证插件已连上**（plugins 变为 1）：
```bash
curl --noproxy localhost http://localhost:8766/health
# → {"status":"ok","plugins":1}
```

**查看插件日志**：`chrome://extensions/` → Demo 插件 → Service Worker → Console，正常输出：
```
[Demo Plugin] 启动
[Demo Plugin] 连接服务器: ws://localhost:8766/ws
[Demo Plugin] 已连接
```

---

## 四、注册 MCP Server 到 Claude Code

```bash
claude mcp add --transport http -H "Authorization: Bearer any-local-token" --scope user -- demo-local http://localhost:8766/mcp
```

参数说明：
- `--transport http`：使用 HTTP transport（非 stdio）
- `-H "Authorization: Bearer any-local-token"`：每次请求自动带上此 header
- `--scope user`：写入 `~/.claude.json`（user 级，所有项目可用）；`--scope project` 则写入项目根目录 `.mcp.json`
- `--`：分隔选项与位置参数（name 和 url）

**写入 `~/.claude.json` 的格式**：
```json
"demo-local": {
  "type": "http",
  "url": "http://localhost:8766/mcp",
  "headers": {
    "Authorization": "Bearer any-local-token"
  }
}
```

对比 stdio 格式：
```json
"library-access": {
  "command": "python",
  "args": ["D:/BIT101/Bit-library-mcp/mcp-server/server.py"]
}
```

验证注册成功：
```bash
claude mcp list
# → demo-local: http://localhost:8766/mcp (HTTP) - ✓ Connected
```

---

## 五、全链路测试

### 方式 A：curl 直接测试（无需 Claude Code）

```bash
# 1. ping（不需要插件）
curl --noproxy localhost -X POST http://localhost:8766/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-local-token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
# → {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"pong"}]}}

# 2. open_tab（需要插件在线）
curl --noproxy localhost -X POST http://localhost:8766/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-local-token" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"open_tab","arguments":{"url":"https://www.baidu.com"}}}'
# → {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"成功：已打开标签页 XXXXXX: https://www.baidu.com"}]}}
```

### 方式 B：通过 Claude Code 调用

在 Claude Code 会话中（新会话才会加载 MCP tools）：
```
请用 demo-local 的 open_tab 工具打开 https://www.baidu.com
```

---

## 六、认证机制

- Token 写死为 `any-local-token`（本地 MVP 够用）
- Server 检查 `Authorization: Bearer any-local-token`，不匹配返回 `401`
- Claude Code 通过 `-H` 配置自动在每次请求时附带 header，无需手动处理

无认证请求的响应：
```bash
curl --noproxy localhost -X POST http://localhost:8766/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'
# → 401 Unauthorized
```

---

## 七、任务流转协议

MCP Server → 插件的消息格式（WebSocket）：
```json
{
  "type": "TASK",
  "task_id": "task_1234567890",
  "action": "open_tab",
  "params": { "url": "https://..." }
}
```

插件 → MCP Server 的结果格式：
```json
{
  "type": "TASK_RESULT",
  "task_id": "task_1234567890",
  "result": "已打开标签页 1470703545: https://..."
}
```

Server 用 `asyncio.Future` 等待结果，超时 10 秒。

---

## 八、改造主服务器的关键结论

1. **HTTP transport 可行**：Claude Code 的 `--transport http` + `-H` 能正常传递 Bearer token，MCP 协议走得通。
2. **config 格式**：`type: "http"` + `url` + `headers`，与 stdio 的 `command`+`args` 完全不同。
3. **WebSocket 中继可行**：FastAPI 同时提供 HTTP（MCP）和 WebSocket（插件）端点，单进程无冲突。
4. **任务异步等待**：`asyncio.Future` + `wait_for(timeout=10)` 是正确的等待模式，避免阻塞事件循环。
5. **代理陷阱**：开发机若有系统代理，curl 测试需 `--noproxy localhost`；插件直连 localhost 不受代理影响。
6. **插件连接验证**：`/health` 端点的 `plugins` 字段是判断插件是否在线的最快手段。
