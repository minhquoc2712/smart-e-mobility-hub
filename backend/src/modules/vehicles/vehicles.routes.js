/**
 * Module: Vehicles & Availability Check (Task 3.1)
 * UC02 (Search rental vehicles), UC04a (Check availability).
 *
 * GET   /vehicles                     ?hubId=&type=&minBattery=&status=
 * GET   /vehicles/:vehicleId
 * GET   /vehicles/:vehicleId/availability
 * PATCH /vehicles/:vehicleId/status   [OPERATOR] body: { "status": "OUT_OF_SERVICE" }
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const controller = require('./vehicles.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:vehicleId', controller.getOne);
router.get('/:vehicleId/availability', controller.availability);
router.patch('/:vehicleId/status', authenticateToken, requireRole('OPERATOR'), controller.changeStatus);

module.exports = router;
