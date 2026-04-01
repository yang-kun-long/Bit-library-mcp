/**
 * Manual login provider for other schools or fallback.
 */
class ManualProvider extends LoginProvider {
  getName() {
    return '手动登录/其他学校';
  }

  getLoginUrl() {
    return ''; // No automated login
  }

  async syncSession() {
    throw new Error('请先在浏览器中手动登录您的学校图书馆并进入发现系统');
  }

  async login(taskId, payload) {
    chrome.tabs.create({ url: this.getDiscoveryUrl() });
    throw new Error('请在打开的浏览器页面中完成手动登录');
  }
}
