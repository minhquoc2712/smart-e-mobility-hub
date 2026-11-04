/**
 * Module: Operator Monitoring, Incidents, Redistribution & Telemetry
 * Covers Task 3.3b (Trần Tiến Phát), Task 4.1b (Dispatch), and Task 3.1b (Nils - A3 Telemetry).
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');

const router = express.Router();

// UC10: Operator Network Overview Dashboard
router.get('/operator/dashboard', authenticateToken, requireRole('OPERATOR'), async (_req, res, next) => {
  try {
    const [[vehicleStats]] = await pool.execute(`
      SELECT
        COUNT(*) AS totalVehicles,
        SUM(status = 'AVAILABLE') AS availableVehicles,
        SUM(status = 'IN_USE') AS inUseVehicles,
        SUM(status = 'CHARGING') AS chargingVehicles,
        SUM(status = 'OUT_OF_SERVICE') AS outOfServiceVehicles
      FROM vehicles
    `);
    const [[incidentStats]] = await pool.execute(`
      SELECT COUNT(*) AS openIncidents FROM incidents WHERE status IN ('OPEN', 'IN_PROGRESS')
    `);
    res.json({
      success: true,
      data: {
        ...vehicleStats,
        openIncidents: incidentStats.openIncidents,
      },
    });
  } catch (err) {
    next(err);
  }
});

// UC11 & UC12: Operational Incidents
router.get('/incidents', authenticateToken, requireRole('OPERATOR'), async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT i.*, h.name AS hubName FROM incidents i JOIN hubs h ON h.id = i.hub_id ORDER BY i.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/incidents', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { hubId, targetType, vehicleId = null, chargingPointId = null, severity = 'MEDIUM', title, description } = req.body;
    const incidentCode = `INC-${Date.now()}`;
    const [result] = await pool.execute(
      `INSERT INTO incidents (incident_code, reported_by, hub_id, target_type, vehicle_id, charging_point_id, severity, title, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [incidentCode, req.user.id, hubId, targetType, vehicleId, chargingPointId, severity, title, description]
    );
    if (targetType === 'VEHICLE' && vehicleId) {
      await pool.execute('UPDATE vehicles SET status = "OUT_OF_SERVICE" WHERE id = ?', [vehicleId]);
    }
    if (targetType === 'CHARGING_POINT' && chargingPointId) {
      await pool.execute('UPDATE charging_points SET status = "OUT_OF_SERVICE" WHERE id = ?', [chargingPointId]);
    }
    res.status(201).json({ success: true, data: { id: result.insertId, incidentCode, status: 'OPEN' } });
  } catch (err) {
    next(err);
  }
});

router.patch('/incidents/:incidentId/close', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { resolutionNotes = 'Repaired and verified.' } = req.body;
    await pool.execute(
      `UPDATE incidents SET status = 'CLOSED', resolution_notes = ?, closed_at = NOW() WHERE id = ?`,
      [resolutionNotes, req.params.incidentId]
    );
    res.json({ success: true, data: { id: Number(req.params.incidentId), status: 'CLOSED' } });
  } catch (err) {
    next(err);
  }
});

// UC13: Redistribute Vehicles Between Hubs
router.post('/dispatch/redistribute', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { sourceHubId, destinationHubId, vehicleCount, reason = 'Manual balancing' } = req.body;
    const orderCode = `DSP-${Date.now()}`;
    const [result] = await pool.execute(
      `INSERT INTO dispatch_orders (order_code, operator_id, source_hub_id, destination_hub_id, vehicle_count, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [orderCode, req.user.id, sourceHubId, destinationHubId, vehicleCount, reason]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, orderCode, status: 'PENDING' } });
  } catch (err) {
    next(err);
  }
});

// UC14: A3 IoT Sensor / Data Simulator Telemetry Ingestion (Task 3.1b — Owner: Nils)
router.post('/telemetry/ingest', async (req, res, next) => {
  try {
    const { simulatorKey, vehicleUpdates = [] } = req.body;
    if (process.env.SIMULATOR_API_KEY && simulatorKey !== process.env.SIMULATOR_API_KEY) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_SIMULATOR_KEY', message: 'Invalid simulator key.' } });
    }
    for (const item of vehicleUpdates) {
      await pool.execute(
        'UPDATE vehicles SET battery_level = ?, last_telemetry_at = NOW() WHERE code = ?',
        [item.batteryLevel, item.vehicleCode]
      );
    }
    return res.json({ success: true, data: { updatedCount: vehicleUpdates.length } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
