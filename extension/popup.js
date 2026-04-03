// 学校域名映射
const SCHOOL_NAMES = {
  'lib.bit.edu.cn': '北京理工大学',
  'lib.tsinghua.edu.cn': '清华大学',
  'lib.pku.edu.cn': '北京大学',
  'lib.ruc.edu.cn': '中国人民大学',
  'lib.bnu.edu.cn': '北京师范大学'
};

// 检查连接状态
let connectionStartTime = null;

function updateStatus() {
  chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response) => {
    const statusEl = document.getElementById('status');
    const serverPortEl = document.getElementById('serverPort');
    const connectionTimeEl = document.getElementById('connectionTime');

    if (response && response.connected) {
      statusEl.textContent = `已连接到 MCP 服务器`;
      statusEl.className = 'status connected';
      serverPortEl.textContent = response.port;

      // 计算连接时长
      if (!connectionStartTime) {
        connectionStartTime = Date.now();
      }
      const elapsed = Math.floor((Date.now() - connectionStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      connectionTimeEl.textContent = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
    } else {
      statusEl.textContent = `未连接到 MCP 服务器`;
      statusEl.className = 'status disconnected';
      serverPortEl.textContent = response?.port || '-';
      connectionTimeEl.textContent = '-';
      connectionStartTime = null;
    }
  });
}

// 显示插件版本
function showPluginVersion() {
  const manifest = chrome.runtime.getManifest();
  document.getElementById('pluginVersion').textContent = manifest.version;
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

// 加载 MCP 端口
async function loadMcpPort() {
  const data = await chrome.storage.local.get(['mcpPort']);
  document.getElementById('mcpPort').value = data.mcpPort || 8765;
}

showPluginVersion();
updateStatus();
setInterval(updateStatus, 1000);
detectSchool();
loadCustomUrl();
loadMcpPort();

// 测试按钮
document.getElementById('testBtn').addEventListener('click', () => {
  const resultEl = document.getElementById('result');
  resultEl.textContent = '发送测试消息...';

  chrome.runtime.sendMessage({ type: 'PING_TEST' }, (response) => {
    if (response && response.success) {
      resultEl.textContent = `✓ 测试成功！往返时间: ${response.elapsed}ms`;
      resultEl.style.color = '#155724';
    } else {
      resultEl.textContent = `✗ 测试失败: ${response?.error || '未知错误'}`;
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

  // 只对智真系统检测登录状态
  if (discoveryUrl.includes('ss.zhizhen.com')) {
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
    }, 3000);
  } else {
    resultEl.textContent = `✓ 已打开发现系统，请手动确认登录状态`;
    resultEl.style.color = '#155724';
  }
});

// 保存 MCP 端口并重连
document.getElementById('saveMcpPortBtn').addEventListener('click', async () => {
  const port = parseInt(document.getElementById('mcpPort').value);
  const resultEl = document.getElementById('result');
  if (!port || port < 1024 || port > 65535) {
    resultEl.textContent = '✗ 请输入有效端口（1024-65535）';
    resultEl.style.color = '#721c24';
    return;
  }
  await chrome.storage.local.set({ mcpPort: port });
  chrome.runtime.sendMessage({ type: 'RECONNECT' });
  resultEl.textContent = `✓ 已切换到端口 ${port}，正在重连...`;
  resultEl.style.color = '#155724';
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
