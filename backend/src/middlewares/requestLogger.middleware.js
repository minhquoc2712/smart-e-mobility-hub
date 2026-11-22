const { randomUUID } = require('node:crypto');

function requestLogger(req, res, next) {
  const requestId = randomUUID();
  const started = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const entry = {
      event: 'http_request', requestId, method: req.method,
      path: req.originalUrl.split('?')[0], status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
    };
    // Record successful writes as well as failed requests; no PII in the log.
    const message = JSON.stringify(entry);
    if (res.statusCode >= 500) console.error(message);
    else if (res.statusCode >= 400) console.warn(message);
    else console.info(message);
  });
  next();
}

module.exports = requestLogger;