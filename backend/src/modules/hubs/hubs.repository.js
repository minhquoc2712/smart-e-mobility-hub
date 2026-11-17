const { pool } = require('../../config/db');

const HUB_SELECT = `
  SELECT
    h.id, h.code, h.name, h.campus_zone AS campusZone, h.address,
    h.latitude, h.longitude,
    h.total_parking_slots AS totalParkingSlots,
    h.total_charging_points AS totalChargingPoints,
    h.status,
    -- Future reservations should not consume CURRENT availability.
    (SELECT COUNT(*) FROM parking_slots ps WHERE ps.hub_id = h.id
       AND (ps.status = 'FREE' OR (ps.status = 'RESERVED' AND EXISTS (
         SELECT 1 FROM reservations r_future WHERE r_future.parking_slot_id=ps.id
           AND r_future.reservation_type='PARKING' AND r_future.status='CONFIRMED'
           AND r_future.start_time > UTC_TIMESTAMP())))
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.parking_slot_id=ps.id
         AND r.reservation_type='PARKING' AND r.status IN ('CONFIRMED','ACTIVE')
         AND r.start_time <= UTC_TIMESTAMP() AND r.end_time > UTC_TIMESTAMP())) AS freeParkingSlots,
    (SELECT COUNT(*) FROM charging_points cp WHERE cp.hub_id = h.id
       AND (cp.status = 'AVAILABLE' OR (cp.status = 'RESERVED' AND EXISTS (
         SELECT 1 FROM charging_requests f WHERE f.charging_point_id=cp.id
          AND f.status='SCHEDULED' AND f.scheduled_start > UTC_TIMESTAMP())))
       AND NOT EXISTS (SELECT 1 FROM charging_requests cr WHERE cr.charging_point_id=cp.id
         AND cr.status IN ('SCHEDULED','CHARGING') AND cr.scheduled_start <= UTC_TIMESTAMP()
         AND cr.scheduled_end > UTC_TIMESTAMP())) AS availableChargingPoints,
    (SELECT COUNT(*) FROM vehicles v WHERE v.current_hub_id = h.id AND v.type = 'ELECTRIC_BIKE' AND v.status = 'AVAILABLE') AS availableBikes,
    (SELECT COUNT(*) FROM vehicles v WHERE v.current_hub_id = h.id AND v.type = 'ELECTRIC_SCOOTER' AND v.status = 'AVAILABLE') AS availableScooters
  FROM hubs h`;

function toHub(row) {
  return row && { ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) };
}

async function findAll() {
  const [rows] = await pool.execute(`${HUB_SELECT} ORDER BY h.id ASC`);
  return rows.map(toHub);
}

async function findById(id) {
  const [rows] = await pool.execute(`${HUB_SELECT} WHERE h.id = ?`, [id]);
  return toHub(rows[0]) || null;
}


async function lockById(conn, id) {
  const [rows] = await conn.execute('SELECT id, status FROM hubs WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function getStatus(conn, id) {
  const [rows] = await conn.execute('SELECT id, status FROM hubs WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getSlotUsage(conn, id) {
  const [rows] = await conn.execute(
    `SELECT
       COALESCE(SUM(status <> 'OUT_OF_SERVICE'), 0) AS usable,
       COALESCE(SUM(status IN ('RESERVED', 'OCCUPIED')), 0) AS used
     FROM parking_slots WHERE hub_id = ?`,
    [id]
  );
  return { usable: Number(rows[0].usable), used: Number(rows[0].used) };
}

async function updateStatus(conn, id, status) {
  await conn.execute('UPDATE hubs SET status = ? WHERE id = ?', [status, id]);
}

module.exports = { findAll, findById, lockById, getStatus, getSlotUsage, updateStatus };