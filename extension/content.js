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
  }
  return true;
});
