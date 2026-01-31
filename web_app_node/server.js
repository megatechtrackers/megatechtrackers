/**
 * Custom server to record request metrics (duration, status) after each response.
 * Runs next dev or next start and POSTs to /api/_metrics/record on response finish.
 */
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3002', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const SKIP_RECORD_PATHS = ['/api/metrics', '/api/_metrics/record'];

app.prepare().then(() => {
  createServer((req, res) => {
    const start = Date.now();
    const parsedUrl = parse(req.url, true);
    const path = parsedUrl.pathname || '/';
    const method = req.method || 'GET';
    const skipRecord = SKIP_RECORD_PATHS.some((p) => path === p || path.startsWith(p + '?'));

    if (!skipRecord) {
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const status = res.statusCode || 200;
        const recordUrl = `http://127.0.0.1:${port}/api/_metrics/record`;
        fetch(recordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, path, status, duration }),
        }).catch(() => {});
      });
    }

    return handle(req, res, parsedUrl);
  }).listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${port} (${dev ? 'development' : 'production'})`);
  });
});
