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
chrome.storage.local.get(['username', 'password', 'university'], (result) => {
  if (result.university) {
    document.getElementById('university').value = result.university;
    toggleFields(result.university);
  }
  if (result.username) {
    document.getElementById('username').value = result.username;
  }
  if (result.password) {
    document.getElementById('password').value = '******';
  }
});

function toggleFields(uni) {
  const fields = document.getElementById('auto-login-fields');
  if (uni === 'BIT') {
    fields.classList.remove('hidden');
  } else {
    fields.classList.add('hidden');
  }
}

document.getElementById('university').addEventListener('change', (e) => {
  toggleFields(e.target.value);
});

// 保存配置
document.getElementById('saveBtn').addEventListener('click', () => {
  const university = document.getElementById('university').value;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  const config = { university };

  if (university === 'BIT') {
    if (!username || !password) {
      alert('请填写完整信息');
      return;
    }
    config.username = username;
    if (password !== '******') {
      config.password = encryptPassword(password);
    }
  }

  chrome.storage.local.set(config, () => {
    document.getElementById('message').innerHTML = '<div class="success">设置已保存</div>';
    setTimeout(() => {
      document.getElementById('message').innerHTML = '';
    }, 2000);
  });
});
