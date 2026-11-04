/**
 * Module: Reservations, Pickup/Return & Parking Booking (Task 3.2b — Owner: Lục Khánh Phát)
 * Implements UC04 (Reserve vehicle), UC05 (Cancel), UC06 (Pickup), UC07 (Return), UC08 (Reserve parking).
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/my', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.*, h.name AS hubName, v.code AS vehicleCode, ps.slot_code AS parkingSlotCode
       FROM reservations r
       JOIN hubs h ON h.id = r.hub_id
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN parking_slots ps ON ps.id = r.parking_slot_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/vehicles', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { hubId, vehicleId, startTime, endTime } = req.body;
    await conn.beginTransaction();

    const [vehicles] = await conn.execute('SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [vehicleId]);
    if (!vehicles.length || vehicles[0].status !== 'AVAILABLE') {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        error: { code: 'VEHICLE_UNAVAILABLE', message: 'Selected vehicle is no longer AVAILABLE.' },
      });
    }

    const reservationCode = `RES-V-${Date.now()}`;
    await conn.execute('UPDATE vehicles SET status = "RESERVED" WHERE id = ?', [vehicleId]);
    const [result] = await conn.execute(
      `INSERT INTO reservations (reservation_code, user_id, reservation_type, hub_id, vehicle_id, start_time, end_time, status)
       VALUES (?, ?, 'VEHICLE', ?, ?, ?, ?, 'CONFIRMED')`,
      [reservationCode, req.user.id, hubId, vehicleId, startTime, endTime]
    );

    await conn.commit();
    return res.status(201).json({
      success: true,
      data: { id: result.insertId, reservationCode, status: 'CONFIRMED' },
    });
  } catch (err) {
    await conn.rollback();
    return next(err);
  } finally {
    conn.release();
  }
});

router.post('/parking', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { hubId, startTime, endTime } = req.body;
    await conn.beginTransaction();

    const [freeSlots] = await conn.execute(
      'SELECT * FROM parking_slots WHERE hub_id = ? AND status = "FREE" LIMIT 1 FOR UPDATE',
      [hubId]
    );
    if (!freeSlots.length) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        error: { code: 'NO_FREE_PARKING', message: 'No free parking slots available at this Hub.' },
      });
    }

    const slot = freeSlots[0];
    const reservationCode = `RES-P-${Date.now()}`;
    await conn.execute('UPDATE parking_slots SET status = "RESERVED" WHERE id = ?', [slot.id]);
    const [result] = await conn.execute(
      `INSERT INTO reservations (reservation_code, user_id, reservation_type, hub_id, parking_slot_id, start_time, end_time, status)
       VALUES (?, ?, 'PARKING', ?, ?, ?, ?, 'CONFIRMED')`,
      [reservationCode, req.user.id, hubId, slot.id, startTime, endTime]
    );

    await conn.commit();
    return res.status(201).json({
      success: true,
      data: { id: result.insertId, reservationCode, slotCode: slot.slot_code, status: 'CONFIRMED' },
    });
  } catch (err) {
    await conn.rollback();
    return next(err);
  } finally {
    conn.release();
  }
});

router.patch('/:reservationId/cancel', async (req, res, next) => {
  try {
    // Task 3.2b: release RESERVED vehicle/parking_slot inside a transaction
    await pool.execute('UPDATE reservations SET status = "CANCELLED" WHERE id = ? AND user_id = ?', [
      req.params.reservationId,
      req.user.id,
    ]);
    res.json({ success: true, data: { id: Number(req.params.reservationId), status: 'CANCELLED' } });
  } catch (err) {
    next(err);
  }
});

router.post('/:reservationId/pickup', async (req, res, next) => {
  try {
    // Task 3.2b (UC06): Transition Reservation CONFIRMED -> ACTIVE, Vehicle RESERVED -> IN_USE, free ParkingSlot
    res.json({ success: true, data: { id: Number(req.params.reservationId), status: 'ACTIVE', message: 'Pickup skeleton ready for Task 3.2b' } });
  } catch (err) {
    next(err);
  }
});

router.post('/:reservationId/return', async (req, res, next) => {
  try {
    // Task 3.2b (UC07): Validate free parking slot at returnHubId, transition Vehicle IN_USE -> AVAILABLE/CHARGING
    res.json({ success: true, data: { id: Number(req.params.reservationId), status: 'COMPLETED', message: 'Return skeleton ready for Task 3.2b' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
