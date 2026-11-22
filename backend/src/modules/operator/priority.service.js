/** Task 4.3b: operator priority override is atomic with queue/point update. */
const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../utils/transaction');
const { parseId } = require('../../utils/validators');
const AppError = require('../../utils/appError');
const allowed = ['LOW','NORMAL','HIGH','URGENT'];
function automatic(battery) { return battery<20?'URGENT':battery<50?'HIGH':battery<80?'NORMAL':'LOW'; }

async function overridePriority(user, rawVehicleId, body = {}) {
  const vehicleId = parseId(rawVehicleId, 'vehicleId');
  const value = body.priority ?? 'NORMAL';
  if (![...allowed,'AUTO'].includes(value)) throw new AppError(400,'VALIDATION_ERROR','Invalid charging priority.');
  return withTransaction(async conn => {
    const [[identity]] = await conn.execute('SELECT current_hub_id FROM vehicles WHERE id=?',[vehicleId]);
    if (!identity) throw new AppError(404,'VEHICLE_NOT_FOUND','Vehicle not found.');
    if (!identity.current_hub_id) throw new AppError(409,'VEHICLE_NOT_AT_HUB','Vehicle is not at a Hub.');
    const [[hub]] = await conn.execute('SELECT id,status FROM hubs WHERE id=? FOR UPDATE',[identity.current_hub_id]);
    if (!hub || hub.status==='MAINTENANCE') throw new AppError(409,'HUB_IN_MAINTENANCE','Hub is not operational.');
    const [[vehicle]] = await conn.execute('SELECT * FROM vehicles WHERE id=? FOR UPDATE',[vehicleId]);
    if (Number(vehicle.current_hub_id)!==Number(hub.id)) throw new AppError(409,'RESOURCE_CONFLICT','Vehicle changed Hub.');
    const priority = value==='AUTO'?automatic(Number(vehicle.battery_level)):value;
    const [requests] = await conn.execute(
      "SELECT * FROM charging_requests WHERE vehicle_id=? AND status IN ('QUEUED','SCHEDULED','CHARGING') ORDER BY id DESC FOR UPDATE", [vehicleId]);
    if (requests.length) {
      const active = requests[0];
      await conn.execute('UPDATE charging_requests SET priority=? WHERE id=?',[priority,active.id]);
      if (active.status==='CHARGING' && active.charging_point_id) {
        await conn.execute('UPDATE charging_points SET priority_level=? WHERE id=?',[priority,active.charging_point_id]);
      }
    } else {
      if (vehicle.status!=='AVAILABLE' || Number(vehicle.battery_level)>=100) {
        throw new AppError(409,'VEHICLE_NOT_AVAILABLE','Cannot queue charging for this vehicle in its current state.');
      }
      const code = `CHG-${randomUUID().replace(/-/g,'')}`;
      const [[waiting]] = await conn.execute("SELECT COUNT(*) AS n FROM charging_requests WHERE hub_id=? AND status='QUEUED'",[hub.id]);
      await conn.execute(`INSERT INTO charging_requests
        (request_code,user_id,ownership_type,vehicle_id,hub_id,current_battery_level,target_battery_level,priority,scheduled_start,scheduled_end,queue_position,status)
        VALUES (?,?,'RENTAL',?,?,?,?,?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR),?,'QUEUED')`,
        [code,parseId(user.id,'operatorId'),vehicleId,hub.id,vehicle.battery_level,Math.max(95,Math.min(100,Number(vehicle.battery_level)+1)),priority,Number(waiting.n)+1]);
    }
    return {vehicleId,priority,mode:value==='AUTO'?'AUTO':'MANUAL'};
  });
}
module.exports = { overridePriority, automatic };