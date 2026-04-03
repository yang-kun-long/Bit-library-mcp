/**
 * 最小化浏览器插件 - WebSocket 客户端
 * 连接 MCP Server 并执行浏览器操作
 */

const WS_URL = 'ws://localhost:8766/ws';
let ws = null;
let reconnectTimer = null;

console.log('[Demo Plugin] 启动');

function connect() {
  console.log('[Demo Plugin] 连接服务器:', WS_URL);
  
  ws = new WebSocket(WS_URL);
  
  ws.onopen = () => {
    console.log('[Demo Plugin] 已连接');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };
  
  ws.onmessage = async (event) => {
    console.log('[Demo Plugin] 收到消息:', event.data);
    
    try {
      const data = JSON.parse(event.data);
      
      // 处理任务
      if (data.type === 'TASK') {
        const { task_id, action, params } = data;
        console.log(`[Demo Plugin] 执行任务 ${task_id}:`, action, params);
        
        let result = '未知操作';
        
        if (action === 'open_tab') {
          // 打开新标签页
          const url = params.url || 'about:blank';
          const tab = await chrome.tabs.create({ url });
          result = `已打开标签页 ${tab.id}: ${url}`;
          console.log('[Demo Plugin]', result);
        }
        
        // 返回结果
        const response = {
          type: 'TASK_RESULT',
          task_id,
          result
        };
        ws.send(JSON.stringify(response));
        console.log('[Demo Plugin] 返回结果:', response);
      }
    } catch (e) {
      console.error('[Demo Plugin] 处理消息错误:', e);
    }
  };
  
  ws.onclose = () => {
    console.log('[Demo Plugin] 连接关闭');
    ws = null;
    
    // 5 秒后重连
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 5000);
    }
  };
  
  ws.onerror = (error) => {
    console.error('[Demo Plugin] WebSocket 错误:', error);
  };
}

// 启动连接
connect();
