# Library Access MCP

通过浏览器插件 + MCP 服务器实现 AI 工具访问需要认证的学术数据库（IEEE、Springer、CNKI 等）。

## 🚀 核心特性

- ✅ **复用浏览器 Session** - 无需重新登录，直接使用已登录的浏览器
- ✅ **元数据深度抓取** - 支持提取单位、基金、核心收录、影响因子及标准引文
- ✅ **资产自动化固化** - 自动生成论文 Markdown 笔记并同步更新研究索引 `Research/README.md`
- ⚡ **规则引擎** - 脚本化执行，1秒/操作，无需 LLM 理解页面
- 🔒 **本地运行** - 所有数据在本地处理，不传输凭证

## 📦 安装与部署

详细安装步骤请参考 [**安装指南 (INSTALL.md)**](./INSTALL.md)。

### 快速开始 (推荐二进制运行)

1. 从 [Releases](https://github.com/yang-kun-long/Bit-library-mcp/releases) 下载最新版：
   - `library-access-extension.zip` (插件压缩包)
   - `mcp-server-windows-latest.exe` (Windows 服务端)
2. **浏览器插件**: 在 `chrome://extensions/` 开启开发者模式，加载解压后的 `extension` 目录。
3. **MCP 服务端**: 直接运行 `.exe` 文件（Windows）或执行 `python mcp-server/server.py`。

## 🛠️ 配置 AI 客户端 (Claude Code)

在 Claude Code 配置中添加 MCP 服务器：

```json
{
  "mcpServers": {
    "library-access": {
      "command": "D:/Bit-library-mcp/mcp-server-windows-latest.exe",
      "args": []
    }
  }
}
```

*注：若使用源码运行，请将 command 改为 python，args 改为 ["path/to/server.py"]。*

## 📖 文档与开发

- [安装指南 (INSTALL.md)](./INSTALL.md)
- [开发与多校支持指南 (DEVELOPMENT.md)](./DEVELOPMENT.md)
- [技术实现日志 (TECH_LOG.md)](./TECH_LOG.md)

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
