/**
 * State-transition mechanism (Task 3.1, bám theo sơ đồ 2A.5).
 *
 * Mọi thay đổi trạng thái của Vehicle / ChargingPoint / ParkingSlot / Hub đều phải đi qua
 * assertTransition(). Chuyển sai => AppError 409 INVALID_STATE_TRANSITION.
 *
 * Bảng dưới là "state tiếp theo hợp lệ" của từng state. Sửa bảng này nếu sơ đồ 2A.5 khác.
 */
const AppError = require('../../utils/appError');

const ENTITY_LABELS = {
  vehicle: 'Vehicle',
  chargingPoint: 'ChargingPoint',
  parkingSlot: 'ParkingSlot',
  hub: 'Hub',
};

const TRANSITIONS = {
  vehicle: {
    AVAILABLE: ['RESERVED', 'CHARGING', 'OUT_OF_SERVICE'],
    RESERVED: ['AVAILABLE', 'IN_USE', 'OUT_OF_SERVICE'],
    IN_USE: ['AVAILABLE', 'CHARGING', 'OUT_OF_SERVICE'],
    CHARGING: ['AVAILABLE', 'OUT_OF_SERVICE'],
    OUT_OF_SERVICE: ['AVAILABLE'],
  },
  chargingPoint: {
    AVAILABLE: ['RESERVED', 'CHARGING', 'OUT_OF_SERVICE'],
    RESERVED: ['AVAILABLE', 'CHARGING', 'OUT_OF_SERVICE'],
    CHARGING: ['AVAILABLE', 'OUT_OF_SERVICE'],
    OUT_OF_SERVICE: ['AVAILABLE'],
  },
  parkingSlot: {
    FREE: ['RESERVED', 'OCCUPIED', 'OUT_OF_SERVICE'],
    RESERVED: ['FREE', 'OCCUPIED', 'OUT_OF_SERVICE'],
    OCCUPIED: ['FREE', 'OUT_OF_SERVICE'],
    OUT_OF_SERVICE: ['FREE'],
  },
  // Hub: Operator chỉ được bật/tắt MAINTENANCE bằng tay.
  // ACTIVE / NEAR_FULL / FULL do hệ thống tự tính từ số slot đã dùng (xem hubs.service.js).
  hub: {
    ACTIVE: ['MAINTENANCE'],
    NEAR_FULL: ['MAINTENANCE'],
    FULL: ['MAINTENANCE'],
    MAINTENANCE: ['ACTIVE'],
  },
};

function tableOf(entity) {
  const table = TRANSITIONS[entity];
  if (!table) throw new Error(`Unknown state machine entity: ${entity}`);
  return table;
}

function statusesOf(entity) {
  return Object.keys(tableOf(entity));
}

function isKnownStatus(entity, status) {
  return Object.prototype.hasOwnProperty.call(tableOf(entity), status);
}

function allowedNext(entity, from) {
  return tableOf(entity)[from] || [];
}

function canTransition(entity, from, to) {
  return allowedNext(entity, from).includes(to);
}

function assertTransition(entity, from, to) {
  const label = ENTITY_LABELS[entity];
  if (!isKnownStatus(entity, to)) {
    throw new AppError(400, 'INVALID_STATUS', `${to} is not a valid ${label} status. Valid: ${statusesOf(entity).join(', ')}.`);
  }
  if (from === to) {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', `${label} is already ${to}.`);
  }
  if (!canTransition(entity, from, to)) {
    const next = allowedNext(entity, from);
    throw new AppError(
      409,
      'INVALID_STATE_TRANSITION',
      `Cannot change ${label} status from ${from} to ${to}. Allowed next states: ${next.length ? next.join(', ') : 'none'}.`
    );
  }
}

module.exports = {
  TRANSITIONS,
  statusesOf,
  isKnownStatus,
  allowedNext,
  canTransition,
  assertTransition,
};
