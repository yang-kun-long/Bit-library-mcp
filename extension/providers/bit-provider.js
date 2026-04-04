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

  /**
   * BIT 统一检索 session 同步
   * 直接构造后端 SSO 跳转 URL，由服务器 302 重定向到发现系统，无需触发 window.open()
   * @param {string} uname - 学号，从 /engine2/header/user-info 获取
   */
  async syncSession(uname) {
    const syncUrl = `https://lib.bit.edu.cn/sso/api/search?wfwfid=2398&searchType=zhizhen&account=${encodeURIComponent(uname)}&sw=sync&categoryId=19&fieldId=`;
    console.log('[BitProvider] 构造 session 同步 URL:', syncUrl);

    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url: syncUrl, active: false }, (tab) => {
        waitForTabComplete(tab.id, 15000).then(() => {
          chrome.tabs.get(tab.id, (t) => {
            if (chrome.runtime.lastError) {
              reject(new Error('标签页已关闭'));
              return;
            }
            console.log('[BitProvider] 同步后落地 URL:', t.url);
            if (t.url && t.url.includes('ss.zhizhen.com')) {
              setTimeout(() => {
                chrome.tabs.remove(tab.id).catch(() => {});
                resolve();
              }, 1000);
            } else {
              chrome.tabs.remove(tab.id).catch(() => {});
              reject(new Error(`重定向未到达发现系统，当前页: ${t.url}`));
            }
          });
        });
      });
    });
  }

  /**
   * 检查图书馆是否已登录
   * @param {string} libUrl - 图书馆 URL
   * @returns {Promise<{success: boolean, username?: string}>}
   */
  async checkLibraryAuth(libUrl) {
    return new Promise((resolve) => {
      chrome.tabs.create({ url: libUrl, active: false }, (tab) => {
        // 等待页面加载完成
        const waitForLoad = setInterval(() => {
          chrome.tabs.get(tab.id, (t) => {
            if (chrome.runtime.lastError) {
              clearInterval(waitForLoad);
              // chrome.tabs.remove(tab.id).catch(() => {}); // 调试：不关闭
              resolve({ success: false, error: '标签页已关闭' });
              return;
            }
            if (t.status === 'complete') {
              clearInterval(waitForLoad);
              // 页面加载完成后，开始检查登录状态
              const check = setInterval(async () => {
                const response = await this.checkLibraryAuthInTab(tab.id);
                if (chrome.runtime.lastError) return;
                if (response && response.success) {
                  clearInterval(check);
                  // chrome.tabs.remove(tab.id); // 调试：不关闭
                  resolve(response);
                }
              }, 1000);
              setTimeout(() => {
                clearInterval(check);
                // chrome.tabs.remove(tab.id).catch(() => {}); // 调试：不关闭
                resolve({ success: false });
              }, 10000);
            }
          });
        }, 500);
        // 总超时15秒（包括页面加载时间）
        setTimeout(() => {
          clearInterval(waitForLoad);
          // chrome.tabs.remove(tab.id).catch(() => {}); // 调试：不关闭
          resolve({ success: false, error: '页面加载超时' });
        }, 15000);
      });
    });
  }

  /**
   * 在指定标签页检查图书馆登录状态
   * @param {number} tabId - 标签页 ID
   * @returns {Promise<{success: boolean}>}
   */
  async checkLibraryAuthInTab(tabId) {
    return new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { type: 'CHECK_LIBRARY_AUTH' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { success: false });
        }
      });
    });
  }

  /**
   * 完整的登录流程：图书馆登录 → 验证 → 发现系统验证 → 兜底
   */
  async login(taskId, payload) {
    try {
      console.log('[BitProvider] 开始登录流程');

      // 1. 执行 CAS 登录
      console.log('[BitProvider] 步骤1: 执行 CAS 登录');
      const loginResult = await handleCasLogin(taskId, payload);
      if (!loginResult.success) {
        return { success: false, error: '图书馆登录失败' };
      }

      // 2. 等待登录完成并验证图书馆登录状态
      console.log('[BitProvider] 步骤2: 验证图书馆登录状态');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const libCheck = await this.checkLibraryAuth(this.getLibHome());

      if (!libCheck.success) {
        console.error('[BitProvider] 图书馆登录验证失败');
        return { success: false, error: '图书馆登录验证失败，请检查凭据' };
      }
      console.log('[BitProvider] 图书馆登录验证成功, uname:', libCheck.uname);

      // 3. 打开发现系统并检查登录状态
      console.log('[BitProvider] 步骤3: 检查发现系统登录状态');
      const discoveryUrl = this.getDiscoveryUrl();
      const authCheck = await this.checkDiscoveryAuth(discoveryUrl);

      if (authCheck.success) {
        console.log('[BitProvider] 发现系统已登录');
        return { success: true, message: '登录成功' };
      }

      // 4. 如果发现系统未登录，执行兜底方案：统一检索同步
      console.log('[BitProvider] 步骤4: 发现系统未登录，执行统一检索兜底');
      try {
        await this.syncSession(libCheck.uname);
        console.log('[BitProvider] 统一检索同步完成');
      } catch (syncError) {
        console.warn('[BitProvider] 统一检索同步失败:', syncError);
        // 继续尝试验证，可能已经同步成功
      }

      // 5. 再次检查发现系统登录状态
      console.log('[BitProvider] 步骤5: 再次检查发现系统登录状态');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const finalCheck = await this.checkDiscoveryAuth(discoveryUrl);

      if (finalCheck.success) {
        console.log('[BitProvider] 登录流程完成，发现系统已登录');
        return { success: true, message: '登录成功' };
      } else {
        console.warn('[BitProvider] 登录流程完成，但发现系统仍未登录');
        return {
          success: false,
          error: '图书馆登录成功，但发现系统未能自动登录，请手动访问发现系统确认'
        };
      }

    } catch (error) {
      console.error('[BitProvider] 登录流程异常:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查发现系统是否已登录
   * @param {string} discoveryUrl - 发现系统 URL
   * @returns {Promise<{success: boolean, username?: string}>}
   */
  async checkDiscoveryAuth(discoveryUrl) {
    return new Promise((resolve) => {
      chrome.tabs.create({ url: discoveryUrl, active: false }, (tab) => {
        const check = setInterval(async () => {
          const response = await this.checkAuth(tab.id);
          if (chrome.runtime.lastError) return;
          if (response && response.success) {
            clearInterval(check);
            // chrome.tabs.remove(tab.id); // 调试：不关闭
            resolve(response);
          }
        }, 1000);
        setTimeout(() => {
          clearInterval(check);
          // chrome.tabs.remove(tab.id).catch(() => {}); // 调试：不关闭
          resolve({ success: false });
        }, 10000);
      });
    });
  }
}