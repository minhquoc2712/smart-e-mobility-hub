/**
 * Module: Charging Points (Task 3.1)
 *
 * GET   /charging-points                 ?hubId=&status=
 * GET   /charging-points/:chargerId
 * PATCH /charging-points/:chargerId/status   [OPERATOR]
 *       body: { "status": "CHARGING", "vehicleId": 3 }   (vehicleId tùy chọn)
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const controller = require('./charging-points.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:chargerId', controller.getOne);
router.patch('/:chargerId/status', authenticateToken, requireRole('OPERATOR'), controller.changeStatus);

module.exports = router;
