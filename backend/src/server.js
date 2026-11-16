require('dotenv').config();
const app = require('./app');
const { checkDatabaseConnection } = require('./config/db');

const PORT = Number(process.env.PORT || 4000);
const { expireVehicleHolds } = require('./modules/reservations/reservations.service');

async function bootstrap() {
  try {
    await checkDatabaseConnection();
    console.log('[MySQL] Connected to database successfully.');
  } catch (err) {
    console.warn(
      '[MySQL] Warning: Could not connect to MySQL yet. Check backend/.env and database/schema.sql.',
      err.message
    );
  }

  // Task 3.2b: expire unclaimed 15-minute rental holds every minute.
  // Skip overlapping runs and avoid bringing down the API on transient DB failures.
  let expirationRunning = false;
  const expirationTimer = setInterval(async () => {
    if (expirationRunning) return;
    expirationRunning = true;
    try { await expireVehicleHolds(); }
    catch (err) { console.error('[Reservation expiry job]', err.message); }
    finally { expirationRunning = false; }
  }, 60_000);
  expirationTimer.unref();

  app.listen(PORT, () => {
    console.log(`[Backend] Smart E-Mobility Hub API running at http://localhost:${PORT}/api/v1`);
  });
}

bootstrap();


/**

require('dotenv').config();
const app = require('./app');
const { checkDatabaseConnection } = require('./config/db');

const PORT = Number(process.env.PORT || 4000);

async function bootstrap() {
  try {
    await checkDatabaseConnection();
    console.log('[MySQL] Connected to database successfully.');
  } catch (err) {
    console.warn(
      '[MySQL] Warning: Could not connect to MySQL yet. Check backend/.env and database/schema.sql.',
      err.message
    );
  }

  app.listen(PORT, () => {
    console.log(`[Backend] Smart E-Mobility Hub API running at http://localhost:${PORT}/api/v1`);
  });
}

bootstrap();

**/