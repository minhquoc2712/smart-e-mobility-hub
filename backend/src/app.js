const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');
const { requestLogger, notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / server-to-server / CLI requests
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes(origin)) return callback(null, true);
      // In development, allow local LAN/Hotspot mobile devices accessing Vite dev server
      if (
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(
          origin
        )
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
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
