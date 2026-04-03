#!/usr/bin/env python3
import sys
import json
import requests

URL = "http://localhost:8766/mcp"
HEADERS = {"Authorization": "Bearer any-local-token"}

for line in sys.stdin:
    try:
        request = json.loads(line)
        response = requests.post(URL, json=request, headers=HEADERS)
        print(json.dumps(response.json()), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
