'use strict';
/*
 * 业务员专属二维码 · 患者扫码领券 · 溯源原型
 * 纯 Node 内置 http，仅依赖 qrcode 生成二维码图片。
 *
 * 核心溯源原理：
 *   二维码内容 = 一个带业务员推广码的 URL:  /claim?code=SALE_XXXX
 *   患者扫码打开领取页 -> 后端读取 URL 里的 code -> 领取时把 sales_id 写入 claim 记录
 *   溯源 = 按 sales_code 分组统计 claim 记录即可
 *
 * 真实环境接入微信：
 *   本原型用 Cookie 模拟 OpenID。生产环境应改为微信网页授权(snsapi_base)：
 *   1) 患者访问 /claim?code=XXX 时，后端 302 跳转到
 *      https://open.weixin.qq.com/connect/oauth2/authorize?appid=APPID&redirect_uri=<encodeURIComponent(本页URL)>&response_type=code&scope=snsapi_base&state=STATE#wechat_redirect
 *   2) 微信带回 ?code=WXCODE，后端用 WXCODE 调 api 换 openid
 *   3) 其余领取/核销/溯源逻辑不变
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const CLAIMS_FILE = path.join(DATA_DIR, 'claims.json');

// ---------- 极简 JSON 存储 ----------
function readStore(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return def; }
}
function writeStore(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function getSales() { return readStore(SALES_FILE, []); }
function getClaims() { return readStore(CLAIMS_FILE, []); }

// ---------- 工具 ----------
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

// 模拟 OpenID：用 Cookie 给每个浏览器分配一个稳定身份。
// 生产环境替换为微信 OAuth 换取的真实 openid / unionid。
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function claimUrlFor(req, code) {
  return `http://${req.headers.host}/claim?code=${encodeURIComponent(code)}`;
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const method = req.method;
  const p = url.pathname;
  const q = url.searchParams;

  // 新增业务员
  if (p === '/api/sales' && method === 'POST') {
    const body = await readBody(req);
    const name = (body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: '请填写业务员姓名' });
    const sales = getSales();
    const record = { id: uid(), name, code: genSalesCode(), created_at: Date.now() };
    sales.push(record);
    writeStore(SALES_FILE, sales);
    return sendJson(res, 200, record);
  }

  // 业务员列表
  if (p === '/api/sales' && method === 'GET') {
    return sendJson(res, 200, getSales());
  }

  // 生成二维码图片（业务员专属领取链接）
  if (p === '/api/qrcode' && method === 'GET') {
    const code = q.get('code');
    if (!code) return sendJson(res, 400, { error: '缺少 code' });
    const buf = await QRCode.toBuffer(claimUrlFor(req, code), { type: 'png', width: 420, margin: 2 });
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(buf);
  }

  // 领取页查询业务员信息（供前端展示）
  if (p === '/api/sales-info' && method === 'GET') {
    const code = q.get('code');
    const sales = getSales().find(s => s.code === code);
    if (!sales) return sendJson(res, 404, { error: '二维码无效或业务员已停用' });
    return sendJson(res, 200, { code: sales.code, name: sales.name });
  }

  // 患者领取代金券
  if (p === '/api/claim' && method === 'POST') {
    const openid = resolveOpenid(req, res);
    const body = await readBody(req);
    const code = body.code;
    const sales = getSales().find(s => s.code === code);
    if (!sales) return sendJson(res, 400, { error: '二维码无效' });
    const claims = getClaims();
    const existing = claims.find(c => c.openid === openid);
    if (existing) {
      return sendJson(res, 200, Object.assign({ dup: true }, existing));
    }
    const claim = {
      id: uid(),
      openid,
      sales_code: sales.code,
      sales_id: sales.id,
      sales_name: sales.name,
      voucher: genVoucher(),
      amount: 50,
      claimed_at: Date.now(),
      redeemed: false,
      redeemed_at: null,
      redeemed_by: null
    };
    claims.push(claim);
    writeStore(CLAIMS_FILE, claims);
    return sendJson(res, 200, claim);
  }

  // 溯源：全部领取记录
  if (p === '/api/claims' && method === 'GET') {
    return sendJson(res, 200, getClaims());
  }

  // 核销查询：凭核销码查来源
  if (p === '/api/redeem' && method === 'GET') {
    const code = (q.get('code') || '').trim().toUpperCase();
    const claim = getClaims().find(c => c.voucher.toUpperCase() === code);
    if (!claim) return sendJson(res, 404, { error: '核销码不存在' });
    return sendJson(res, 200, claim);
  }

  // 核销操作
  if (p === '/api/redeem' && method === 'POST') {
    const body = await readBody(req);
    const code = (body.code || '').trim().toUpperCase();
    const staff = (body.staff || '前台').trim();
    const claims = getClaims();
    const claim = claims.find(c => c.voucher.toUpperCase() === code);
    if (!claim) return sendJson(res, 404, { error: '核销码不存在' });
    if (claim.redeemed) return sendJson(res, 400, { error: '该券已核销', claim });
    claim.redeemed = true;
    claim.redeemed_at = Date.now();
    claim.redeemed_by = staff;
    writeStore(CLAIMS_FILE, claims);
    return sendJson(res, 200, claim);
  }

  return sendJson(res, 404, { error: 'api not found' });
}

// ---------- 服务器 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    // 患者进入领取页时分配/刷新 OpenID（模拟微信身份）
    if (pathname === '/claim') {
      resolveOpenid(req, res);
    }
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  业务员二维码溯源原型已启动`);
  console.log(`  后台(生成二维码/溯源):  http://localhost:${PORT}/admin`);
  console.log(`  核销台:                 http://localhost:${PORT}/redeem`);
  console.log(`  患者领取页示例:         http://localhost:${PORT}/claim?code=SALE_DEMO\n`);
});
