import asyncio
import json
import time
import websockets
import uuid
from typing import Dict, Set

class WebSocketServer:
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.instance_id = str(uuid.uuid4())
        self.start_time = time.time()
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.pending_tasks: Dict[str, asyncio.Future] = {}

    async def handle_client(self, websocket):
        """处理客户端连接"""
        self.clients.add(websocket)
        print(f"[WebSocket] 客户端已连接，当前连接数: {len(self.clients)}")

        try:
            async for message in websocket:
                data = json.loads(message)
                await self.handle_message(websocket, data)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.remove(websocket)
            print(f"[WebSocket] 客户端已断开，当前连接数: {len(self.clients)}")

    async def handle_message(self, websocket, data):
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
            # 直接回复发送者
            await websocket.send(json.dumps({'type': 'INSTANCE_RESPONSE', 'instanceId': self.instance_id}))
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
            ws = await asyncio.wait_for(
                websockets.connect(f"ws://{self.host}:{port}"),
                timeout=0.5  # 500ms 足够了
            )
            try:
                await ws.send(json.dumps({'type': 'INSTANCE_CHECK'}))
                response = await asyncio.wait_for(ws.recv(), timeout=0.5)
                data = json.loads(response)
                if data.get('type') == 'INSTANCE_RESPONSE':
                    print(f"[WebSocket] 端口 {port} 检测到实例: {data.get('instanceId', 'unknown')[:8]}")
                    return True
            finally:
                await ws.close()
        except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
            pass
        except Exception as e:
            print(f"[WebSocket] 端口 {port} 检查异常: {e}")
        return False

    async def find_available_port(self, start_port: int, max_attempts: int = 10) -> int:
        """查找可用端口，如果发现旧实例则尝试杀掉"""
        print(f"[WebSocket] 开始扫描端口 {start_port}-{start_port + max_attempts - 1}...")

        # 检查首选端口是否有旧实例
        if await self.check_existing_instance(start_port):
            print(f"[WebSocket] 检测到旧实例在端口 {start_port}，尝试杀掉...")
            await self.kill_old_instance(start_port)
            await asyncio.sleep(0.5)  # 等待端口释放

        # 尝试绑定首选端口
        try:
            server = await websockets.serve(lambda ws: None, self.host, start_port)
            server.close()
            await server.wait_closed()
            print(f"[WebSocket] 端口 {start_port} 可用")
            return start_port
        except OSError:
            print(f"[WebSocket] 端口 {start_port} 仍被占用，查找其他端口...")

        # 如果首选端口不可用，尝试其他端口
        for port in range(start_port + 1, start_port + max_attempts):
            try:
                server = await websockets.serve(lambda ws: None, self.host, port)
                server.close()
                await server.wait_closed()
                print(f"[WebSocket] 端口 {port} 可用")
                return port
            except OSError:
                continue

        raise Exception(f"无法找到可用端口 ({start_port}-{start_port + max_attempts - 1})")

    async def kill_old_instance(self, port: int):
        """尝试杀掉占用指定端口的旧 Python 进程"""
        try:
            import subprocess
            import platform

            if platform.system() == "Windows":
                # 用 PowerShell 查找并终止占用端口的进程（比 netstat 更可靠）
                result = subprocess.run(
                    ["powershell", "-Command",
                     f"Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue"
                     f" | Select-Object -ExpandProperty OwningProcess"
                     f" | ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}"],
                    capture_output=True, text=True, timeout=5
                )
                print(f"[WebSocket] PowerShell 终止结果: {result.returncode}")
            else:
                # Linux/Mac
                result = subprocess.run(
                    ["lsof", "-ti", f":{port}"],
                    capture_output=True, text=True, timeout=2
                )
                pid = result.stdout.strip()
                if pid:
                    print(f"[WebSocket] 找到旧进程 PID: {pid}，尝试终止...")
                    subprocess.run(["kill", "-9", pid], timeout=2)
        except Exception as e:
            print(f"[WebSocket] 无法杀掉旧进程: {e}")

    async def start(self):
        """启动 WebSocket 服务器"""
        # 在独立服务器模式下，使用固定端口，不再查找可用端口
        async with websockets.serve(self.handle_client, self.host, self.port):
            print(f"[WebSocket] 服务器已启动: ws://{self.host}:{self.port}")
            await asyncio.Future()  # 永久运行
