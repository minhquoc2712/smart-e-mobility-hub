const AppError = require('../../utils/appError');
const { runInTransaction } = require('../../utils/transaction');
const { assertTransition } = require('../state/stateMachine');
const hubsService = require('../hubs/hubs.service');
const vehiclesService = require('../vehicles/vehicles.service');
const vehiclesRepo = require('../vehicles/vehicles.repository');
const repo = require('./charging-points.repository');

async function listChargingPoints(filters) {
  return repo.findAll(filters);
}

async function getChargingPoint(id) {
  const charger = await repo.findById(id);
  if (!charger) throw new AppError(404, 'CHARGING_POINT_NOT_FOUND', 'Charging point not found.');
  return charger;
}

/**
 * Đổi trạng thái charger qua state machine (một transaction) và đồng bộ với xe:
 *  - RESERVED / CHARGING: hub không được bảo trì. vehicleId tùy chọn
 *    (xe của người dùng riêng không có trong bảng vehicles thì bỏ trống).
 *    Nếu có xe: xe phải đang ở cùng hub và chưa gắn vào charger khác.
 *  - CHARGING + có xe thuê: xe chuyển sang CHARGING; charger giữ current_vehicle_id.
 *  - Rời CHARGING (AVAILABLE / OUT_OF_SERVICE): xe đang sạc trở về AVAILABLE, charger bỏ current_vehicle_id.
 * options.conn: truyền connection nếu module khác muốn chung transaction.
 */
async function changeChargingPointStatus(chargerId, toStatus, options = {}) {
  await runInTransaction(options.conn, async (conn) => {
    const charger = await repo.lockById(conn, chargerId);
    if (!charger) throw new AppError(404, 'CHARGING_POINT_NOT_FOUND', 'Charging point not found.');

    assertTransition('chargingPoint', charger.status, toStatus);

    let holdVehicleId = null;

    if (toStatus === 'RESERVED' || toStatus === 'CHARGING') {
      await hubsService.assertHubOperational(conn, charger.hub_id);

      const requested = options.vehicleId ?? null;
      if (requested !== null && charger.current_vehicle_id !== null && requested !== charger.current_vehicle_id) {
        throw new AppError(409, 'CHARGER_RESERVED_FOR_OTHER', 'This charging point is reserved for a different vehicle.');
      }
      holdVehicleId = requested ?? charger.current_vehicle_id;

      if (holdVehicleId !== null) {
        const vehicle = await vehiclesRepo.lockById(conn, holdVehicleId);
        if (!vehicle) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');
        if (vehicle.current_hub_id !== charger.hub_id) {
          throw new AppError(409, 'VEHICLE_HUB_MISMATCH', 'Vehicle is not at the same hub as this charging point.');
        }
        if (await repo.findActiveByVehicle(conn, holdVehicleId, chargerId)) {
          throw new AppError(409, 'VEHICLE_ALREADY_ASSIGNED', 'Vehicle is already assigned to another charging point.');
        }
        if (toStatus === 'CHARGING') {
          await vehiclesService.changeVehicleStatus(holdVehicleId, 'CHARGING', { conn, viaCharger: true });
        }
      }
    } else if (charger.status === 'CHARGING' && charger.current_vehicle_id !== null) {
      // Kết thúc sạc / charger hỏng: trả xe về AVAILABLE.
      const vehicle = await vehiclesRepo.lockById(conn, charger.current_vehicle_id);
      if (vehicle && vehicle.status === 'CHARGING') {
        await vehiclesService.changeVehicleStatus(vehicle.id, 'AVAILABLE', { conn, viaCharger: true });
      }
    }

    await repo.update(conn, chargerId, toStatus, holdVehicleId);
  });
  return getChargingPoint(chargerId);
}

module.exports = { listChargingPoints, getChargingPoint, changeChargingPointStatus };
