const CAS_RESTAPI = 'https://sso.bit.edu.cn/cas/v1/tickets';
const XOR_KEY = 'bit-sso-AutoLogin-key';

function decryptPassword(s) {
  if (!s || !s.startsWith('xor:')) return s || '';
  const b = atob(s.slice(4));
  const bytes = new Uint8Array([...b].map(c => c.charCodeAt(0)));
  const keyBytes = new TextEncoder().encode(XOR_KEY);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(out);
}

async function encodeVpnHost(host) {
  const VPN_KEY = 'wrdvpnisthebest!';
  const VPN_IV = 'wrdvpnisthebest!';
  const enc = new TextEncoder();
  const keyBytes = enc.encode(VPN_KEY);
  const ivBytes = enc.encode(VPN_IV);
  const textLen = host.length;
  const padLen = (16 - (textLen % 16)) % 16;
  const plaintext = enc.encode(host + '0'.repeat(padLen));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(plaintext.length);
  let feedback = ivBytes;
  for (let i = 0; i < plaintext.length; i += 16) {
    const zeroIv = new Uint8Array(16);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: zeroIv }, cryptoKey, feedback);
    const keystream = new Uint8Array(encrypted).slice(0, 16);
    const block = new Uint8Array(16);
    for (let j = 0; j < 16; j++) {
      block[j] = plaintext[i + j] ^ keystream[j];
      ciphertext[i + j] = block[j];
    }
    feedback = block;
  }
  const toHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return toHex(ivBytes) + toHex(ciphertext).slice(0, textLen * 2);
}

async function casLogin(service) {
  const config = await chrome.storage.local.get(['username', 'password']);
  if (!config.username || !config.password) {
    throw new Error('请先在设置中配置学号和密码');
  }
  const username = config.username;
  const password = decryptPassword(config.password);
  const formData1 = new URLSearchParams();
  formData1.append('username', username);
  formData1.append('password', password);
  const r1 = await fetch(CAS_RESTAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData1.toString()
  });
  if (!r1.ok) throw new Error('获取 TGT 失败，请检查学号密码');
  const tgtUrl = r1.headers.get('Location');
  if (!tgtUrl) throw new Error('未获取到 TGT');
  const formData2 = new URLSearchParams();
  formData2.append('service', service);
  const r2 = await fetch(tgtUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData2.toString()
  });
  if (!r2.ok) throw new Error('获取 Service Ticket 失败');
  const ticket = await r2.text();
  return ticket.trim();
}

async function buildLoginUrl(service, ticket, isWebVpn = false) {
  let jumpUrl = new URL(service);
  if (isWebVpn) {
    const targetProto = jumpUrl.protocol.replace(':', '');
    const targetHost = jumpUrl.hostname;
    const encodedHost = await encodeVpnHost(targetHost);
    jumpUrl = new URL(`https://webvpn.bit.edu.cn/${targetProto}/${encodedHost}${jumpUrl.pathname}${jumpUrl.search}`);
  }
  jumpUrl.searchParams.set('ticket', ticket);
  return jumpUrl.toString();
}
