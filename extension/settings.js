// XOR 加密（复用原脚本逻辑）
const XOR_KEY = 'bit-sso-AutoLogin-key';

function encryptPassword(pwd) {
  if (!pwd) return '';
  const enc = new TextEncoder();
  const keyBytes = enc.encode(XOR_KEY);
  const inBytes = enc.encode(pwd);
  const out = new Uint8Array(inBytes.length);

  for (let i = 0; i < inBytes.length; i++) {
    out[i] = inBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  let binary = '';
  for (let i = 0; i < out.length; i++) {
    binary += String.fromCharCode(out[i]);
  }

  return 'xor:' + btoa(binary);
}

// 加载已保存的配置
chrome.storage.local.get(['username', 'password'], (result) => {
  if (result.username) {
    document.getElementById('username').value = result.username;
  }
  if (result.password) {
    document.getElementById('password').value = '******'; // 不显示真实密码
  }
});

// 保存配置
document.getElementById('saveBtn').addEventListener('click', () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    alert('请填写完整信息');
    return;
  }

  if (password === '******') {
    document.getElementById('message').innerHTML = '<div class="success">设置已保存（密码未修改）</div>';
    return;
  }

  const encryptedPwd = encryptPassword(password);

  chrome.storage.local.set({
    username: username,
    password: encryptedPwd
  }, () => {
    document.getElementById('message').innerHTML = '<div class="success">设置已保存</div>';
    setTimeout(() => {
      document.getElementById('message').innerHTML = '';
    }, 2000);
  });
});
