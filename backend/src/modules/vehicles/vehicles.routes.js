/**
 * Module: Vehicles & Availability Check (Task 3.1 — Owner: Nguyễn Thùy Trang)
 * Implements UC02 (Search rental vehicles) and UC04a (Check availability).
 */
const express = require('express');
const { pool } = require('../../config/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { hubId, type, minBattery = 0, status } = req.query;
    const conditions = ['v.battery_level >= ?'];
    const params = [Number(minBattery)];

    if (hubId) {
      conditions.push('v.current_hub_id = ?');
      params.push(Number(hubId));
    }
    if (type) {
      conditions.push('v.type = ?');
      params.push(type);
    }
    if (status) {
      conditions.push('v.status = ?');
      params.push(status);
    }

    const [vehicles] = await pool.execute(
      `SELECT v.id, v.code, v.type, v.model, v.current_hub_id AS currentHubId,
              h.name AS currentHubName, v.battery_level AS batteryLevel,
              v.estimated_range_km AS estimatedRangeKm, v.status
       FROM vehicles v
       LEFT JOIN hubs h ON h.id = v.current_hub_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY v.battery_level DESC`,
      params
    );

    res.json({ success: true, data: vehicles });
  } catch (err) {
    next(err);
  }
});

router.get('/:vehicleId/availability', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, code, status, battery_level FROM vehicles WHERE id = ?', [
      req.params.vehicleId,
    ]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: { code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found.' } });
    }
    const vehicle = rows[0];
    const isAvailable = vehicle.status === 'AVAILABLE' && vehicle.battery_level >= 20;
    return res.json({
      success: true,
      data: {
        vehicleId: vehicle.id,
        available: isAvailable,
        reason: isAvailable ? null : `Vehicle status is ${vehicle.status} (battery ${vehicle.battery_level}%)`,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
