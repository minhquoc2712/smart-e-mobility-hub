/**
 * Module: Charging Requests & Smart Priority Scheduling (Task 3.2b & Task 4.1b)
 * Implements UC09 (Schedule charging) and UC15 (Set charging priority).
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const isOperator = req.user.role === 'OPERATOR';
    const sql = isOperator
      ? `SELECT cr.*, h.name AS hubName FROM charging_requests cr JOIN hubs h ON h.id = cr.hub_id ORDER BY cr.queue_position ASC`
      : `SELECT cr.*, h.name AS hubName FROM charging_requests cr JOIN hubs h ON h.id = cr.hub_id WHERE cr.user_id = ? ORDER BY cr.created_at DESC`;
    const [rows] = await pool.execute(sql, isOperator ? [] : [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      hubId,
      ownershipType = 'RENTAL',
      vehicleId = null,
      privateVehicleLabel = null,
      currentBatteryLevel = 30,
      targetBatteryLevel = 85,
      scheduledStart,
      scheduledEnd,
    } = req.body;

    const requestCode = `CHG-${Date.now()}`;
    const [result] = await pool.execute(
      `INSERT INTO charging_requests
        (request_code, user_id, ownership_type, vehicle_id, private_vehicle_label, hub_id,
         current_battery_level, target_battery_level, scheduled_start, scheduled_end, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED')`,
      [
        requestCode,
        req.user.id,
        ownershipType,
        vehicleId,
        privateVehicleLabel,
        hubId,
        currentBatteryLevel,
        targetBatteryLevel,
        scheduledStart,
        scheduledEnd,
      ]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, requestCode, status: 'SCHEDULED' } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:requestId/priority', requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { priority } = req.body;
    await pool.execute('UPDATE charging_requests SET priority = ? WHERE id = ?', [priority, req.params.requestId]);
    res.json({ success: true, data: { id: Number(req.params.requestId), priority } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
