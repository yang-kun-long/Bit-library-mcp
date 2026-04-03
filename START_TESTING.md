# 如何自己测试 - 简单步骤

## 第一步：启动服务器

打开 PowerShell 或命令行，运行：

```bash
cd D:\Bit-library-mcp\mcp-server
python standalone.py
```

你会看到：
```
[INFO] Library Access MCP Server - Standalone Mode
[INFO] Starting WebSocket server on ws://127.0.0.1:8766
[INFO] Starting HTTP server on http://127.0.0.1:8765
[INFO] Server started successfully!
```

**保持这个窗口打开**，服务器会一直运行。

---

## 第二步：配置 Claude Code

1. 打开 Claude Code 的设置文件
2. 添加以下配置：

```json
{
  "mcpServers": {
    "library-access": {
      "url": "http://localhost:8765/mcp",
      "transport": "streamable-http"
    }
  }
}
```

3. 保存并重启 Claude Code

---

## 第三步：测试连接

在 Claude Code 中输入：

```
请使用 ping_test 工具测试连接
```

如果成功，你会看到类似：
```
✅ 连接正常
MCP 服务器端口: 8765
浏览器连接数: 0
```

---

## 第四步：测试其他功能

依次测试：

1. **打开网页**：
   ```
   请使用 open_url 工具打开 https://www.baidu.com
   ```

2. **搜索论文**（需要浏览器插件）：
   ```
   请搜索关键词"transformer"的论文
   ```

---

## 第五步：测试多客户端

1. 保持第一个 Claude Code 窗口打开
2. 打开第二个 Claude Code 窗口
3. 在两个窗口中都执行 `ping_test`
4. 验证两个窗口都能正常连接，没有端口冲突

---

## 停止服务器

在服务器窗口按 `Ctrl+C`，或者运行：

```bash
# PowerShell
Get-Process python | Stop-Process -Force
```

---

就这么简单！现在你可以自己开始测试了。
