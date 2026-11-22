const express = require('express');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const { pool } = require('../../config/db');
const wrap = require('../../utils/asyncHandler');
const service = require('./charging.service');
const AppError = require('../../utils/appError');
const { validateRequest: validate } = require('../../middlewares/validateRequest.middleware');
const { withTransaction } = require('../../utils/transaction');
const { parseId } = require('../../utils/validators');

const router = express.Router();
router.use(authenticateToken);

router.get('/', wrap(async (req, res) => res.json({ success: true, data: await service.list(req.user) })));
router.get('/:requestId', wrap(async (req, res) => res.json({ success: true, data: await service.detail(req.user, req.params.requestId) })));
router.post('/', validate('charging'), wrap(async (req, res) => res.status(201).json({ success: true, data: await service.schedule(req.user, req.body) })));
router.delete('/:requestId', wrap(async (req, res) => res.json({ success: true, data: await service.cancelRequest(req.user, req.params.requestId) })));
router.post('/:requestId/start', requireRole('OPERATOR'), wrap(async(req,res)=>res.json({success:true,data:await service.startCharging(req.user,req.params.requestId)})));
router.post('/:requestId/stop', requireRole('OPERATOR'), wrap(async(req,res)=>res.json({success:true,data:await service.stopCharging(req.user,req.params.requestId)})));
router.post('/:requestId/cancel', wrap(async(req,res)=>res.json({success:true,data:await service.cancelRequest(req.user,req.params.requestId)})));

// Priority belongs to the shared/operator charging workflow.
// Lock the request and its hub, update request + charger atomically.
router.patch('/:requestId/priority', requireRole('OPERATOR'), validate('priority'), wrap(async (req, res) => {
  const id = parseId(req.params.requestId, 'requestId');
  const data = await withTransaction(async (conn) => {
    const [[meta]] = await conn.execute('SELECT hub_id FROM charging_requests WHERE id=?', [id]);
    if (!meta) throw new AppError(404, 'CHARGING_REQUEST_NOT_FOUND', 'Request not found.');
    await conn.execute('SELECT id FROM hubs WHERE id=? FOR UPDATE', [meta.hub_id]);
    const [[row]] = await conn.execute('SELECT * FROM charging_requests WHERE id=? FOR UPDATE', [id]);
    if (!row || !['QUEUED', 'SCHEDULED', 'CHARGING'].includes(row.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only an active charging request can change priority.');
    }
    await conn.execute('UPDATE charging_requests SET priority=? WHERE id=?', [req.body.priority, id]);
    if (row.charging_point_id) {
      // An assigned charger can share its timeline with multiple reservations.
      // Only mark the charger's immediate priority when this request is charging.
      if (row.status === 'CHARGING') {
        await conn.execute('UPDATE charging_points SET priority_level=? WHERE id=?', [req.body.priority, row.charging_point_id]);
      }
    }
    return { id, priority: req.body.priority };
  });
  res.json({ success: true, data });
}));

module.exports = router;