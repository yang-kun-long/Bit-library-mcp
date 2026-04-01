# 安装与部署指南 (Installation Guide)

本指南将帮助你从零开始部署 Library Access MCP 系统，包括浏览器插件和 MCP 服务端。

## 1. 下载组件 (Download)

从 GitHub [Releases](https://github.com/yang-kun-long/Bit-library-mcp/releases) 页面下载以下文件：
- `library-access-extension.zip` (浏览器插件)
- `mcp-server-windows-latest.exe` (如果你是 Windows 用户) 或 `mcp-server-ubuntu-latest` (如果你是 Linux 用户)

## 2. 浏览器插件安装 (Browser Extension)

1. 将下载的 `library-access-extension.zip` 解压到一个固定目录。
2. 打开 Chrome 或 Edge 浏览器，进入 `扩展程序` 管理页面 (`chrome://extensions/`)。
3. 开启右上角的 **"开发者模式"**。
4. 点击 **"加载解压的扩展程序"**，选择你解压的 `extension/` 文件夹。
5. 在浏览器工具栏固定插件图标，点击图标检查连接状态（初始应为“断开”，因为服务端尚未启动）。

## 3. MCP 服务端配置 (MCP Server)

### 方式 A：运行二进制文件 (推荐)
1. 将下载的 `mcp-server-windows-latest.exe` 放置在项目根目录下。
2. 直接运行该可执行文件。它将自动启动 WebSocket 服务器 (默认端口 `8765`) 并等待 MCP 协议连接。

### 方式 B：源码运行 (开发者模式)
1. 确保安装了 Python 3.10+。
2. 安装依赖：`pip install -r requirements.txt`
3. 启动服务端：`python mcp-server/server.py`

## 4. 连接测试 (Testing)

1. 启动服务端后，观察浏览器插件图标。它应该会自动尝试连接到 `ws://localhost:8765`。
2. 点击插件图标，如果显示 **"Connected"** 或 **"已连接"**，则表示通信链路已打通。
3. 在 MCP 客户端 (如 Claude Code) 中执行 `ping_test` 工具进行验证。

## 5. 初次使用：图书馆登录

在使用搜索工具前，必须通过插件完成登录以获取学术资源访问权限：
1. 在 AI 终端输入：`login_library`。
2. 浏览器会自动打开北理工 (BIT) 的统一身份认证页面。
3. **手动完成登录**。一旦登录成功，插件会自动同步 session，后续搜索将无需再次登录。

---
*注：目前仅支持北京理工大学 (BIT) 智真系统。其他学校的支持请参考 [DEVELOPMENT.md](./DEVELOPMENT.md)。*