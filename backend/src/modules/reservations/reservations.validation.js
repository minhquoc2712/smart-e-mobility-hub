const AppError = require('../../utils/appError');
const { parseId } = require('../../utils/validators');

function requiredId(value, name) {
  return parseId(value, name);
}

function dateTime(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(value)) {
    throw new AppError(400, 'VALIDATION_FAILED', `${name} must be a date-time string.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'VALIDATION_FAILED', `Invalid ${name}.`);
  }
  return date;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Formats a JS Date in local server time ('YYYY-MM-DD HH:mm:ss') so MySQL DATETIME
 * (which has no timezone) matches NOW() and mysql2's local Date parser without UTC shift.
 */
function mysqlDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function windowOf(start, end, { maxAdvanceDays = 7, minMinutes = 30, maxMinutes = 720 } = {}) {
  const s = dateTime(start, 'startTime');
  const e = dateTime(end, 'endTime');
  const now = Date.now();
  if (
    s.getTime() < now - 60000 ||
    s.getTime() > now + maxAdvanceDays * 86400000 ||
    e <= s ||
    e - s < minMinutes * 60000 ||
    e - s > maxMinutes * 60000
  ) {
    throw new AppError(
      422,
      'INVALID_TIME_WINDOW',
      `Start must be within 7 days and duration ${minMinutes}-${maxMinutes} minutes.`
    );
  }
  return { start: mysqlDate(s), end: mysqlDate(e) };
}

function battery(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new AppError(400, 'VALIDATION_FAILED', 'batteryLevel must be an integer from 0 to 100.');
  }
  return n;
}

module.exports = { requiredId, dateTime, windowOf, mysqlDate, battery };
