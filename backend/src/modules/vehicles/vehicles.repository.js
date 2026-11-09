const { pool } = require('../../config/db');

const VEHICLE_SELECT = `
  SELECT v.id, v.code, v.type, v.model,
         v.current_hub_id AS currentHubId, h.name AS currentHubName,
         v.parking_slot_id AS parkingSlotId,
         v.battery_level AS batteryLevel, v.estimated_range_km AS estimatedRangeKm,
         v.status, v.last_telemetry_at AS lastTelemetryAt, v.updated_at AS updatedAt
  FROM vehicles v
  LEFT JOIN hubs h ON h.id = v.current_hub_id`;

const toVehicle = (row) => row && { ...row, estimatedRangeKm: Number(row.estimatedRangeKm) };

async function findAll({ hubId = null, type = null, minBattery = 0, status = null } = {}) {
  const conditions = ['v.battery_level >= ?'];
  const params = [minBattery];
  if (hubId) { conditions.push('v.current_hub_id = ?'); params.push(hubId); }
  if (type) { conditions.push('v.type = ?'); params.push(type); }
  if (status) { conditions.push('v.status = ?'); params.push(status); }
  const [rows] = await pool.execute(
    `${VEHICLE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY v.battery_level DESC, v.id ASC`,
    params
  );
  return rows.map(toVehicle);
}

async function findById(id) {
  const [rows] = await pool.execute(`${VEHICLE_SELECT} WHERE v.id = ?`, [id]);
  return toVehicle(rows[0]) || null;
}

async function lockById(conn, id) {
  const [rows] = await conn.execute(
    'SELECT id, status, battery_level, current_hub_id FROM vehicles WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows[0] || null;
}

async function updateStatus(conn, id, status) {
  await conn.execute('UPDATE vehicles SET status = ? WHERE id = ?', [status, id]);
}

module.exports = { findAll, findById, lockById, updateStatus };
