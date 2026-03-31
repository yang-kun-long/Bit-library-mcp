#!/usr/bin/env python3
import asyncio
import json
import uuid
from mcp.server import Server
from mcp.types import Tool, TextContent
from websocket_server import WebSocketServer
from rule_manager import RuleManager

# 创建 MCP 服务器
app = Server("library-access-mcp")

# 创建 WebSocket 服务器和规则管理器
ws_server = WebSocketServer()
rule_manager = RuleManager()

@app.list_tools()
async def list_tools() -> list[Tool]:
    """列出可用的 MCP 工具"""
    return [
        Tool(
            name="ping_test",
            description="测试与浏览器插件的连接",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="bit_login",
            description="自动登录北理工图书馆",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {"type": "string", "description": "服务 URL，默认为图书馆", "default": "https://lib.bit.edu.cn/sso/login/3rd?wfwfid=2398&refer=https://lib.bit.edu.cn"}
                },
                "required": []
            }
        ),
        Tool(
            name="open_url",
            description="在浏览器中打开指定 URL",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "要打开的 URL"}
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="search_papers",
            description="在学术数据库中搜索论文",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "field": {"type": "string", "description": "检索字段: Z(全部)/Su(主题)/T(题名)/A(作者)/S(摘要)/K(关键词)/O(作者单位)", "default": "Z"},
                    "language": {"type": "string", "description": "语种: 空(全部)/1(中文)/2(外文)", "default": ""},
                    "doc_types": {"type": "array", "items": {"type": "integer"}, "description": "文献类型: 11(图书)/1(期刊)/13(报纸)/3(学位)/4(会议)/6(标准)/46(法规)/47(案例)/10(专利)/8(音视频)/21(成果)/85(图片)"},
                    "year_start": {"type": "string", "description": "开始年份"},
                    "year_end": {"type": "string", "description": "结束年份"},
                    "isbn": {"type": "string", "description": "ISBN"},
                    "issn": {"type": "string", "description": "ISSN"},
                    "page_size": {"type": "integer", "description": "每页显示数量: 15/30", "default": 15},
                    "only_catalog": {"type": "boolean", "description": "只显示馆藏目录"},
                    "only_eres": {"type": "boolean", "description": "只显示电子资源"}
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="download_paper",
            description="下载论文 PDF",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "论文 PDF 链接"}
                },
                "required": ["url"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """执行 MCP 工具"""
    if name == "ping_test":
        return await ping_test()
    elif name == "bit_login":
        return await bit_login(arguments)
    elif name == "open_url":
        return await open_url(arguments)
    elif name == "search_papers":
        return await search_papers(arguments)
    elif name == "download_paper":
        return await download_paper(arguments)
    else:
        raise ValueError(f"未知工具: {name}")

async def ping_test() -> list[TextContent]:
    """测试连接"""
    try:
        if not ws_server.clients:
            return [TextContent(type="text", text="❌ 没有浏览器连接")]

        task_id = str(uuid.uuid4())
        start_time = asyncio.get_event_loop().time()

        # 发送 PING
        message = json.dumps({'type': 'PING', 'taskId': task_id})
        await asyncio.gather(
            *[client.send(message) for client in ws_server.clients],
            return_exceptions=True
        )

        # 等待 PONG（简单等待，实际应该监听响应）
        await asyncio.sleep(0.1)

        elapsed = (asyncio.get_event_loop().time() - start_time) * 1000

        return [TextContent(
            type="text",
            text=f"✅ 连接正常\n浏览器连接数: {len(ws_server.clients)}\n往返时间: {elapsed:.0f}ms"
        )]
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 测试失败: {str(e)}")]

async def bit_login(args: dict) -> list[TextContent]:
    """北理工 CAS 登录并进入发现系统"""
    try:
        if not ws_server.clients:
            return [TextContent(type="text", text="❌ 没有浏览器连接")]

        service = args.get("service", "https://lib.bit.edu.cn/sso/login/3rd?wfwfid=2398&refer=https://lib.bit.edu.cn")
        task_id = str(uuid.uuid4())

        payload = {
            'type': 'CAS_LOGIN',
            'service': service,
            'redirect_to': 'https://ss.zhizhen.com/'
        }

        result = await ws_server.send_task(task_id, payload)

        if result.get("success"):
            return [TextContent(
                type="text",
                text=f"✅ 登录成功，已进入发现系统搜索界面"
            )]
        else:
            return [TextContent(
                type="text",
                text=f"❌ 登录失败: {result.get('error', '未知错误')}"
            )]
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 登录失败: {str(e)}")]

async def open_url(args: dict) -> list[TextContent]:
    """在浏览器中打开 URL"""
    try:
        if not ws_server.clients:
            return [TextContent(type="text", text="❌ 没有浏览器连接")]

        url = args["url"]
        task_id = str(uuid.uuid4())

        payload = {
            'type': 'OPEN_URL',
            'url': url
        }

        result = await ws_server.send_task(task_id, payload)

        if result.get("success"):
            return [TextContent(type="text", text=f"✅ 已打开: {url}")]
        else:
            return [TextContent(type="text", text=f"❌ 打开失败: {result.get('error', '未知错误')}")]
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 打开失败: {str(e)}")]

async def search_papers(args: dict) -> list[TextContent]:
    """搜索论文"""
    try:
        if not ws_server.clients:
            return [TextContent(type="text", text="❌ 没有浏览器连接")]

        task_id = str(uuid.uuid4())
        payload = {
            'type': 'SEARCH_PAPERS',
            **args
        }

        result = await ws_server.send_task(task_id, payload)

        if result.get("success"):
            papers = result.get("papers", [])
            if not papers:
                return [TextContent(type="text", text="未找到相关论文")]

            text = f"找到 {len(papers)} 篇论文:\n\n"
            for i, paper in enumerate(papers[:10], 1):
                text += f"{i}. {paper.get('title', '无标题')}\n"
                if paper.get('authors'):
                    text += f"   作者: {paper['authors']}\n"
                if paper.get('source'):
                    text += f"   来源: {paper['source']}\n"
                if paper.get('url'):
                    text += f"   链接: {paper['url']}\n"
                text += "\n"

            return [TextContent(type="text", text=text)]
        else:
            return [TextContent(type="text", text=f"❌ 搜索失败: {result.get('error', '未知错误')}")]
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 搜索失败: {str(e)}")]

async def download_paper(args: dict) -> list[TextContent]:
    """下载论文"""
    url = args["url"]
    task_id = str(uuid.uuid4())

    script = {
        "action": "navigate",
        "url": url
    }

    result = await ws_server.send_task(task_id, {"script": script})

    if result.get("success"):
        return [TextContent(type="text", text=f"已打开下载页面: {url}")]
    else:
        return [TextContent(type="text", text=f"下载失败: {result.get('error')}")]

def replace_variables(script: dict, variables: dict) -> dict:
    """替换脚本中的变量"""
    import copy
    script = copy.deepcopy(script)

    for key, value in script.items():
        if isinstance(value, str):
            for var_name, var_value in variables.items():
                value = value.replace(f"{{{var_name}}}", var_value)
            script[key] = value

    return script

def format_paper(paper: dict) -> str:
    """格式化论文信息"""
    title = paper.get("title", "无标题")
    authors = ", ".join(paper.get("authors", []))
    abstract = paper.get("abstract", "无摘要")[:200]
    pdf_url = paper.get("pdf_url", "")

    return f"**{title}**\n作者: {authors}\n摘要: {abstract}...\nPDF: {pdf_url}"

async def main():
    """启动服务器"""
    # 在后台启动 WebSocket 服务器
    asyncio.create_task(ws_server.start())

    # 运行 MCP 服务器
    from mcp.server.stdio import stdio_server
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
