const AppError = require('../../utils/appError');
const { withTransaction } = require('../../utils/transaction');
const { HUB_NEAR_FULL_RATIO } = require('../../config/businessRules');
const { assertTransition } = require('../state/stateMachine');
const hubsRepo = require('./hubs.repository');
const slotsRepo = require('../parking-slots/parking-slots.repository');
const chargersRepo = require('../charging-points/charging-points.repository');

const notFound = () => new AppError(404, 'HUB_NOT_FOUND', 'Hub not found.');

async function listHubs() {
  return hubsRepo.findAll();
}

async function getHub(hubId) {
  const hub = await hubsRepo.findById(hubId);
  if (!hub) throw notFound();
  return hub;
}

async function listParkingSlots(hubId, filters = {}) {
  await getHub(hubId);
  return slotsRepo.findAll({ ...filters, hubId });
}

async function listChargingPoints(hubId, filters = {}) {
  await getHub(hubId);
  return chargersRepo.findAll({ ...filters, hubId });
}

// Rule: hub trong MAINTENANCE không nhận đặt slot / charger mới.
async function assertHubOperational(conn, hubId) {
  const hub = await hubsRepo.getStatus(conn, hubId);
  if (!hub) throw notFound();
  if (hub.status === 'MAINTENANCE') {
    throw new AppError(409, 'HUB_IN_MAINTENANCE', 'Hub is under maintenance and cannot accept new reservations or charging sessions.');
  }
}

// Trạng thái tự tính theo mức lấp đầy slot.
function computeHubStatus(usable, used) {
  if (usable === 0) return 'FULL';
  const ratio = used / usable;
  if (ratio >= 1) return 'FULL';
  if (ratio >= HUB_NEAR_FULL_RATIO) return 'NEAR_FULL';
  return 'ACTIVE';
}

/**
 * Tính lại ACTIVE / NEAR_FULL / FULL cho hub. Gọi trong transaction mỗi khi slot đổi trạng thái.
 * Hub đang MAINTENANCE thì giữ nguyên.
 */
async function syncHubStatus(conn, hubId) {
  const hub = await hubsRepo.lockById(conn, hubId);
  if (!hub || hub.status === 'MAINTENANCE') return hub ? hub.status : null;
  const { usable, used } = await hubsRepo.getSlotUsage(conn, hubId);
  const next = computeHubStatus(usable, used);
  if (next !== hub.status) await hubsRepo.updateStatus(conn, hubId, next);
  return next;
}

// Operator bật/tắt bảo trì (ACTIVE <-> MAINTENANCE).
async function changeHubStatus(hubId, toStatus) {
  await withTransaction(async (conn) => {
    const hub = await hubsRepo.lockById(conn, hubId);
    if (!hub) throw notFound();
    assertTransition('hub', hub.status, toStatus);
    await hubsRepo.updateStatus(conn, hubId, toStatus);
    if (toStatus === 'ACTIVE') await syncHubStatus(conn, hubId); // ra khỏi bảo trì: tính lại theo slot
  });
  return getHub(hubId);
}

module.exports = {
  listHubs,
  getHub,
  listParkingSlots,
  listChargingPoints,
  assertHubOperational,
  computeHubStatus,
  syncHubStatus,
  changeHubStatus,
};
