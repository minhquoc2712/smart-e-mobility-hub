const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const { withTransaction } = require('../../utils/transaction');
const AppError = require('../../utils/appError');
const { requiredId, windowOf, battery } = require('../reservations/reservations.validation');

const error = (status, code, message) => {
  throw new AppError(status, code, message);
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalIso(val) {
  if (!val) return val;
  if (val instanceof Date) {
    return `${val.getFullYear()}-${pad2(val.getMonth() + 1)}-${pad2(val.getDate())}T${pad2(
      val.getHours()
    )}:${pad2(val.getMinutes())}:${pad2(val.getSeconds())}`;
  }
  return String(val).replace(' ', 'T');
}

async function list(user) {
  const baseSelect = `
    SELECT cr.*,
           h.name AS hubName,
           v.code AS vehicleCode,
           cp.charger_code AS chargerCode
    FROM charging_requests cr
    LEFT JOIN hubs h ON h.id = cr.hub_id
    LEFT JOIN vehicles v ON v.id = cr.vehicle_id
    LEFT JOIN charging_points cp ON cp.id = cr.charging_point_id
  `;
  const [rows] =
    user.role === 'OPERATOR'
      ? await pool.execute(`${baseSelect} WHERE cr.status <> 'CANCELLED' ORDER BY cr.created_at ASC LIMIT 100`)
      : await pool.execute(
          `${baseSelect} WHERE cr.user_id = ? AND cr.status <> 'CANCELLED' ORDER BY cr.created_at DESC LIMIT 100`,
          [requiredId(user.id)]
        );
  return rows.map((r) => ({
    ...r,
    scheduled_start: toLocalIso(r.scheduled_start),
    scheduled_end: toLocalIso(r.scheduled_end),
    scheduledStart: toLocalIso(r.scheduled_start),
    scheduledEnd: toLocalIso(r.scheduled_end),
  }));
}

async function detail(user, id) {
  const [rows] = await pool.execute('SELECT * FROM charging_requests WHERE id = ?', [requiredId(id)]);
  if (!rows.length) error(404, 'CHARGING_REQUEST_NOT_FOUND', 'Request not found.');
  if (user.role !== 'OPERATOR' && rows[0].user_id !== requiredId(user.id)) {
    error(403, 'FORBIDDEN', 'Not your request.');
  }
  return rows[0];
}

/**
 * Charging Scheduling & Waitlist Priority (Task 3.2b & 4.1b — UC09 & UC15):
 *   1. Time-Slot Lock First: Any charger already booked (SCHEDULED / CHARGING) in overlapping
 *      [start, end) is LOCKED for the earlier user and CANNOT be preempted by a later user,
 *      regardless of battery %.
 *   2. Waitlist Priority Second: If all compatible chargers at the Hub are occupied/locked in
 *      [start, end), the new request enters status = 'QUEUED' (waitlist), ranked by
 *      Priority (Staff Manual Override > Auto Battery SoC > FIFO arrival time).
 */
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

    const plate = users[0].private_vehicle_plate || body.privateVehicleLabel || 'PV-018';
    if (!users[0].private_vehicle_plate) {
      await c.execute(
        'UPDATE users SET private_vehicle_plate = ?, private_vehicle_model = ? WHERE id = ?',
        [plate, 'Private electric bike', uid]
      );
    }

    const [hubs] = await c.execute('SELECT id, status FROM hubs WHERE id = ? FOR UPDATE', [hubId]);
    if (!hubs.length) error(404, 'HUB_NOT_FOUND', 'Hub not found.');
    if (hubs[0].status === 'MAINTENANCE') {
      error(409, 'HUB_IN_MAINTENANCE', 'Hub is currently under maintenance.');
    }

    // Lock all operational charging points at this Hub
    const [points] = await c.execute(
      `SELECT cp.* FROM charging_points cp
       WHERE cp.hub_id = ? AND cp.status <> 'OUT_OF_SERVICE'
       ORDER BY cp.id FOR UPDATE`,
      [hubId]
    );
    if (!points.length) {
      error(409, 'NO_CHARGING_POINT_AVAILABLE', 'No operational charging points at this Hub.');
    }

    // Find chargers already LOCKED by overlapping SCHEDULED / CHARGING bookings in [start, end)
    const [overlapping] = await c.execute(
      `SELECT charging_point_id
       FROM charging_requests
       WHERE hub_id = ?
         AND charging_point_id IS NOT NULL
         AND status IN ('SCHEDULED', 'CHARGING')
         AND scheduled_start < ?
         AND scheduled_end > ?
       FOR UPDATE`,
      [hubId, end, start]
    );
    const lockedPointIds = new Set(overlapping.map((r) => Number(r.charging_point_id)));

    const isImmediateWindow =
      new Date(start.replace(' ', 'T')).getTime() <= Date.now() + 2 * 3600 * 1000;

    const freePointsInWindow = points.filter(
      (p) => (!isImmediateWindow || p.status !== 'CHARGING') && !lockedPointIds.has(Number(p.id))
    );

    const requestedPointId = body.chargingPointId ? Number(body.chargingPointId) : null;
    if (requestedPointId && lockedPointIds.has(requestedPointId)) {
      error(
        409,
        'TIME_SLOT_BOOKED',
        'That time window is already booked on the selected charger. Please choose another hour or charger.'
      );
    }

    const assignedPoint =
      (requestedPointId && freePointsInWindow.find((p) => Number(p.id) === requestedPointId)) ||
      (!requestedPointId ? freePointsInWindow[0] : null) ||
      null;

    const autoPriority =
      current < 20 ? 'URGENT' : current < 50 ? 'HIGH' : current < 80 ? 'NORMAL' : 'LOW';
    const priority = body.priority || autoPriority;
    const requestCode = `CHG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    // Case A: A charger is free in [start, end) -> LOCK this interval (status = SCHEDULED)
    if (assignedPoint) {
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
          assignedPoint.id,
          current,
          target,
          priority,
          start,
          end,
        ]
      );

      if (isImmediateWindow && assignedPoint.status === 'AVAILABLE') {
        await c.execute(
          "UPDATE charging_points SET status = 'RESERVED', priority_level = ? WHERE id = ?",
          [priority, assignedPoint.id]
        );
      }

      return {
        id: result.insertId,
        requestCode,
        status: 'SCHEDULED',
        priority,
        chargingPointId: assignedPoint.id,
        chargerCode: assignedPoint.charger_code,
        slotCode: assignedPoint.charger_code,
      };
    }

    // Case B: All chargers at this Hub are already locked in [start, end) -> Enter Waitlist (QUEUED)
    const [[queueCountRow]] = await c.execute(
      `SELECT COUNT(*) AS cnt FROM charging_requests WHERE hub_id = ? AND status = 'QUEUED'`,
      [hubId]
    );
    const queuePos = Number(queueCountRow?.cnt || 0) + 1;

    const [result] = await c.execute(
      `INSERT INTO charging_requests
        (request_code, user_id, ownership_type, vehicle_id, private_vehicle_label, hub_id, charging_point_id,
         current_battery_level, target_battery_level, priority, queue_position, scheduled_start, scheduled_end, status)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'QUEUED')`,
      [
        requestCode,
        uid,
        ownershipType,
        body.vehicleId || null,
        body.privateVehicleLabel || plate,
        hubId,
        current,
        target,
        priority,
        queuePos,
        start,
        end,
      ]
    );

    return {
      id: result.insertId,
      requestCode,
      status: 'QUEUED',
      priority,
      queuePosition: queuePos,
      chargingPointId: null,
      chargerCode: 'Waitlist (Priority Queue)',
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
      const [otherActive] = await c.execute(
        `SELECT id FROM charging_requests
         WHERE charging_point_id = ? AND id <> ? AND status IN ('SCHEDULED', 'CHARGING') LIMIT 1`,
        [reqRow.charging_point_id, reqId]
      );
      if (!otherActive.length) {
        await c.execute(
          "UPDATE charging_points SET status = 'AVAILABLE' WHERE id = ? AND status = 'RESERVED'",
          [reqRow.charging_point_id]
        );
      }
    }
    return { id: reqId, status: 'CANCELLED' };
  });
}

module.exports = { list, detail, schedule, cancelRequest };
