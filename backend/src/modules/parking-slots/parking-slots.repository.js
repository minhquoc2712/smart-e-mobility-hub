const { pool } = require('../../config/db');

const SLOT_SELECT = `
  SELECT ps.id, ps.hub_id AS hubId, ps.slot_code AS slotCode, ps.slot_type AS slotType,
         ps.status, ps.updated_at AS updatedAt
  FROM parking_slots ps`;

async function findAll({ hubId = null, status = null, slotType = null } = {}) {
  const conditions = [];
  const params = [];
  if (hubId) { conditions.push('ps.hub_id = ?'); params.push(hubId); }
  if (status) { conditions.push('ps.status = ?'); params.push(status); }
  if (slotType) { conditions.push('ps.slot_type = ?'); params.push(slotType); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(`${SLOT_SELECT} ${where} ORDER BY ps.hub_id, ps.slot_code`, params);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(`${SLOT_SELECT} WHERE ps.id = ?`, [id]);
  return rows[0] || null;
}

async function lockById(conn, id) {
  const [rows] = await conn.execute('SELECT id, hub_id, status FROM parking_slots WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function updateStatus(conn, id, status) {
  await conn.execute('UPDATE parking_slots SET status = ? WHERE id = ?', [status, id]);
}

// Slot được trả về FREE thì xe không còn đậu ở đó nữa.
async function detachVehicles(conn, slotId) {
  await conn.execute('UPDATE vehicles SET parking_slot_id = NULL WHERE parking_slot_id = ?', [slotId]);
}

module.exports = { findAll, findById, lockById, updateStatus, detachVehicles };
