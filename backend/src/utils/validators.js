const AppError = require('./appError');
const { statusesOf, isKnownStatus } = require('../modules/state/stateMachine');

function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(400, 'INVALID_ID', `${label} must be a positive integer.`);
  }
  return n;
}

function parseOptionalId(value, label) {
  return value === undefined || value === null || value === '' ? null : parseId(value, label);
}

function parseStatus(entity, value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!isKnownStatus(entity, normalized)) {
    throw new AppError(400, 'INVALID_STATUS', `status must be one of: ${statusesOf(entity).join(', ')}.`);
  }
  return normalized;
}

function parseOptionalStatus(entity, value) {
  return value === undefined || value === '' ? null : parseStatus(entity, value);
}

module.exports = { parseId, parseOptionalId, parseStatus, parseOptionalStatus };
