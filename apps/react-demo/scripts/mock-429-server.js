const http = require('http');

const PORT = 8429;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-API-KEY');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();

    return;
  }

  res.writeHead(429, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-429-server] listening on http://localhost:${PORT}`);
});
