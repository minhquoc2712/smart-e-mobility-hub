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
  return (
    row && {
      ...row,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      freeParkingSlots: Number(row.freeParkingSlots ?? 0),
      availableChargingPoints: Number(row.availableChargingPoints ?? 0),
      availableBikes: Number(row.availableBikes ?? 0),
      availableScooters: Number(row.availableScooters ?? 0),
    }
  );
}

async function findAll({ search = '', vehicleType = '' } = {}) {
  const conditions = [];
  const params = [];

  if (search) {
    const like = `%${search}%`;
    conditions.push(
      `(h.name LIKE ? OR h.campus_zone LIKE ? OR h.address LIKE ? OR h.code LIKE ?
        OR EXISTS (SELECT 1 FROM vehicles v WHERE v.current_hub_id = h.id AND (v.code LIKE ? OR v.model LIKE ?)))`
    );
    params.push(like, like, like, like, like, like);
  }

  if (vehicleType === 'ELECTRIC_BIKE' || vehicleType === 'ELECTRIC_SCOOTER') {
    conditions.push(
      `EXISTS (SELECT 1 FROM vehicles v WHERE v.current_hub_id = h.id AND v.type = ? AND v.status = 'AVAILABLE')`
    );
    params.push(vehicleType);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(`${HUB_SELECT} ${where} ORDER BY h.id ASC`, params);
  return rows.map(toHub);
}

async function findSuggestions(query = '') {
  const q = String(query || '').trim();
  if (!q) return [];
  const like = `%${q}%`;

  const [hubRows] = await pool.execute(
    `${HUB_SELECT}
     WHERE h.name LIKE ? OR h.campus_zone LIKE ? OR h.address LIKE ? OR h.code LIKE ?
     ORDER BY h.id ASC`,
    [like, like, like, like]
  );
  const hubs = hubRows.map(toHub);

  const [vehicles] = await pool.execute(
    `SELECT v.id, v.code, v.type, v.model, v.battery_level AS batteryLevel,
            v.current_hub_id AS hubId, h.name AS hubName
     FROM vehicles v
     JOIN hubs h ON h.id = v.current_hub_id
     WHERE v.status = 'AVAILABLE'
       AND (v.code LIKE ? OR v.model LIKE ?)
     ORDER BY v.battery_level DESC
     LIMIT 6`,
    [like, like]
  );

  const items = [];

  hubs.forEach((h) => {
    items.push({
      kind: 'HUB',
      id: `hub-${h.id}`,
      hubId: h.id,
      title: h.name,
      subtitle: `${h.campusZone} · ${h.address}`,
      status: h.status,
      meta: `🚲 ${h.availableBikes} · 🛴 ${h.availableScooters} · 🅿️ ${h.freeParkingSlots} free`,
      searchValue: h.name,
    });
  });

  vehicles.forEach((v) => {
    items.push({
      kind: 'VEHICLE',
      id: `veh-${v.id}`,
      hubId: v.hubId,
      vehicleId: v.id,
      vehicleCode: v.code,
      vehicleType: v.type,
      title: `${v.code} (${v.model})`,
      subtitle: `Parked at ${v.hubName}`,
      status: 'AVAILABLE',
      meta: `🔋 ${v.batteryLevel}% battery`,
      searchValue: v.code,
    });
  });

  return items.slice(0, 8);
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

module.exports = { findAll, findSuggestions, findById, lockById, getStatus, getSlotUsage, updateStatus };
