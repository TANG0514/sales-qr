'use strict';
const { kv } = require('./_lib/store');
const { genVoucher, uid, sendJson, readBody, resolveOpenid } = require('./_lib/util');

// POST /api/claim  患者领取代金券（写入来源业务员，实现溯源）
module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
  const openid = resolveOpenid(req, res);
  const body = await readBody(req);
  const code = body.code;
  const sales = await kv.get('sales:' + code);
  if (!sales) return sendJson(res, 400, { error: '二维码无效' });

  const existing = await kv.get('claim:' + openid);
  if (existing) {
    return sendJson(res, 200, Object.assign({ dup: true }, existing));
  }

  const voucher = genVoucher();
  const claim = {
    id: uid(),
    openid,
    sales_code: sales.code,
    sales_id: sales.id,
    sales_name: sales.name,
    voucher,
    amount: 50,
    claimed_at: Date.now(),
    redeemed: false,
    redeemed_at: null,
    redeemed_by: null
  };
  await kv.set('claim:' + openid, claim);
  await kv.set('vch:' + voucher, claim);
  await kv.hset('claims:' + code, { [openid]: JSON.stringify(claim) });
  return sendJson(res, 200, claim);
};
