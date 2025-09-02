const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8080;

app.use(cors({
  origin: 'https://tahahhany11192.github.io/CS-EslamHatem-Frontend',
  credentials: true
}));

app.use('/', createProxyMiddleware({
  target: 'http://0.0.0.0:8080',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    if (req.method === 'OPTIONS') {
      proxyReq.end();
    }
  }
}));

app.listen(PORT, () => {
  console.log(`Proxy server running on http://0.0.0.0:${PORT}`);
});
