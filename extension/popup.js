// 检查连接状态
function updateStatus() {
  chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response) => {
    const statusEl = document.getElementById('status');
    if (response && response.connected) {
      statusEl.textContent = '已连接到 MCP 服务器';
      statusEl.className = 'status connected';
    } else {
      statusEl.textContent = '未连接到 MCP 服务器';
      statusEl.className = 'status disconnected';
    }
  });
}

updateStatus();
setInterval(updateStatus, 1000); // 每秒刷新

// 测试按钮
document.getElementById('testBtn').addEventListener('click', () => {
  const resultEl = document.getElementById('result');
  resultEl.textContent = '发送测试消息...';

  const startTime = Date.now();
  chrome.runtime.sendMessage({ type: 'PING_TEST' }, (response) => {
    const elapsed = Date.now() - startTime;
    if (response && response.success) {
      resultEl.textContent = `✓ 测试成功！往返时间: ${elapsed}ms`;
      resultEl.style.color = '#155724';
    } else {
      resultEl.textContent = '✗ 测试失败';
      resultEl.style.color = '#721c24';
    }
  });
});
