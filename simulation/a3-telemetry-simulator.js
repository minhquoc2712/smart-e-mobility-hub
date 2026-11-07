const INGEST_URL = process.env.API_URL || 'http://localhost:4000/api/v1/telemetry/ingest';
const VEHICLES_URL = 'http://localhost:4000/api/v1/vehicles';
const SIMULATOR_KEY = process.env.SIMULATOR_API_KEY || 'local_dev_simulator_key';
const INTERVAL_MS = 15000; // Send data every 15 seconds

async function startSimulator() {
  console.log(`[A3 Simulator] Starting... Sending to ${INGEST_URL} every ${INTERVAL_MS}ms`);

  // Start the periodic loop
  setInterval(async () => {
    try {
      // 1. Fetch current vehicles from the API instead of the database
      const vehiclesRes = await fetch(VEHICLES_URL);
      if (!vehiclesRes.ok) {
        throw new Error(`Failed to fetch vehicles (HTTP ${vehiclesRes.status})`);
      }
      
      const responseData = await vehiclesRes.json();
      // Handle cases where API returns { data: [...] } or just an array [...]
      const vehicles = responseData.data || responseData;
      
      
      //console.log("Données reçues du backend :", vehicles[0]);
      // 2. Calculate realistic battery changes
      const vehicleUpdates = vehicles.map(v => {
        // Check for both camelCase and snake_case depending on API response format
        let currentBattery = v.batteryLevel !== undefined ? v.batteryLevel : v.battery_level;
        
        // Fallback to prevent ER_BAD_NULL_ERROR if API didn't return battery info
        if (currentBattery === undefined || currentBattery === null) {
          currentBattery = 100;
        }

        let newBattery = Number(currentBattery);
        
        // Increase battery if charging, decrease if in use or idle
        if (v.status === 'CHARGING') {
          newBattery = Math.min(100, newBattery + 5);
        } else if (v.status === 'IN_USE') {
          newBattery = Math.max(5, newBattery - 2);
        } else if (v.status === 'AVAILABLE' && Math.random() < 0.2) {
          newBattery = Math.max(5, newBattery - 1); // Slight drain while idle
        }

        // Support both code and vehicleCode from API
        const vehicleCode = v.code || v.vehicleCode;

        return {
          vehicleCode: vehicleCode,
          batteryLevel: newBattery
        };
      });

      // 3. Send the payload exactly as the backend API expects it
      const res = await fetch(INGEST_URL, {
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
      console.error('[A3 Simulator] Communication error:', err.message);
    }
  }, INTERVAL_MS);
}

// Run the simulator
startSimulator().catch(console.error);