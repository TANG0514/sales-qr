'use strict';
const { kv } = require('./_lib/store');
const { genSalesCode, uid, sendJson, readBody } = require('./_lib/util');

// POST 新增业务员 / GET 业务员列表
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const body = await readBody(req);
    const name = (body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: '请填写业务员姓名' });
    const code = genSalesCode();
    const record = { id: uid(), name, code, created_at: Date.now() };
    await kv.set('sales:' + code, record);
    await kv.sadd('sales:index', code);
    return sendJson(res, 200, record);
  }

  if (req.method === 'GET') {
    const codes = await kv.smembers('sales:index');
    const list = [];
    for (const code of codes) {
      const s = await kv.get('sales:' + code);
      if (s) list.push(s);
    }
    return sendJson(res, 200, list);
  }

  return sendJson(res, 405, { error: 'method not allowed' });
};
