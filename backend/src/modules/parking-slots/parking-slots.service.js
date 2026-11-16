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
 *  - về FREE thì gỡ liên kết xe; sang OCCUPIED có kèm biển số/mã xe thì gắn/tạo xe vào MySQL
 *  - tính lại trạng thái Hub (ACTIVE / NEAR_FULL / FULL)
 */
async function changeParkingSlotStatus(slotId, toStatus, conn = null, extra = {}) {
  const work = async (c) => {
    const slot = await repo.lockById(c, slotId);
    if (!slot) throw new AppError(404, 'PARKING_SLOT_NOT_FOUND', 'Parking slot not found.');

    if (slot.status !== toStatus) {
      assertTransition('parkingSlot', slot.status, toStatus);
    }
    if (toStatus === 'RESERVED' || toStatus === 'OCCUPIED') {
      await hubsService.assertHubOperational(c, slot.hub_id);
    }

    await repo.updateStatus(c, slotId, toStatus);
    if (toStatus === 'FREE' || toStatus === 'OUT_OF_SERVICE') {
      await repo.detachVehicles(c, slotId);
    } else if (toStatus === 'OCCUPIED' && (extra.vehiclePlate || extra.vehicleCode)) {
      await repo.attachOrCreateVehicle(c, {
        slotId,
        hubId: slot.hub_id,
        slotType: slot.slot_type,
        vehiclePlate: extra.vehiclePlate || extra.vehicleCode,
        vehicleType: extra.vehicleType,
      });
    }
    await hubsService.syncHubStatus(c, slot.hub_id);
  };

  if (conn) await work(conn);
  else await withTransaction(work);
  return getParkingSlot(slotId);
}

module.exports = { listParkingSlots, getParkingSlot, changeParkingSlotStatus };
