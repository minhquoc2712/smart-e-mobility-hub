const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const { withTransaction } = require('../../utils/transaction');
const AppError = require('../../utils/appError');
const { requiredId, windowOf, battery } = require('../reservations/reservations.validation');

const error = (status, code, message) => {
  throw new AppError(status, code, message);
};

async function list(user) {
  const [rows] =
    user.role === 'OPERATOR'
      ? await pool.execute(
          `SELECT cr.*, h.name AS hubName, v.code AS vehicleCode
           FROM charging_requests cr
           LEFT JOIN hubs h ON h.id = cr.hub_id
           LEFT JOIN vehicles v ON v.id = cr.vehicle_id
           ORDER BY cr.created_at DESC LIMIT 100`
        )
      : await pool.execute(
          `SELECT cr.*, h.name AS hubName, v.code AS vehicleCode
           FROM charging_requests cr
           LEFT JOIN hubs h ON h.id = cr.hub_id
           LEFT JOIN vehicles v ON v.id = cr.vehicle_id
           WHERE cr.user_id = ?
           ORDER BY cr.created_at DESC LIMIT 100`,
          [requiredId(user.id)]
        );
  return rows;
}

async function detail(user, id) {
  const [rows] = await pool.execute('SELECT * FROM charging_requests WHERE id = ?', [requiredId(id)]);
  if (!rows.length) error(404, 'CHARGING_REQUEST_NOT_FOUND', 'Request not found.');
  if (user.role !== 'OPERATOR' && rows[0].user_id !== requiredId(user.id)) {
    error(403, 'FORBIDDEN', 'Not your request.');
  }
  return rows[0];
}

async function schedule(user, body) {
  const uid = requiredId(user.id);
  const hubId = requiredId(body.hubId, 'hubId');
  const ownershipType = body.ownershipType || 'PRIVATE';
  const current = battery(body.currentBatteryLevel ?? body.batteryAtRequest ?? 35);
  const target = battery(body.targetBatteryLevel ?? body.targetBattery ?? 85);
  if (target <= current) error(422, 'TARGET_BATTERY_INVALID', 'Target must exceed current battery.');
  const { start, end } = windowOf(
    body.scheduledStart ?? body.earliestStart,
    body.scheduledEnd ?? body.neededBy
  );

  return withTransaction(async (c) => {
    const [users] = await c.execute(
      'SELECT private_vehicle_plate, private_vehicle_model FROM users WHERE id = ? FOR UPDATE',
      [uid]
    );
    if (!users.length) error(404, 'USER_NOT_FOUND', 'User not found.');

    let plate = users[0].private_vehicle_plate || body.privateVehicleLabel || 'PV-018';
    if (!users[0].private_vehicle_plate) {
      await c.execute(
        'UPDATE users SET private_vehicle_plate = ?, private_vehicle_model = ? WHERE id = ?',
        [plate, 'Private electric bike', uid]
      );
    }

    const [hubs] = await c.execute('SELECT id, status FROM hubs WHERE id = ? FOR UPDATE', [hubId]);
    if (!hubs.length) error(404, 'HUB_NOT_FOUND', 'Hub not found.');
    if (['MAINTENANCE', 'FULL'].includes(hubs[0].status)) error(409, 'HUB_CLOSED', 'Hub unavailable.');

    const [points] = await c.execute(
      `SELECT cp.* FROM charging_points cp
       WHERE cp.hub_id = ? AND cp.status <> 'OUT_OF_SERVICE'
       ORDER BY cp.id FOR UPDATE`,
      [hubId]
    );
    const requestedPointId = body.chargingPointId ? Number(body.chargingPointId) : null;
    const point =
      (requestedPointId && points.find((p) => Number(p.id) === requestedPointId)) ||
      points.find((p) => p.status === 'AVAILABLE') ||
      points[0];

    if (!point) error(409, 'NO_CHARGING_POINT_AVAILABLE', 'No charging point available at this Hub.');

    const autoPriority =
      current < 20 ? 'URGENT' : current < 50 ? 'HIGH' : current < 80 ? 'NORMAL' : 'LOW';
    const priority = body.priority || autoPriority;

    const requestCode = `CHG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const [result] = await c.execute(
      `INSERT INTO charging_requests
        (request_code, user_id, ownership_type, vehicle_id, private_vehicle_label, hub_id, charging_point_id,
         current_battery_level, target_battery_level, priority, scheduled_start, scheduled_end, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED')`,
      [
        requestCode,
        uid,
        ownershipType,
        body.vehicleId || null,
        body.privateVehicleLabel || plate,
        hubId,
        point.id,
        current,
        target,
        priority,
        start,
        end,
      ]
    );

    if (point.status === 'AVAILABLE') {
      await c.execute("UPDATE charging_points SET status = 'RESERVED', priority_level = ? WHERE id = ?", [
        priority,
        point.id,
      ]);
    }

    return {
      id: result.insertId,
      requestCode,
      status: 'SCHEDULED',
      priority,
      chargingPointId: point.id,
    };
  });
}

async function cancelRequest(user, id) {
  const reqId = requiredId(id, 'requestId');
  return withTransaction(async (c) => {
    const [rows] = await c.execute('SELECT * FROM charging_requests WHERE id = ? FOR UPDATE', [reqId]);
    if (!rows.length) error(404, 'CHARGING_REQUEST_NOT_FOUND', 'Charging registration not found.');
    const reqRow = rows[0];
    if (user.role !== 'OPERATOR' && reqRow.user_id !== requiredId(user.id)) {
      error(403, 'FORBIDDEN', 'Not your charging request.');
    }
    await c.execute("UPDATE charging_requests SET status = 'CANCELLED' WHERE id = ?", [reqId]);
    if (reqRow.charging_point_id) {
      await c.execute(
        "UPDATE charging_points SET status = 'AVAILABLE' WHERE id = ? AND status = 'RESERVED'",
        [reqRow.charging_point_id]
      );
    }
    return { id: reqId, status: 'CANCELLED' };
  });
}

module.exports = { list, detail, schedule, cancelRequest };
