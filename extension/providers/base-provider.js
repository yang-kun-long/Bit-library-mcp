/**
 * Base class for all login providers.
 */
class LoginProvider {
  /**
   * Get the display name of the provider.
   * @returns {string}
   */
  getName() {
    throw new Error('getName() not implemented');
  }

  /**
   * Get the discovery system URL (e.g., ss.zhizhen.com).
   * @returns {string}
   */
  getDiscoveryUrl() {
    return 'https://ss.zhizhen.com/';
  }

  /**
   * Get the login page URL.
   * @returns {string}
   */
  getLoginUrl() {
    throw new Error('getLoginUrl() not implemented');
  }

  /**
   * Check if the user is authenticated in the discovery system.
   * @param {number} tabId - The ID of the tab to check.
   * @returns {Promise<{success: boolean, username?: string}>}
   */
  async checkAuth(tabId) {
    return new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { type: 'CHECK_LOGIN_STATUS' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { success: false });
        }
      });
    });
  }

  /**
   * Synchronize the session between the school library and the discovery system.
   * @returns {Promise<void>}
   */
  async syncSession() {
    throw new Error('syncSession() not implemented');
  }

  /**
   * Perform automatic login.
   * @param {string} taskId - The ID of the task requesting login.
   * @param {any} payload - Login parameters.
   * @returns {Promise<any>}
   */
  async login(taskId, payload) {
    throw new Error('login() not implemented');
  }
}
