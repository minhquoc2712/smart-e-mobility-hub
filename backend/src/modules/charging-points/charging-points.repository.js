const { pool } = require('../../config/db');

const CHARGER_SELECT = `
  SELECT cp.id, cp.hub_id AS hubId, cp.charger_code AS chargerCode,
         cp.connector_type AS connectorType, cp.max_power_kw AS maxPowerKw,
         cp.status, cp.current_vehicle_id AS currentVehicleId,
         cp.priority_level AS priorityLevel, cp.updated_at AS updatedAt
  FROM charging_points cp`;

const toCharger = (row) => row && { ...row, maxPowerKw: Number(row.maxPowerKw) };

async function findAll({ hubId = null, status = null } = {}) {
  const conditions = [];
  const params = [];
  if (hubId) { conditions.push('cp.hub_id = ?'); params.push(hubId); }
  if (status) { conditions.push('cp.status = ?'); params.push(status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(`${CHARGER_SELECT} ${where} ORDER BY cp.hub_id, cp.charger_code`, params);
  return rows.map(toCharger);
}

async function findById(id) {
  const [rows] = await pool.execute(`${CHARGER_SELECT} WHERE cp.id = ?`, [id]);
  return toCharger(rows[0]) || null;
}

async function lockById(conn, id) {
  const [rows] = await conn.execute(
    'SELECT id, hub_id, status, current_vehicle_id FROM charging_points WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows[0] || null;
}

async function update(conn, id, status, currentVehicleId) {
  await conn.execute('UPDATE charging_points SET status = ?, current_vehicle_id = ? WHERE id = ?', [
    status,
    currentVehicleId,
    id,
  ]);
}

// Charger khác đang giữ (RESERVED / CHARGING) xe này?
async function findActiveByVehicle(conn, vehicleId, excludeId) {
  const [rows] = await conn.execute(
    `SELECT id FROM charging_points
     WHERE current_vehicle_id = ? AND status IN ('RESERVED', 'CHARGING') AND id <> ? LIMIT 1`,
    [vehicleId, excludeId]
  );
  return rows[0] || null;
}

// Xe rời trạng thái CHARGING => charger đang sạc xe đó trở về AVAILABLE.
async function releaseByVehicle(conn, vehicleId) {
  await conn.execute(
    `UPDATE charging_points SET status = 'AVAILABLE', current_vehicle_id = NULL
     WHERE current_vehicle_id = ? AND status = 'CHARGING'`,
    [vehicleId]
  );
}

module.exports = { findAll, findById, lockById, update, findActiveByVehicle, releaseByVehicle };
