/**
 * Module: Hubs, Parking Slots & Charging Points (Task 3.1 — Owner: Nguyễn Thùy Trang)
 * Implements UC01 (View Hubs & resources) and UC03 (View parking and charging).
 */
const express = require('express');
const { pool } = require('../../config/db');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const [hubs] = await pool.execute(`
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
      FROM hubs h
      ORDER BY h.id ASC
    `);
    res.json({ success: true, data: hubs });
  } catch (err) {
    next(err);
  }
});

router.get('/:hubId', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM hubs WHERE id = ?', [req.params.hubId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: { code: 'HUB_NOT_FOUND', message: 'Hub not found.' } });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.get('/:hubId/parking-slots', async (req, res, next) => {
  try {
    const [slots] = await pool.execute('SELECT * FROM parking_slots WHERE hub_id = ? ORDER BY slot_code', [req.params.hubId]);
    res.json({ success: true, data: slots });
  } catch (err) {
    next(err);
  }
});

router.get('/:hubId/charging-points', async (req, res, next) => {
  try {
    const [chargers] = await pool.execute('SELECT * FROM charging_points WHERE hub_id = ? ORDER BY charger_code', [req.params.hubId]);
    res.json({ success: true, data: chargers });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
