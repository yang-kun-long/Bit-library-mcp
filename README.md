# Library Access MCP

通过浏览器插件 + MCP 服务器实现 AI 工具访问需要认证的学术数据库（IEEE、Springer、CNKI 等）。

## 核心特性

- ✅ **复用浏览器 Session** - 无需重新登录，直接使用已登录的浏览器
- ⚡ **规则引擎** - 脚本化执行，1秒/操作，无需 LLM 理解页面
- 🔒 **本地运行** - 所有数据在本地处理，不传输凭证
- 🎯 **AI 筛选** - LLM 只负责论文筛选，不处理网页操作

## 快速开始

### 1. 安装浏览器插件

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extension` 目录

### 2. 安装 MCP 服务器

```bash
cd mcp-server
pip install -r requirements.txt
```

### 3. 配置 Claude Code

在 Claude Code 配置中添加 MCP 服务器：

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

### 4. 使用

1. 在浏览器中登录学校图书馆
2. 启动 Claude Code
3. 使用工具搜索论文：

```
帮我在 IEEE 搜索关于 "transformer neural network" 的论文
```

## 架构

```
浏览器插件 <--WebSocket(localhost:8765)--> MCP Server <--stdio--> Claude Code
```

## 项目结构

```
Bit-library-mcp/
├── extension/              # Chrome 浏览器插件
│   ├── manifest.json       # 插件配置
│   ├── background.js       # WebSocket 客户端
│   ├── content.js          # 脚本执行引擎
│   ├── popup.html/js       # 状态面板
│   └── rules/              # 规则库
│       └── library.bit.edu.cn.json
├── mcp-server/             # Python MCP 服务器
│   ├── server.py           # MCP 主服务
│   ├── websocket_server.py # WebSocket 服务器
│   ├── rule_manager.py     # 规则管理
│   └── requirements.txt
└── docs/                   # 文档
```

## 可用工具

- `search_papers` - 搜索论文
- `download_paper` - 下载论文 PDF

## 开发状态

当前版本：**v0.1.0 (MVP)**

- ✅ 基础架构
- ✅ WebSocket 通信
- ✅ 规则引擎
- ✅ MCP 工具接口
- ⏳ 真实环境测试
- ⏳ 更多数据库支持

## 贡献

欢迎提交 Issue 和 PR！

## 许可

MIT License
