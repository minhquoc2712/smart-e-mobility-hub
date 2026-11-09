/**
 * Module: Operator Monitoring, Incidents, Redistribution & Telemetry
 * Covers Task 3.3b (Trần Tiến Phát), Task 4.1b (Dispatch), and Task 3.1b (Nils - A3 Telemetry).
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');

const router = express.Router();

// UC10: Operator Network Overview Dashboard
/*Return data trông như này nha anh: (mỗi một phần tử trong data ứng với một trang: Overview, Hub Utilization, Manage Parking, Vehicle Charging)
{
  "success": true,
  "data": {
    "overview": {},
    "hubUtilization": {},
    "manageParking": {},
    "vehicleCharging": {}
  }
} */
function buildOperatorDashboardBundle({
  rawDashboard = null,
  hubs = [],
  vehicles = [],
  parkingSlots = [],
  chargingPoints = [],
  openIncidents = 0,
}) {
  if (
    rawDashboard &&
    rawDashboard.overview &&
    rawDashboard.hubUtilization &&
    rawDashboard.manageParking &&
    rawDashboard.vehicleCharging
  ) {
    return {
      overview: rawDashboard.overview,
      hubUtilization: rawDashboard.hubUtilization,
      manageParking: rawDashboard.manageParking,
      vehicleCharging: rawDashboard.vehicleCharging,
      openIncidents: Number(rawDashboard.openIncidents ?? openIncidents ?? 0),
    };
  }
}

router.get('/operator/dashboard', authenticateToken, requireRole('OPERATOR'), async (_req, res, next) => {
  try {
    // 1. Fetch data from database
    const [
      [hubs],
      [vehicles],
      [parkingSlots],
      [chargingPoints],
      [incidents],
    ] = await Promise.all([
      pool.execute('SELECT * FROM hubs ORDER BY id ASC'),
      pool.execute('SELECT * FROM vehicles ORDER BY id ASC'),
      pool.execute('SELECT * FROM parking_slots ORDER BY id ASC'),
      pool.execute('SELECT * FROM charging_points ORDER BY id ASC'),
      pool.execute('SELECT status FROM incidents'),
    ]);

    // 2. Count open incidents
    // Keep the same condition as the mock API
    const openIncidents = incidents.filter(
      (i) => i.status !== 'CLOSED'
    ).length;

    // 3. Build the same dashboard bundle as the mock API
    const bundle = buildOperatorDashboardBundle({
      hubs,
      vehicles,
      parkingSlots,
      chargingPoints,
      openIncidents,
    });

    // 4. Calculate vehicle statistics
    const data = {
      totalVehicles: vehicles.length,

      availableVehicles: vehicles.filter(
        (v) => v.status === 'AVAILABLE'
      ).length,

      inUseVehicles: vehicles.filter(
        (v) => v.status === 'IN_USE'
      ).length,

      chargingVehicles: vehicles.filter(
        (v) => v.status === 'CHARGING'
      ).length,

      outOfServiceVehicles: vehicles.filter(
        (v) => v.status === 'OUT_OF_SERVICE'
      ).length,

      hubs,

      ...bundle,
    };

    // 5. Return dashboard data
    res.json({
      success: true,
      data,
    });

  } catch (err) {
    next(err);
  }
}
);
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
    const { hubId, targetType, vehicleId = null, chargingPointId = null, parkingSlotId = null, severity = 'MEDIUM', title, description } = req.body;
    const incidentCode = `INC-${Date.now()}`;
    const [result] = await pool.execute(
      `INSERT INTO incidents (incident_code, reported_by, hub_id, target_type, vehicle_id, charging_point_id, parking_slot_id, severity, title, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [incidentCode, req.user.id, hubId, targetType, vehicleId, chargingPointId, parkingSlotId, severity, title, description]
    );
    if (targetType === 'VEHICLE' && vehicleId) {
      await pool.execute('UPDATE vehicles SET status = "OUT_OF_SERVICE" WHERE id = ?', [vehicleId]);
    }
    if (targetType === 'CHARGING_POINT' && chargingPointId) {
      await pool.execute('UPDATE charging_points SET status = "OUT_OF_SERVICE" WHERE id = ?', [chargingPointId]);
    }
    if (targetType === "PARKING_SLOT" && parkingSlotId) {
      await pool.execute('UPDATE parking_slots SET status = "OUT_OF_SERVICE" WHERE id = ?', [parkingSlotId]);
    }
    if (targetType === "HUB") {
      await pool.execute('UPDATE hubs SET status = "MAINTENANCE" WHERE id = ?', [hubId]);
    }
    res.status(201).json({ success: true, data: { id: result.insertId, incidentCode, status: 'OPEN' } });
  } catch (err) {
    next(err);
  }
});

router.patch('/incidents/:incidentId/close', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const incidentId = Number(req.params.incidentId);
    const {
      resolutionNotes = 'Repaired and verified.'
    } = req.body;
    if (!Number.isInteger(incidentId) || incidentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid incident ID.'
      });
    }
    await connection.beginTransaction();

    // 1. Find and lock the incident
    const [rows] = await connection.execute(
      `SELECT *
                 FROM incidents
                 WHERE id = ?
                 FOR UPDATE`,
      [incidentId]
    );

    if (rows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: 'Incident not found.'
      });
    }

    const incident = rows[0];

    if (incident.status === 'CLOSED') {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: 'Incident is already closed.'
      });
    }

    // 2. Restore the affected object's status
    if (incident.target_type === 'VEHICLE') {

      if (!incident.vehicle_id) {
        return res.status(404).json({
          success: false,
          message: 'No associated vehicle found.'
        });
      }

      await connection.execute(
        `UPDATE vehicles
                     SET status = 'AVAILABLE'
                     WHERE id = ?`,
        [incident.vehicle_id]
      );

    } else if (incident.target_type === 'CHARGING_POINT') {

      if (!incident.charging_point_id) {
        return res.status(404).json({
          success: false,
          message: 'No associated charging point found.'
        });
      }

      await connection.execute(
        `UPDATE charging_points
                     SET status = 'AVAILABLE'
                     WHERE id = ?`,
        [incident.charging_point_id]
      );

    } else if (incident.target_type === 'PARKING_SLOT') {
      if (!incident.parking_slot_id) {
        return res.status(404).json({
          success: false,
          message: 'No associated parking slot found.'
        });
      }

      await connection.execute(
        `UPDATE parking_slots
                     SET status = 'FREE'
                     WHERE id = ?`,
        [incident.parking_slot_id]
      );

    }

    // 3. Close the incident
    await connection.execute(
      `UPDATE incidents
                 SET status = 'CLOSED',
                     resolution_notes = ?,
                     closed_at = NOW()
                 WHERE id = ?`,
      [resolutionNotes, incidentId]
    );

    // 4. Commit all changes
    await connection.commit();

    res.json({
      success: true,
      data: {
        id: incidentId,
        targetType: incident.target_type,
        status: 'CLOSED',
        resolutionNotes
      }
    });

  } catch (err) {
    await connection.rollback();
    next(err);

  } finally {
    connection.release();
  }
}
);

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
