const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 18080;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cookie-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Serve HTML
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, (err, data) => {
      if (err) { res.writeHead(500); res.end('Error loading page'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Serve static files (e.g. _pack_sample.json)
  if (req.method === 'GET' && req.url !== '/') {
    const filePath = path.join(__dirname, req.url);
    // 安全检查：防止路径穿越
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = { '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': (mimeTypes[ext] || 'application/octet-stream') + '; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Generic API proxy: /api/* -> account.zyun.qihoo.net/orkaApi/*
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const token = req.headers['x-cookie-token'] || '';
      const postData = body || '{}';
      const apiPath = req.url.replace(/^\/api/, '/orkaApi/product');

      const options = {
        hostname: 'account.zyun.qihoo.net',
        port: 443,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': token,
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const proxyReq = https.request(options, proxyRes => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(data);
        });
      });

      proxyReq.on('error', e => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errno: -1, errmsg: 'Proxy error: ' + e.message }));
      });

      proxyReq.write(postData);
      proxyReq.end();
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n  ✅ 对账工具已启动`);
  console.log(`  📎 打开浏览器访问: http://localhost:${PORT}\n`);
});
