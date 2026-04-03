# Demo - MCP HTTP 认证验证

验证 `claude mcp add --header` 参数能否正常传递 Bearer token。

## 架构

```
Claude Code --(HTTP + Header)--> MCP Server --(WebSocket)--> 浏览器插件
```

- **MCP Server**: HTTP transport，验证 `Authorization: Bearer any-local-token`
- **浏览器插件**: WebSocket 客户端，执行 `open_tab` 操作
- **认证**: 固定 token，无需 OAuth

## 启动步骤

### 1. 安装依赖

```bash
cd demo/server
pip install -r requirements.txt
```

### 2. 启动 MCP Server

```bash
python server.py
```

服务器启动在：
- HTTP: `http://localhost:8766/mcp`
- WebSocket: `ws://localhost:8766/ws`
- 健康检查: `http://localhost:8766/health`

### 3. 安装浏览器插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `demo/extension` 目录

插件会自动连接 WebSocket 服务器。

### 4. 配置 Claude Code MCP

```bash
claude mcp add --transport http --header "Authorization: Bearer any-local-token" demo http://localhost:8766/mcp
```

### 5. 测试

在 Claude Code 中：

```
请使用 demo 工具打开 https://www.google.com
```

预期：
1. Claude Code 发送 HTTP 请求，带 `Authorization` header
2. MCP Server 验证 token 通过
3. Server 通过 WebSocket 发送 `open_tab` 任务给插件
4. 插件打开新标签页并返回结果
5. Claude Code 收到成功响应

## 手动测试

### 测试 MCP Server（带认证）

```bash
curl -X POST http://localhost:8766/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-local-token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 测试 MCP Server（无认证，应返回 401）

```bash
curl -X POST http://localhost:8766/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 测试工具列表

```bash
curl -X POST http://localhost:8766/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-local-token" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### 测试打开标签页

```bash
curl -X POST http://localhost:8766/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-local-token" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"open_tab","arguments":{"url":"https://www.google.com"}}}'
```

## 文件结构

```
demo/
├── server/
│   ├── server.py          # MCP Server (HTTP + WebSocket)
│   └── requirements.txt   # Python 依赖
├── extension/
│   ├── manifest.json      # Chrome 插件配置
│   └── background.js      # WebSocket 客户端
└── README.md              # 本文件
```

## 认证流程

1. Claude Code 配置时指定 `--header "Authorization: Bearer any-local-token"`
2. 每次 HTTP 请求自动带上这个 header
3. Server 验证 `Authorization == "Bearer any-local-token"`
4. 验证通过则处理请求，否则返回 401

**关键点**：不需要 OAuth，就一个写死的 token。
