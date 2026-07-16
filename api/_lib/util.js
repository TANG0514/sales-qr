'use strict';
const crypto = require('crypto');

function genSalesCode() { return 'SALE_' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function genVoucher() { return 'V' + crypto.randomBytes(5).toString('hex').toUpperCase(); }
function uid() { return crypto.randomBytes(6).toString('hex'); }

function parseCookies(req) {
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach(s => {
    const i = s.indexOf('=');
    if (i > 0) out[s.slice(0, i).trim()] = decodeURIComponent(s.slice(i + 1).trim());
  });
  return out;
}

// 身份识别：本原型用 Cookie 模拟 OpenID。
// 生产环境改为微信网页授权(snsapi_base)换取真实 openid / unionid（逻辑不变）。
function resolveOpenid(req, res) {
  const cookies = parseCookies(req);
  let openid = cookies.openid;
  if (!openid) {
    openid = 'OPENID_' + crypto.randomBytes(8).toString('hex');
    res.setHeader('Set-Cookie', `openid=${openid}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }
  return openid;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
  });
}

// 生成二维码里承载的领取链接：使用真实 host（Vercel 部署后为公网域名）。
function claimUrlFor(req, code) {
  const host = req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${host}/claim?code=${encodeURIComponent(code)}`;
}

module.exports = { genSalesCode, genVoucher, uid, parseCookies, resolveOpenid, sendJson, readBody, claimUrlFor };
