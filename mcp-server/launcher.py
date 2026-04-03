#!/usr/bin/env python3
"""
Library Access MCP - 托盘启动器
双击运行此文件，server 以系统托盘形式常驻，右键退出。
"""
import asyncio
import os
import threading
import time

import pystray
from PIL import Image, ImageDraw

# 导入 server 模块中的全局状态
from server import main, ws_server


def _create_icon_image() -> Image.Image:
    """生成托盘图标：蓝底白字 L"""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([2, 2, size - 2, size - 2], fill="#2563eb")
    # 用矩形拼出字母 L（不依赖字体文件）
    draw.rectangle([20, 14, 28, 46], fill="white")  # 竖
    draw.rectangle([20, 38, 44, 46], fill="white")  # 横
    return img


def _start_server_thread():
    """在独立线程中运行 asyncio 事件循环"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(main())


def _status_updater(icon: pystray.Icon):
    """每 2 秒刷新一次 tooltip，显示实时插件连接数"""
    while True:
        count = len(ws_server.clients)
        icon.title = f"Library MCP  |  插件: {count} 个连接"
        time.sleep(2)


def _build_menu() -> pystray.Menu:
    return pystray.Menu(
        pystray.MenuItem("MCP:  localhost:8766", None, enabled=False),
        pystray.MenuItem("WS:   localhost:8765", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", lambda icon, item: (icon.stop(), os._exit(0))),
    )


def main_gui():
    # 启动 server 后台线程
    threading.Thread(target=_start_server_thread, daemon=True).start()

    icon = pystray.Icon(
        name="library-mcp",
        icon=_create_icon_image(),
        title="Library MCP  |  启动中...",
        menu=_build_menu(),
    )

    # 启动 tooltip 刷新线程（等 icon 就绪后）
    def on_setup(ic):
        ic.visible = True
        threading.Thread(target=_status_updater, args=(ic,), daemon=True).start()

    icon.run(setup=on_setup)


if __name__ == "__main__":
    main_gui()
