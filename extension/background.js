// WebSocket 连接到本地 MCP 服务器
let ws = null;
let isConnected = false;
let pending_tasks = {};

// 导入 CAS 登录模块
importScripts('cas-login.js');

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

// 心跳保活，防止 service worker 休眠
setInterval(() => {
  if (ws && isConnected) {
    ws.send(JSON.stringify({ type: 'PING', taskId: 'keepalive-' + Date.now() }));
  }
}, 20000); // 每 20 秒发送一次

// 处理来自 MCP 服务器的消息
function handleMessage(message) {
  const { type, taskId, payload } = message;

  if (type === 'PONG') {
    // 标记 PONG 收到
    pending_tasks[taskId] = true;
    return;
  }

  if (type === 'CAS_LOGIN') {
    handleCasLogin(taskId, payload);
    return;
  }

  if (type === 'OPEN_URL') {
    handleOpenUrl(taskId, payload);
    return;
  }

  if (type === 'SEARCH_PAPERS') {
    handleSearchPapers(taskId, payload);
    return;
  }

  if (type === 'TASK') {
    if (payload?.type === 'CAS_LOGIN') {
      handleCasLogin(taskId, payload);
      return;
    }
    if (payload?.type === 'OPEN_URL') {
      handleOpenUrl(taskId, payload);
      return;
    }
    if (payload?.type === 'SEARCH_PAPERS') {
      handleSearchPapers(taskId, payload);
      return;
    }
    // 其他 TASK 转发给 content script 执行
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'MCP_TASK',
          taskId,
          payload
        }).catch(() => {});
      });
    });
    return;
  }
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
  } else if (message.type === 'EXECUTE_CAS_LOGIN') {
    // content script 请求执行 CAS 登录
    (async () => {
      try {
        const ticket = await casLogin(message.service);
        const loginUrl = await buildLoginUrl(message.service, ticket, message.isWebVpn);

        // 回复给 content script
        sendResponse({ success: true, loginUrl });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 异步响应
  } else if (message.type === 'CAS_LOGIN_SUCCESS') {
    // CAS 登录成功，记录登录 URL（如果需要跳转到发现系统，会在 handleCasLogin 中处理）
    console.log('[CAS Login] 登录成功:', message.loginUrl);
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

async function handleCasLogin(taskId, payload) {
  try {
    const service = payload.service;
    const redirectTo = payload.redirect_to;

    // 构建 CAS 登录页 URL
    const casLoginUrl = `https://sso.bit.edu.cn/cas/login?service=${encodeURIComponent(service)}`;

    // 打开 CAS 登录页
    const tab = await chrome.tabs.create({ url: casLoginUrl });

    // 等待页面加载并执行登录
    const listener = async (message, sender) => {
      if (message.type === 'CAS_PAGE_READY' && sender.tab?.id === tab.id) {
        chrome.runtime.onMessage.removeListener(listener);

        // 通知 content script 执行登录（会跳转到图书馆）
        chrome.tabs.sendMessage(tab.id, { type: 'DO_CAS_LOGIN' });

        // 等待图书馆页面加载完成，然后新建标签页打开发现系统
        if (redirectTo) {
          setTimeout(async () => {
            const newTab = await chrome.tabs.create({ url: redirectTo });

            // 等待发现系统页面加载并验证登录状态
            setTimeout(async () => {
              try {
                const result = await chrome.tabs.sendMessage(newTab.id, { type: 'CHECK_LOGIN_STATUS' });

                if (ws && isConnected) {
                  ws.send(JSON.stringify({
                    type: 'RESULT',
                    taskId: taskId,
                    data: result
                  }));
                }
              } catch (error) {
                if (ws && isConnected) {
                  ws.send(JSON.stringify({
                    type: 'RESULT',
                    taskId: taskId,
                    data: { success: false, error: '验证登录状态失败' }
                  }));
                }
              }
            }, 5000);
          }, 3000);
        } else {
          if (ws && isConnected) {
            ws.send(JSON.stringify({
              type: 'RESULT',
              taskId: taskId,
              data: { success: true, message: '正在登录...' }
            }));
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    // 超时处理
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
    }, 15000);

  } catch (error) {
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT',
        taskId: taskId,
        data: { success: false, error: error.message }
      }));
    }
  }
}

async function handleOpenUrl(taskId, payload) {
  try {
    const url = payload.url;
    await chrome.tabs.create({ url: url });

    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT',
        taskId: taskId,
        data: { success: true }
      }));
    }
  } catch (error) {
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT',
        taskId: taskId,
        data: { success: false, error: error.message }
      }));
    }
  }
}

async function handleSearchPapers(taskId, payload) {
  try {
    const query = payload.query;

    // 查找发现系统的标签页
    const tabs = await chrome.tabs.query({ url: 'https://ss.zhizhen.com/*' });

    if (tabs.length === 0) {
      if (ws && isConnected) {
        ws.send(JSON.stringify({
          type: 'RESULT',
          taskId: taskId,
          data: { success: false, error: '未找到发现系统页面，请先登录' }
        }));
      }
      return;
    }

    const tab = tabs[0];

    // 激活并刷新标签页，确保 content script 加载
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.tabs.reload(tab.id);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 发送搜索指令到 content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'SEARCH_PAPERS',
      query: query
    });

    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT',
        taskId: taskId,
        data: response
      }));
    }
  } catch (error) {
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT',
        taskId: taskId,
        data: { success: false, error: error.message }
      }));
    }
  }
}

// 启动时连接
connectToMCP();
