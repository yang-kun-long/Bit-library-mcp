#!/usr/bin/env python3
"""
快速测试脚本 - Library Access MCP v2.0.0
测试服务器的所有端点和功能
"""
import requests
import json
import time
import sys

BASE_URL = "http://localhost:8765"

def print_test(name, passed, details=""):
    """打印测试结果"""
    status = "[PASS]" if passed else "[FAIL]"
    print(f"{status} - {name}")
    if details:
        print(f"   {details}")

def test_server_info():
    """测试服务器信息端点"""
    try:
        response = requests.get(f"{BASE_URL}/")
        data = response.json()
        passed = (
            response.status_code == 200 and
            data.get("name") == "Library Access MCP Server" and
            data.get("version") == "2.0.0"
        )
        print_test("服务器信息", passed, f"版本: {data.get('version')}")
        return passed
    except Exception as e:
        print_test("服务器信息", False, str(e))
        return False

def test_health():
    """测试健康检查端点"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        data = response.json()
        passed = response.status_code == 200 and data.get("status") == "healthy"
        print_test("健康检查", passed)
        return passed
    except Exception as e:
        print_test("健康检查", False, str(e))
        return False

def test_status():
    """测试状态查询端点"""
    try:
        response = requests.get(f"{BASE_URL}/status")
        data = response.json()
        passed = (
            response.status_code == 200 and
            data.get("status") == "running" and
            data.get("http_port") == 8765 and
            data.get("ws_port") == 8766
        )
        details = f"HTTP: {data.get('http_port')}, WS: {data.get('ws_port')}, 浏览器连接: {data.get('browser_clients')}"
        print_test("状态查询", passed, details)
        return passed
    except Exception as e:
        print_test("状态查询", False, str(e))
        return False

def test_mcp_endpoint():
    """测试 MCP 端点（基础连接）"""
    try:
        # 发送一个简单的 JSON-RPC 请求
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        }
        response = requests.post(f"{BASE_URL}/mcp", json=payload)
        passed = response.status_code == 200
        print_test("MCP 端点", passed, f"状态码: {response.status_code}")
        return passed
    except Exception as e:
        print_test("MCP 端点", False, str(e))
        return False

def test_response_time():
    """测试响应时间"""
    try:
        start = time.time()
        response = requests.get(f"{BASE_URL}/health")
        elapsed = (time.time() - start) * 1000
        passed = elapsed < 100  # 期望小于 100ms
        print_test("响应时间", passed, f"{elapsed:.2f}ms")
        return passed
    except Exception as e:
        print_test("响应时间", False, str(e))
        return False

def main():
    """运行所有测试"""
    print("=" * 60)
    print("Library Access MCP v2.0.0 - 快速测试")
    print("=" * 60)
    print()

    tests = [
        ("服务器信息", test_server_info),
        ("健康检查", test_health),
        ("状态查询", test_status),
        ("MCP 端点", test_mcp_endpoint),
        ("响应时间", test_response_time),
    ]

    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append(result)
        except Exception as e:
            print(f"❌ 测试异常 - {name}: {e}")
            results.append(False)
        print()

    # 总结
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Test Results: {passed}/{total} passed")

    if passed == total:
        print("[SUCCESS] All tests passed! Server is running normally.")
        return 0
    else:
        print("[ERROR] Some tests failed. Please check server status.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
