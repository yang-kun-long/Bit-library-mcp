// WebSocket 连接到本地 MCP 服务器
let ws = null;
let isConnected = false;
let pending_tasks = {};
let currentPort = 8765;

// 导入依赖
importScripts(
  'cas-login.js',
  'providers/base-provider.js',
  'providers/bit-provider.js',
  'providers/manual-provider.js'
);

// 连接到 MCP 服务器（从 storage 读端口，默认 8765）
async function connectToMCP() {
  const config = await chrome.storage.local.get(['mcpPort']);
  currentPort = config.mcpPort || 8765;

  ws = new WebSocket(`ws://localhost:${currentPort}`);

  ws.onopen = () => {
    console.log(`[MCP] 已连接到服务器 (端口 ${currentPort})`);
    isConnected = true;
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[MCP] 收到原始消息:', message);

      // 收到 ANNOUNCE 后发送客户端信息
      if (message.type === 'ANNOUNCE') {
        const manifest = chrome.runtime.getManifest();
        ws.send(JSON.stringify({
          type: 'CLIENT_INFO',
          version: manifest.version,
          browser: 'Chrome',
          timestamp: Date.now()
        }));
      }

      handleMessage(message);
    } catch (e) {
      console.error('[MCP] 解析消息失败:', e, event.data);
    }
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

// 实例化 Providers
const Providers = {
  'BIT': new BitProvider(),
  'MANUAL': new ManualProvider()
};

async function getActiveProvider() {
  const config = await chrome.storage.local.get(['university']);
  const uni = config.university || 'BIT';
  return Providers[uni] || Providers['BIT'];
}

// 处理来自 MCP 服务器的消息
async function handleMessage(msg) {
  console.log('[MCP] handleMessage 收到:', msg);
  let type = msg.type;
  let taskId = msg.taskId;
  let payload = msg.payload;

  // 如果是包装好的任务，解包任务类型并保持 payload 指向内部数据
  if (type === 'TASK') {
    console.log('[MCP] 解包 TASK:', payload.type);
    type = payload.type;
    // 注意：这里的 payload 已经是内部对象了，不需要再次赋值
  }

  try {
    if (type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', taskId }));
      return;
    }

    if (type === 'PONG') {
      if (pending_tasks[taskId]) {
        pending_tasks[taskId]();
      }
      return;
    }

    console.log(`[MCP] 执行指令: ${type}, 任务ID: ${taskId}`);
    const provider = await getActiveProvider();

    if (type === 'LOGIN' || type === 'LOGIN_LIBRARY') {
      const result = await provider.login(taskId, payload);
      ws.send(JSON.stringify({ type: 'RESULT', taskId, data: result }));
    } else if (type === 'SEARCH_PAPERS') {
      await handleSearchPapers(taskId, payload);
    } else if (type === 'GET_PAPER_DETAIL') {
      console.log('[MCP] 正在调用 handleGetPaperDetail');
      await handleGetPaperDetail(taskId, payload);
    } else if (type === 'OPEN_URL') {
      console.log('[MCP] 正在执行 chrome.tabs.create:', payload.url);
      chrome.tabs.create({ url: payload.url });
      ws.send(JSON.stringify({ type: 'RESULT', taskId, data: { success: true } }));
    } else if (type === 'DOWNLOAD_PAPER') {
      chrome.tabs.create({ url: payload.url });
      ws.send(JSON.stringify({ type: 'RESULT', taskId, data: { success: true } }));
    }
  } catch (error) {
    console.error('[MCP] handleMessage 处理出错:', error);
    ws.send(JSON.stringify({
      type: 'RESULT',
      taskId,
      data: { success: false, error: error.message }
    }));
  }
}

// 处理自动登录流程 (由 provider.login 调用)
async function handleCasLogin(taskId, payload) {
  const { service, isWebVpn } = payload;
  const ticket = await casLogin(service);
  const loginUrl = await buildLoginUrl(service, ticket, isWebVpn);

  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: loginUrl, active: false }, (tab) => {
      const check = setInterval(() => {
        chrome.tabs.get(tab.id, (t) => {
          if (chrome.runtime.lastError) {
            clearInterval(check);
            reject(new Error('Tab closed'));
            return;
          }
          if (t.status === 'complete' && !t.url.includes('cas/login')) {
            clearInterval(check);
            setTimeout(() => { chrome.tabs.remove(tab.id); resolve({ success: true }); }, 2000);
          }
        });
      }, 1000);
      setTimeout(() => {
        clearInterval(check);
        chrome.tabs.remove(tab.id).catch(() => {});
        reject(new Error('Login timeout'));
      }, 30000);
    });
  });
}

// --- 搜索和详情提取逻辑 ---

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
    const provider = await getActiveProvider();
    const discoveryUrl = provider.getDiscoveryUrl();
    const urlPattern = discoveryUrl.replace(/\/$/, '') + '/*';

    // 查找已有的发现系统标签页
    let tabs = await chrome.tabs.query({ url: urlPattern });
    let tab;

    if (tabs.length === 0) {
      // 没有发现系统标签页，自动打开并等待加载
      tab = await new Promise(resolve => chrome.tabs.create({ url: discoveryUrl, active: true }, resolve));
      await waitForTabComplete(tab.id);
      await new Promise(r => setTimeout(r, 1000));

      // 检查是否已登录
      const authCheck = await provider.checkAuth(tab.id);
      if (!authCheck.success) {
        if (ws && isConnected) {
          ws.send(JSON.stringify({
            type: 'RESULT', taskId,
            data: { success: false, error: '发现系统未登录，请先调用 login_library 登录' }
          }));
        }
        return;
      }
    } else {
      tab = tabs[0];
    }

    // 直接构造结果页 URL 导航
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
          const dxid = card.querySelector('h3[data-id]')?.dataset?.id || new URL(titleA?.href || '').searchParams.get('dxid');
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
    console.log('[MCP] 开始抓取详情:', payload.url);
    tab = await new Promise((resolve) => {
      chrome.tabs.create({ url: payload.url, active: true }, resolve);
    });

    // 等待页面加载完成
    console.log('[MCP] 等待标签页加载:', tab.id);
    await Promise.race([
      new Promise((resolve) => {
        const check = setInterval(() => {
          chrome.tabs.get(tab.id, (t) => {
            if (chrome.runtime.lastError) {
              console.log('[MCP] 标签页获取失败 (可能已关闭)');
              clearInterval(check); resolve(); return;
            }
            if (t.status === 'complete') {
              console.log('[MCP] 标签页加载完成');
              clearInterval(check); resolve();
            }
          });
        }, 500);
      }),
      new Promise(resolve => setTimeout(() => {
        console.log('[MCP] 等待加载超时 (15s)');
        resolve();
      }, 15000))
    ]);

    await new Promise(r => setTimeout(r, 1000));
    console.log('[MCP] 准备执行提取脚本');

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (dxid) => {
          try {
              console.log('[Injected] 脚本开始执行');
          // 调试：打印页面所有文本和结构信息
          console.log('[Injected] 页面标题:', document.title);
          console.log('[Injected] 页面 URL:', location.href);
          const bodyText = document.body.innerText;
          console.log('[Injected] 页面文本内容片段:', bodyText.substring(0, 1000));

          // 检查常见的容器
          const containers = {
            '#detailAllAbstractId': !!document.querySelector('#detailAllAbstractId'),
            'dl.card_line count': document.querySelectorAll('dl.card_line').length,
            'dl.clearfix count': document.querySelectorAll('dl.clearfix').length,
            '.zy_detail count': document.querySelectorAll('.zy_detail').length,
            'iframe count': document.querySelectorAll('iframe').length
          };
          console.log('[Injected] 容器检查:', containers);

          const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

          // 完整摘要
          const absEl = document.querySelector('#detailAllAbstractId dd')
                     || document.querySelector('#detailSubAbstractId dd');
          const absClone = absEl?.cloneNode(true);
          absClone?.querySelectorAll('a').forEach(a => a.remove());
          const abstract = norm(absClone?.textContent);

          // 增强：递归检查所有 iframe
          const allDls = [];
          const collectDls = (doc) => {
            const selectors = ['dl.card_line', 'dl.clearfix', 'div.card_line', 'dl'];
            selectors.forEach(s => {
              allDls.push(...Array.from(doc.querySelectorAll(s)));
            });
            doc.querySelectorAll('iframe').forEach(frame => {
              try {
                if (frame.contentDocument) collectDls(frame.contentDocument);
              } catch (e) {}
            });
          };
          collectDls(document);
          console.log('[Injected] 总计找到 DL 元素:', allDls.length);

          // dl.card_line 字段提取 (增强选择器)
          const findField = (label) => {
            const clean = s => (s || '').replace(/\s+/g, '');
            const target = clean(label);

            const dl = allDls.find(el => {
              const dtText = clean(el.querySelector('dt')?.textContent || el.querySelector('span.label')?.textContent || el.querySelector('b')?.textContent);
              return dtText && dtText.includes(target);
            });

            const dd = dl?.querySelector('dd') || dl?.querySelector('span.zylist_font') || dl?.querySelector('span');
            return norm(dd?.textContent);
          };
          const findLinks = (label) => {
            const dls = Array.from(document.querySelectorAll('dl.card_line'));
            const clean = s => (s || '').replace(/\s+/g, '');
            const target = clean(label);
            const dl = dls.find(dl => clean(dl.querySelector('dt span')?.textContent) === target);
            return Array.from(dl?.querySelectorAll('dd a') || [])
              .map(a => norm(a.textContent)).filter(Boolean);
          };

          const venue = ['期刊名', '会议名称', '会议名', '会议']
            .map(findField).find(Boolean) || '';
          const doi = findField('d o i');
          const year = findField('年份');
          const keywords = findLinks('关键词');
          const authors = findLinks('作者').length
            ? findLinks('作者')
            : findField('作者')?.split(/[;；,，]/).map(s => norm(s)).filter(Boolean);

          // 扩展字段提取
          const affiliation = findField('作者单位');
          const funding = findField('基金');
          const volume = findField('卷号');
          const issue = findField('期号');
          const pages = findField('页码');
          const issn = findField('I S S N');
          const classification = findField('分类号');

          // 提取评价指标
          const impactFactorEl = document.querySelector('.Influence');
          const impactFactor = impactFactorEl ? impactFactorEl.textContent.trim() : null;

          const indexingEls = document.querySelectorAll('.FindLabel');
          const indexing = Array.from(indexingEls).map(el => el.textContent.trim()).filter(Boolean);

          // 获取标准引文格式 (增加超时控制)
          let citation = '';
          if (dxid) {
            console.log('[Injected] 尝试获取引文格式, dxid:', dxid);
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const resp = await fetch(`/fav/outputDetailRefer?type=3&dxid=${dxid}`, {
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              citation = (await resp.text()).trim();
              console.log('[Injected] 引文获取成功');
            } catch (e) {
              console.log('[Injected] 引文获取失败:', e.message);
            }
          }
          console.log('[Injected] 提取完成，返回数据');
          return {
            success: true,
            abstract, venue, doi, year, keywords, authors,
            affiliation, funding, volume, issue, pages,
            issn, classification, impactFactor, indexing,
            citation
          };
          } catch (e) {
              console.error('[Injected] 脚本执行异常:', e);
              return { success: false, error: e.message };
          }
      },
      args: [payload.dxid || '']
    });

    console.log('[MCP] 脚本执行结果:', result);
    const data = result?.result ?? result;

    // 只有在成功获取到关键内容时才关闭标签页，方便调试
    if (data && (data.abstract || (data.authors && data.authors.length))) {
        console.log('[MCP] 抓取成功，关闭标签页');
        await chrome.tabs.remove(tab.id);
    } else {
        console.log('[MCP] 未获取到关键内容，保留标签页以供检查', data);
    }
    tab = null;

    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: 'RESULT', taskId, data }));
    }
  } catch (error) {
    console.error('[MCP] handleGetPaperDetail 发生错误:', error);
    if (tab) await chrome.tabs.remove(tab.id).catch(() => {});
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'RESULT', taskId,
        data: { success: false, error: error.message }
      }));
    }
  }
}

connectToMCP();

// 响应来自 popup 的内部消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK_STATUS') {
    sendResponse({ connected: isConnected, port: currentPort });
  } else if (msg.type === 'RECONNECT') {
    if (ws) { ws.onclose = null; ws.close(); }
    isConnected = false;
    connectToMCP();
    sendResponse({ success: true });
  } else if (msg.type === 'PING_TEST') {
    if (!isConnected || !ws) {
      sendResponse({ success: false, error: '未连接到 MCP 服务器' });
    } else {
      const taskId = 'ping-' + Date.now();
      const startTime = Date.now();
      const timer = setTimeout(() => {
        delete pending_tasks[taskId];
        sendResponse({ success: false, error: '响应超时' });
      }, 5000);
      pending_tasks[taskId] = () => {
        clearTimeout(timer);
        delete pending_tasks[taskId];
        sendResponse({ success: true, elapsed: Date.now() - startTime });
      };
      ws.send(JSON.stringify({ type: 'PING', taskId }));
    }
  }
  return true;
});
