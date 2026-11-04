/**
 * Module: Parking Slots (Task 3.1)
 *
 * GET   /parking-slots              ?hubId=&status=&slotType=
 * GET   /parking-slots/:slotId
 * PATCH /parking-slots/:slotId/status   [OPERATOR] body: { "status": "OCCUPIED" }
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const controller = require('./parking-slots.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:slotId', controller.getOne);
router.patch('/:slotId/status', authenticateToken, requireRole('OPERATOR'), controller.changeStatus);

module.exports = router;
