const AppError = require('../../utils/appError');
const { withTransaction } = require('../../utils/transaction');
const { assertTransition } = require('../state/stateMachine');
const hubsService = require('../hubs/hubs.service');
const repo = require('./parking-slots.repository');

async function listParkingSlots(filters) {
  return repo.findAll(filters);
}

async function getParkingSlot(id) {
  const slot = await repo.findById(id);
  if (!slot) throw new AppError(404, 'PARKING_SLOT_NOT_FOUND', 'Parking slot not found.');
  return slot;
}

/**
 * Đổi trạng thái slot qua state machine, trong một transaction:
 *  - khóa dòng slot, kiểm tra transition hợp lệ
 *  - hub đang bảo trì thì không cho RESERVED / OCCUPIED
 *  - về FREE thì gỡ liên kết xe
 *  - tính lại trạng thái Hub (ACTIVE / NEAR_FULL / FULL)
 * `conn` tùy chọn: module khác (reservations...) truyền connection để chung transaction.
 */
async function changeParkingSlotStatus(slotId, toStatus, conn = null) {
  const work = async (c) => {
    const slot = await repo.lockById(c, slotId);
    if (!slot) throw new AppError(404, 'PARKING_SLOT_NOT_FOUND', 'Parking slot not found.');

    assertTransition('parkingSlot', slot.status, toStatus);
    if (toStatus === 'RESERVED' || toStatus === 'OCCUPIED') {
      await hubsService.assertHubOperational(c, slot.hub_id);
    }

    await repo.updateStatus(c, slotId, toStatus);
    if (toStatus === 'FREE') await repo.detachVehicles(c, slotId);
    await hubsService.syncHubStatus(c, slot.hub_id);
  };

  if (conn) await work(conn);
  else await withTransaction(work);
  return getParkingSlot(slotId);
}

module.exports = { listParkingSlots, getParkingSlot, changeParkingSlotStatus };
