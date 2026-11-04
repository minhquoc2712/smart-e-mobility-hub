-- ============================================================================
-- Smart E-Mobility Hub — MySQL 8.0 Relational Schema (Task 2B.1 & 3.1)
-- Enforces State Machine transitions from Task 2A.5:
--   Vehicle: AVAILABLE -> RESERVED -> IN_USE -> CHARGING -> OUT_OF_SERVICE
--   ChargingPoint: AVAILABLE -> RESERVED -> CHARGING -> OUT_OF_SERVICE
-- ============================================================================

CREATE DATABASE IF NOT EXISTS smart_emobility_hub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_emobility_hub;

-- 1. Users (Student / Private EV Owner = 'USER', Hub Operator = 'OPERATOR')
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  google_sub VARCHAR(128) NULL UNIQUE,
  avatar_url VARCHAR(500) NULL,
  role ENUM('USER', 'OPERATOR') NOT NULL DEFAULT 'USER',
  private_vehicle_plate VARCHAR(30) NULL,
  private_vehicle_model VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Mobility Hubs across VNU-HCM Urban Area
CREATE TABLE IF NOT EXISTS hubs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  campus_zone VARCHAR(100) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  total_parking_slots INT NOT NULL DEFAULT 0,
  total_charging_points INT NOT NULL DEFAULT 0,
  status ENUM('ACTIVE', 'NEAR_FULL', 'FULL', 'MAINTENANCE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Parking Slots per Hub
CREATE TABLE IF NOT EXISTS parking_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hub_id INT NOT NULL,
  slot_code VARCHAR(32) NOT NULL,
  slot_type ENUM('SHARED_EV', 'PRIVATE_EV', 'UNIVERSAL') NOT NULL DEFAULT 'UNIVERSAL',
  status ENUM('FREE', 'RESERVED', 'OCCUPIED', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'FREE',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hub_slot (hub_id, slot_code),
  CONSTRAINT fk_parking_hub FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Electric Vehicles (Shared Rental Fleet)
CREATE TABLE IF NOT EXISTS vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  type ENUM('ELECTRIC_BIKE', 'ELECTRIC_SCOOTER') NOT NULL,
  model VARCHAR(100) NOT NULL,
  current_hub_id INT NULL,
  parking_slot_id INT NULL,
  battery_level TINYINT UNSIGNED NOT NULL DEFAULT 100 CHECK (battery_level <= 100),
  estimated_range_km DECIMAL(5, 1) NOT NULL DEFAULT 45.0,
  status ENUM('AVAILABLE', 'RESERVED', 'IN_USE', 'CHARGING', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'AVAILABLE',
  last_telemetry_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_hub FOREIGN KEY (current_hub_id) REFERENCES hubs(id) ON DELETE SET NULL,
  CONSTRAINT fk_vehicle_slot FOREIGN KEY (parking_slot_id) REFERENCES parking_slots(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 5. Charging Points per Hub
CREATE TABLE IF NOT EXISTS charging_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hub_id INT NOT NULL,
  charger_code VARCHAR(32) NOT NULL,
  connector_type ENUM('TYPE_2', 'E_BIKE_DC', 'UNIVERSAL_AC') NOT NULL DEFAULT 'UNIVERSAL_AC',
  max_power_kw DECIMAL(5, 2) NOT NULL DEFAULT 3.50,
  status ENUM('AVAILABLE', 'RESERVED', 'CHARGING', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'AVAILABLE',
  current_vehicle_id INT NULL,
  priority_level ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hub_charger (hub_id, charger_code),
  CONSTRAINT fk_charger_hub FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE,
  CONSTRAINT fk_charger_vehicle FOREIGN KEY (current_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 6. Reservations (Vehicle Rental & Parking Space Booking — UC04..UC08)
CREATE TABLE IF NOT EXISTS reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_code VARCHAR(40) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  reservation_type ENUM('VEHICLE', 'PARKING') NOT NULL,
  hub_id INT NOT NULL,
  vehicle_id INT NULL,
  parking_slot_id INT NULL,
  return_hub_id INT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  actual_pickup_time DATETIME NULL,
  actual_return_time DATETIME NULL,
  return_condition_note VARCHAR(255) NULL,
  status ENUM('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_hub FOREIGN KEY (hub_id) REFERENCES hubs(id),
  CONSTRAINT fk_res_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  CONSTRAINT fk_res_slot FOREIGN KEY (parking_slot_id) REFERENCES parking_slots(id) ON DELETE SET NULL,
  CONSTRAINT fk_res_return_hub FOREIGN KEY (return_hub_id) REFERENCES hubs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 7. Charging Requests & Smart Queue (UC09 & UC15)
CREATE TABLE IF NOT EXISTS charging_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(40) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  ownership_type ENUM('RENTAL', 'PRIVATE') NOT NULL DEFAULT 'RENTAL',
  vehicle_id INT NULL,
  private_vehicle_label VARCHAR(100) NULL,
  hub_id INT NOT NULL,
  charging_point_id INT NULL,
  current_battery_level TINYINT UNSIGNED NOT NULL DEFAULT 30,
  target_battery_level TINYINT UNSIGNED NOT NULL DEFAULT 85,
  priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  scheduled_start DATETIME NOT NULL,
  scheduled_end DATETIME NOT NULL,
  queue_position INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('QUEUED', 'SCHEDULED', 'CHARGING', 'COMPLETED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chg_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  CONSTRAINT fk_chg_hub FOREIGN KEY (hub_id) REFERENCES hubs(id),
  CONSTRAINT fk_chg_point FOREIGN KEY (charging_point_id) REFERENCES charging_points(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 8. Operational Incidents (UC11 & UC12)
CREATE TABLE IF NOT EXISTS incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  incident_code VARCHAR(40) NOT NULL UNIQUE,
  reported_by INT NOT NULL,
  hub_id INT NOT NULL,
  target_type ENUM('VEHICLE', 'CHARGING_POINT', 'PARKING_SLOT', 'HUB') NOT NULL,
  vehicle_id INT NULL,
  charging_point_id INT NULL,
  parking_slot_id INT NULL,
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  resolution_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  CONSTRAINT fk_inc_reporter FOREIGN KEY (reported_by) REFERENCES users(id),
  CONSTRAINT fk_inc_hub FOREIGN KEY (hub_id) REFERENCES hubs(id),
  CONSTRAINT fk_inc_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  CONSTRAINT fk_inc_charger FOREIGN KEY (charging_point_id) REFERENCES charging_points(id) ON DELETE SET NULL,
  CONSTRAINT fk_inc_slot FOREIGN KEY (parking_slot_id) REFERENCES parking_slots(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 9. Vehicle Redistribution / Dispatch Orders (UC13)
CREATE TABLE IF NOT EXISTS dispatch_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(40) NOT NULL UNIQUE,
  operator_id INT NOT NULL,
  source_hub_id INT NOT NULL,
  destination_hub_id INT NOT NULL,
  vehicle_count INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NULL,
  status ENUM('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_disp_operator FOREIGN KEY (operator_id) REFERENCES users(id),
  CONSTRAINT fk_disp_src FOREIGN KEY (source_hub_id) REFERENCES hubs(id),
  CONSTRAINT fk_disp_dst FOREIGN KEY (destination_hub_id) REFERENCES hubs(id)
) ENGINE=InnoDB;

-- 10. What-If Simulation Scenario Templates & Saved Runs (UC16, UC17, UC18)
CREATE TABLE IF NOT EXISTS scenarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  scenario_type ENUM('DEMAND_SURGE', 'HUB_FULL', 'CHARGER_FAILURE', 'VEHICLE_IMBALANCE') NOT NULL,
  description TEXT NOT NULL,
  default_params JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
