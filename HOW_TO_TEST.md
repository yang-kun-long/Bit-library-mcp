# 如何测试 - 快速指南

## 当前状态 ✅

**服务器**: 运行中  
**HTTP 端口**: 8765  
**WebSocket 端口**: 8766  
**版本**: 2.0.0-streamable

---

## 你现在可以做的测试

### 1. 基础测试（已完成 ✅）

服务器已经启动并通过基础测试：
- ✅ HTTP 端点正常
- ✅ WebSocket 服务运行
- ✅ 健康检查通过
- ✅ 状态查询正常

### 2. 配置 Claude Code（下一步）

**步骤**：

1. 打开 Claude Code 设置文件：
   - Windows: `C:\Users\你的用户名\.claude\settings.json`
   - 或在 Claude Code 中输入 `/settings`

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

4. 在 Claude Code 中测试：
```
请使用 ping_test 工具测试连接
```

**期望结果**：
```
✅ 连接正常
MCP 服务器端口: 8765
浏览器连接数: 0
往返时间: XXms
```

### 3. 测试浏览器插件（可选）

**步骤**：

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `D:\Bit-library-mcp\extension` 目录
6. 点击插件图标，查看连接状态

**期望结果**：
- 插件显示"已连接"
- 可以点击"测试连接"按钮

### 4. 测试工具功能

在 Claude Code 中依次测试：

#### 4.1 测试 ping_test
```
请使用 ping_test 工具
```

#### 4.2 测试 open_url
```
请使用 open_url 工具打开 https://www.baidu.com
```

#### 4.3 测试 search_papers（需要浏览器插件）
```
请搜索关键词"transformer"的论文
```

### 5. 测试多客户端共享

**步骤**：

1. 保持当前 Claude Code 窗口打开
2. 打开另一个 Claude Code 窗口
3. 在两个窗口中都执行 `ping_test`
4. 检查服务器状态：
```bash
curl http://localhost:8765/status
```

**期望结果**：
- 两个窗口都能正常连接
- 不会出现端口冲突
- 共享同一个服务器实例

---

## 快速命令参考

### 检查服务器状态
```bash
curl http://localhost:8765/status
```

### 检查健康状态
```bash
curl http://localhost:8765/health
```

### 查看服务器信息
```bash
curl http://localhost:8765/
```

### 停止服务器
```bash
# Windows PowerShell
Get-Process python | Stop-Process -Force

# 或者在服务器窗口按 Ctrl+C
```

### 重启服务器
```bash
cd D:/Bit-library-mcp/mcp-server
python standalone.py
```

---

## 故障排查

### 问题：Claude Code 无法连接

**检查**：
1. 服务器是否运行：`curl http://localhost:8765/health`
2. 配置文件是否正确
3. 重启 Claude Code

### 问题：浏览器插件无法连接

**检查**：
1. WebSocket 服务是否运行
2. 插件是否正确加载
3. 查看浏览器控制台错误

### 问题：端口被占用

**解决**：
```bash
# 查找占用端口的进程
netstat -ano | findstr "8765"
netstat -ano | findstr "8766"

# 终止进程
taskkill /F /PID <进程ID>
```

---

## 测试检查清单

- [x] 服务器启动成功
- [x] HTTP 端点正常
- [x] WebSocket 服务运行
- [ ] Claude Code 配置完成
- [ ] Claude Code 连接成功
- [ ] ping_test 工具正常
- [ ] open_url 工具正常
- [ ] 浏览器插件连接成功
- [ ] search_papers 工具正常
- [ ] 多客户端共享测试

---

## 下一步

1. **立即执行**：配置 Claude Code 并测试连接
2. **今天完成**：测试所有 MCP 工具
3. **本周完成**：更新浏览器插件，发布 v2.0.0-beta

---

## 需要帮助？

- 查看详细测试指南：`docs/TESTING_GUIDE.md`
- 查看测试报告：`docs/TEST_REPORT.md`
- 查看架构设计：`docs/REMOTE_SERVER_DESIGN.md`
