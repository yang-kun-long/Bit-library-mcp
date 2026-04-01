/**
 * BIT (Beijing Institute of Technology) login provider implementation.
 */
class BitProvider extends LoginProvider {
  getName() {
    return '北京理工大学 (BIT)';
  }

  getLoginUrl() {
    return 'https://sso.bit.edu.cn/cas/login';
  }

  getLibHome() {
    return 'https://lib.bit.edu.cn/';
  }

  async syncSession() {
    const self = this;
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url: self.getLibHome(), active: true }, (tab) => {
        const checkReady = setInterval(() => {
          chrome.tabs.sendMessage(tab.id, { type: 'PERFORM_UNIFIED_SEARCH' }, (res) => {
            if (chrome.runtime.lastError) return;
            if (res && res.success) {
              clearInterval(checkReady);
              setTimeout(() => { chrome.tabs.remove(tab.id); resolve(); }, 4000);
            }
          });
        }, 1000);
        setTimeout(() => {
          clearInterval(checkReady);
          chrome.tabs.remove(tab.id).catch(() => {});
          reject(new Error('同步超时'));
        }, 20000);
      });
    });
  }

  async login(taskId, payload) {
    // 调用 background.js 中的 handleCasLogin
    return handleCasLogin(taskId, payload);
  }

  // BIT 特有的统一检索同步逻辑
  async syncSession() {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url: this.getLibHome(), active: true }, (tab) => {
        const checkReady = setInterval(() => {
          chrome.tabs.sendMessage(tab.id, { type: 'PERFORM_UNIFIED_SEARCH' }, (res) => {
            if (chrome.runtime.lastError) return;
            if (res && res.success) {
              clearInterval(checkReady);
              setTimeout(() => { chrome.tabs.remove(tab.id); resolve(); }, 4000);
            }
          });
        }, 1000);
        setTimeout(() => {
          clearInterval(checkReady);
          chrome.tabs.remove(tab.id).catch(() => {});
          reject(new Error('北理工 Session 同步超时'));
        }, 20000);
      });
    });
  }
}