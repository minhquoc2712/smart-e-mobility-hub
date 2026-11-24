const express = require('express');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const { withTransaction } = require('../../utils/transaction');
const { parseId } = require('../../utils/validators');
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
  const requestId = parseId(req.params.requestId, 'requestId');
  await withTransaction(async (c) => {
    const [rows] = await c.execute('SELECT id, charging_point_id, status FROM charging_requests WHERE id = ? FOR UPDATE', [requestId]);
    if (!rows.length) {
      throw new AppError(404, 'CHARGING_REQUEST_NOT_FOUND', 'Request not found.');
    }
    if (!['QUEUED','SCHEDULED','CHARGING'].includes(rows[0].status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Request is no longer active.');
    await c.execute('UPDATE charging_requests SET priority = ? WHERE id = ?', [
      req.body.priority,
      req.params.requestId,
    ]);
    if (rows[0].charging_point_id) {
      await c.execute('UPDATE charging_points SET priority_level = ? WHERE id = ?', [
        req.body.priority,
        rows[0].charging_point_id,
      ]);
    }
  });
  res.json({ success: true, data: { id: requestId, priority: req.body.priority } });
}));

module.exports = router;