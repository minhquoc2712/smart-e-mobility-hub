/**
 * Module: Operator Monitoring, Incidents, Redistribution & Telemetry
 * Covers Task 3.3b (Trần Tiến Phát), Task 4.1b (Dispatch), and Task 3.1b (Nils - A3 Telemetry).
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');

const router = express.Router();

// UC10: Operator Network Overview Dashboard
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
    const { hubId, targetType, vehicleId = null, chargingPointId = null, parkingSlotId = null, severity = 'MEDIUM', title = null, description = null } = req.body;
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
        console.log("LỖI ở vehicle_id");
        return res.status(404).json({
          success: false,
          message: 'No associated vehicle found.'
        });
      }
      // Restore vehicle only if no other unresolved incidents related to this vehicle exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE vehicle_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.vehicle_id, incidentId]
      );
      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE vehicles
                     SET status = 'AVAILABLE'
                     WHERE id = ?`,
          [incident.vehicle_id]
        );
      }


    } else if (incident.target_type === 'CHARGING_POINT') {

      if (!incident.charging_point_id) {
        console.log("LỖI ở chargingpoint_ID");
        return res.status(404).json({
          success: false,
          message: 'No associated charging point found.'
        });
      }
      // Restore charging point only if no other unresolved incidents exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE charging_point_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.charging_point_id, incidentId]
      );


      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE charging_points
       SET status = 'AVAILABLE'
       WHERE id = ?`,
          [incident.charging_point_id]
        );
      }

    } else if (incident.target_type === 'PARKING_SLOT') {
      if (!incident.parking_slot_id) {
        console.log("LỖI ở parkingSlot_id");
        return res.status(404).json({
          success: false,
          message: 'No associated parking slot found.'
        });
      }
      // Restore parking_slot only if no other unresolved incidents related to this parking_slot exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE parking_slot_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.parking_slot_id, incidentId]
      );

      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE parking_slots
                     SET status = 'FREE'
                     WHERE id = ?`,
          [incident.parking_slot_id]
        );
      }

    } else if (incident.target_type === 'HUB') {
      if (!incident.hub_id) {
        console.log("LỖI ở hub_id");
        return res.status(404).json({
          success: false,
          message: 'No associated parking slot found.'
        });
      }
      // Restore hub only if no other unresolved incidents related to this hub exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE hub_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.hub_id, incidentId]
      );

      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE hubs
                     SET status = 'ACTIVE'
                     WHERE id = ?`,
          [incident.hub_id]
        );
      }
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
// router.post('/dispatch/redistribute', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
//   try {
//     const { sourceHubId, destinationHubId, vehicleCount, reason = 'Manual balancing' } = req.body;
//     const orderCode = `DSP-${Date.now()}`;
//     const [result] = await pool.execute(
//       `INSERT INTO dispatch_orders (order_code, operator_id, source_hub_id, destination_hub_id, vehicle_count, reason, status)
//        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
//       [orderCode, req.user.id, sourceHubId, destinationHubId, vehicleCount, reason]
//     );
//     res.status(201).json({ success: true, data: { id: result.insertId, orderCode, status: 'PENDING' } });
//   } catch (err) {
//     next(err);
//   }
// });

const buildPlaceholders = (count) => Array(count).fill('?').join(',');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

router.post('/dispatch/redistribute', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();

    const {
      sourceHubId,
      destinationHubId,
      vehicleCount,
      assignedStaff = 'S. Patel',
      allocations,
      reason = 'Manual balancing',
    } = req.body;

    const sourceId = Number(sourceHubId);
    const destinationId = Number(destinationHubId);

    if (
      !Number.isInteger(sourceId) ||
      sourceId <= 0 ||
      !Number.isInteger(destinationId) ||
      destinationId <= 0
    ) {
      throw createHttpError(400, 'Invalid sourceHubId or destinationHubId.');
    }

    await connection.beginTransaction();
    transactionStarted = true;

    // 1. Verify and lock source/destination hubs.
    const hubIds = [...new Set([sourceId, destinationId])];
    const [hubs] = await connection.execute(
      `SELECT id, name
         FROM hubs
         WHERE id IN (${buildPlaceholders(hubIds.length)})
         FOR UPDATE`,
      hubIds
    );

    const existingHubIds = new Set(hubs.map((hub) => Number(hub.id)));

    if (!existingHubIds.has(sourceId)) {
      throw createHttpError(404, 'Source hub not found.');
    }

    if (!existingHubIds.has(destinationId)) {
      throw createHttpError(404, 'Destination hub not found.');
    }

    const orderCode = `DSP-${Date.now()}`;
    const staff = assignedStaff || 'S. Patel';

    // =========================================================
    // MODE 1: Slot-to-slot arrangement
    // =========================================================
    if (Array.isArray(allocations) && allocations.length > 0) {
      // Validate allocation data.
      const normalizedAllocations = allocations.map((item) => {
        const vehicleId = Number(item.vehicleId);
        const toSlotId = Number(item.toSlotId);
        const fromSlotId =
          item.fromSlotId == null ? null : Number(item.fromSlotId);

        if (
          !Number.isInteger(vehicleId) ||
          vehicleId <= 0 ||
          !Number.isInteger(toSlotId) ||
          toSlotId <= 0 ||
          (fromSlotId !== null &&
            (!Number.isInteger(fromSlotId) || fromSlotId <= 0))
        ) {
          throw createHttpError(400, 'Invalid allocation data.');
        }

        return {
          ...item,
          vehicleId,
          fromSlotId,
          toSlotId,
        };
      });

      const vehicleIds = normalizedAllocations.map((a) => a.vehicleId);
      const targetSlotIds = normalizedAllocations.map((a) => a.toSlotId);

      if (new Set(vehicleIds).size !== vehicleIds.length) {
        throw createHttpError(400, 'Duplicate vehicle in allocations.');
      }

      if (new Set(targetSlotIds).size !== targetSlotIds.length) {
        throw createHttpError(400, 'A target slot can only be allocated once.');
      }

      // 2. Lock all requested vehicles.
      const [vehicles] = await connection.execute(
        `SELECT id, current_hub_id, parking_slot_id, status
           FROM vehicles
           WHERE id IN (${buildPlaceholders(vehicleIds.length)})
           FOR UPDATE`,
        vehicleIds
      );

      const vehicleMap = new Map(
        vehicles.map((vehicle) => [Number(vehicle.id), vehicle])
      );

      if (vehicles.length !== vehicleIds.length) {
        throw createHttpError(404, 'One or more vehicles were not found.');
      }

      // Resolve the actual source slots.
      const resolvedAllocations = normalizedAllocations.map((item) => {
        const vehicle = vehicleMap.get(item.vehicleId);

        if (Number(vehicle.current_hub_id) !== sourceId) {
          throw createHttpError(
            409,
            `Vehicle ${item.vehicleId} does not belong to the source hub.`
          );
        }

        const actualSlotId =
          vehicle.parking_slot_id == null
            ? null
            : Number(vehicle.parking_slot_id);

        // Prevent freeing a slot that is not currently assigned to this vehicle.
        if (
          item.fromSlotId !== null &&
          item.fromSlotId !== actualSlotId
        ) {
          throw createHttpError(
            409,
            `Vehicle ${item.vehicleId} has changed its parking slot.`
          );
        }

        return {
          ...item,
          oldSlotId: item.fromSlotId ?? actualSlotId,
        };
      });

      const oldSlotIds = [
        ...new Set(
          resolvedAllocations
            .map((item) => item.oldSlotId)
            .filter((id) => id !== null)
        ),
      ];

      const allSlotIds = [...new Set([...oldSlotIds, ...targetSlotIds])];

      // 3. Lock all source and target slots.
      const [slots] = await connection.execute(
        `SELECT id, hub_id, slot_type, status
           FROM parking_slots
           WHERE id IN (${buildPlaceholders(allSlotIds.length)})
           FOR UPDATE`,
        allSlotIds
      );

      const slotMap = new Map(
        slots.map((slot) => [Number(slot.id), slot])
      );

      if (slots.length !== allSlotIds.length) {
        throw createHttpError(404, 'One or more parking slots were not found.');
      }

      const oldSlotSet = new Set(oldSlotIds);

      // Validate source slots.
      for (const slotId of oldSlotIds) {
        const slot = slotMap.get(slotId);

        if (Number(slot.hub_id) !== sourceId) {
          throw createHttpError(409, 'A source slot does not belong to the source hub.');
        }
      }

      // Validate target slots.
      for (const slotId of targetSlotIds) {
        const slot = slotMap.get(slotId);

        if (Number(slot.hub_id) !== destinationId) {
          throw createHttpError(
            409,
            `Target slot ${slotId} does not belong to the destination hub.`
          );
        }

        // A target must be FREE or be one of the slots vacated in Phase A.
        if (slot.status !== 'FREE' && !oldSlotSet.has(slotId)) {
          throw createHttpError(
            409,
            `Target slot ${slotId} is not available.`
          );
        }
      }

      // ---------------------------------------------------------
      // Phase A: Vacate all source slots first.
      // This allows safe swaps within the same hub.
      // ---------------------------------------------------------
      if (oldSlotIds.length > 0) {
        await connection.execute(
          `UPDATE parking_slots
             SET status = 'FREE'
             WHERE id IN (${buildPlaceholders(oldSlotIds.length)})`,
          oldSlotIds
        );
      }

      await connection.execute(
        `UPDATE vehicles
           SET parking_slot_id = NULL
           WHERE id IN (${buildPlaceholders(vehicleIds.length)})`,
        vehicleIds
      );

      // ---------------------------------------------------------
      // Phase B: Occupy target slots and update vehicle locations.
      // ---------------------------------------------------------
      await connection.execute(
        `UPDATE parking_slots
           SET status = 'OCCUPIED'
           WHERE id IN (${buildPlaceholders(targetSlotIds.length)})`,
        targetSlotIds
      );

      for (const item of resolvedAllocations) {
        await connection.execute(
          `UPDATE vehicles
             SET current_hub_id = ?,
                 parking_slot_id = ?
             WHERE id = ?`,
          [destinationId, item.toSlotId, item.vehicleId]
        );
      }

      // Create completed dispatch order.
      const [result] = await connection.execute(
        `INSERT INTO dispatch_orders
            (order_code, operator_id, source_hub_id, destination_hub_id,
             vehicle_count, reason, status)
           VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED')`,
        [
          orderCode,
          req.user.id,
          sourceId,
          destinationId,
          resolvedAllocations.length,
          reason,
        ]
      );

      await connection.commit();
      transactionStarted = false;

      return res.status(201).json({
        success: true,
        data: {
          id: result.insertId,
          orderCode,
          movedCount: resolvedAllocations.length,
          assignedStaff: staff,
          allocations,
          status: 'COMPLETED',
        },
      });
    }

    // =========================================================
    // MODE 2: Legacy count-only dispatch
    // =========================================================

    const count = Math.max(1, Number(vehicleCount) || 1);

    // 2. Get available vehicles from the source hub.
    const [movableVehicles] = await connection.execute(
      `SELECT id, current_hub_id, parking_slot_id
         FROM vehicles
         WHERE current_hub_id = ?
           AND status = 'AVAILABLE'
         ORDER BY id
         LIMIT ?
         FOR UPDATE`,
      [sourceId, count]
    );

    const movedCount = movableVehicles.length;

    // 3. Get free destination slots.
    // Keep the same slot types as the mock API.
    let freeDestSlots = [];

    if (movedCount > 0) {
      [freeDestSlots] = await connection.execute(
        `SELECT id
           FROM parking_slots
           WHERE hub_id = ?
             AND slot_type IN ('SHARED_EV', 'UNIVERSAL')
             AND status = 'FREE'
           ORDER BY id
           LIMIT ?
           FOR UPDATE`,
        [destinationId, movedCount]
      );
    }

    // 4. Vacate old vehicle slots.
    const oldSlotIds = [
      ...new Set(
        movableVehicles
          .map((vehicle) =>
            vehicle.parking_slot_id == null
              ? null
              : Number(vehicle.parking_slot_id)
          )
          .filter((id) => id !== null)
      ),
    ];

    if (oldSlotIds.length > 0) {
      await connection.execute(
        `UPDATE parking_slots
           SET status = 'FREE'
           WHERE id IN (${buildPlaceholders(oldSlotIds.length)})`,
        oldSlotIds
      );
    }

    // 5. Occupy destination slots and move vehicles.
    for (let i = 0; i < movableVehicles.length; i++) {
      const vehicle = movableVehicles[i];
      const targetSlot = freeDestSlots[i] || null;

      if (targetSlot) {
        await connection.execute(
          `UPDATE parking_slots
             SET status = 'OCCUPIED'
             WHERE id = ?`,
          [targetSlot.id]
        );
      }

      await connection.execute(
        `UPDATE vehicles
           SET current_hub_id = ?,
               parking_slot_id = ?
           WHERE id = ?`,
        [destinationId, targetSlot ? targetSlot.id : null, vehicle.id]
      );
    }

    // 6. Create completed dispatch order.
    const [result] = await connection.execute(
      `INSERT INTO dispatch_orders
          (order_code, operator_id, source_hub_id, destination_hub_id,
           vehicle_count, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED')`,
      [
        orderCode,
        req.user.id,
        sourceId,
        destinationId,
        movedCount,
        reason,
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        orderCode,
        movedCount,
        assignedStaff: staff,
        status: 'COMPLETED',
      },
    });
  } catch (err) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
);


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
