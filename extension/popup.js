// 学校域名映射
const SCHOOL_NAMES = {
  'lib.bit.edu.cn': '北京理工大学',
  'lib.tsinghua.edu.cn': '清华大学',
  'lib.pku.edu.cn': '北京大学',
  'lib.ruc.edu.cn': '中国人民大学',
  'lib.bnu.edu.cn': '北京师范大学'
};

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

// 检测当前学校
async function detectSchool() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    const url = new URL(tabs[0].url);
    const hostname = url.hostname;
    const schoolName = SCHOOL_NAMES[hostname] || '未知';
    document.getElementById('currentSchool').textContent = schoolName;
    return hostname;
  }
  return null;
}

// 加载自定义 URL
async function loadCustomUrl() {
  const data = await chrome.storage.local.get(['customDiscoveryUrl']);
  if (data.customDiscoveryUrl) {
    document.getElementById('customUrl').value = data.customDiscoveryUrl;
  }
}

updateStatus();
setInterval(updateStatus, 1000);
detectSchool();
loadCustomUrl();

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

// 打开发现系统按钮
document.getElementById('openDiscoveryBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('result');
  const hostname = await detectSchool();

  // 读取配置文件
  const response = await fetch(chrome.runtime.getURL('discovery-mapping.json'));
  const mapping = await response.json();

  // 读取自定义 URL
  const storage = await chrome.storage.local.get(['customDiscoveryUrl']);
  const customUrl = storage.customDiscoveryUrl;

  // 优先级：自定义 URL > 域名映射 > 默认
  let discoveryUrl = customUrl || mapping[hostname] || mapping['custom'];

  // 打开发现系统
  const tab = await chrome.tabs.create({ url: discoveryUrl });

  // 等待页面加载后检测登录状态
  resultEl.textContent = '正在检测登录状态...';
  resultEl.style.color = '#666';

  setTimeout(async () => {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const welcomePattern = /欢迎来自.*?的朋友/;
          return welcomePattern.test(document.body.textContent);
        }
      });

      if (result.result) {
        resultEl.textContent = '✓ 登录成功！可以开始使用 AI 搜索';
        resultEl.style.color = '#155724';
      } else {
        resultEl.textContent = '✗ 未检测到登录状态，请先登录图书馆';
        resultEl.style.color = '#721c24';
      }
    } catch (e) {
      resultEl.textContent = '⚠ 无法检测登录状态，请手动确认';
      resultEl.style.color = '#856404';
    }
  }, 3000); // 等待 3 秒让页面加载
});

// 保存自定义 URL
document.getElementById('saveUrlBtn').addEventListener('click', async () => {
  const url = document.getElementById('customUrl').value.trim();
  const resultEl = document.getElementById('result');

  if (!url) {
    resultEl.textContent = '✗ 请输入有效的 URL';
    resultEl.style.color = '#721c24';
    return;
  }

  await chrome.storage.local.set({ customDiscoveryUrl: url });
  resultEl.textContent = '✓ 自定义 URL 已保存';
  resultEl.style.color = '#155724';
});
