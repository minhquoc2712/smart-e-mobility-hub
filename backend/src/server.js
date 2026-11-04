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
