const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const { withTransaction } = require('../../utils/transaction');
const AppError = require('../../utils/appError');
const { MIN_BATTERY_TO_RESERVE } = require('../../config/businessRules');
const { assertTransition } = require('../state/stateMachine');
const hubsService = require('../hubs/hubs.service');
const { requiredId, windowOf, battery, optionalText } = require('./reservations.validation');

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

// VARCHAR(40) in database/schema.sql: RES-V-/RES-P- (6) + UUID without hyphens (32) = 38.
const code = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
const isOperator = (user) => user.role === 'OPERATOR';
const userId = (user) => requiredId(user.id, 'authenticated user id');

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

function mapReservationRow(row) {
  if (!row) return row;
  const rawNote = row.return_condition_note || '';
  let cancellationSource = null;
  if (row.status === 'CANCELLED') {
    if (rawNote.startsWith('REJECTED_BY_OPERATOR:')) cancellationSource = 'OPERATOR_REJECTED';
    else if (rawNote.startsWith('DECLINED_BY_STUDENT:')) cancellationSource = 'STUDENT_DECLINED';
    else cancellationSource = 'STUDENT_CANCELLED';
  }
  return {
    ...row,
    start_time: toLocalIso(row.start_time),
    end_time: toLocalIso(row.end_time),
    startTime: toLocalIso(row.start_time),
    endTime: toLocalIso(row.end_time),
    actualPickupTime: toLocalIso(row.actual_pickup_time),
    actualReturnTime: toLocalIso(row.actual_return_time),
    studentName: row.studentName || null,
    studentEmail: row.studentEmail || null,
    cancellationSource,
    statusNote: rawNote
      .replace(/^REJECTED_BY_OPERATOR:\s*/i, '')
      .replace(/^DECLINED_BY_STUDENT:\s*/i, '')
      .replace(/^CANCELLED_BY_STUDENT:\s*/i, '') || null,
    licensePlate:
      row.reservation_type === 'PARKING' && !rawNote.startsWith('REJECTED_BY_OPERATOR:') && !rawNote.startsWith('DECLINED_BY_STUDENT:') && !rawNote.startsWith('CANCELLED_BY_STUDENT:')
        ? rawNote || null
        : null,
  };
}

async function selectOne(c, sql, params = [], err = 'RESOURCE_NOT_FOUND') {
  const [rows] = await c.execute(sql, params);
  if (!rows.length) fail(404, err, 'Resource not found.');
  return rows[0];
}

async function authorizedReservation(c, id, user, lock = true) {
  const row = await selectOne(
    c,
    `SELECT * FROM reservations WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`,
    [requiredId(id, 'reservationId')],
    'RESERVATION_NOT_FOUND'
  );
  if (!isOperator(user) && row.user_id !== userId(user)) {
    fail(403, 'FORBIDDEN', 'This reservation belongs to another user.');
  }
  return row;
}

async function liveHub(c, id, { allowFull = false } = {}) {
  const hub = await selectOne(
    c,
    'SELECT * FROM hubs WHERE id = ? FOR UPDATE',
    [requiredId(id, 'hubId')],
    'HUB_NOT_FOUND'
  );
  if (hub.status === 'MAINTENANCE' || (!allowFull && hub.status === 'FULL')) {
    fail(409, 'HUB_CLOSED', 'Hub is full or under maintenance and cannot accept new parking.');
  }
  return hub;
}

async function detail(user, id) {
  const r = await authorizedReservation(pool, id, user, false);
  return {
    ...mapReservationRow(r),
    holdExpiresAt:
      r.reservation_type === 'VEHICLE' && ['PENDING', 'CONFIRMED'].includes(r.status)
        ? new Date(new Date(r.created_at).getTime() + 15 * 60000).toISOString()
        : null,
  };
}

async function list(user, query = {}) {
  const params = [];
  const conditions = [];
  if (!isOperator(user)) {
    conditions.push('r.user_id = ?');
    params.push(userId(user));
  }
  if (query.status) {
    conditions.push('r.status = ?');
    params.push(query.status);
  }
  if (query.hubId) {
    conditions.push('r.hub_id = ?');
    params.push(requiredId(query.hubId, 'hubId'));
  }
  const [rows] = await pool.execute(
    `SELECT r.*, h.name AS hubName, v.code AS vehicleCode, v.type AS vehicleType, v.battery_level AS batteryLevel,
            p.slot_code AS parkingSlotCode, u.full_name AS studentName, u.email AS studentEmail
     FROM reservations r
     JOIN hubs h ON h.id = r.hub_id
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN vehicles v ON v.id = r.vehicle_id
     LEFT JOIN parking_slots p ON p.id = r.parking_slot_id
     ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
     ORDER BY r.created_at DESC LIMIT 100`,
    params
  );
  return rows.map(mapReservationRow);
}

// The existing users row is the mutex for all rental creation by this account.
// A locking read sees the latest committed row even at MySQL REPEATABLE READ.
async function assertNoOpenRental(c, uid, excludeId = 0, pickup = false) {
  await selectOne(c, 'SELECT id FROM users WHERE id = ? FOR UPDATE', [uid], 'USER_NOT_FOUND');
  const [open] = await c.execute(
    `SELECT id FROM reservations WHERE user_id = ? AND reservation_type = 'VEHICLE'
      AND status IN (${pickup ? "'ACTIVE'" : "'PENDING', 'CONFIRMED', 'ACTIVE'"}) AND id <> ? LIMIT 1 FOR UPDATE`,
    [uid, excludeId]
  );
  if (open.length) fail(409, 'USER_HAS_ACTIVE_RENTAL', 'You already have a pending or active vehicle reservation. Cancel it or return the vehicle before booking another.');
}

async function reserveVehicle(user, body = {}) {
  const uid = userId(user);
  const vid = requiredId(body.vehicleId, 'vehicleId');
  const requestedHub = body.hubId == null ? null : requiredId(body.hubId, 'hubId');
  const startInput = body.startTime === undefined ? new Date().toISOString() : body.startTime;
  const endInput = body.endTime === undefined && body.startTime === undefined
    ? new Date(Date.now() + 2 * 3600000).toISOString() : body.endTime;
  const { start: startSql, end: endSql } = windowOf(startInput, endInput);
  return withTransaction(async (c) => {
    await assertNoOpenRental(c, uid);
    const v = await selectOne(
      c,
      'SELECT * FROM vehicles WHERE id = ? FOR UPDATE',
      [vid],
      'VEHICLE_NOT_FOUND'
    );
    if (v.model === 'Customer Private EV') {
      fail(409, 'VEHICLE_NOT_RENTABLE', 'Private customer vehicles cannot be rented.');
    }
    if (!['AVAILABLE', 'RESERVED'].includes(v.status)) {
      fail(409, 'VEHICLE_NOT_AVAILABLE', 'Vehicle is not available for reservation.');
    }
    if (v.battery_level < MIN_BATTERY_TO_RESERVE) {
      fail(409, 'BATTERY_TOO_LOW', 'Battery is too low.');
    }
    if (!v.current_hub_id) fail(409, 'VEHICLE_NOT_AT_HUB', 'Vehicle is not located at a Hub.');
    if (requestedHub !== null && requestedHub !== v.current_hub_id) fail(409, 'WRONG_PICKUP_HUB', 'Vehicle is at another hub.');
    await liveHub(c, v.current_hub_id, { allowFull: true });


    // Check time-window overlap on this vehicle across all users
    const [overlapping] = await c.execute(
      `SELECT id FROM reservations
       WHERE vehicle_id = ?
         AND reservation_type = 'VEHICLE'
         AND status IN ('PENDING', 'CONFIRMED', 'ACTIVE')
         AND start_time < ?
         AND end_time > ?
       LIMIT 1 FOR UPDATE`,
      [vid, endSql, startSql]
    );
    if (overlapping.length > 0) {
      fail(
        409,
        'VEHICLE_TIME_SLOT_BOOKED',
        'This vehicle is already booked in that time window. Please choose another available hour.'
      );
    }

    const isImmediateWindow = new Date(startSql.replace(' ', 'T')).getTime() <= Date.now() + 2 * 3600 * 1000;
    if (isImmediateWindow && v.status === 'AVAILABLE') {
      assertTransition('vehicle', v.status, 'RESERVED');
      await c.execute("UPDATE vehicles SET status = 'RESERVED' WHERE id = ?", [vid]);
    }
    const initialStatus = isOperator(user) ? 'CONFIRMED' : 'PENDING';
    const reservationCode = code('RES-V');
    const [result] = await c.execute(
      `INSERT INTO reservations (reservation_code, user_id, reservation_type, hub_id, vehicle_id, start_time, end_time, status)
       VALUES (?, ?, 'VEHICLE', ?, ?, ?, ?, ?)`,
      [reservationCode, uid, v.current_hub_id, vid, startSql, endSql, initialStatus]
    );
    return {
      id: result.insertId,
      reservationCode,
      status: initialStatus,
      holdExpiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      vehicleId: vid,
    };
  });
}

async function reserveParking(user, body) {
  const uid = userId(user);
  const hubId = requiredId(body.hubId, 'hubId');
  const { start, end } = windowOf(body.startTime, body.endTime);
  const plateNote = optionalText(body.licensePlate, 'licensePlate', 255);
  const requestedSlotId = body.parkingSlotId == null ? null : requiredId(body.parkingSlotId, 'parkingSlotId');

  return withTransaction(async (c) => {
    // Allow booking future/non-overlapping 7-day time windows even if Hub is currently FULL right now
    await liveHub(c, hubId, { allowFull: true });
    const isImmediateWindow =
      new Date(start.replace(' ', 'T')).getTime() <= Date.now() + 2 * 3600 * 1000;

    const [slots] = await c.execute(
      `SELECT s.* FROM parking_slots s
       WHERE s.hub_id = ?
         AND s.slot_type IN ('PRIVATE_EV', 'UNIVERSAL')
         AND s.status <> 'OUT_OF_SERVICE'
         AND NOT EXISTS (
           SELECT 1 FROM vehicles v WHERE v.parking_slot_id = s.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM reservations r
           WHERE r.parking_slot_id = s.id
             AND r.reservation_type = 'PARKING'
             AND r.status IN ('PENDING', 'CONFIRMED', 'ACTIVE')
             AND r.start_time < ?
             AND r.end_time > ?
         )
       ORDER BY s.id FOR UPDATE`,
      [hubId, end, start]
    );

    const slot = requestedSlotId
      ? slots.find((s) => Number(s.id) === requestedSlotId && (!isImmediateWindow || s.status !== 'OCCUPIED'))
      : slots.find((s) => !isImmediateWindow || s.status !== 'OCCUPIED');

    if (!slot) {
      fail(
        409,
        'HUB_PARKING_FULL',
        'That time window is already booked on all customer parking slots. Please choose another available hour.'
      );
    }

    const reservationCode = code('RES-P');
    if (isImmediateWindow && slot.status === 'FREE') {
      assertTransition('parkingSlot', slot.status, 'RESERVED');
      await c.execute("UPDATE parking_slots SET status = 'RESERVED' WHERE id = ?", [slot.id]);
    }

    const initialStatus = isOperator(user) ? 'CONFIRMED' : 'PENDING';
    const [result] = await c.execute(
      `INSERT INTO reservations
        (reservation_code, user_id, reservation_type, hub_id, parking_slot_id, start_time, end_time, status, return_condition_note)
       VALUES (?, ?, 'PARKING', ?, ?, ?, ?, ?, ?)`,
      [reservationCode, uid, hubId, slot.id, start, end, initialStatus, plateNote]
    );

    // Recompute Hub status (ACTIVE / NEAR_FULL / FULL) immediately in MySQL!
    const nextHubStatus = await hubsService.syncHubStatus(c, hubId);

    return {
      id: result.insertId,
      reservationCode,
      parkingSlotId: slot.id,
      slotCode: slot.slot_code,
      parkingSlotCode: slot.slot_code,
      licensePlate: plateNote,
      startTime: start.replace(' ', 'T'),
      endTime: end.replace(' ', 'T'),
      hubStatus: nextHubStatus,
      status: initialStatus,
    };
  });
}

async function releaseHeldResources(c, r) {
  if (r.reservation_type === 'VEHICLE' && r.vehicle_id) {
    const v = await selectOne(c, 'SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [r.vehicle_id]);
    const [others] = await c.execute(
      `SELECT id FROM reservations
       WHERE vehicle_id = ? AND id <> ? AND status IN ('PENDING', 'CONFIRMED')
         AND start_time <= DATE_ADD(NOW(), INTERVAL 2 HOUR) AND end_time > NOW()
       LIMIT 1 FOR UPDATE`,
      [v.id, r.id]
    );
    if (v.status === 'RESERVED' && !others.length) {
      assertTransition('vehicle', v.status, 'AVAILABLE');
      await c.execute("UPDATE vehicles SET status = 'AVAILABLE' WHERE id = ?", [v.id]);
    }
  }

  if (r.reservation_type === 'PARKING' && r.parking_slot_id) {
    const [others] = await c.execute(
      `SELECT id FROM reservations
       WHERE parking_slot_id = ? AND id <> ? AND status IN ('PENDING', 'CONFIRMED', 'ACTIVE') LIMIT 1`,
      [r.parking_slot_id, r.id]
    );
    const slot = await selectOne(c, 'SELECT * FROM parking_slots WHERE id = ? FOR UPDATE', [
      r.parking_slot_id,
    ]);
    if (!others.length && slot.status === 'RESERVED') {
      await c.execute("UPDATE parking_slots SET status = 'FREE' WHERE id = ?", [slot.id]);
    }
    await hubsService.syncHubStatus(c, r.hub_id);
  }
}

async function approve(user, id) {
  if (!isOperator(user)) {
    fail(403, 'FORBIDDEN', 'Only hub operators can approve reservations.');
  }
  return withTransaction(async (c) => {
    const r = await authorizedReservation(c, id, user);
    if (r.status !== 'PENDING') {
      fail(409, 'INVALID_STATE_TRANSITION', 'Only pending reservations can be approved.');
    }
    await c.execute("UPDATE reservations SET status = 'CONFIRMED' WHERE id = ?", [r.id]);
    return { id: r.id, status: 'CONFIRMED' };
  });
}

async function reject(user, id, body = {}) {
  if (!isOperator(user)) {
    fail(403, 'FORBIDDEN', 'Only hub operators can reject reservations.');
  }
  const reason = optionalText(body?.reason, 'reason', 180) || 'Declined by hub operator';
  return withTransaction(async (c) => {
    const r = await authorizedReservation(c, id, user);
    if (!['PENDING', 'CONFIRMED'].includes(r.status)) {
      fail(409, 'INVALID_STATE_TRANSITION', 'Only pending or confirmed reservations can be rejected.');
    }
    await c.execute(
      "UPDATE reservations SET status = 'CANCELLED', return_condition_note = ? WHERE id = ?",
      [`REJECTED_BY_OPERATOR: ${reason}`, r.id]
    );
    await releaseHeldResources(c, r);
    return { id: r.id, status: 'CANCELLED', cancellationSource: 'OPERATOR_REJECTED', reason };
  });
}

async function cancel(user, id, body = {}) {
  return withTransaction(async (c) => {
    const r = await authorizedReservation(c, id, user);
    if (!['PENDING', 'CONFIRMED'].includes(r.status)) {
      fail(409, 'INVALID_STATE_TRANSITION', 'Only pending or confirmed reservations can be cancelled.');
    }
    const wasApproved = r.status === 'CONFIRMED';
    const customReason = optionalText(body?.reason, 'reason', 180);
    const note = isOperator(user)
      ? `REJECTED_BY_OPERATOR: ${customReason || 'Cancelled by operator'}`
      : wasApproved
      ? `DECLINED_BY_STUDENT: ${customReason || 'Declined pickup after approval'}`
      : `CANCELLED_BY_STUDENT: ${customReason || 'Cancelled while pending approval'}`;

    await c.execute(
      "UPDATE reservations SET status = 'CANCELLED', return_condition_note = ? WHERE id = ?",
      [note, r.id]
    );
    await releaseHeldResources(c, r);

    return {
      id: r.id,
      status: 'CANCELLED',
      cancellationSource: isOperator(user)
        ? 'OPERATOR_REJECTED'
        : wasApproved
        ? 'STUDENT_DECLINED'
        : 'STUDENT_CANCELLED',
    };
  });
}

async function pickup(user, id, body = {}) {
  return withTransaction(async (c) => {
    // Lock the owner before the reservation (same order as reserveVehicle).
    const ownerId = isOperator(user) ? (await authorizedReservation(c, id, user, false)).user_id : userId(user);
    await selectOne(c, 'SELECT id FROM users WHERE id = ? FOR UPDATE', [ownerId], 'USER_NOT_FOUND');
    const r = await authorizedReservation(c, id, user);
    await assertNoOpenRental(c, ownerId, r.id, true);
    if (r.reservation_type === 'VEHICLE' && r.status === 'PENDING') {
      fail(409, 'AWAITING_OPERATOR_APPROVAL', 'Reservation is awaiting operator approval before QR unlock.');
    }
    if (r.reservation_type !== 'VEHICLE' || r.status !== 'CONFIRMED') {
      fail(409, 'INVALID_STATE_TRANSITION', 'Reservation is not ready for pickup.');
    }
    if (Date.now() > new Date(r.end_time).getTime() + 15 * 60000) {
      fail(409, 'RESERVATION_EXPIRED', 'Booking window has passed.');
    }
    const v = await selectOne(c, 'SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [r.vehicle_id]);
    if (body.hubId != null && requiredId(body.hubId, 'hubId') !== v.current_hub_id) {
      fail(422, 'WRONG_PICKUP_HUB', 'Vehicle is at another hub.');
    }
    if (v.battery_level < MIN_BATTERY_TO_RESERVE) fail(409, 'BATTERY_TOO_LOW', 'Battery is too low for pickup.');
    if (v.current_hub_id !== r.hub_id) {
      fail(409, 'WRONG_PICKUP_HUB', 'Vehicle moved from reservation hub.');
    }
    const [conflicts] = await c.execute(`SELECT id FROM reservations WHERE vehicle_id = ? AND id <> ?
      AND reservation_type = 'VEHICLE' AND (status = 'ACTIVE' OR (status = 'CONFIRMED' AND start_time < ? AND end_time > NOW())) LIMIT 1 FOR UPDATE`, [v.id, r.id, r.end_time]);
    if (conflicts.length) fail(409, 'VEHICLE_TIME_SLOT_BOOKED', 'Another booking conflicts with this pickup.');
    if (v.status === 'AVAILABLE') {
      assertTransition('vehicle', 'AVAILABLE', 'RESERVED');
      v.status = 'RESERVED';
    }
    assertTransition('vehicle', v.status, 'IN_USE');
    if (v.parking_slot_id) {
      const slot = await selectOne(c, 'SELECT * FROM parking_slots WHERE id = ? FOR UPDATE', [
        v.parking_slot_id,
      ]);
      if (slot.status === 'OCCUPIED') {
        assertTransition('parkingSlot', slot.status, 'FREE');
        await c.execute("UPDATE parking_slots SET status = 'FREE' WHERE id = ?", [slot.id]);
      }
    }
    await c.execute(
      "UPDATE vehicles SET status = 'IN_USE', current_hub_id = NULL, parking_slot_id = NULL WHERE id = ?",
      [v.id]
    );
    await c.execute(
      "UPDATE reservations SET status = 'ACTIVE', actual_pickup_time = NOW() WHERE id = ?",
      [r.id]
    );
    await hubsService.syncHubStatus(c, r.hub_id);
    return { id: r.id, vehicleId: v.id, status: 'ACTIVE' };
  });
}

async function returnVehicle(user, id, body = {}) {
  const hubId = requiredId(body.hubId ?? body.returnHubId, 'hubId');
  return withTransaction(async (c) => {
    const r = await authorizedReservation(c, id, user);
    if (r.reservation_type !== 'VEHICLE' || r.status !== 'ACTIVE') {
      fail(409, 'INVALID_STATE_TRANSITION', 'No active rental for this reservation.');
    }
    await liveHub(c, hubId);
    const v = await selectOne(c, 'SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [r.vehicle_id]);
    assertTransition('vehicle', v.status, 'AVAILABLE');
    const [slots] = await c.execute(
      `SELECT * FROM parking_slots
       WHERE hub_id = ? AND slot_type IN ('SHARED_EV', 'UNIVERSAL') AND status = 'FREE'
         AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.parking_slot_id = parking_slots.id)
         AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.parking_slot_id = parking_slots.id
           AND r.status IN ('PENDING', 'CONFIRMED', 'ACTIVE') AND r.end_time > NOW() AND r.start_time <= NOW())
       ORDER BY id FOR UPDATE`,
      [hubId]
    );
    if (!slots.length) fail(409, 'HUB_PARKING_FULL', 'No free rental-vehicle parking slot.');
    const slot = slots[0];
    const suppliedLevel = body.batteryLevel !== undefined ? body.batteryLevel : body.remainingBattery;
    const level = suppliedLevel === undefined ? v.battery_level : battery(suppliedLevel);
    assertTransition('parkingSlot', slot.status, 'OCCUPIED');
    await c.execute("UPDATE parking_slots SET status = 'OCCUPIED' WHERE id = ?", [slot.id]);
    await c.execute(
      "UPDATE vehicles SET status = 'AVAILABLE', current_hub_id = ?, parking_slot_id = ?, battery_level = ? WHERE id = ?",
      [hubId, slot.id, level, v.id]
    );
    await c.execute(
      "UPDATE reservations SET status = 'COMPLETED', actual_return_time = NOW(), return_hub_id = ?, return_condition_note = ? WHERE id = ?",
      [
        hubId,
        optionalText(body.returnConditionNote ?? body.conditionNote, 'conditionNote', 255) ||
          (level < MIN_BATTERY_TO_RESERVE ? 'LOW_BATTERY_REQUIRES_CHARGING' : null),
        r.id,
      ]
    );
    await hubsService.syncHubStatus(c, hubId);
    return {
      id: r.id,
      status: 'COMPLETED',
      returnHubId: hubId,
      parkingSlotId: slot.id,
      batteryLevel: level,
      needsCharging: level < MIN_BATTERY_TO_RESERVE,
    };
  });
}

async function parkingCheckIn(user, id) {
  return withTransaction(async (c) => {
    const r = await authorizedReservation(c, id, user);
    if (r.reservation_type !== 'PARKING' || r.status !== 'CONFIRMED') {
      fail(409, 'INVALID_STATE_TRANSITION', 'Reservation cannot be checked in.');
    }
    const [windowRows] = await c.execute(
      'SELECT TIMESTAMPDIFF(SECOND, NOW(), start_time) AS seconds_until_start FROM reservations WHERE id = ?',
      [r.id]
    );
    const secondsUntilStart = Number(windowRows[0].seconds_until_start);
    if (!Number.isFinite(secondsUntilStart) || Math.abs(secondsUntilStart) > 15 * 60) {
      fail(409, 'CHECK_IN_WINDOW_CLOSED', 'Check-in allowed within 15 minutes of start.');
    }
    const s = await selectOne(c, 'SELECT * FROM parking_slots WHERE id = ? FOR UPDATE', [
      r.parking_slot_id,
    ]);
    if (!['FREE', 'RESERVED'].includes(s.status)) {
      fail(409, 'SLOT_UNAVAILABLE', 'Slot is occupied.');
    }
    assertTransition('parkingSlot', s.status, 'OCCUPIED');
    await c.execute("UPDATE parking_slots SET status = 'OCCUPIED' WHERE id = ?", [s.id]);
    await c.execute(
      "UPDATE reservations SET status = 'ACTIVE', actual_pickup_time = NOW() WHERE id = ?",
      [r.id]
    );
    await hubsService.syncHubStatus(c, r.hub_id);
    return { id: r.id, status: 'ACTIVE', parkingSlotId: s.id };
  });
}

async function parkingCheckOut(user, id) {
  return withTransaction(async (c) => {
    const r = await authorizedReservation(c, id, user);
    if (r.reservation_type !== 'PARKING' || r.status !== 'ACTIVE') {
      fail(409, 'INVALID_STATE_TRANSITION', 'Parking booking is not checked in.');
    }
    const [charging] = await c.execute(
      `SELECT id FROM charging_requests WHERE user_id = ? AND hub_id = ? AND status = 'CHARGING' LIMIT 1`,
      [r.user_id, r.hub_id]
    );
    if (charging.length) {
      fail(409, 'CHARGING_IN_PROGRESS', 'Stop charging before parking checkout.');
    }
    const s = await selectOne(c, 'SELECT * FROM parking_slots WHERE id = ? FOR UPDATE', [
      r.parking_slot_id,
    ]);
    assertTransition('parkingSlot', s.status, 'FREE');
    await c.execute("UPDATE parking_slots SET status = 'FREE' WHERE id = ?", [s.id]);
    await c.execute(
      "UPDATE reservations SET status = 'COMPLETED', actual_return_time = NOW() WHERE id = ?",
      [r.id]
    );
    await hubsService.syncHubStatus(c, r.hub_id);
    return { id: r.id, status: 'COMPLETED' };
  });
}

async function expireVehicleHolds() {
  const [rows] = await pool.execute(
    `SELECT id, user_id FROM reservations
     WHERE reservation_type = 'VEHICLE' AND status IN ('PENDING', 'CONFIRMED')
       AND end_time < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
     ORDER BY id LIMIT 100`
  );
  let expired = 0;
  for (const row of rows) {
    try {
      await withTransaction(async (c) => {
        const r = await authorizedReservation(c, row.id, { id: row.user_id, role: 'USER' });
        if (!['PENDING', 'CONFIRMED'].includes(r.status) || Date.now() < new Date(r.end_time).getTime() + 15 * 60000) {
          return;
        }
        const v = await selectOne(c, 'SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [
          r.vehicle_id,
        ]);
        const [others] = await c.execute(`SELECT id FROM reservations WHERE vehicle_id = ? AND id <> ? AND status IN ('PENDING', 'CONFIRMED') AND start_time <= DATE_ADD(NOW(), INTERVAL 2 HOUR) AND end_time > NOW() LIMIT 1 FOR UPDATE`, [v.id, r.id]);
        if (v.status === 'RESERVED' && !others.length) {
          await c.execute("UPDATE vehicles SET status = 'AVAILABLE' WHERE id = ?", [v.id]);
        }
        await c.execute("UPDATE reservations SET status = 'EXPIRED' WHERE id = ?", [r.id]);
        expired++;
      });
    } catch (err) {
      console.error('[Reservation expiry]', row.id, err.message);
    }
  }
  return expired;
}

module.exports = {
  detail,
  list,
  reserveVehicle,
  reserveParking,
  approve,
  reject,
  cancel,
  pickup,
  returnVehicle,
  parkingCheckIn,
  parkingCheckOut,
  expireVehicleHolds,
};