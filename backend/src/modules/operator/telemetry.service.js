/** Task 4.3b â€“ input is validated before calling this service. */
const { withTransaction } = require('../../utils/transaction');
const AppError = require('../../utils/appError');

async function ingestTelemetry(body) {
  if (process.env.NODE_ENV === 'production' && !process.env.SIMULATOR_API_KEY) {
    throw new AppError(503, 'SIMULATOR_NOT_CONFIGURED', 'Telemetry ingestion is disabled until a simulator key is configured.');
  }
  if (process.env.SIMULATOR_API_KEY && body.simulatorKey !== process.env.SIMULATOR_API_KEY) {
    throw new AppError(401, 'INVALID_SIMULATOR_KEY', 'Invalid simulator key.');
  }
  if (!body.vehicleUpdates.length) return {updatedCount:0};
  return withTransaction(async conn => {
    // Sort locks deterministically; reject any unknown vehicle before writing.
    const updates = [...body.vehicleUpdates].sort((a,b)=>a.vehicleCode.localeCompare(b.vehicleCode));
    const rows = [];
    for (const item of updates) {
      const [[vehicle]] = await conn.execute('SELECT id,status FROM vehicles WHERE code=? FOR UPDATE',[item.vehicleCode]);
      if (!vehicle) throw new AppError(404,'VEHICLE_NOT_FOUND',`Unknown vehicleCode: ${item.vehicleCode}.`);
      // Status changes require the responsible reservation/charging/incident flow.
      // IoT telemetry reports status, but may NOT bypass state transition invariants.
      if (item.status !== undefined && item.status !== vehicle.status) {
        throw new AppError(409,'STATE_UPDATE_REQUIRES_WORKFLOW',
          'Telemetry cannot directly override vehicle lifecycle state; use the relevant state API.');
      }
      rows.push({id:vehicle.id,batteryLevel:item.batteryLevel});
    }
    for (const row of rows) {
      await conn.execute('UPDATE vehicles SET battery_level=?,last_telemetry_at=UTC_TIMESTAMP() WHERE id=?',
        [row.batteryLevel,row.id]);
    }
    return {updatedCount:rows.length};
  });
}
module.exports = { ingestTelemetry };