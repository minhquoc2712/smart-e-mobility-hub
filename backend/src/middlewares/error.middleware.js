const AppError = require('../utils/appError');

/** Convert expected MySQL concurrency/constraint failures to safe API errors. */
function classifyError(err) {
  if (err instanceof AppError) return err;
  // express.json() throws a SyntaxError for malformed JSON and a 413 for huge bodies.
  if (err && err.type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', 'Malformed JSON request body.');
  }
  if (err && err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds size limit.');
  }
  const codes = {
    ER_DUP_ENTRY: [409, 'RESOURCE_CONFLICT', 'This resource or reference already exists.'],
    ER_LOCK_DEADLOCK: [409, 'CONCURRENT_UPDATE_CONFLICT', 'Concurrent update conflict. Please retry.'],
    ER_LOCK_WAIT_TIMEOUT: [409, 'CONCURRENT_UPDATE_CONFLICT', 'Resource is busy. Please retry.'],
    ER_NO_REFERENCED_ROW_2: [400, 'INVALID_REFERENCE', 'Referenced resource does not exist.'],
    ER_ROW_IS_REFERENCED_2: [409, 'RESOURCE_IN_USE', 'Resource is still referenced by another record.'],
    ER_DATA_TOO_LONG: [400, 'VALIDATION_ERROR', 'A field exceeds its maximum allowed length.'],
    ER_TRUNCATED_WRONG_VALUE: [400, 'VALIDATION_ERROR', 'Invalid field value.'],
    ER_BAD_NULL_ERROR: [400, 'VALIDATION_ERROR', 'A required field is missing.'],
    WARN_DATA_TRUNCATED: [400, 'VALIDATION_ERROR', 'Invalid field value.'],
    ER_CHECK_CONSTRAINT_VIOLATED: [400, 'VALIDATION_ERROR', 'A value is outside the allowed range.'],
  };
  const mapped = err && codes[err.code];
  return mapped ? new AppError(...mapped) : new AppError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected server error occurred.');
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Endpoint ${req.method} ${req.path} does not exist.` },
  });
}

function errorHandler(err, req, res, _next) {
  const safe = classifyError(err);
  // Keep original stack/DB detail server-side only, never expose SQL/JWT/secrets in JSON.
  if (safe.statusCode >= 500) {
    console.error(JSON.stringify({ event: 'server_error', requestId: req.requestId,
      method: req.method, path: req.path, code: err?.code || 'UNKNOWN',
      message: err?.message || 'Unknown failure' }));
  }
  if (res.headersSent) return;
  res.status(safe.statusCode).json({
    success: false,
    error: { code: safe.code, message: safe.message },
  });
}

module.exports = { notFoundHandler, errorHandler, classifyError };