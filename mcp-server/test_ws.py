#!/usr/bin/env python3
"""
独立的 WebSocket 服务器，用于测试
"""
import asyncio
from websocket_server import WebSocketServer

async def main():
    server = WebSocketServer()
    print("[启动] WebSocket 服务器正在启动...")
    await server.start()

if __name__ == "__main__":
    asyncio.run(main())
