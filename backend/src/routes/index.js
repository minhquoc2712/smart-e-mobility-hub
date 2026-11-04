const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const hubsRoutes = require('../modules/hubs/hubs.routes');
const vehiclesRoutes = require('../modules/vehicles/vehicles.routes');
const reservationsRoutes = require('../modules/reservations/reservations.routes');
const chargingRoutes = require('../modules/charging/charging.routes');
const operatorRoutes = require('../modules/operator/operator.routes');
const simulationRoutes = require('../modules/simulation/simulation.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/hubs', hubsRoutes);
router.use('/vehicles', vehiclesRoutes);
router.use('/reservations', reservationsRoutes);
router.use('/charging-requests', chargingRoutes);
router.use('/', operatorRoutes); // mounts /operator/dashboard, /incidents, /dispatch, /telemetry
router.use('/simulations', simulationRoutes);

module.exports = router;
