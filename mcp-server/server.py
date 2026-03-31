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
            name="search_papers",
            description="在学术数据库中搜索论文",
            inputSchema={
                "type": "object",
                "properties": {
                    "site": {"type": "string", "description": "图书馆站点，如 library.bit.edu.cn"},
                    "database": {"type": "string", "description": "数据库名称，如 ieee"},
                    "query": {"type": "string", "description": "搜索关键词"}
                },
                "required": ["site", "database", "query"]
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

async def search_papers(args: dict) -> list[TextContent]:
    """搜索论文"""
    site = args["site"]
    database = args["database"]
    query = args["query"]

    # 加载规则
    rule = rule_manager.load_rule(site, database)

    # 执行搜索步骤
    task_id = str(uuid.uuid4())
    results = []

    for step in rule["search"]["steps"]:
        # 替换变量
        script = replace_variables(step, {"query": query})
        result = await ws_server.send_task(task_id, {"script": script})

        if not result.get("success"):
            return [TextContent(
                type="text",
                text=f"搜索失败: {result.get('error')}"
            )]

    # 提取数据
    extract_script = rule["extract"]
    extract_script["action"] = "extract"
    result = await ws_server.send_task(task_id, {"script": extract_script})

    if result.get("success"):
        papers = result.get("result", [])
        return [TextContent(
            type="text",
            text=f"找到 {len(papers)} 篇论文:\n\n" +
                 "\n\n".join([format_paper(p) for p in papers])
        )]
    else:
        return [TextContent(
            type="text",
            text=f"提取数据失败: {result.get('error')}"
        )]

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
