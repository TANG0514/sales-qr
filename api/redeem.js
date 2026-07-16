'use strict';
const { kv } = require('./_lib/store');
const { sendJson, readBody } = require('./_lib/util');

async function findByVoucher(code) {
  const v = (code || '').trim().toUpperCase();
  if (!v) return null;
  return await kv.get('vch:' + v);
}

// GET 核销查询 / POST 核销操作
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const claim = await findByVoucher(url.searchParams.get('code'));
    if (!claim) return sendJson(res, 404, { error: '核销码不存在' });
    return sendJson(res, 200, claim);
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const claim = await findByVoucher(body.code);
    if (!claim) return sendJson(res, 404, { error: '核销码不存在' });
    if (claim.redeemed) return sendJson(res, 400, { error: '该券已核销', claim });
    claim.redeemed = true;
    claim.redeemed_at = Date.now();
    claim.redeemed_by = (body.staff || '前台').trim();
    await kv.set('vch:' + claim.voucher, claim);
    await kv.set('claim:' + claim.openid, claim);
    await kv.hset('claims:' + claim.sales_code, { [claim.openid]: JSON.stringify(claim) });
    return sendJson(res, 200, claim);
  }

  return sendJson(res, 405, { error: 'method not allowed' });
};
