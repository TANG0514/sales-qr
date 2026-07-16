'use strict';
const { kv } = require('./_lib/store');
const { sendJson } = require('./_lib/util');

// GET /api/claims  溯源：返回全部领取记录（后台报表用）
module.exports = async (req, res) => {
  const codes = await kv.smembers('sales:index');
  const all = [];
  for (const code of codes) {
    const h = await kv.hgetall('claims:' + code);
    for (const k in h) {
      try { all.push(JSON.parse(h[k])); } catch (e) { /* ignore */ }
    }
  }
  return sendJson(res, 200, all);
};
