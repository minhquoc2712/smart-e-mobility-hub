-- ============================================================================
-- Smart E-Mobility Hub — Seed Data for VNU-HCM Urban Area (Task 3.1 & 3.1b)
-- ============================================================================

USE smart_emobility_hub;

INSERT INTO users (email, full_name, role, private_vehicle_plate, private_vehicle_model) VALUES
  ('student@hcmut.edu.vn', 'Nguyễn Văn Sinh Viên', 'USER', NULL, NULL),
  ('ev.owner@hcmut.edu.vn', 'Trần Thị Chủ Xe Điện', 'USER', '59-MĐ1 123.45', 'VinFast Evo200 Lite'),
  ('operator@hcmut.edu.vn', 'Lê Điều Phối Viên', 'OPERATOR', NULL, NULL)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO hubs (code, name, campus_zone, address, latitude, longitude, total_parking_slots, total_charging_points, status) VALUES
  ('HUB-BK-GATE1', 'HCMUT Main Gate Hub', 'HCMUT Campus Dĩ An', 'Cổng H1 ĐH Bách Khoa, Khu Đô thị ĐHQG-HCM', 10.8805200, 106.8053100, 20, 6, 'ACTIVE'),
  ('HUB-CENTRAL', 'VNU Central Library Hub', 'Central Academic Zone', 'Thư viện Trung tâm ĐHQG-HCM, Linh Trung, Thủ Đức', 10.8701800, 106.8031200, 24, 8, 'ACTIVE'),
  ('HUB-DORM-B', 'Dormitory Zone B Hub', 'Student Dormitory B', 'Ký túc xá Khu B ĐHQG-HCM, Đông Hòa, Dĩ An', 10.8839100, 106.7824500, 30, 10, 'NEAR_FULL'),
  ('HUB-METRO-VNU', 'Metro Suoi Tien - VNU Hub', 'Metro Line 1 Transit', 'Ga ĐHQG - Tuyến Metro số 1, Xa lộ Hà Nội', 10.8662400, 106.8129000, 18, 6, 'ACTIVE')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO parking_slots (hub_id, slot_code, slot_type, status) VALUES
  (1, 'BK-P01', 'SHARED_EV', 'OCCUPIED'),
  (1, 'BK-P02', 'SHARED_EV', 'OCCUPIED'),
  (1, 'BK-P03', 'UNIVERSAL', 'FREE'),
  (1, 'BK-P04', 'PRIVATE_EV', 'FREE'),
  (2, 'CT-P01', 'SHARED_EV', 'OCCUPIED'),
  (2, 'CT-P02', 'UNIVERSAL', 'FREE'),
  (3, 'DB-P01', 'SHARED_EV', 'OCCUPIED'),
  (3, 'DB-P02', 'PRIVATE_EV', 'RESERVED'),
  (4, 'MT-P01', 'SHARED_EV', 'OCCUPIED'),
  (4, 'MT-P02', 'UNIVERSAL', 'FREE')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO vehicles (code, type, model, current_hub_id, parking_slot_id, battery_level, estimated_range_km, status) VALUES
  ('EB-102', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 1, 1, 88, 42.0, 'AVAILABLE'),
  ('EB-205', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 1, 2, 74, 35.5, 'AVAILABLE'),
  ('ES-301', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 2, 5, 92, 60.0, 'AVAILABLE'),
  ('EB-108', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 2, NULL, 24, 11.0, 'CHARGING'),
  ('ES-410', 'ELECTRIC_SCOOTER', 'Smart E-Scooter S1', 3, 7, 65, 41.0, 'RESERVED'),
  ('EB-309', 'ELECTRIC_BIKE', 'Campus E-Bike Gen2', 4, 9, 15, 6.5, 'OUT_OF_SERVICE')
ON DUPLICATE KEY UPDATE battery_level = VALUES(battery_level), status = VALUES(status);

INSERT INTO charging_points (hub_id, charger_code, connector_type, max_power_kw, status, current_vehicle_id, priority_level) VALUES
  (1, 'BK-C01', 'E_BIKE_DC', 2.50, 'AVAILABLE', NULL, 'NORMAL'),
  (1, 'BK-C02', 'UNIVERSAL_AC', 3.50, 'AVAILABLE', NULL, 'NORMAL'),
  (2, 'CT-C01', 'E_BIKE_DC', 2.50, 'CHARGING', 4, 'HIGH'),
  (2, 'CT-C02', 'UNIVERSAL_AC', 7.00, 'AVAILABLE', NULL, 'NORMAL'),
  (3, 'DB-C01', 'UNIVERSAL_AC', 3.50, 'OUT_OF_SERVICE', NULL, 'NORMAL'),
  (4, 'MT-C01', 'UNIVERSAL_AC', 7.00, 'AVAILABLE', NULL, 'URGENT')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO scenarios (code, name, scenario_type, description, default_params) VALUES
  ('SCN-METRO-SURGE', 'Morning Metro Demand Surge', 'DEMAND_SURGE', 'Sudden arrival of 60+ students at Metro Suoi Tien - VNU Hub at 07:15 AM requesting rental bikes.', JSON_OBJECT('targetHubCode', 'HUB-METRO-VNU', 'extraDemandRequests', 45, 'durationMinutes', 60)),
  ('SCN-DORMB-FULL', 'Evening Dormitory B Capacity Overflow', 'HUB_FULL', 'Dormitory Zone B Hub reaches 100% parking occupancy during evening return peak (17:30).', JSON_OBJECT('targetHubCode', 'HUB-DORM-B', 'incomingReturns', 18, 'freeSlotsRemaining', 1)),
  ('SCN-CHARGER-OUTAGE', 'Central Hub Charging Point Failure', 'CHARGER_FAILURE', '50% of charging points at VNU Central Library Hub go offline while charging queue has pending vehicles.', JSON_OBJECT('targetHubCode', 'HUB-CENTRAL', 'failedChargersCount', 4, 'queuedVehicles', 7)),
  ('SCN-FLEET-IMBALANCE', 'Inter-Campus Vehicle Concentration', 'VEHICLE_IMBALANCE', '80% of available fleet accumulates at Dormitory B while HCMUT Main Gate faces severe shortage.', JSON_OBJECT('surplusHubCode', 'HUB-DORM-B', 'deficitHubCode', 'HUB-BK-GATE1', 'imbalanceRatio', 0.8))
ON DUPLICATE KEY UPDATE description = VALUES(description);
