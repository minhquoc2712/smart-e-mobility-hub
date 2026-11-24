const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');
const { requestLogger, notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(requestLogger);
app.use(express.json());
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(new (require('./utils/appError'))(400, 'VALIDATION_FAILED', 'Request body must be a JSON object.'));
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'smart-emobility-hub-api', status: 'ok' });
});

app.use('/api/v1', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;