const { randomUUID } = require('node:crypto');

function requestLogger(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();
  res.on('finish', () => {
    // Do not log query strings, tokens, credentials, request bodies or personal data.
    console.info('[API]', JSON.stringify({ requestId, method: req.method, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
}

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint does not exist.' } });
}

function normalizeError(err) {
  if (err.type === 'entity.parse.failed') return { status: 400, code: 'INVALID_JSON', message: 'Request body must be valid JSON.' };
  if (err.type === 'entity.too.large') return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' };
  if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(err.code)) return { status: 409, code: 'CONCURRENT_UPDATE', message: 'Another request changed this resource. Refresh and retry.' };
  if (err.code === 'ER_DUP_ENTRY') return { status: 409, code: 'DUPLICATE_RESOURCE', message: 'Resource already exists.' };
  if (['ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2'].includes(err.code)) return { status: 409, code: 'REFERENCE_CONFLICT', message: 'Related resource is missing or in use.' };
  if (['ER_DATA_TOO_LONG','ER_TRUNCATED_WRONG_VALUE_FOR_FIELD','ER_WARN_DATA_OUT_OF_RANGE','ER_CHECK_CONSTRAINT_VIOLATED'].includes(err.code)) return { status: 400, code: 'VALIDATION_FAILED', message: 'A field value is invalid.' };
  if (err.statusCode >= 400 && err.statusCode < 500) return { status: err.statusCode, code: err.code || 'REQUEST_FAILED', message: err.message };
  return { status: 500, code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' };
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const { status, code, message } = normalizeError(err);
  if (status >= 500) console.error('[API error]', JSON.stringify({ requestId: req.requestId, code: err.code || err.name, status }));
  res.status(status).json({ success: false, error: { code, message } });
}

module.exports = { requestLogger, notFoundHandler, errorHandler, normalizeError };