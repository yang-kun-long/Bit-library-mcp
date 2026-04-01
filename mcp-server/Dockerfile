FROM python:3.11-slim

WORKDIR /app

# 安装基础依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝服务端代码
# 假设 build 时上下文在项目根目录
COPY mcp-server/ /app/

# 创建必要的运行时目录
RUN mkdir -p /app/Research/papers

# 端口映射（WebSocket）
EXPOSE 8765

# 启动服务端
# 注意：MCP 通常通过 stdio 运行，这里作为容器也可以支持远程调试或 WS 模式
ENTRYPOINT ["python", "server.py"]