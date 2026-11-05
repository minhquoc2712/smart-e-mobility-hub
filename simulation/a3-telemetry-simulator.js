const mysql = require('mysql2/promise');


const API_URL = 'http://localhost:4000/api/v1/telemetry/ingest';
const SIMULATOR_KEY = 'local_dev_simulator_key';
const INTERVAL_MS = 15000; // Send data every 15 seconds

const DB_CONFIG = {
  host: '127.0.0.1',
  user: 'root',
  // password: 'root',
  database: 'smart_emobility_hub',
  port: 3306
};

async function startSimulator() {
  // 1. Connect to the MySQL database
  const connection = await mysql.createConnection(DB_CONFIG);

  console.log(`[A3 Simulator] Starting... Sending to ${API_URL} every ${INTERVAL_MS}ms`);

  // 2. Start the periodic loop
  setInterval(async () => {
    try {
      // Fetch current vehicles from the database using the new SQL schema
      const [vehicles] = await connection.execute(
        "SELECT code, battery_level, status FROM vehicles"
      );

      // Calculate realistic battery changes
      const vehicleUpdates = vehicles.map(v => {
        let newBattery = v.battery_level;
        
        // Increase battery if charging, decrease if in use or idle
        if (v.status === 'CHARGING') {
          newBattery = Math.min(100, newBattery + 5);
        } else if (v.status === 'IN_USE') {
          newBattery = Math.max(5, newBattery - 2);
        } else if (v.status === 'AVAILABLE' && Math.random() < 0.2) {
          newBattery = Math.max(5, newBattery - 1); // Slight drain while idle
        }

        return {
          vehicleCode: v.code,
          batteryLevel: newBattery
        };
      });

      // 3. Send the payload exactly as the backend API expects it
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          simulatorKey: SIMULATOR_KEY, 
          vehicleUpdates: vehicleUpdates 
        }),
      });
      
      const data = await res.json();
      console.log(`[A3 Simulator] Sent ${vehicleUpdates.length} updates -> API Status: ${res.status}`, data);

    } catch (err) {
      console.error('[A3 Simulator] Communication or DB error:', err.message);
    }
  }, INTERVAL_MS);
}

// Run the simulator
startSimulator().catch(console.error);