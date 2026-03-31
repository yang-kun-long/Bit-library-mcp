// WebSocket 连接到本地 MCP 服务器
let ws = null;
let isConnected = false;
let pending_tasks = {};

// 连接到 MCP 服务器
function connectToMCP() {
  ws = new WebSocket('ws://localhost:8765');

  ws.onopen = () => {
    console.log('[MCP] 已连接到服务器');
    isConnected = true;
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('[MCP] 收到消息:', message);
    handleMessage(message);
  };

  ws.onerror = (error) => {
    console.error('[MCP] WebSocket 错误:', error);
  };

  ws.onclose = () => {
    console.log('[MCP] 连接已断开，5秒后重连');
    isConnected = false;
    setTimeout(connectToMCP, 5000);
  };
}

// 处理来自 MCP 服务器的消息
function handleMessage(message) {
  const { type, taskId, payload } = message;

  if (type === 'PONG') {
    // 标记 PONG 收到
    pending_tasks[taskId] = true;
    return;
  }

  // 转发给对应的 content script
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'MCP_TASK',
        taskId,
        payload
      }).catch(() => {});
    });
  });
}

// 接收来自 content script 和 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE_SCRIPT') {
    // 转发给 MCP 服务器
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT',
        taskId: message.taskId,
        data: message.data
      }));
    }
  } else if (message.type === 'CHECK_STATUS') {
    sendResponse({ connected: isConnected });
  } else if (message.type === 'PING_TEST') {
    // 测试连接
    if (ws && isConnected) {
      const startTime = Date.now();
      const testId = 'ping-' + Date.now();

      ws.send(JSON.stringify({
        type: 'PING',
        taskId: testId
      }));

      // 等待 PONG
      const checkPong = setInterval(() => {
        if (pending_tasks[testId]) {
          clearInterval(checkPong);
          const time = Date.now() - startTime;
          delete pending_tasks[testId];
          sendResponse({ success: true, time });
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkPong);
        sendResponse({ success: false });
      }, 5000);
    } else {
      sendResponse({ success: false });
    }
  }
  return true;
});

// 启动时连接
connectToMCP();
