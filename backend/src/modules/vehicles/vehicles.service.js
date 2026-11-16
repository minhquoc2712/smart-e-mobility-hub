const AppError = require('../../utils/appError');
const { runInTransaction } = require('../../utils/transaction');
const { MIN_BATTERY_TO_RESERVE } = require('../../config/businessRules');
const { assertTransition } = require('../state/stateMachine');
const repo = require('./vehicles.repository');
const chargersRepo = require('../charging-points/charging-points.repository');

const notFound = () => new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');

async function listVehicles(filters) {
  return repo.findAll(filters);
}

async function getVehicle(id) {
  const vehicle = await repo.findById(id);
  if (!vehicle) throw notFound();
  return vehicle;
}

async function checkAvailability(id) {
  const vehicle = await getVehicle(id);
  const available = vehicle.status === 'AVAILABLE' && vehicle.batteryLevel >= MIN_BATTERY_TO_RESERVE;
  return {
    vehicleId: vehicle.id,
    available,
    reason: available ? null : `Vehicle status is ${vehicle.status} (battery ${vehicle.batteryLevel}%)`,
  };
}

/**
 * Đổi trạng thái xe qua state machine.
 * options.conn       : dùng chung transaction của module gọi (reservations, charging...)
 * options.viaCharger : true khi được gọi từ luồng sạc (charging-points.service).
 *
 * Rule:
 *  - sang CHARGING phải đi qua charger (PATCH /charging-points/:id/status)
 *  - sang RESERVED cần pin >= MIN_BATTERY_TO_RESERVE và xe đang ở một hub
 *  - rời CHARGING thì giải phóng charger đang giữ xe này
 */
async function changeVehicleStatus(vehicleId, toStatus, options = {}) {
  await runInTransaction(options.conn, async (conn) => {
    const vehicle = await repo.lockById(conn, vehicleId);
    if (!vehicle) throw notFound();

    assertTransition('vehicle', vehicle.status, toStatus);

    if (toStatus === 'CHARGING' && !options.viaCharger) {
      throw new AppError(
        409,
        'CHARGER_REQUIRED',
        'A vehicle can only start charging through a charging point: PATCH /charging-points/:id/status with status CHARGING and vehicleId.'
      );
    }
    if (toStatus === 'RESERVED') {
      if (vehicle.battery_level < MIN_BATTERY_TO_RESERVE) {
        throw new AppError(409, 'LOW_BATTERY', `Battery ${vehicle.battery_level}% is below the ${MIN_BATTERY_TO_RESERVE}% minimum required to reserve.`);
      }
      if (vehicle.current_hub_id == null) {
        throw new AppError(409, 'VEHICLE_NOT_AT_HUB', 'Vehicle is not currently at a hub.');
      }
    }

    if (vehicle.status === 'CHARGING') await chargersRepo.releaseByVehicle(conn, vehicleId);
    await repo.updateStatus(conn, vehicleId, toStatus);
  });
  return getVehicle(vehicleId);
}

module.exports = { listVehicles, getVehicle, checkAvailability, changeVehicleStatus };
