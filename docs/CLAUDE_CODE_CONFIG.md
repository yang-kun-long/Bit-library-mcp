# Claude Code 配置说明

## 配置文件位置

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

完整路径通常是：`C:\Users\你的用户名\AppData\Roaming\Claude\claude_desktop_config.json`

## 配置内容

```json
{
  "mcpServers": {
    "library-access": {
      "command": "python",
      "args": ["D:/Bit-library-mcp/mcp-server/server.py"]
    }
  }
}
```

**注意**：
- 路径使用正斜杠 `/`
- 如果文件不存在，手动创建

## 配置后

1. 重启 Claude Code
2. 在对话中输入：`使用 ping_test 工具测试连接`
3. 应该返回连接状态和浏览器连接数

## 验证配置

重启后，Claude Code 会自动启动 MCP 服务器，你应该看到：
- 插件显示"已连接"
- 可以使用 `ping_test` 工具
