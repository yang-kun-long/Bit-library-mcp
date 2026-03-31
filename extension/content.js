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
  } else if (message.type === 'CHECK_LOGIN_STATUS') {
    const welcomeLinks = document.querySelectorAll('a[href="#"]');
    let isLoggedIn = false;

    for (const link of welcomeLinks) {
      if (link.textContent.includes('欢迎来自北京理工大学的朋友')) {
        isLoggedIn = true;
        break;
      }
    }

    sendResponse({
      success: isLoggedIn,
      error: isLoggedIn ? null : '未找到登录标识'
    });
  } else if (message.type === 'SEARCH_PAPERS') {
    (async () => {
      try {
        const { query, field = 'Z', language = '', doc_types = [], year_start, year_end, isbn, issn, page_size = 15, only_catalog, only_eres } = message;

        // 点击高级检索
        const advLink = document.querySelector('#adv');
        if (advLink) advLink.click();
        await new Promise(resolve => setTimeout(resolve, 500));

        // 设置语种
        if (language) {
          const langCheckboxes = document.querySelectorAll('#language input[name="header_chorens"]');
          langCheckboxes.forEach(cb => cb.checked = false);
          const targetLang = Array.from(langCheckboxes).find(cb => cb.value === language);
          if (targetLang) targetLang.checked = true;
        }

        // 设置文献类型
        if (doc_types.length > 0) {
          const typeCheckboxes = document.querySelectorAll('#channel input[name="channel"]');
          typeCheckboxes.forEach(cb => cb.checked = false);
          doc_types.forEach(type => {
            const cb = Array.from(typeCheckboxes).find(c => c.value === String(type));
            if (cb) cb.checked = true;
          });
        }

        // 设置检索字段和关键词
        const fieldSelects = document.querySelectorAll('select[name="dept"]');
        const inputs = document.querySelectorAll('.sForm_t .txt');
        if (fieldSelects[0]) fieldSelects[0].value = field;
        if (inputs[0]) inputs[0].value = query;

        // 设置ISBN/ISSN
        if (isbn) {
          const isbnInput = document.querySelector('input[name="bn"]');
          if (isbnInput) isbnInput.value = isbn;
        }
        if (issn) {
          const issnInput = document.querySelector('input[name="sn"]');
          if (issnInput) issnInput.value = issn;
        }

        // 设置年份
        if (year_start) {
          const syearSelect = document.querySelector('select[name="syear"]');
          if (syearSelect) syearSelect.value = year_start;
        }
        if (year_end) {
          const eyearSelect = document.querySelector('select[name="eyear"]');
          if (eyearSelect) eyearSelect.value = year_end;
        }

        // 设置每页显示
        const sizeRadios = document.querySelectorAll('input[name="size"]');
        sizeRadios.forEach(r => r.checked = r.value === String(page_size));

        // 设置只显示选项
        if (only_catalog) {
          const catalogCb = document.querySelector('input[name="strtype"][value="3"]');
          if (catalogCb) catalogCb.checked = true;
        }
        if (only_eres) {
          const eresCb = document.querySelector('input[name="strtype"][value="4"]');
          if (eresCb) eresCb.checked = true;
        }

        // 点击检索按钮
        const searchBtn = document.querySelector('#advbutton');
        if (searchBtn) searchBtn.click();

        // 等待结果加载
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 提取结果
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
