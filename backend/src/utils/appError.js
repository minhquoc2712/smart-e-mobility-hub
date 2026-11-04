/**
 * Lỗi nghiệp vụ có HTTP status + mã lỗi.
 * error.middleware.js đọc err.statusCode / err.code / err.message.
 */
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = AppError;
