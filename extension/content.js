// 脚本执行引擎
class ScriptExecutor {
  async execute(script) {
    switch (script.action) {
      case 'navigate':
        window.location.href = script.url;
        break;

      case 'wait_for_selector':
        await this.waitForSelector(script.selector, script.timeout || 5000);
        break;

      case 'fill_input':
        const input = document.querySelector(script.selector);
        if (input) input.value = script.value;
        break;

      case 'click':
        const element = document.querySelector(script.selector);
        if (element) element.click();
        break;

      case 'extract':
        return this.extractData(script);

      default:
        throw new Error(`未知操作: ${script.action}`);
    }
  }

  waitForSelector(selector, timeout) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(selector)) {
        return resolve();
      }

      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`等待元素超时: ${selector}`));
      }, timeout);
    });
  }

  extractData(script) {
    const items = document.querySelectorAll(script.result_items);
    const results = [];

    items.forEach(item => {
      const data = {};
      for (const [key, config] of Object.entries(script.fields)) {
        if (config.multiple) {
          const elements = item.querySelectorAll(config.selector);
          data[key] = Array.from(elements).map(el => el[config.attribute]);
        } else {
          const element = item.querySelector(config.selector);
          data[key] = element ? element[config.attribute] : null;
        }
      }
      results.push(data);
    });

    return results;
  }
}

const executor = new ScriptExecutor();

// 接收来自 background 的任务
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MCP_TASK') {
    const { taskId, payload } = message;

    executor.execute(payload.script)
      .then(result => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_SCRIPT',
          taskId,
          data: { success: true, result }
        });
      })
      .catch(error => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_SCRIPT',
          taskId,
          data: { success: false, error: error.message }
        });
      });
  } else if (message.type === 'CHECK_LIBRARY_AUTH') {
    // 检查图书馆登录状态
    let isLoggedIn = false;
    let error = null;

    if (location.hostname === 'lib.bit.edu.cn') {
      const loginedEl = document.getElementById('logined');
      const loginBtn = document.getElementById('id-login');

      if (loginedEl && getComputedStyle(loginedEl).display !== 'none') {
        isLoggedIn = true;
      } else if (loginBtn) {
        isLoggedIn = false;
        error = '未登录';
      } else {
        error = '未找到登录状态标识';
      }
    } else {
      error = '不是图书馆页面';
    }

    sendResponse({
      success: isLoggedIn,
      error: isLoggedIn ? null : error
    });
  } else if (message.type === 'CHECK_LOGIN_STATUS') {
    let isLoggedIn = false;
    let error = null;

    if (location.hostname === 'lib.bit.edu.cn') {
      // 图书馆首页登录检测
      const loginedEl = document.getElementById('logined');
      const loginBtn = document.getElementById('id-login');

      if (loginedEl && getComputedStyle(loginedEl).display !== 'none') {
        isLoggedIn = true;
      } else if (loginBtn) {
        isLoggedIn = false;
        error = '未登录';
      } else {
        error = '未找到登录状态标识';
      }
    } else if (location.hostname === 'ss.zhizhen.com') {
      // 发现系统登录检测 - 检测 "欢迎来自...的朋友" 字样（通用）
      const welcomePattern = /欢迎来自.*?的朋友/;
      const welcomeLinks = document.querySelectorAll('a[href="#"]');
      for (const link of welcomeLinks) {
        if (welcomePattern.test(link.textContent)) {
          isLoggedIn = true;
          break;
        }
      }
      if (!isLoggedIn) {
        // 备选方案：检查整个页面的文字
        if (welcomePattern.test(document.body.textContent)) {
          isLoggedIn = true;
        } else {
          error = '超星发现页未登录';
        }
      }
    }

    sendResponse({
      success: isLoggedIn,
      error: isLoggedIn ? null : error
    });
  } else if (message.type === 'PERFORM_UNIFIED_SEARCH') {
    // 执行统一检索（兜底逻辑：触发 session 同步）
    try {
      const input = document.querySelector('.ipt-box .ipt');
      const btn = document.querySelector('button.btn-search');

      if (!input || !btn) {
        sendResponse({ success: false, error: '未找到搜索框或按钮' });
        return true;
      }

      // 填充输入框
      input.value = 'AI Search';

      // 点击按钮，让页面自然跳转
      btn.click();

      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  } else if (message.type === 'EXTRACT_RESULTS') {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const findField = (card, label) => {
      const li = Array.from(card.querySelectorAll('li'))
        .find(li => norm(li.querySelector('span')?.textContent) === label);
      return norm(li?.querySelector('.zylist_font')?.textContent);
    };
    const cards = document.querySelectorAll('.zyList');
    const papers = Array.from(cards).map(card => {
      const titleA = card.querySelector('.card_name h3 a[href*="detail_"]');
      const source = findField(card, '出处');
      return {
        title: norm(titleA?.textContent),
        url: titleA?.href || '',
        authors: findField(card, '作者'),
        source,
        year: (source?.match(/\b(19|20)\d{2}\b/) || [])[0] || '',
        keywords: findField(card, '关键词'),
        abstract: findField(card, '摘要')
      };
    }).filter(p => p.title);
    sendResponse({ success: true, papers });
    return true;

  } else if (message.type === 'EXPERT_SEARCH') {
    // Plan B：填专业检索框 + 点击搜索
    (async () => {
      try {
        // 切换到专业检索 tab
        const expertTab = document.querySelector('#secondAdvId a');
        if (expertTab) expertTab.click();
        await new Promise(r => setTimeout(r, 300));

        const textarea = document.querySelector('#professtextar');
        const btn = document.querySelector('#professbutton');
        if (!textarea || !btn) {
          sendResponse({ success: false, error: '未找到专业检索输入框' });
          return;
        }

        textarea.value = message.adv;
        btn.click();

        // 等待结果页加载
        await new Promise(r => setTimeout(r, 3000));

        const results = [];
        const items = document.querySelectorAll('.resultList .item');
        items.forEach(item => {
          const titleEl = item.querySelector('.title a');
          const authorsEl = item.querySelector('.author');
          const sourceEl = item.querySelector('.source');
          results.push({
            title: titleEl?.textContent.trim() || '',
            url: titleEl?.href || '',
            authors: authorsEl?.textContent.trim() || '',
            source: sourceEl?.textContent.trim() || ''
          });
        });

        sendResponse({ success: true, papers: results });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  return true;
});
