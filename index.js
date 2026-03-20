const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const TARGET = 'generativelanguage.googleapis.com';

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  
  const options = {
    hostname: TARGET,
    port: 443,
    path: parsedUrl.path,
    method: req.method,
    headers: {
      ...req.headers,
      host: TARGET,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`Gemini proxy running on port ${PORT}`);
});
