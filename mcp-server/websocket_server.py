import asyncio
import json
import websockets
from typing import Dict, Set

class WebSocketServer:
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
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

    async def start(self):
        """启动 WebSocket 服务器"""
        async with websockets.serve(self.handle_client, self.host, self.port):
            print(f"[WebSocket] 服务器已启动: ws://{self.host}:{self.port}")
            await asyncio.Future()  # 永久运行
