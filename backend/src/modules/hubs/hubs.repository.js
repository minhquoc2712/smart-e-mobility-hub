const { pool } = require('../../config/db');

const HUB_SELECT = `
  SELECT
    h.id, h.code, h.name, h.campus_zone AS campusZone, h.address,
    h.latitude, h.longitude,
    h.total_parking_slots AS totalParkingSlots,
    h.total_charging_points AS totalChargingPoints,
    h.status,
    (SELECT COUNT(*) FROM parking_slots ps WHERE ps.hub_id = h.id AND ps.status = 'FREE') AS freeParkingSlots,
    (SELECT COUNT(*) FROM charging_points cp WHERE cp.hub_id = h.id AND cp.status = 'AVAILABLE') AS availableChargingPoints,
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

// Khóa dòng hub trong transaction (SELECT ... FOR UPDATE).
async function lockById(conn, id) {
  const [rows] = await conn.execute('SELECT id, status FROM hubs WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function getStatus(conn, id) {
  const [rows] = await conn.execute('SELECT id, status FROM hubs WHERE id = ?', [id]);
  return rows[0] || null;
}

// usable = slot chưa OUT_OF_SERVICE; used = slot đang RESERVED hoặc OCCUPIED.
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
