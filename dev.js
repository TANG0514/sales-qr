'use strict';
/*
 * 本地开发服务器（与 Vercel 行为对齐）：
 * - /api/* 路由到 api/ 下的 Serverless 函数
 * - 其余请求托管 public/ 静态文件
 * 存储：未配置 Vercel KV 时使用内存存储（重启清空）。
 * 运行：node dev.js   或   npm start
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const routes = {
  '/api/sales': require('./api/sales'),
  '/api/qrcode': require('./api/qrcode'),
  '/api/sales-info': require('./api/sales-info'),
  '/api/claim': require('./api/claim'),
  '/api/claims': require('./api/claims'),
  '/api/redeem': require('./api/redeem')
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  try {
    if (routes[pathname]) return await routes[pathname](req, res);
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'server error' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n  本地开发服务器已启动（复用 api/ 函数，与 Vercel 行为一致）`);
  console.log(`  后台:        http://localhost:${PORT}/admin`);
  console.log(`  核销台:      http://localhost:${PORT}/redeem`);
  console.log(`  患者页示例:  http://localhost:${PORT}/claim?code=SALE_DEMO\n`);
});
