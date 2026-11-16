-- ============================================================================
-- Smart E-Mobility Hub — Seed Data for VNU-HCM Urban Area (Demo-Ready Fleet)
-- ============================================================================

USE smart_emobility_hub;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE dispatch_orders;
TRUNCATE TABLE incidents;
TRUNCATE TABLE charging_requests;
TRUNCATE TABLE reservations;
TRUNCATE TABLE charging_points;
TRUNCATE TABLE vehicles;
TRUNCATE TABLE parking_slots;
TRUNCATE TABLE scenarios;
TRUNCATE TABLE hubs;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO users (email, full_name, role, private_vehicle_plate, private_vehicle_model) VALUES
  ('student@hcmut.edu.vn', 'Nguyễn Văn Sinh Viên', 'USER', 'PV-018', 'My e-bike (Private electric bike)'),
  ('ev.owner@hcmut.edu.vn', 'Trần Thị Chủ Xe Điện', 'USER', '59-MĐ1 123.45', 'VinFast Evo200 Lite'),
  ('operator@hcmut.edu.vn', 'Lê Điều Phối Viên', 'OPERATOR', NULL, NULL),
  ('matranminhquoc000@gmail.com', 'Mã Trần Minh Quốc', 'OPERATOR', NULL, NULL);

INSERT INTO hubs (code, name, campus_zone, address, latitude, longitude, total_parking_slots, total_charging_points, status) VALUES
  ('HUB-BK-GATE1', 'HCMUT Main Gate Hub', 'HCMUT Campus Dĩ An', 'Cổng H1 ĐH Bách Khoa, Khu Đô thị ĐHQG-HCM', 10.8805200, 106.8053100, 6, 3, 'ACTIVE'),
  ('HUB-CENTRAL', 'VNU Central Library Hub', 'Central Academic Zone', 'Thư viện Trung tâm ĐHQG-HCM, Linh Trung, Thủ Đức', 10.8701800, 106.8031200, 6, 3, 'ACTIVE'),
  ('HUB-DORM-B', 'Dormitory Zone B Hub', 'Student Dormitory B', 'Ký túc xá Khu B ĐHQG-HCM, Đông Hòa, Dĩ An', 10.8839100, 106.7824500, 6, 3, 'NEAR_FULL'),
  ('HUB-METRO-VNU', 'Metro Suoi Tien - VNU Hub', 'Metro Line 1 Transit', 'Ga ĐHQG - Tuyến Metro số 1, Xa lộ Hà Nội', 10.8662400, 106.8129000, 6, 3, 'ACTIVE');

-- 24 Parking Slots across 4 Hubs (Zone A: SHARED_EV, Zone C: UNIVERSAL & PRIVATE_EV)
INSERT INTO parking_slots (hub_id, slot_code, slot_type, status) VALUES
  -- Hub 1: HCMUT Main Gate Hub (slots 1..6)
  (1, 'BK-P01', 'SHARED_EV', 'OCCUPIED'),
  (1, 'BK-P02', 'SHARED_EV', 'OCCUPIED'),
  (1, 'BK-P03', 'SHARED_EV', 'OCCUPIED'),
  (1, 'BK-P04', 'SHARED_EV', 'FREE'),
  (1, 'BK-P05', 'UNIVERSAL', 'FREE'),
  (1, 'BK-P06', 'PRIVATE_EV', 'FREE'),
  -- Hub 2: VNU Central Library Hub (slots 7..12)
  (2, 'CT-P01', 'SHARED_EV', 'OCCUPIED'),
  (2, 'CT-P02', 'SHARED_EV', 'OCCUPIED'),
  (2, 'CT-P03', 'SHARED_EV', 'OCCUPIED'),
  (2, 'CT-P04', 'SHARED_EV', 'FREE'),
  (2, 'CT-P05', 'UNIVERSAL', 'FREE'),
  (2, 'CT-P06', 'PRIVATE_EV', 'FREE'),
  -- Hub 3: Dormitory Zone B Hub (slots 13..18 — Near Full)
  (3, 'DB-P01', 'SHARED_EV', 'OCCUPIED'),
  (3, 'DB-P02', 'SHARED_EV', 'OCCUPIED'),
  (3, 'DB-P03', 'SHARED_EV', 'OCCUPIED'),
  (3, 'DB-P04', 'UNIVERSAL', 'OCCUPIED'),
  (3, 'DB-P05', 'PRIVATE_EV', 'RESERVED'),
  (3, 'DB-P06', 'UNIVERSAL', 'FREE'),
  -- Hub 4: Metro Suoi Tien - VNU Hub (slots 19..24)
  (4, 'MT-P01', 'SHARED_EV', 'OCCUPIED'),
  (4, 'MT-P02', 'SHARED_EV', 'OCCUPIED'),
  (4, 'MT-P03', 'SHARED_EV', 'OCCUPIED'),
  (4, 'MT-P04', 'SHARED_EV', 'FREE'),
  (4, 'MT-P05', 'UNIVERSAL', 'FREE'),
  (4, 'MT-P06', 'PRIVATE_EV', 'FREE');

-- 16 Electric Vehicles across all 4 Hubs so every Hub has Bikes & Scooters ready to rent
INSERT INTO vehicles (code, type, model, current_hub_id, parking_slot_id, battery_level, estimated_range_km, status) VALUES
  -- Hub 1: HCMUT Main Gate Hub
  ('EB-102', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 1, 1, 88, 42.0, 'AVAILABLE'),
  ('EB-205', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 1, 2, 74, 35.5, 'AVAILABLE'),
  ('ES-110', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 1, 3, 91, 58.0, 'AVAILABLE'),
  ('EB-114', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 1, NULL, 34, 16.0, 'CHARGING'),
  -- Hub 2: VNU Central Library Hub
  ('EB-220', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 2, 7, 82, 39.5, 'AVAILABLE'),
  ('ES-301', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 2, 8, 92, 60.0, 'AVAILABLE'),
  ('ES-308', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 2, 9, 68, 43.0, 'AVAILABLE'),
  ('EB-108', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 2, NULL, 18, 8.5, 'CHARGING'),
  -- Hub 3: Dormitory Zone B Hub
  ('EB-315', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 3, 13, 85, 41.0, 'AVAILABLE'),
  ('EB-322', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 3, 14, 63, 30.0, 'AVAILABLE'),
  ('ES-410', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 3, 15, 77, 49.0, 'AVAILABLE'),
  ('ES-418', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 3, 16, 44, 27.0, 'AVAILABLE'),
  -- Hub 4: Metro Suoi Tien - VNU Hub
  ('EB-402', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 4, 19, 90, 44.0, 'AVAILABLE'),
  ('ES-501', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 4, 20, 84, 53.0, 'AVAILABLE'),
  ('EB-309', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 4, 21, 15, 6.5, 'OUT_OF_SERVICE'),
  ('ES-509', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 4, NULL, 28, 17.5, 'CHARGING');

-- 12 Charging Points across 4 Hubs (vehicle ids: 4=EB-114, 8=EB-108, 16=ES-509)
INSERT INTO charging_points (hub_id, charger_code, connector_type, max_power_kw, status, current_vehicle_id, priority_level) VALUES
  (1, 'BK-C01', 'E_BIKE_DC', 2.50, 'CHARGING', 4, 'HIGH'),
  (1, 'BK-C02', 'UNIVERSAL_AC', 3.50, 'AVAILABLE', NULL, 'NORMAL'),
  (1, 'BK-C03', 'UNIVERSAL_AC', 3.50, 'AVAILABLE', NULL, 'NORMAL'),
  (2, 'CT-C01', 'E_BIKE_DC', 2.50, 'CHARGING', 8, 'URGENT'),
  (2, 'CT-C02', 'UNIVERSAL_AC', 7.00, 'AVAILABLE', NULL, 'NORMAL'),
  (2, 'CT-C03', 'UNIVERSAL_AC', 7.00, 'AVAILABLE', NULL, 'NORMAL'),
  (3, 'DB-C01', 'UNIVERSAL_AC', 3.50, 'AVAILABLE', NULL, 'NORMAL'),
  (3, 'DB-C02', 'UNIVERSAL_AC', 3.50, 'AVAILABLE', NULL, 'NORMAL'),
  (3, 'DB-C03', 'E_BIKE_DC', 2.50, 'OUT_OF_SERVICE', NULL, 'NORMAL'),
  (4, 'MT-C01', 'UNIVERSAL_AC', 7.00, 'CHARGING', 16, 'HIGH'),
  (4, 'MT-C02', 'UNIVERSAL_AC', 7.00, 'AVAILABLE', NULL, 'NORMAL'),
  (4, 'MT-C03', 'E_BIKE_DC', 2.50, 'AVAILABLE', NULL, 'NORMAL');

-- Sample Operational Incidents
INSERT INTO incidents (incident_code, reported_by, hub_id, target_type, vehicle_id, charging_point_id, severity, title, description, status) VALUES
  ('INC-2026-001', 3, 4, 'VEHICLE', 15, NULL, 'HIGH', 'Low cell voltage on EB-309', 'Battery pack dropped to 15% and triggered BMS protection lock.', 'OPEN'),
  ('INC-2026-002', 3, 3, 'CHARGING_POINT', NULL, 9, 'MEDIUM', 'Charger DB-C03 connector latch', 'Connector latch stuck; isolated for maintenance inspection.', 'OPEN');

INSERT INTO scenarios (code, name, scenario_type, description, default_params) VALUES
  ('SCN-METRO-SURGE', 'Morning Metro Demand Surge', 'DEMAND_SURGE', 'Sudden arrival of 60+ students at Metro Suoi Tien - VNU Hub at 07:15 AM requesting rental bikes.', JSON_OBJECT('targetHubCode', 'HUB-METRO-VNU', 'extraDemandRequests', 45, 'durationMinutes', 60)),
  ('SCN-DORMB-FULL', 'Evening Dormitory B Capacity Overflow', 'HUB_FULL', 'Dormitory Zone B Hub reaches 100% parking occupancy during evening return peak (17:30).', JSON_OBJECT('targetHubCode', 'HUB-DORM-B', 'incomingReturns', 18, 'freeSlotsRemaining', 1)),
  ('SCN-CHARGER-OUTAGE', 'Central Hub Charging Point Failure', 'CHARGER_FAILURE', '50% of charging points at VNU Central Library Hub go offline while charging queue has pending vehicles.', JSON_OBJECT('targetHubCode', 'HUB-CENTRAL', 'failedChargersCount', 4, 'queuedVehicles', 7)),
  ('SCN-FLEET-IMBALANCE', 'Inter-Campus Vehicle Concentration', 'VEHICLE_IMBALANCE', '80% of available fleet accumulates at Dormitory B while HCMUT Main Gate faces severe shortage.', JSON_OBJECT('surplusHubCode', 'HUB-DORM-B', 'deficitHubCode', 'HUB-BK-GATE1', 'imbalanceRatio', 0.8));
