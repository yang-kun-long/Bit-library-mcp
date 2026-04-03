# 测试指南 - Library Access MCP v2.0.0

## 测试环境

- **服务器状态**: ✅ 运行中
- **HTTP 端口**: 8765
- **WebSocket 端口**: 8766
- **进程 ID**: 28944

---

## 第一步：验证服务器运行

### 1.1 检查服务器状态
```bash
curl http://localhost:8765/status
```

**期望输出**：
```json
{
  "status": "running",
  "http_port": 8765,
  "ws_port": 8766,
  "browser_clients": 0,
  "version": "2.0.0-streamable"
}
```

✅ **测试结果**: 通过

### 1.2 检查健康状态
```bash
curl http://localhost:8765/health
```

**期望输出**：
```json
{"status": "healthy"}
```

✅ **测试结果**: 通过

### 1.3 检查服务器信息
```bash
curl http://localhost:8765/
```

**期望输出**：
```json
{
  "name": "Library Access MCP Server",
  "version": "2.0.0",
  "transport": "streamable-http",
  "endpoints": {
    "mcp": "/mcp",
    "status": "/status",
    "health": "/health"
  }
}
```

---

## 第二步：配置 AI 客户端（Claude Code）

### 2.1 打开配置文件

在 Claude Code 中，打开设置文件：
- Windows: `%USERPROFILE%\.claude\settings.json`
- Mac/Linux: `~/.claude/settings.json`

### 2.2 添加 MCP 服务器配置

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

### 2.3 重启 Claude Code

保存配置后，重启 Claude Code 使配置生效。

---

## 第三步：测试浏览器插件连接

### 3.1 安装浏览器插件

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `D:\Bit-library-mcp\extension` 目录

### 3.2 检查插件连接

1. 点击浏览器工具栏的插件图标
2. 查看连接状态

**期望显示**：
```
✅ 已连接到 MCP 服务器（端口 8766）
```

### 3.3 测试连接

在插件弹窗中点击"测试连接"按钮。

**期望结果**：
```
✓ 测试成功！往返时间: XXms
```

---

## 第四步：测试 MCP 工具

### 4.1 在 Claude Code 中测试 ping_test

在 Claude Code 中输入：
```
请使用 ping_test 工具测试连接
```

**期望输出**：
```
✅ 连接正常
MCP 服务器端口: 8765
浏览器连接数: 1
往返时间: XXms
```

### 4.2 测试 open_url

```
请使用 open_url 工具打开 https://www.baidu.com
```

**期望结果**：
- 浏览器自动打开百度首页
- Claude Code 返回：`✅ 已打开: https://www.baidu.com`

### 4.3 测试 search_papers

```
请搜索关键词"transformer"的论文
```

**期望结果**：
- 返回论文列表
- 包含标题、作者、年份等信息

---

## 第五步：测试多客户端共享

### 5.1 打开第二个 Claude Code 窗口

使用相同的配置，打开另一个 Claude Code 实例。

### 5.2 检查服务器状态

在任一窗口中访问：
```bash
curl http://localhost:8765/status
```

**期望输出**：
```json
{
  "status": "running",
  "http_port": 8765,
  "ws_port": 8766,
  "browser_clients": 1,
  "version": "2.0.0-streamable"
}
```

### 5.3 在两个窗口中同时测试

- 窗口 1: 执行 `ping_test`
- 窗口 2: 执行 `ping_test`

**期望结果**：
- 两个窗口都能正常连接
- 共享同一个服务器实例
- 不会出现端口冲突

---

## 第六步：压力测试

### 6.1 快速连续请求

在 Claude Code 中快速执行多次：
```
ping_test
ping_test
ping_test
```

**期望结果**：
- 所有请求都能正常响应
- 没有超时或错误

### 6.2 长时间运行测试

保持服务器运行 10 分钟，期间执行各种操作。

**期望结果**：
- 服务器稳定运行
- 内存占用正常
- 没有崩溃或异常

---

## 故障排查

### 问题 1: 服务器无法启动

**症状**: 运行 `python standalone.py` 后报错

**排查步骤**：
1. 检查端口是否被占用：
   ```bash
   netstat -ano | findstr "8765"
   netstat -ano | findstr "8766"
   ```
2. 检查依赖是否安装：
   ```bash
   pip list | grep -E "fastapi|uvicorn|websockets"
   ```
3. 查看详细错误日志

### 问题 2: AI 客户端无法连接

**症状**: Claude Code 报告"连接失败"

**排查步骤**：
1. 确认服务器正在运行：
   ```bash
   curl http://localhost:8765/health
   ```
2. 检查配置文件格式是否正确
3. 重启 Claude Code

### 问题 3: 浏览器插件无法连接

**症状**: 插件显示"未连接"

**排查步骤**：
1. 确认 WebSocket 服务正在运行
2. 检查插件是否正确加载
3. 查看浏览器控制台错误信息
4. 确认连接地址为 `ws://localhost:8766`

---

## 测试检查清单

- [ ] 服务器成功启动
- [ ] HTTP 端点正常响应（/, /status, /health）
- [ ] WebSocket 服务正常运行
- [ ] AI 客户端配置正确
- [ ] AI 客户端能够连接服务器
- [ ] 浏览器插件能够连接服务器
- [ ] ping_test 工具正常工作
- [ ] open_url 工具正常工作
- [ ] search_papers 工具正常工作
- [ ] 多客户端可以共享服务器
- [ ] 没有端口冲突
- [ ] 服务器稳定运行

---

## 测试报告模板

```
测试日期: ____________________
测试人员: ____________________

服务器状态:
- [ ] 启动成功
- [ ] HTTP 端点正常
- [ ] WebSocket 正常

客户端连接:
- [ ] Claude Code 连接成功
- [ ] 浏览器插件连接成功

功能测试:
- [ ] ping_test: ______
- [ ] open_url: ______
- [ ] search_papers: ______

多客户端测试:
- [ ] 共享服务器: ______
- [ ] 无端口冲突: ______

问题记录:
_________________________________
_________________________________
_________________________________

总体评价: [ ] 通过  [ ] 失败
```

---

## 下一步

测试通过后：
1. 提交测试报告
2. 更新浏览器插件（固定 8766 端口）
3. 准备发布 v2.0.0-beta
4. 收集用户反馈
