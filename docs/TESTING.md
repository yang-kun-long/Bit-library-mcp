# 测试流程

## 阶段 1: 环境准备

### 1.1 安装 Python 依赖
```bash
cd mcp-server
pip install -r requirements.txt
```

### 1.2 安装浏览器插件
1. 打开 Chrome: `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `extension` 目录
5. 确认插件已加载

## 阶段 2: 单独测试 WebSocket 服务器

### 2.1 启动 WebSocket 服务器
```bash
cd mcp-server
python -c "
import asyncio
from websocket_server import WebSocketServer

async def main():
    server = WebSocketServer()
    await server.start()

asyncio.run(main())
"
```

### 2.2 测试插件连接
1. 打开浏览器任意页面
2. 点击插件图标
3. 应显示"已连接到 MCP 服务器"
4. 查看终端输出: `[WebSocket] 客户端已连接`

## 阶段 3: 测试脚本执行

### 3.1 在浏览器控制台测试
```javascript
// 打开 IEEE Xplore: https://ieeexplore.ieee.org
// F12 打开控制台，粘贴：

chrome.runtime.sendMessage({
  type: 'MCP_TASK',
  taskId: 'test-001',
  payload: {
    script: {
      action: 'fill_input',
      selector: 'input.search-field',
      value: 'machine learning'
    }
  }
});
```

### 3.2 预期结果
- 搜索框自动填入 "machine learning"
- 控制台无错误

## 阶段 4: 测试 MCP 服务器

### 4.1 配置 Claude Code
编辑配置文件（Windows: `%APPDATA%\Claude\claude_desktop_config.json`）:
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

### 4.2 重启 Claude Code

### 4.3 测试工具调用
在 Claude Code 中输入：
```
列出可用的 MCP 工具
```

预期输出：
- `search_papers`
- `download_paper`

## 阶段 5: 端到端测试

### 5.1 登录图书馆
1. 在浏览器中访问学校图书馆
2. 完成登录
3. 访问 IEEE Xplore

### 5.2 执行搜索
在 Claude Code 中：
```
使用 search_papers 工具搜索：
- site: library.bit.edu.cn
- database: ieee
- query: transformer neural network
```

### 5.3 预期结果
- 浏览器自动执行搜索
- 返回论文列表（标题、作者、摘要、PDF 链接）

## 常见问题

### 插件未连接
- 检查 WebSocket 服务器是否运行
- 查看浏览器控制台错误
- 确认端口 8765 未被占用

### 脚本执行失败
- 检查 CSS 选择器是否正确
- 查看页面结构是否变化
- 更新规则文件

### MCP 工具不可用
- 查看 Claude Code 日志
- 确认 Python 路径正确
- 检查依赖是否安装完整

## 调试技巧

### 查看 WebSocket 消息
在 `background.js` 中添加：
```javascript
ws.onmessage = (event) => {
  console.log('[DEBUG] 收到:', event.data);
  // ...
};
```

### 查看脚本执行
在 `content.js` 中添加：
```javascript
executor.execute(payload.script)
  .then(result => {
    console.log('[DEBUG] 执行成功:', result);
    // ...
  });
```

### 查看 Python 日志
在 `server.py` 中添加：
```python
print(f"[DEBUG] 收到请求: {name}, {arguments}")
```
