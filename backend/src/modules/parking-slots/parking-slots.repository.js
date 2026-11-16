const { pool } = require('../../config/db');

const SLOT_SELECT = `
  SELECT ps.id, ps.hub_id AS hubId, ps.slot_code AS slotCode, ps.slot_type AS slotType,
         ps.status, ps.updated_at AS updatedAt,
         v.id AS vehicleId, v.code AS vehiclePlate
  FROM parking_slots ps
  LEFT JOIN vehicles v ON v.parking_slot_id = ps.id`;

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
  const [rows] = await conn.execute('SELECT id, hub_id, slot_type, status FROM parking_slots WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function updateStatus(conn, id, status) {
  await conn.execute('UPDATE parking_slots SET status = ? WHERE id = ?', [status, id]);
}

// Slot được trả về FREE thì xe không còn đậu ở đó nữa.
async function detachVehicles(conn, slotId) {
  await conn.execute("DELETE FROM vehicles WHERE parking_slot_id = ? AND model = 'Customer Private EV'", [slotId]);
  await conn.execute('UPDATE vehicles SET parking_slot_id = NULL WHERE parking_slot_id = ?', [slotId]);
}

async function attachOrCreateVehicle(conn, { slotId, hubId, slotType, vehiclePlate, vehicleType }) {
  const code = String(vehiclePlate || '').trim();
  if (!code) return;

  // Gỡ xe cũ (nếu có) khỏi slot này trước
  await conn.execute('UPDATE vehicles SET parking_slot_id = NULL WHERE parking_slot_id = ? AND UPPER(code) <> UPPER(?)', [
    slotId,
    code,
  ]);

  const [existing] = await conn.execute(
    'SELECT id, parking_slot_id FROM vehicles WHERE UPPER(code) = UPPER(?) LIMIT 1 FOR UPDATE',
    [code]
  );

  if (existing.length > 0) {
    const veh = existing[0];
    if (veh.parking_slot_id && Number(veh.parking_slot_id) !== Number(slotId)) {
      await conn.execute("UPDATE parking_slots SET status = 'FREE' WHERE id = ?", [veh.parking_slot_id]);
    }
    await conn.execute(
      `UPDATE vehicles
       SET current_hub_id = ?,
           parking_slot_id = ?,
           status = CASE WHEN status IN ('IN_USE', 'RESERVED') THEN 'AVAILABLE' ELSE status END
       WHERE id = ?`,
      [hubId, slotId, veh.id]
    );
  } else {
    const resolvedType =
      vehicleType === 'ELECTRIC_SCOOTER' || code.toUpperCase().startsWith('ES-')
        ? 'ELECTRIC_SCOOTER'
        : 'ELECTRIC_BIKE';
    const resolvedModel =
      slotType === 'PRIVATE_EV'
        ? 'Customer Private EV'
        : resolvedType === 'ELECTRIC_SCOOTER'
        ? 'Smart E-Scooter S1'
        : 'Campus E-Bike Gen2';
    await conn.execute(
      `INSERT INTO vehicles (code, type, model, current_hub_id, parking_slot_id, battery_level, estimated_range_km, status)
       VALUES (?, ?, ?, ?, ?, 85, 42.0, 'AVAILABLE')`,
      [code, resolvedType, resolvedModel, hubId, slotId]
    );
  }
}

module.exports = { findAll, findById, lockById, updateStatus, detachVehicles, attachOrCreateVehicle };
