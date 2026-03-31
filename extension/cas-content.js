// 在 CAS 登录页自动执行登录
(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const service = urlParams.get('service');

  if (!service) return;

  // 检查是否在 CAS 登录页
  const isCasLogin =
    (location.hostname === 'sso.bit.edu.cn' && location.pathname === '/cas/login') ||
    (location.hostname === 'webvpn.bit.edu.cn' && /^\/https?\/[0-9a-f]+\/cas\/login$/.test(location.pathname));

  if (!isCasLogin) return;

  // 监听来自 background 的登录指令
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'DO_CAS_LOGIN') {
      try {
        // 请求 background 执行登录
        const response = await chrome.runtime.sendMessage({
          type: 'EXECUTE_CAS_LOGIN',
          service: service,
          isWebVpn: location.hostname === 'webvpn.bit.edu.cn'
        });

        if (response.success) {
          // 先跳转到图书馆建立 session
          location.href = response.loginUrl;
        } else {
          console.error('[CAS Login]', response.error);
          alert('登录失败: ' + response.error);
        }
      } catch (error) {
        console.error('[CAS Login]', error);
        alert('登录失败: ' + error.message);
      }
    }
  });

  // 通知 background 已准备好
  chrome.runtime.sendMessage({ type: 'CAS_PAGE_READY', service });
})();
