'use strict';
const QRCode = require('qrcode');
const { kv } = require('./_lib/store');
const { sendJson, claimUrlFor } = require('./_lib/util');

// GET /api/qrcode?code=SALE_XXX  生成业务员专属领取链接二维码(PNG)
module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  if (!code) return sendJson(res, 400, { error: '缺少 code' });
  const sales = await kv.get('sales:' + code);
  if (!sales) return sendJson(res, 404, { error: '业务员不存在' });
  const buf = await QRCode.toBuffer(claimUrlFor(req, code), { type: 'png', width: 420, margin: 2 });
  res.writeHead(200, { 'Content-Type': 'image/png' });
  res.end(buf);
};
