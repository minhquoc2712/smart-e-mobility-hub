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
router.get('/operator/dashboard', authenticateToken, requireRole('OPERATOR'), async (_req, res, next) => {
  try {
    const threshold = Number(
      process.env.HUB_STATUS_LOW_THRESHOLD ?? 5
    );
    // Chưa có file .env nên em set default threshold = 5, nếu muốn thay đổi thì thêm biến HUB_STATUS_LOW_THRESHOLD vào file .env
    const LOW_THRESHOLD = Number.isFinite(threshold)
      ? threshold : 5;

    // ==========================================
    // QUERY 1: HUB UTILIZATION
    // ==========================================

    const [hubRows] = await pool.execute(`
            SELECT
                h.id,
                h.code,
                h.name,
                h.campus_zone AS campusZone,
                h.address,
                h.latitude,
                h.longitude,
                h.status AS hubStatus,

                h.total_parking_slots AS totalParkingSlots,
                h.total_charging_points AS totalChargingPoints,

                (
                    h.total_parking_slots +
                    h.total_charging_points
                ) AS totalCapacity,

                -- Parking slot statistics
                COALESCE(ps.actual_slots, 0) AS actualParkingSlots,
                COALESCE(ps.occupied_slots, 0) AS occupiedSlots,
                COALESCE(ps.reserved_slots, 0) AS reservedSlots,
                COALESCE(ps.free_slots, 0) AS freeSlots,
                COALESCE(ps.out_of_service_slots, 0)
                    AS outOfServiceSlots,

                -- Charging point statistics
                COALESCE(cp.actual_points, 0) AS actualChargingPoints,
                COALESCE(cp.available_points, 0)
                    AS availableChargingPoints,
                COALESCE(cp.reserved_points, 0)
                    AS reservedChargingPoints,
                COALESCE(cp.charging_points_in_use, 0)
                    AS chargingPointsInUse,
                COALESCE(cp.out_of_service_points, 0)
                    AS outOfServiceChargingPoints,

                -- Vehicle statistics at this hub
                (v.available_vehicles, 0)
                    AS availableVehicles,
                COALESCE(v.reserved_vehicles, 0)
                    AS reservedVehicles,
                COALESCE(v.vehicles_in_use, 0)
                    AS vehiclesInUse,
                COALESCE(v.vehicles_charging, 0)
                    AS vehiclesCharging,
                COALESCE(v.out_of_service_vehicles, 0)
                    AS outOfServiceVehicles,

                -- Utilization percentage
                ROUND(
                    (
                        COALESCE(ps.occupied_slots, 0) +
                        COALESCE(cp.charging_points_in_use, 0)
                    ) * 100.0 /
                    NULLIF(
                        h.total_parking_slots +
                        h.total_charging_points,
                        0
                    ),
                    2
                ) AS utilizationPercentage

            FROM hubs h

            LEFT JOIN (
                SELECT
                    hub_id,
                    COUNT(*) AS actual_slots,
                    COUNT(CASE WHEN status = 'OCCUPIED'
                        THEN 1 END) AS occupied_slots,
                    COUNT(CASE WHEN status = 'RESERVED'
                        THEN 1 END) AS reserved_slots,
                    COUNT(CASE WHEN status = 'FREE'
                        THEN 1 END) AS free_slots,
                    COUNT(CASE WHEN status = 'OUT_OF_SERVICE'
                        THEN 1 END) AS out_of_service_slots
                FROM parking_slots
                GROUP BY hub_id
            ) ps ON h.id = ps.hub_id

            LEFT JOIN (
                SELECT
                    hub_id,
                    COUNT(*) AS actual_points,
                    COUNT(CASE WHEN status = 'AVAILABLE'
                        THEN 1 END) AS available_points,
                    COUNT(CASE WHEN status = 'RESERVED'
                        THEN 1 END) AS reserved_points,
                    COUNT(CASE WHEN status = 'CHARGING'
                        THEN 1 END) AS charging_points_in_use,
                    COUNT(CASE WHEN status = 'OUT_OF_SERVICE'
                        THEN 1 END) AS out_of_service_points
                FROM charging_points
                GROUP BY hub_id
            ) cp ON h.id = cp.hub_id

            LEFT JOIN (
                SELECT
                    current_hub_id AS hub_id,

                    COUNT(CASE WHEN status = 'AVAILABLE'
                        THEN 1 END) AS available_vehicles,

                    COUNT(CASE WHEN status = 'RESERVED'
                        THEN 1 END) AS reserved_vehicles,

                    COUNT(CASE WHEN status = 'IN_USE'
                        THEN 1 END) AS vehicles_in_use,

                    COUNT(CASE WHEN status = 'CHARGING'
                        THEN 1 END) AS vehicles_charging,

                    COUNT(CASE WHEN status = 'OUT_OF_SERVICE'
                        THEN 1 END) AS out_of_service_vehicles

                FROM vehicles
                WHERE current_hub_id IS NOT NULL
                GROUP BY current_hub_id
            ) v ON h.id = v.hub_id

            ORDER BY h.id;
        `);

    // ==========================================
    // QUERY 2: GLOBAL VEHICLE STATISTICS
    // ==========================================

    const [vehicleStatRows] = await pool.execute(`
            SELECT
                status,
                COUNT(*) AS total
            FROM vehicles
            GROUP BY status;
        `);

    // ==========================================
    // QUERY 3: PARKING SLOT DETAILS
    // ==========================================

    const [parkingRows] = await pool.execute(`
            SELECT
                ps.id,
                ps.hub_id AS hubId,
                h.code AS hubCode,
                h.name AS hubName,

                ps.slot_code AS slotCode,
                ps.slot_type AS slotType,
                ps.status,
                ps.updated_at AS updatedAt

            FROM parking_slots ps
            JOIN hubs h ON ps.hub_id = h.id

            ORDER BY h.id, ps.slot_code;
        `);

    // ==========================================
    // QUERY 4: VEHICLE DETAILS
    // ==========================================

    const [vehicleRows] = await pool.execute(`
            SELECT
                v.id,
                v.code,
                v.type,
                v.model,

                v.current_hub_id AS currentHubId,
                h.name AS currentHubName,
                h.code AS currentHubCode,

                v.parking_slot_id AS parkingSlotId,
                ps.slot_code AS parkingSlotCode,

                v.battery_level AS batteryLevel,
                v.estimated_range_km AS estimatedRangeKm,
                v.status,

                v.last_telemetry_at AS lastTelemetryAt,
                v.created_at AS createdAt,
                v.updated_at AS updatedAt

            FROM vehicles v

            LEFT JOIN hubs h
                ON v.current_hub_id = h.id

            LEFT JOIN parking_slots ps
                ON v.parking_slot_id = ps.id

            ORDER BY v.id;
        `);

    // ==========================================
    // QUERY 5: CHARGING POINT DETAILS
    // ==========================================

    const [chargingRows] = await pool.execute(`
            SELECT
                cp.id,
                cp.hub_id AS hubId,
                h.name AS hubName,
                h.code AS hubCode,

                cp.charger_code AS chargerCode,
                cp.connector_type AS connectorType,
                cp.max_power_kw AS maxPowerKw,
                cp.status,

                cp.current_vehicle_id AS currentVehicleId,
                v.code AS currentVehicleCode,
                v.model AS currentVehicleModel,
                v.type AS currentVehicleType,
                v.battery_level AS currentVehicleBattery,
                v.status AS currentVehicleStatus,

                cp.priority_level AS priorityLevel,
                cp.updated_at AS updatedAt

            FROM charging_points cp

            JOIN hubs h
                ON cp.hub_id = h.id

            LEFT JOIN vehicles v
                ON cp.current_vehicle_id = v.id

            ORDER BY h.id, cp.charger_code;
        `);

    // ==========================================
    // QUERY 6: INCIDENT STATISTICS
    // ==========================================
    const [[incidentStats]] = await pool.execute(`
      SELECT SUM(CASE WHEN status = 'OPEN' OR status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS openIncidents FROM incidents
    `);
    
    // ==========================================
    // PROCESS 1: NORMALIZE HUB DATA
    // ==========================================

    const hubStatusList = hubRows.map(hub => {
      const availableVehicles = Number(hub.availableVehicles);

      return {
        ...hub,

        latitude: Number(hub.latitude),
        longitude: Number(hub.longitude),

        totalParkingSlots: Number(hub.totalParkingSlots),
        totalChargingPoints: Number(hub.totalChargingPoints),
        totalCapacity: Number(hub.totalCapacity),

        actualParkingSlots: Number(hub.actualParkingSlots),
        occupiedSlots: Number(hub.occupiedSlots),
        reservedSlots: Number(hub.reservedSlots),
        freeSlots: Number(hub.freeSlots),
        outOfServiceSlots: Number(hub.outOfServiceSlots),

        actualChargingPoints: Number(hub.actualChargingPoints),
        availableChargingPoints: Number(hub.availableChargingPoints),
        reservedChargingPoints: Number(hub.reservedChargingPoints),
        chargingPointsInUse: Number(hub.chargingPointsInUse),
        outOfServiceChargingPoints:
          Number(hub.outOfServiceChargingPoints),

        availableVehicles,

        reservedVehicles: Number(hub.reservedVehicles),
        vehiclesInUse: Number(hub.vehiclesInUse),
        vehiclesCharging: Number(hub.vehiclesCharging),
        outOfServiceVehicles: Number(hub.outOfServiceVehicles),

        utilizationPercentage:
          hub.utilizationPercentage === null
            ? null
            : Number(hub.utilizationPercentage),

        vehicleStockStatus:
          availableVehicles <= LOW_THRESHOLD
            ? "Low stock"
            : "Operating"
      };
    });

    // ==========================================
    // PROCESS 2: GLOBAL VEHICLE STATISTICS
    // ==========================================

    const vehicleStats = {
      AVAILABLE: 0,
      RESERVED: 0,
      IN_USE: 0,
      CHARGING: 0,
      OUT_OF_SERVICE: 0
    };

    vehicleStatRows.forEach(row => {
      vehicleStats[row.status] = Number(row.total);
    });

    const totalVehicles = Object.values(vehicleStats)
      .reduce((sum, count) => sum + count, 0);

    // ==========================================
    // PROCESS 3: PARKING STATISTICS
    // ==========================================

    const parkingStats = {
      total: parkingRows.length,
      FREE: 0,
      RESERVED: 0,
      OCCUPIED: 0,
      OUT_OF_SERVICE: 0
    };

    parkingRows.forEach(slot => {
      parkingStats[slot.status]++;
    });

    // ==========================================
    // PROCESS 4: CHARGING STATISTICS
    // ==========================================

    const chargingStats = {
      total: chargingRows.length,
      AVAILABLE: 0,
      RESERVED: 0,
      CHARGING: 0,
      OUT_OF_SERVICE: 0
    };

    chargingRows.forEach(point => {
      chargingStats[point.status]++;
    });

    // ==========================================
    // PROCESS 5: OVERVIEW STATISTICS
    // ==========================================

    const overview = hubStatusList.reduce(
      (result, hub) => {
        result.totalParkingSlots += hub.totalParkingSlots;
        result.totalChargingPoints += hub.totalChargingPoints;
        result.occupiedSlots += hub.occupiedSlots;
        result.chargingPointsInUse += hub.chargingPointsInUse;

        return result;
      },
      {
        totalHubs: hubStatusList.length,
        totalParkingSlots: 0,
        totalChargingPoints: 0,
        occupiedSlots: 0,
        chargingPointsInUse: 0
      }
    );

    overview.totalCapacity =
      overview.totalParkingSlots +
      overview.totalChargingPoints;

    overview.inUseCapacity =
      overview.occupiedSlots +
      overview.chargingPointsInUse;

    overview.utilizationPercentage =
      overview.totalCapacity === 0
        ? 0
        : Number((
          overview.inUseCapacity * 100 /
          overview.totalCapacity
        ).toFixed(2));

    overview.totalVehicles = totalVehicles;
    overview.vehicleStats = vehicleStats;

    overview.lowStockHubs = hubStatusList.filter(
      hub => hub.vehicleStockStatus === "Low stock"
    ).length;

    // ==========================================
    // FINAL RESPONSE
    // ==========================================

    res.json({
      success: true,

      data: {
        overview,

        hubUtilization: {
          totalHubs: hubStatusList.length,
          hubs: hubStatusList
        },

        manageParking: {
          statistics: parkingStats,
          parkingSlots: parkingRows
        },

        vehicleCharging: {
          totalVehicles,
          vehicleStats,
          vehicles: vehicleRows,

          chargingStatistics: chargingStats,
          chargingPoints: chargingRows
        },

        openIncidents: incidentStats.openIncidents
      }
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
                     SET status = 'AVAILABLE'
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
// ==========================================================
// UC13: Redistribute Vehicles Between Hubs (Dispatch)
// Quy trình: PENDING -> IN_TRANSIT -> COMPLETED / CANCELLED
//
// - Chỉ di dời xe cho thuê (bảng vehicles). Xe cá nhân của sinh viên không di dời.
// - Khi tạo lệnh: chọn xe AVAILABLE ở hub nguồn và slot SHARED_EV còn FREE ở hub đích
//   (mỗi xe đúng 1 slot). Xe chuyển sang OUT_OF_SERVICE, slot đích chuyển sang RESERVED.
// - Xe chỉ đổi hub / slot khi lệnh COMPLETED, lúc đó xe trở lại AVAILABLE.
// - Nếu CANCELLED: xe trở lại AVAILABLE ở hub nguồn, slot đích trở lại FREE.
// ==========================================================

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

// Chạy fn(connection) trong một transaction, lỗi thì rollback
async function withTransaction(fn) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await fn(connection);

    await connection.commit();

    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Khóa lệnh dispatch và kiểm tra trạng thái hiện tại có hợp lệ không
async function lockDispatchOrder(connection, orderId, allowedStatuses) {
  const [rows] = await connection.execute(
    'SELECT * FROM dispatch_orders WHERE id = ? FOR UPDATE',
    [orderId]
  );

  if (rows.length === 0) {
    throw httpError(404, 'Dispatch order not found.');
  }

  if (!allowedStatuses.includes(rows[0].status)) {
    throw httpError(
      409,
      `Dispatch order is ${rows[0].status}, expected ${allowedStatuses.join(' or ')}.`
    );
  }

  return rows[0];
}

// ==========================================================
// 1. Tạo lệnh điều phối (PENDING)
// POST /dispatch/redistribute
// ==========================================================

router.post('/dispatch/redistribute', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { reason = 'Manual balancing' } = req.body;

    const sourceHubId = Number(req.body.sourceHubId);
    const destinationHubId = Number(req.body.destinationHubId);
    const vehicleCount = Number(req.body.vehicleCount);

    if (
      !isPositiveInt(sourceHubId) ||
      !isPositiveInt(destinationHubId) ||
      !isPositiveInt(vehicleCount)
    ) {
      throw httpError(
        400,
        'sourceHubId, destinationHubId and vehicleCount (>= 1) are required.'
      );
    }

    if (sourceHubId === destinationHubId) {
      throw httpError(400, 'Source and destination Hub must be different.');
    }

    const data = await withTransaction(async (connection) => {

      // Kiểm tra hub nguồn và hub đích tồn tại
      const [hubs] = await connection.execute(
        'SELECT id FROM hubs WHERE id IN (?, ?)',
        [sourceHubId, destinationHubId]
      );

      if (hubs.length !== 2) {
        throw httpError(404, 'Source or destination Hub not found.');
      }

      // Xe cho thuê đang sẵn sàng ở hub nguồn
      const [vehicles] = await connection.execute(
        `SELECT id FROM vehicles
                 WHERE current_hub_id = ? AND status = 'AVAILABLE'
                 ORDER BY id LIMIT ${vehicleCount} FOR UPDATE`,
        [sourceHubId]
      );

      if (vehicles.length < vehicleCount) {
        throw httpError(
          409,
          'Source Hub does not have enough available vehicles.'
        );
      }

      // Slot SHARED_EV còn trống ở hub đích
      const [slots] = await connection.execute(
        `SELECT id FROM parking_slots
                 WHERE hub_id = ? AND slot_type = 'SHARED_EV' AND status = 'FREE'
                 ORDER BY id LIMIT ${vehicleCount} FOR UPDATE`,
        [destinationHubId]
      );

      if (slots.length < vehicleCount) {
        throw httpError(
          409,
          'Destination Hub lacks free parking capacity.'
        );
      }

      // Tạo mã lệnh điều phối
      const orderCode = `DSP-${Date.now()}`;

      const [result] = await connection.execute(
        `INSERT INTO dispatch_orders (
                    order_code,
                    operator_id,
                    source_hub_id,
                    destination_hub_id,
                    vehicle_count,
                    reason,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          orderCode,
          req.user.id,
          sourceHubId,
          destinationHubId,
          vehicleCount,
          reason
        ]
      );

      // Mỗi xe ghép với đúng 1 slot đích
      for (let i = 0; i < vehicleCount; i++) {

        await connection.execute(
          `INSERT INTO dispatch_order_items (
                        dispatch_order_id,
                        vehicle_id,
                        destination_slot_id
                    )
                    VALUES (?, ?, ?)`,
          [
            result.insertId,
            vehicles[i].id,
            slots[i].id
          ]
        );

        // Xe chuyển sang OUT_OF_SERVICE
        await connection.execute(
          "UPDATE vehicles SET status = 'OUT_OF_SERVICE' WHERE id = ?",
          [vehicles[i].id]
        );

        // Slot đích chuyển sang RESERVED
        await connection.execute(
          "UPDATE parking_slots SET status = 'RESERVED' WHERE id = ?",
          [slots[i].id]
        );
      }

      return {
        id: result.insertId,
        orderCode,
        status: 'PENDING',
        vehicleCount
      };
    });

    res.status(201).json({
      success: true,
      data
    });

  } catch (err) {
    next(err);
  }
});

// ==========================================================
// 2. Danh sách lệnh điều phối
// GET /dispatch/orders
// Query tùy chọn: ?status=PENDING
// ==========================================================

router.get('/dispatch/orders', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { status } = req.query;

    const where = status ? 'WHERE o.status = ?' : '';
    const params = status ? [status] : [];

    const [rows] = await pool.execute(
      `SELECT
                o.id,
                o.order_code AS orderCode,
                o.source_hub_id AS sourceHubId,
                sh.name AS sourceHubName,
                o.destination_hub_id AS destinationHubId,
                dh.name AS destinationHubName,
                o.vehicle_count AS vehicleCount,
                o.reason,
                o.status,
                o.created_at AS createdAt,
                o.completed_at AS completedAt
             FROM dispatch_orders o
             JOIN hubs sh ON sh.id = o.source_hub_id
             JOIN hubs dh ON dh.id = o.destination_hub_id
             ${where}
             ORDER BY o.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    next(err);
  }
});

// ==========================================================
// 3. Chi tiết một lệnh điều phối
// GET /dispatch/orders/:orderId
// ==========================================================

router.get('/dispatch/orders/:orderId', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!isPositiveInt(orderId)) {
      throw httpError(400, 'Invalid order ID.');
    }

    // Lấy thông tin lệnh điều phối
    const [orders] = await pool.execute(
      `SELECT
                o.id,
                o.order_code AS orderCode,
                o.source_hub_id AS sourceHubId,
                sh.name AS sourceHubName,
                o.destination_hub_id AS destinationHubId,
                dh.name AS destinationHubName,
                o.vehicle_count AS vehicleCount,
                o.reason,
                o.status,
                o.created_at AS createdAt,
                o.completed_at AS completedAt
             FROM dispatch_orders o
             JOIN hubs sh ON sh.id = o.source_hub_id
             JOIN hubs dh ON dh.id = o.destination_hub_id
             WHERE o.id = ?`,
      [orderId]
    );

    if (orders.length === 0) {
      throw httpError(404, 'Dispatch order not found.');
    }

    // Lấy danh sách xe và slot đích tương ứng
    const [vehicles] = await pool.execute(
      `SELECT
                i.vehicle_id AS vehicleId,
                v.code AS vehicleCode,
                i.destination_slot_id AS destinationSlotId,
                ps.slot_code AS destinationSlotCode
             FROM dispatch_order_items i
             JOIN vehicles v ON v.id = i.vehicle_id
             JOIN parking_slots ps ON ps.id = i.destination_slot_id
             WHERE i.dispatch_order_id = ?`,
      [orderId]
    );

    res.json({
      success: true,
      data: {
        ...orders[0],
        vehicles
      }
    });

  } catch (err) {
    next(err);
  }
});

// ==========================================================
// 4. Bắt đầu vận chuyển
// PATCH /dispatch/orders/:orderId/start
// PENDING -> IN_TRANSIT
// ==========================================================

router.patch('/dispatch/orders/:orderId/start', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!isPositiveInt(orderId)) {
      throw httpError(400, 'Invalid order ID.');
    }

    await withTransaction(async (connection) => {

      // Chỉ cho phép bắt đầu khi lệnh đang PENDING
      await lockDispatchOrder(connection, orderId, ['PENDING']);

      await connection.execute(
        "UPDATE dispatch_orders SET status = 'IN_TRANSIT' WHERE id = ?",
        [orderId]
      );
    });

    res.json({
      success: true,
      data: {
        id: orderId,
        status: 'IN_TRANSIT'
      }
    });

  } catch (err) {
    next(err);
  }
});

// ==========================================================
// 5. Hoàn thành điều phối
// PATCH /dispatch/orders/:orderId/complete
// IN_TRANSIT -> COMPLETED
// ==========================================================

router.patch('/dispatch/orders/:orderId/complete', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!isPositiveInt(orderId)) {
      throw httpError(400, 'Invalid order ID.');
    }

    await withTransaction(async (connection) => {

      // Chỉ cho phép hoàn thành khi lệnh đang IN_TRANSIT
      const order = await lockDispatchOrder(
        connection,
        orderId,
        ['IN_TRANSIT']
      );

      // 1. Trả slot cũ ở hub nguồn về FREE
      // Làm trước khi xe đổi slot
      await connection.execute(
        `UPDATE parking_slots ps
                 JOIN vehicles v ON v.parking_slot_id = ps.id
                 JOIN dispatch_order_items i ON i.vehicle_id = v.id
                 SET ps.status = 'FREE'
                 WHERE i.dispatch_order_id = ?
                   AND ps.status = 'OCCUPIED'`,
        [orderId]
      );

      // 2. Xe sang hub đích, vào slot đích, sẵn sàng cho thuê
      await connection.execute(
        `UPDATE vehicles v
                 JOIN dispatch_order_items i ON i.vehicle_id = v.id
                 SET
                    v.current_hub_id = ?,
                    v.parking_slot_id = i.destination_slot_id,
                    v.status = 'AVAILABLE'
                 WHERE i.dispatch_order_id = ?`,
        [
          order.destination_hub_id,
          orderId
        ]
      );

      // 3. Slot đích từ RESERVED thành OCCUPIED
      await connection.execute(
        `UPDATE parking_slots ps
                 JOIN dispatch_order_items i ON i.destination_slot_id = ps.id
                 SET ps.status = 'OCCUPIED'
                 WHERE i.dispatch_order_id = ?`,
        [orderId]
      );

      // 4. Cập nhật trạng thái lệnh thành COMPLETED
      await connection.execute(
        `UPDATE dispatch_orders
                 SET status = 'COMPLETED',
                     completed_at = NOW()
                 WHERE id = ?`,
        [orderId]
      );
    });

    res.json({
      success: true,
      data: {
        id: orderId,
        status: 'COMPLETED'
      }
    });

  } catch (err) {
    next(err);
  }
});

// ==========================================================
// 6. Hủy lệnh điều phối
// PATCH /dispatch/orders/:orderId/cancel
// PENDING / IN_TRANSIT -> CANCELLED
// ==========================================================

router.patch('/dispatch/orders/:orderId/cancel', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!isPositiveInt(orderId)) {
      throw httpError(400, 'Invalid order ID.');
    }

    await withTransaction(async (connection) => {

      // Chỉ cho phép hủy khi lệnh đang PENDING hoặc IN_TRANSIT
      await lockDispatchOrder(
        connection,
        orderId,
        ['PENDING', 'IN_TRANSIT']
      );

      // 1. Xe chưa đổi hub nên chỉ cần trả về AVAILABLE
      await connection.execute(
        `UPDATE vehicles v
                 JOIN dispatch_order_items i ON i.vehicle_id = v.id
                 SET v.status = 'AVAILABLE'
                 WHERE i.dispatch_order_id = ?`,
        [orderId]
      );

      // 2. Nhả slot đích đã giữ chỗ
      await connection.execute(
        `UPDATE parking_slots ps
                 JOIN dispatch_order_items i ON i.destination_slot_id = ps.id
                 SET ps.status = 'FREE'
                 WHERE i.dispatch_order_id = ?
                   AND ps.status = 'RESERVED'`,
        [orderId]
      );

      // 3. Cập nhật trạng thái lệnh thành CANCELLED
      await connection.execute(
        "UPDATE dispatch_orders SET status = 'CANCELLED' WHERE id = ?",
        [orderId]
      );
    });

    res.json({
      success: true,
      data: {
        id: orderId,
        status: 'CANCELLED'
      }
    });

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
