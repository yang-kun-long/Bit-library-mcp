import asyncio
import json
import websockets
import uuid
from typing import Dict, Set

class WebSocketServer:
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.instance_id = str(uuid.uuid4())
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.pending_tasks: Dict[str, asyncio.Future] = {}

    async def handle_client(self, websocket):
        """处理客户端连接"""
        self.clients.add(websocket)
        print(f"[WebSocket] 客户端已连接，当前连接数: {len(self.clients)}")

        try:
            async for message in websocket:
                data = json.loads(message)
                await self.handle_message(data)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.remove(websocket)
            print(f"[WebSocket] 客户端已断开，当前连接数: {len(self.clients)}")

    async def handle_message(self, data):
        """处理来自浏览器插件的消息"""
        msg_type = data.get('type')
        task_id = data.get('taskId')
        print(f"[WebSocket] 收到消息: type={msg_type}, taskId={task_id}")

        if msg_type == 'PING':
            # 响应 PING
            await asyncio.gather(
                *[client.send(json.dumps({'type': 'PONG', 'taskId': task_id}))
                  for client in self.clients],
                return_exceptions=True
            )
        elif msg_type == 'INSTANCE_CHECK':
            # 响应实例检查
            await asyncio.gather(
                *[client.send(json.dumps({'type': 'INSTANCE_RESPONSE', 'instanceId': self.instance_id}))
                  for client in self.clients],
                return_exceptions=True
            )
        elif msg_type == 'RESULT' and task_id in self.pending_tasks:
            # 完成等待中的任务
            future = self.pending_tasks.pop(task_id)
            future.set_result(data.get('data'))

    async def send_task(self, task_id: str, payload: dict) -> dict:
        """发送任务到浏览器插件并等待结果"""
        if not self.clients:
            raise Exception("没有可用的浏览器连接")

        # 创建等待 future
        future = asyncio.Future()
        self.pending_tasks[task_id] = future

        # 发送任务
        message = json.dumps({
            'type': 'TASK',
            'taskId': task_id,
            'payload': payload
        })

        # 广播给所有连接的客户端
        await asyncio.gather(
            *[client.send(message) for client in self.clients],
            return_exceptions=True
        )

        # 等待结果（30秒超时）
        try:
            result = await asyncio.wait_for(future, timeout=30.0)
            return result
        except asyncio.TimeoutError:
            self.pending_tasks.pop(task_id, None)
            raise Exception("任务执行超时")

    async def check_existing_instance(self, port: int) -> bool:
        """检查指定端口是否有 MCP 服务器运行（任何实例）"""
        try:
            async with websockets.connect(f"ws://{self.host}:{port}", timeout=2) as ws:
                await ws.send(json.dumps({'type': 'INSTANCE_CHECK'}))
                response = await asyncio.wait_for(ws.recv(), timeout=2)
                data = json.loads(response)
                # 只要有响应 INSTANCE_RESPONSE，就认为有实例在运行
                return data.get('type') == 'INSTANCE_RESPONSE'
        except:
            pass
        return False

    async def find_available_port(self, start_port: int, max_attempts: int = 10) -> int:
        """查找可用端口，如果发现任何实例已运行则退出"""
        # 先扫描所有可能的端口，检查是否已有实例运行
        for port in range(start_port, start_port + max_attempts):
            if await self.check_existing_instance(port):
                print(f"[WebSocket] 检测到 MCP 服务器已在端口 {port} 运行，退出以避免重复实例")
                raise SystemExit(0)

        # 没有实例运行，查找第一个可用端口
        for port in range(start_port, start_port + max_attempts):
            try:
                server = await websockets.serve(lambda ws: None, self.host, port)
                server.close()
                await server.wait_closed()
                return port
            except OSError:
                continue
        raise Exception(f"无法找到可用端口 ({start_port}-{start_port + max_attempts - 1})")

    async def start(self):
        """启动 WebSocket 服务器"""
        # 查找可用端口
        self.port = await self.find_available_port(self.port)

        async with websockets.serve(self.handle_client, self.host, self.port):
            print(f"[WebSocket] 服务器已启动: ws://{self.host}:{self.port} (实例ID: {self.instance_id[:8]})")
            await asyncio.Future()  # 永久运行
