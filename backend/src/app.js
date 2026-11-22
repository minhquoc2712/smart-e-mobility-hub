const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const requestLogger = require('./middlewares/requestLogger.middleware');

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(requestLogger);
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'smart-emobility-hub-api', status: 'ok' });
});

app.use('/api/v1', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;