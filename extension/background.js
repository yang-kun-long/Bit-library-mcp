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

  if (type === 'GET_PAPER_DETAIL') {
    handleGetPaperDetail(taskId, payload);
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
    if (payload?.type === 'GET_PAPER_DETAIL') {
      handleGetPaperDetail(taskId, payload);
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

// 文献类型 → 专业检索前缀
const DOC_TYPE_PREFIX = {
  1: 'JN', 2: 'JN',    // 期刊
  11: 'BK', 12: 'BK',  // 图书
  3: 'DT',             // 学位
  4: 'CP',             // 会议
  10: 'PT',            // 专利
  6: 'ST',             // 标准
  8: 'VI',             // 音视频
  13: 'NP',            // 报纸
  21: 'TR',            // 科技成果
  46: 'LW',            // 法律法规
  47: 'CA',            // 案例
  85: 'IMG'            // 图片
};

// 文献类型 → strchannel 值（来自 onclick 参数）
const DOC_TYPE_CHANNEL = {
  1: '1,2', 11: '11,12', 3: '3', 4: '4',
  10: '10', 6: '6', 8: '8', 13: '13',
  21: '21', 46: '46', 47: '47', 85: '85'
};

function buildAdvExpr(payload) {
  if (payload.adv) return payload.adv;
  const { query, field = 'Z', doc_types = [], year_start, year_end } = payload;

  // 基础字段表达式
  let inner = `(${field}='${query}')`;

  // 加年份
  if (year_start || year_end) {
    const ys = year_start || 'null';
    const ye = year_end || 'null';
    inner = `(${inner})AND(${ys}<Y<${ye})`;
  }

  // 加文献类型前缀
  if (doc_types.length > 0) {
    const prefix = DOC_TYPE_PREFIX[doc_types[0]];
    if (prefix) inner = `${prefix}(${inner})`;
  }

  return inner;
}

function buildSearchUrl(payload) {
  const adv = buildAdvExpr(payload);
  const { language, doc_types = [], page_size, sort } = payload;

  let url = `https://ss.zhizhen.com/s?adv=${encodeURIComponent(adv)}&aorp=a`;
  if (language) url += `&strchoren=${language}`;
  if (doc_types.length > 0 && DOC_TYPE_CHANNEL[doc_types[0]]) {
    url += `&strchannel=${encodeURIComponent(DOC_TYPE_CHANNEL[doc_types[0]])}`;
  }
  if (page_size && page_size !== 15) url += `&size=${page_size}`;
  if (sort !== undefined && sort !== null) url += `&isort=${sort}`;
  return url;
}

function waitForTabComplete(tabId, timeout = 15000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeout);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function handleSearchPapers(taskId, payload) {
  try {
    // 查找或使用发现系统标签页
    const tabs = await chrome.tabs.query({ url: 'https://ss.zhizhen.com/*' });
    if (tabs.length === 0) {
      if (ws && isConnected) {
        ws.send(JSON.stringify({
          type: 'RESULT', taskId,
          data: { success: false, error: '未找到发现系统页面，请先登录' }
        }));
      }
      return;
    }
    const tab = tabs[0];

    // Plan A：直接构造结果页 URL 导航
    const searchUrl = buildSearchUrl(payload);
    await chrome.tabs.update(tab.id, { active: true, url: searchUrl });
    await waitForTabComplete(tab.id);
    await new Promise(r => setTimeout(r, 800));

    // 翻页（如果需要）
    const page = payload.page || 1;
    if (page > 1) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (p) => { pageUtil.pages(String(p)); },
        args: [page]
      });
      // pageUtil.pages 可能走 AJAX，不一定触发 navigation，用固定等待
      await new Promise(r => setTimeout(r, 3000));
    }

    // 注入脚本：提取结果
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const norm = s => (s || '').replace(/\s+/g, ' ').trim();
        const findField = (card, label) => {
          const li = Array.from(card.querySelectorAll('li'))
            .find(li => norm(li.querySelector('span')?.textContent) === label);
          return norm(li?.querySelector('.zylist_font')?.textContent);
        };
        const totalEl = document.querySelector('.cur-search-count');
        const total = totalEl ? norm(totalEl.textContent).replace(/,/g, '') : '';
        const cards = document.querySelectorAll('.zyList');
        const papers = Array.from(cards).map(card => {
          const titleA = card.querySelector('.card_name h3 a[href*="detail_"]');
          const source = findField(card, '出处');
          const citedEl = card.querySelector('.hitsNum a[href*="refdetail"]');
          const cited = citedEl ? norm(citedEl.textContent).replace('被引量：', '') : '';
          const dxid = card.querySelector('h3[data-id]')?.dataset?.id
                    || card.querySelector('input.saveTitleBox')?.value || '';
          return {
            title: norm(titleA?.textContent),
            url: titleA?.href || '',
            dxid,
            authors: findField(card, '作者'),
            source,
            year: (source?.match(/\b(19|20)\d{2}\b/) || [])[0] || '',
            keywords: findField(card, '关键词'),
            abstract: findField(card, '摘要'),
            cited_by: cited
          };
        }).filter(p => p.title);
        return { success: true, total, papers };
      }
    });
    const response = result.result;

    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: 'RESULT', taskId, data: response }));
    }
  } catch (error) {
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT', taskId,
        data: { success: false, error: error.message }
      }));
    }
  }
}

async function handleGetPaperDetail(taskId, payload) {
  let tab = null;
  try {
    const url = payload.url;
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabComplete(tab.id);
    await new Promise(r => setTimeout(r, 800));

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (dxid) => {
          const norm = s => (s || '').replace(/\s+/g, ' ').trim();

          // 完整摘要
          const absEl = document.querySelector('#detailAllAbstractId dd')
                     || document.querySelector('#detailSubAbstractId dd');
          const absClone = absEl?.cloneNode(true);
          absClone?.querySelectorAll('a').forEach(a => a.remove());
          const abstract = norm(absClone?.textContent);

          // dl.card_line 字段提取
          const findField = (label) => {
            const dls = Array.from(document.querySelectorAll('dl.card_line'));
            const dl = dls.find(dl => norm(dl.querySelector('dt span')?.textContent) === label);
            return norm(dl?.querySelector('dd')?.textContent);
          };
          const findLinks = (label) => {
            const dls = Array.from(document.querySelectorAll('dl.card_line'));
            const dl = dls.find(dl => norm(dl.querySelector('dt span')?.textContent) === label);
            return Array.from(dl?.querySelectorAll('dd a') || [])
              .map(a => norm(a.textContent)).filter(Boolean);
          };

          const venue = ['期刊名', '会议名称', '会议名', '会议']
            .map(findField).find(Boolean) || '';
          const doi = findField('d  o  i');
          const year = findField('年份');
          const keywords = findLinks('关键词');
          const authors = findLinks('作者').length
            ? findLinks('作者')
            : findField('作者')?.split(/[;；,，]/).map(s => norm(s)).filter(Boolean);

          // 获取标准引文格式
          let citation = '';
          if (dxid) {
            try {
              const resp = await fetch(`/fav/outputDetailRefer?type=3&dxid=${dxid}`);
              citation = (await resp.text()).trim();
            } catch (_) {}
          }
          return { success: true, abstract, venue, doi, year, keywords, authors, citation };
      },
      args: [payload.dxid || '']
    });

    await chrome.tabs.remove(tab.id);
    tab = null;

    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: 'RESULT', taskId, data: result.result }));
    }
  } catch (error) {
    if (tab) await chrome.tabs.remove(tab.id).catch(() => {});
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT', taskId,
        data: { success: false, error: error.message }
      }));
    }
  }
}

// 启动时连接
connectToMCP();
