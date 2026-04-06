/**
 * BUAA (Beihang University) login provider implementation.
 */
class BuaaProvider extends LoginProvider {
  getName() {
    return '北京航空航天大学 (BUAA)';
  }

  getLoginUrl() {
    // 直接使用 CARSI 选定北航后的跳转链接，省去手动选择步骤
    return 'https://fsso.zhizhen.com/Shibboleth.sso/Login?entityID=https://idp.buaa.edu.cn/idp/shibboleth&target=https://fsso.zhizhen.com/carsi/secure';
  }

  getDiscoveryUrl() {
    return 'https://www.zhizhen.com/';
  }

  /**
   * BUAA 登录逻辑
   */
  async login(taskId, payload) {
    const { username, password } = payload;
    if (!username || !password) {
      return { success: false, error: '缺少用户名或密码' };
    }

    try {
      console.log('[BuaaProvider] 开始登录流程');
      const loginUrl = this.getLoginUrl();
      
      return new Promise((resolve) => {
        chrome.tabs.create({ url: loginUrl, active: true }, (tab) => {
          let hasFilled = false;
          
          const checkLoad = setInterval(() => {
            chrome.tabs.get(tab.id, (t) => {
              if (chrome.runtime.lastError || !t) {
                clearInterval(checkLoad);
                resolve({ success: false, error: '标签页已关闭' });
                return;
              }
              
              // 检查是否到达北航 SSO 页面
              if (t.status === 'complete' && t.url.includes('sso.buaa.edu.cn')) {
                if (!hasFilled) {
                  hasFilled = true;
                  console.log('[BuaaProvider] 到达 SSO 页面，准备填充 Iframe');
                  
                  // 注入脚本处理登录表单填充
                  chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: (u, p) => {
                      const userInp = document.querySelector('#loginForm input[name="username"]')
                        || document.querySelector('input[name="username"]')
                        || document.querySelector('#un');
                      const passInp = document.querySelector('#loginForm input[name="password"]')
                        || document.querySelector('input[name="password"]')
                        || document.querySelector('#pd');
                      // CAS 系统通常用 input[type=submit] 或带 id="submit" 的元素
                      const btn = document.querySelector('#loginForm input[type="submit"]')
                        || document.querySelector('#submit')
                        || document.querySelector('button[type="submit"]')
                        || document.querySelector('.login_box_btn');

                      if (userInp && passInp) {
                        // 设置值并触发 input 事件，确保 CAS 框架识别
                        userInp.focus();
                        userInp.value = u;
                        userInp.dispatchEvent(new Event('input', { bubbles: true }));
                        userInp.dispatchEvent(new Event('change', { bubbles: true }));

                        passInp.focus();
                        passInp.value = p;
                        passInp.dispatchEvent(new Event('input', { bubbles: true }));
                        passInp.dispatchEvent(new Event('change', { bubbles: true }));

                        if (btn) {
                          console.log('[BuaaProvider] 点击提交按钮:', btn.tagName, btn.id, btn.className);
                          btn.click();
                        } else {
                          // 尝试提交表单
                          const form = document.querySelector('#loginForm') || document.querySelector('form');
                          if (form) {
                            console.log('[BuaaProvider] 无按钮，直接提交表单');
                            form.submit();
                          }
                        }
                        return true;
                      }
                      return false;
                    },
                    args: [username, password]
                  });
                }
              }
              
              // 检查是否登录成功并跳转回发现系统
              if (t.url.includes('zhizhen.com') && !t.url.includes('login') && !t.url.includes('Shibboleth')) {
                clearInterval(checkLoad);
                console.log('[BuaaProvider] 已跳转到智真，登录成功');
                // CARSI 认证成功后页面会显示欢迎信息，直接返回成功
                resolve({ success: true, message: '北航 CARSI 认证成功，已登录智真发现系统' });
              }
            });
          }, 1000);
          
          // 30秒超时
          setTimeout(() => {
            clearInterval(checkLoad);
            resolve({ success: false, error: '登录超时' });
          }, 30000);
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 北航暂未发现类似北理工的直接同步接口，通常 CARSI 认证后会自动完成
   */
  async syncSession(uname) {
    console.log('[BuaaProvider] BUAA 暂不需额外同步逻辑');
    return Promise.resolve();
  }
}
