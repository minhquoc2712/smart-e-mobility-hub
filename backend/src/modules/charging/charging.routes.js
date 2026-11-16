const express = require('express');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const { pool } = require('../../config/db');
const wrap = require('../../utils/asyncHandler');
const service = require('./charging.service');
const AppError = require('../../utils/appError');

const router = express.Router();
router.use(authenticateToken);

router.get('/', wrap(async (req, res) => res.json({ success: true, data: await service.list(req.user) })));
router.get('/:requestId', wrap(async (req, res) => res.json({ success: true, data: await service.detail(req.user, req.params.requestId) })));
router.post('/', wrap(async (req, res) => res.status(201).json({ success: true, data: await service.schedule(req.user, req.body) })));
router.delete('/:requestId', wrap(async (req, res) => res.json({ success: true, data: await service.cancelRequest(req.user, req.params.requestId) })));

// Priority belongs to the shared/operator charging workflow
router.patch('/:requestId/priority', requireRole('OPERATOR'), wrap(async (req, res) => {
  const allowed = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
  if (!allowed.includes(req.body.priority)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Invalid priority.');
  }
  const [rows] = await pool.execute('SELECT id, charging_point_id FROM charging_requests WHERE id = ?', [
    req.params.requestId,
  ]);
  if (!rows.length) {
    throw new AppError(404, 'CHARGING_REQUEST_NOT_FOUND', 'Request not found.');
  }
  await pool.execute('UPDATE charging_requests SET priority = ? WHERE id = ?', [
    req.body.priority,
    req.params.requestId,
  ]);
  if (rows[0].charging_point_id) {
    await pool.execute('UPDATE charging_points SET priority_level = ? WHERE id = ?', [
      req.body.priority,
      rows[0].charging_point_id,
    ]);
  }
  res.json({ success: true, data: { id: Number(req.params.requestId), priority: req.body.priority } });
}));

module.exports = router;
