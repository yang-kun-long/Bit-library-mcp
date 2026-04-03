"""
最小化 MCP Server - HTTP transport + WebSocket for extension
验证 Bearer token 认证方案
"""

import asyncio
import json
import logging
from typing import Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException, Header
from fastapi.responses import JSONResponse, PlainTextResponse
import uvicorn

# 配置
TOKEN = "any-local-token"
HTTP_PORT = 8766
WS_PORT = 8765

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# 全局状态：连接的插件
connected_plugins: list[WebSocket] = []
pending_tasks: dict[str, asyncio.Future] = {}  # task_id -> Future


def check_auth(auth_header: str | None) -> bool:
    """验证 Bearer token"""
    if not auth_header:
        return False
    return auth_header == f"Bearer {TOKEN}"


# MCP 工具定义
TOOLS = [
    {
        "name": "open_tab",
        "description": "在浏览器中打开新标签页",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "要打开的 URL"
                }
            },
            "required": ["url"]
        }
    },
    {
        "name": "ping",
        "description": "测试连接",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    }
]


async def execute_tool(name: str, arguments: dict) -> dict:
    """执行工具并返回结果"""
    if name == "ping":
        return {"content": [{"type": "text", "text": "pong"}]}
    
    elif name == "open_tab":
        url = arguments.get("url", "about:blank")
        
        # 发送任务给插件
        if not connected_plugins:
            return {
                "content": [{"type": "text", "text": "错误：没有插件连接"}],
                "isError": True
            }
        
        # 生成任务 ID
        task_id = f"task_{asyncio.get_event_loop().time():.0f}"
        
        # 创建 Future 等待结果
        future = asyncio.get_event_loop().create_future()
        pending_tasks[task_id] = future
        
        # 发送给第一个连接的插件
        plugin = connected_plugins[0]
        task = {
            "type": "TASK",
            "task_id": task_id,
            "action": "open_tab",
            "params": {"url": url}
        }
        
        try:
            await plugin.send_json(task)
            logger.info(f"已发送任务 {task_id} 给插件: {task}")
            
            # 等待结果（超时 10 秒）
            result = await asyncio.wait_for(future, timeout=10.0)
            return {"content": [{"type": "text", "text": f"成功：{result}"}]}
        except asyncio.TimeoutError:
            del pending_tasks[task_id]
            return {
                "content": [{"type": "text", "text": "错误：插件响应超时"}],
                "isError": True
            }
        except Exception as e:
            if task_id in pending_tasks:
                del pending_tasks[task_id]
            return {
                "content": [{"type": "text", "text": f"错误：{str(e)}"}],
                "isError": True
            }
    
    else:
        return {
            "content": [{"type": "text", "text": f"未知工具：{name}"}],
            "isError": True
        }


# FastAPI 应用
@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时打印配置"""
    logger.info(f"MCP Server 启动在 http://localhost:{HTTP_PORT}")
    logger.info(f"WebSocket 端点 ws://localhost:{HTTP_PORT}/ws")
    logger.info(f"认证 token: {TOKEN}")
    yield

app = FastAPI(title="Demo MCP Server", lifespan=lifespan)


# MCP over HTTP 端点
@app.post("/mcp")
async def mcp_endpoint(request: Request, authorization: str | None = Header(None)):
    """处理 MCP JSON-RPC 请求"""
    
    # 验证认证
    if not check_auth(authorization):
        logger.warning(f"认证失败: {authorization}")
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # 解析请求
    try:
        body = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    logger.info(f"收到 MCP 请求: {json.dumps(body, indent=2)}")
    
    method = body.get("method")
    params = body.get("params", {})
    request_id = body.get("id")
    
    # 处理请求
    response: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id}
    
    if method == "initialize":
        response["result"] = {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "demo-mcp-server",
                "version": "1.0.0"
            }
        }
    
    elif method == "tools/list":
        response["result"] = {"tools": TOOLS}
    
    elif method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        result = await execute_tool(tool_name, tool_args)
        response["result"] = result
    
    elif method == "ping":
        response["result"] = {}
    
    else:
        response["error"] = {"code": -32601, "message": f"Method not found: {method}"}
    
    logger.info(f"返回 MCP 响应: {json.dumps(response, indent=2)}")
    return JSONResponse(response)


# WebSocket 端点（供插件连接）
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """插件 WebSocket 连接"""
    await websocket.accept()
    connected_plugins.append(websocket)
    logger.info(f"插件已连接，当前连接数: {len(connected_plugins)}")
    
    try:
        while True:
            data = await websocket.receive_json()
            logger.info(f"收到插件消息: {data}")
            
            # 处理任务结果
            if data.get("type") == "TASK_RESULT":
                task_id = data.get("task_id")
                result = data.get("result")
                
                if task_id in pending_tasks:
                    future = pending_tasks.pop(task_id)
                    future.set_result(result)
                    logger.info(f"任务 {task_id} 完成: {result}")
    
    except WebSocketDisconnect:
        connected_plugins.remove(websocket)
        logger.info(f"插件断开连接，当前连接数: {len(connected_plugins)}")
    except Exception as e:
        logger.error(f"WebSocket 错误: {e}")
        if websocket in connected_plugins:
            connected_plugins.remove(websocket)


# 健康检查
@app.get("/health")
async def health():
    return {"status": "ok", "plugins": len(connected_plugins)}


async def stdio_server():
    """stdio 模式 MCP 服务器（给 Claude Code 用）"""
    import sys

    logger.info("MCP Server 运行在 stdio 模式")

    async def read_stdin():
        loop = asyncio.get_event_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)
        return reader

    reader = await read_stdin()

    while True:
        try:
            line = await reader.readline()
            if not line:
                break

            body = json.loads(line.decode())
            method = body.get("method")
            params = body.get("params", {})
            request_id = body.get("id")

            response = {"jsonrpc": "2.0", "id": request_id}

            if method == "initialize":
                response["result"] = {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "demo-mcp-server", "version": "1.0.0"}
                }
            elif method == "tools/list":
                response["result"] = {"tools": TOOLS}
            elif method == "tools/call":
                result = await execute_tool(params.get("name"), params.get("arguments", {}))
                response["result"] = result
            elif method == "ping":
                response["result"] = {}
            else:
                response["error"] = {"code": -32601, "message": f"Method not found: {method}"}

            print(json.dumps(response), flush=True)

        except Exception as e:
            logger.error(f"stdio 错误: {e}")
            break


if __name__ == "__main__":
    import sys

    # 检测运行模式
    if sys.stdin.isatty():
        # 终端模式 -> HTTP 服务器
        uvicorn.run(app, host="localhost", port=HTTP_PORT)
    else:
        # stdio 模式 -> Claude Code
        asyncio.run(stdio_server())
