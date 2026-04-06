#!/usr/bin/env python3
import asyncio
import contextlib
import json
import time
import uuid
from mcp.server import Server
from mcp.types import Tool, TextContent
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.requests import Request
from starlette.responses import JSONResponse
import uvicorn
from websocket_server import WebSocketServer
from rule_manager import RuleManager

# 认证 token（本地固定值，Claude Code 配置时指定）
TOKEN = "library-access-for-LiuWen"

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
            name="login_library",
            description="登录图书馆以获取学术资源访问权限。支持自动登录（需要配置凭据）或手动辅助。",
            inputSchema={
                "type": "object",
                "properties": {
                    "university": {"type": "string", "description": "学校代码，例如 'BIT' (北京理工大学)", "default": "BIT"},
                    "service": {"type": "string", "description": "特定的服务 URL", "default": "https://lib.bit.edu.cn/sso/login/3rd?wfwfid=2398&refer=https://lib.bit.edu.cn"},
                    "discovery_url": {"type": "string", "description": "发现系统 URL（如智真/超星），登录后自动跳转", "default": "https://ss.zhizhen.com/"}
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
                    "query": {"type": "string", "description": "搜索关键词（与 adv 二选一）"},
                    "adv": {"type": "string", "description": "直接传入专业检索表达式，优先级高于其他参数。语法示例: JN((Z='transformer')AND(2020<Y<2024)) 。字段: Z全部/T题名/A作者/K关键词/S摘要/O作者单位/Su主题/Y年份。文献类型前缀: JN期刊/BK图书/DT学位/CP会议/PT专利"},
                    "field": {"type": "string", "description": "检索字段: Z(全部)/Su(主题)/T(题名)/A(作者)/S(摘要)/K(关键词)/O(作者单位)", "default": "Z"},
                    "language": {"type": "string", "description": "语种: 空(全部)/1(中文)/2(外文)", "default": ""},
                    "doc_types": {"type": "array", "items": {"type": "integer"}, "description": "文献类型: 11(图书)/1(期刊)/13(报纸)/3(学位)/4(会议)/6(标准)/46(法规)/47(案例)/10(专利)/8(音视频)/21(成果)/85(图片)"},
                    "year_start": {"type": "string", "description": "开始年份"},
                    "year_end": {"type": "string", "description": "结束年份"},
                    "isbn": {"type": "string", "description": "ISBN"},
                    "issn": {"type": "string", "description": "ISSN"},
                    "page_size": {"type": "integer", "description": "每页显示数量: 15/30/50", "default": 15},
                    "page": {"type": "integer", "description": "页码，从1开始", "default": 1},
                    "sort": {"type": "integer", "description": "排序方式: 0默认/1馆藏优先/2出版日期升序/3出版日期降序/4引文量/6相关性"},
                    "only_catalog": {"type": "boolean", "description": "只显示馆藏目录"},
                    "only_eres": {"type": "boolean", "description": "只显示电子资源"}
                },
                "required": []
            }
        ),
        Tool(
            name="get_paper_detail",
            description="获取论文详情页的完整摘要、作者、关键词、DOI、期刊名等信息",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "论文详情页 URL（search_papers 返回的链接）"},
                    "dxid": {"type": "string", "description": "论文 ID（search_papers 返回的 dxid 字段），用于获取引文格式"}
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="persist_paper",
            description="将抓取的论文元数据固化到本地 Research/ 目录",
            inputSchema={
                "type": "object",
                "properties": {
                    "paper_data": {
                        "type": "object",
                        "description": "由 get_paper_detail 或 search_papers 返回的论文数据对象",
                        "required": ["title"]
                    }
                },
                "required": ["paper_data"]
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
    elif name == "login_library":
        return await login_library(arguments)
    elif name == "open_url":
        return await open_url(arguments)
    elif name == "search_papers":
        return await search_papers(arguments)
    elif name == "get_paper_detail":
        return await get_paper_detail(arguments)
    elif name == "download_paper":
        return await download_paper(arguments)
    elif name == "persist_paper":
        return await persist_paper(arguments)
    else:
        raise ValueError(f"未知工具: {name}")

async def ping_test() -> list[TextContent]:
    """测试连接"""
    try:
        # 基本状态信息
        status_text = f"WebSocket 服务器端口: {ws_server.port}\n"

        if not ws_server.clients:
            status_text += "❌ 没有浏览器连接\n\n"
            status_text += "排错提示:\n"
            status_text += f"1. 请在 Chrome 中启动插件并连接到 ws://localhost:{ws_server.port}\n"
            status_text += "2. 检查插件是否已启用\n"
            status_text += "3. 检查端口是否被占用（可尝试重启浏览器）\n"
            status_text += "4. 查看浏览器控制台是否有连接错误"
            return [TextContent(type="text", text=status_text)]

        # 有连接时，发送 PING 测试
        task_id = str(uuid.uuid4())
        start_time = asyncio.get_event_loop().time()

        # 发送 PING
        message = json.dumps({'type': 'PING', 'taskId': task_id})
        results = await asyncio.gather(
            *[client.send(message) for client in ws_server.clients],
            return_exceptions=True
        )

        # 检查是否有发送失败
        failed_count = sum(1 for r in results if isinstance(r, Exception))

        # 等待 PONG
        await asyncio.sleep(0.1)

        elapsed = (asyncio.get_event_loop().time() - start_time) * 1000

        status_text = "✅ 连接正常\n\n"
        status_text += f"WebSocket 服务器端口: {ws_server.port}\n"
        status_text += f"浏览器连接数: {len(ws_server.clients)}\n"
        if failed_count > 0:
            status_text += f"⚠️ 发送失败: {failed_count} 个连接\n"
        status_text += f"往返时间: {elapsed:.0f}ms\n"

        # 显示每个客户端的详细信息
        if hasattr(ws_server, 'client_info'):
            status_text += "\n客户端详情:\n"
            for i, (client, info) in enumerate(ws_server.client_info.items(), 1):
                status_text += f"  {i}. 版本: {info.get('version', '未知')}, "
                status_text += f"连接时长: {int(time.time() - info.get('connect_time', time.time()))}秒\n"

        return [TextContent(type="text", text=status_text)]
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 测试失败: {str(e)}\n\n请检查 WebSocket 服务器是否正常运行")]

async def login_library(args: dict) -> list[TextContent]:
    """登录图书馆"""
    try:
        if not ws_server.clients:
            return [TextContent(type="text", text="❌ 没有浏览器连接")]

        university = args.get("university", "BIT")
        service = args.get("service", "https://lib.bit.edu.cn/sso/login/3rd?wfwfid=2398&refer=https://lib.bit.edu.cn")
        task_id = str(uuid.uuid4())

        payload = {
            'type': 'LOGIN_LIBRARY',
            'university': university,
            'service': service
        }

        # Provider 会完成整个登录流程（包括验证和兜底），需要更长超时
        result = await ws_server.send_task(task_id, payload, timeout=60.0)

        if result.get("success"):
            return [TextContent(
                type="text",
                text=f"✅ {university} 登录成功\n{result.get('message', '已完成图书馆和发现系统登录验证')}"
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
            return [TextContent(type="text", text="❌ 没有浏览器连接\n→ 建议: 确认浏览器插件已安装并已连接到 MCP 服务器")]

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

            total = result.get("total", "")
            page = args.get("page", 1)
            total_str = f"（共 {total} 条）" if total else ""
            text = f"第 {page} 页，本页 {len(papers)} 篇{total_str}:\n\n"
            for i, paper in enumerate(papers, 1):
                text += f"{i}. {paper.get('title', '无标题')}\n"
                if paper.get('authors'):
                    text += f"   作者: {paper['authors']}\n"
                if paper.get('year'):
                    text += f"   年份: {paper['year']}\n"
                if paper.get('source'):
                    text += f"   来源: {paper['source']}\n"
                if paper.get('dxid'):
                    text += f"   ID: {paper['dxid']}\n"
                if paper.get('cited_by'):
                    text += f"   被引量: {paper['cited_by']}\n"
                if paper.get('keywords'):
                    text += f"   关键词: {paper['keywords']}\n"
                if paper.get('abstract'):
                    text += f"   摘要: {paper['abstract'][:150]}...\n"
                if paper.get('url'):
                    text += f"   链接: {paper['url']}\n"
                text += "\n"

            return [TextContent(type="text", text=text)]
        else:
            return [TextContent(type="text", text=f"❌ 搜索失败: {result.get('error', '未知错误')}\n→ 建议: 调用 login_library 重新登录后重试")]
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 搜索失败: {str(e)}\n→ 建议: 调用 login_library 重新登录后重试")]

async def get_paper_detail(args: dict) -> list[TextContent]:
    """获取论文详情页完整信息"""
    try:
        if not ws_server.clients:
            return [TextContent(type="text", text="❌ 没有浏览器连接")]

        url = args["url"]
        task_id = str(uuid.uuid4())
        payload = {"type": "GET_PAPER_DETAIL", "url": url, "dxid": args.get("dxid", "")}
        result = await ws_server.send_task(task_id, payload)

        if result.get("success"):
            text = ""
            if result.get("abstract"):
                text += f"**摘要**\n{result['abstract']}\n\n"

            if result.get("authors"):
                authors = result["authors"] if isinstance(result["authors"], list) else [result["authors"]]
                text += f"**作者**: {', '.join(authors)}\n"

            if result.get("affiliation"):
                text += f"**单位**: {result['affiliation']}\n"

            if result.get("year"):
                text += f"**年份**: {result['year']}\n"

            # 出版信息合并展示
            venue = result.get("venue", "")
            vol = result.get("volume", "")
            issue = result.get("issue", "")
            pages = result.get("pages", "")
            pub_info = venue
            if vol: pub_info += f", {vol}"
            if issue: pub_info += f" ({issue})"
            if pages: pub_info += f", {pages}"
            if pub_info:
                text += f"**出版信息**: {pub_info}\n"

            if result.get("impactFactor"):
                text += f"**影响因子**: {result['impactFactor']}\n"

            if result.get("indexing"):
                indexing = result["indexing"] if isinstance(result["indexing"], list) else [result["indexing"]]
                text += f"**核心收录**: {' / '.join(indexing)}\n"

            if result.get("keywords"):
                kws = result["keywords"] if isinstance(result["keywords"], list) else [result["keywords"]]
                text += f"**关键词**: {', '.join(kws)}\n"

            if result.get("issn"):
                text += f"**ISSN**: {result['issn']}\n"

            if result.get("classification"):
                text += f"**分类号**: {result['classification']}\n"

            if result.get("doi"):
                text += f"**DOI**: {result['doi']}\n"

            if result.get("funding"):
                text += f"**基金项目**: {result['funding']}\n"

            if result.get("citation"):
                text += f"\n**引文格式**\n{result['citation']}\n"

            return [TextContent(type="text", text=text or "未获取到详情")]
        else:
            return [TextContent(type="text", text=f"❌ 获取失败: {result.get('error', '未知错误')}")]
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 获取失败: {str(e)}")]

async def download_paper(args: dict) -> list[TextContent]:
    """下载论文"""
    # ... 原有代码保持不变 ...

async def persist_paper(args: dict) -> list[TextContent]:
    """将论文元数据固化到本地目录"""
    import os
    from datetime import datetime

    try:
        paper = args.get("paper_data", {})
        title = paper.get("title", "未知标题")
        dxid = paper.get("dxid", "")

        # 1. 准备目录
        research_dir = os.path.join(os.getcwd(), "Research")
        papers_dir = os.path.join(research_dir, "papers")
        os.makedirs(papers_dir, exist_ok=True)

        # 2. 生成文件名
        clean_title = "".join([c for c in title if c.isalnum() or c in " _-"]).strip().replace(" ", "_")
        filename = f"{dxid}_{clean_title[:30]}.md"
        file_path = os.path.join(papers_dir, filename)

        # 3. 构造 Markdown 内容
        authors = paper.get("authors", [])
        authors_str = ", ".join(authors) if isinstance(authors, list) else str(authors)
        keywords = paper.get("keywords", [])
        keywords_str = ", ".join(keywords) if isinstance(keywords, list) else str(keywords)
        indexing = paper.get("indexing", [])
        indexing_str = " / ".join(indexing) if isinstance(indexing, list) else str(indexing)

        content = f"# {title}\n\n"
        content += "## 基本信息\n"
        content += f"- **标题**: {title}\n"
        content += f"- **作者**: {authors_str}\n"
        content += f"- **单位**: {paper.get('affiliation', '(未获取)')}\n"
        content += f"- **年份**: {paper.get('year', '')}\n"

        venue = paper.get("venue", "")
        vol = paper.get("volume", "")
        issue = paper.get("issue", "")
        pages = paper.get("pages", "")
        pub_info = venue
        if vol: pub_info += f", {vol}"
        if issue: pub_info += f" ({issue})"
        if pages: pub_info += f", {pages}"
        content += f"- **出版信息**: {pub_info}\n"
        content += f"- **ID (dxid)**: {dxid}\n"
        content += f"- **ISSN**: {paper.get('issn', '')}\n"
        content += f"- **DOI**: {paper.get('doi', '(未获取)')}\n\n"

        content += "## 学术指标\n"
        content += f"- **核心收录**: {indexing_str}\n"
        content += f"- **影响因子**: {paper.get('impactFactor', '')}\n"
        content += f"- **被引量**: {paper.get('cited_by', '')}\n\n"

        content += "## 内容摘要\n"
        content += f"{paper.get('abstract', '无摘要')}\n\n"

        content += "## 关键词\n"
        content += f"{keywords_str}\n\n"

        if paper.get('funding'):
            content += "## 基金项目\n"
            content += f"{paper.get('funding')}\n\n"

        if paper.get('citation'):
            content += "## 引文格式\n"
            content += f"`{paper.get('citation')}`\n\n"

        content += "---\n## AI 笔记 / 阅读记录\n*待补充*\n"

        # 4. 写入文件
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        # 5. 更新索引 README.md
        readme_path = os.path.join(research_dir, "README.md")
        date_str = datetime.now().strftime("%Y-%m-%d")
        rel_path = f"papers/{filename}"
        new_row = f"| {date_str} | [{title}]({rel_path}) | {indexing_str} | {keywords_str[:30]} | {dxid} |\n"

        if os.path.exists(readme_path):
            with open(readme_path, "a", encoding="utf-8") as f:
                f.write(new_row)
        else:
            with open(readme_path, "w", encoding="utf-8") as f:
                f.write("# 学术研究记录与文献库 (Research Journal)\n\n")
                f.write("| 固化日期 | 论文标题 | 核心收录 | 关键词 | ID (dxid) |\n")
                f.write("| :--- | :--- | :--- | :--- | :--- |\n")
                f.write(new_row)

        return [TextContent(type="text", text=f"✅ 资产固化成功:\n文件: {file_path}\n索引已更新")]

    except Exception as e:
        return [TextContent(type="text", text=f"❌ 固化失败: {str(e)}")]

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
    """启动服务器（HTTP transport）"""
    session_manager = StreamableHTTPSessionManager(
        app=app,
        json_response=True,
        stateless=True,
    )

    @contextlib.asynccontextmanager
    async def lifespan(starlette_app):
        # 启动 WebSocket 服务器
        ws_task = asyncio.create_task(ws_server.start())
        try:
            async with session_manager.run():
                yield
        finally:
            # 确保 WebSocket 服务器正确关闭
            ws_task.cancel()
            try:
                await ws_task
            except asyncio.CancelledError:
                pass

    async def health_handler(request: Request):
        return JSONResponse({"status": "ok", "plugins": len(ws_server.clients)})

    # /health 走 Starlette 路由，/mcp 用 ASGI 中间件直接接管，避免双重响应问题
    inner_app = Starlette(routes=[Route("/health", health_handler)], lifespan=lifespan)

    class MCPAuthMiddleware:
        def __init__(self, wrapped):
            self.wrapped = wrapped

        async def __call__(self, scope, receive, send):
            if scope["type"] == "http" and scope.get("path", "").startswith("/mcp"):
                headers = dict(scope.get("headers", []))
                auth = headers.get(b"authorization", b"").decode()
                if auth != f"Bearer {TOKEN}":
                    response = JSONResponse({"error": "Unauthorized"}, status_code=401)
                    await response(scope, receive, send)
                    return
                await session_manager.handle_request(scope, receive, send)
                return
            await self.wrapped(scope, receive, send)

    config = uvicorn.Config(MCPAuthMiddleware(inner_app), host="localhost", port=8766, log_level="info", log_config=None)
    server = uvicorn.Server(config)
    await server.serve()

if __name__ == "__main__":
    asyncio.run(main())
