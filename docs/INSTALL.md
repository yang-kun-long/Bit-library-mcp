# 安装指南

## 前置要求

- Python 3.10+
- Chrome 浏览器
- Claude Code

## 步骤 1: 克隆仓库

```bash
git clone https://github.com/yang-kun-long/Bit-library-mcp.git
cd Bit-library-mcp
```

## 步骤 2: 安装 Python 依赖

```bash
cd mcp-server
pip install -r requirements.txt
```

## 步骤 3: 安装浏览器插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目中的 `extension` 目录
5. 确认插件图标出现在工具栏

## 步骤 4: 配置 Claude Code

### Windows

编辑 `%APPDATA%\Claude\claude_desktop_config.json`:

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

### macOS/Linux

编辑 `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "library-access": {
      "command": "python3",
      "args": ["/path/to/Bit-library-mcp/mcp-server/server.py"]
    }
  }
}
```

## 步骤 5: 测试

1. 在浏览器中登录学校图书馆
2. 重启 Claude Code
3. 点击插件图标，确认显示"已连接到 MCP 服务器"
4. 在 Claude Code 中测试：

```
使用 search_papers 工具在 IEEE 搜索 "machine learning"
```

## 故障排查

### 插件显示"未连接"

- 检查 MCP 服务器是否启动
- 查看 Claude Code 日志
- 确认端口 8765 未被占用

### 搜索失败

- 确认已在浏览器中登录图书馆
- 检查规则文件是否正确
- 查看浏览器控制台错误信息

### Python 依赖安装失败

```bash
# 使用国内镜像
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```
