'use strict';
const { kv } = require('./_lib/store');
const { sendJson } = require('./_lib/util');

// GET /api/sales-info?code=SALE_XXX  领取页查询业务员信息
module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  const sales = await kv.get('sales:' + code);
  if (!sales) return sendJson(res, 404, { error: '二维码无效或业务员已停用' });
  return sendJson(res, 200, { code: sales.code, name: sales.name });
};
