const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const hubsRoutes = require('../modules/hubs/hubs.routes');
const vehiclesRoutes = require('../modules/vehicles/vehicles.routes');
const parkingSlotsRoutes = require('../modules/parking-slots/parking-slots.routes');
const chargingPointsRoutes = require('../modules/charging-points/charging-points.routes');
const stateRoutes = require('../modules/state/state.routes');
const reservationsRoutes = require('../modules/reservations/reservations.routes');
const parkingReservationRoutes = require('../modules/reservations/parking.routes');
const rentalRoutes = require('../modules/reservations/rentals.routes');
const chargingRoutes = require('../modules/charging/charging.routes');
const operatorRoutes = require('../modules/operator/operator.routes');
const simulationRoutes = require('../modules/simulation/simulation.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/hubs', hubsRoutes);
router.use('/vehicles', vehiclesRoutes);
router.use('/parking-slots', parkingSlotsRoutes);
router.use('/charging-points', chargingPointsRoutes);
router.use('/state-machine', stateRoutes);
router.use('/reservations', reservationsRoutes);
router.use('/parking-reservations', parkingReservationRoutes);
router.use('/rentals', rentalRoutes);
router.use('/charging-requests', chargingRoutes);
router.use('/charging/requests', chargingRoutes);
router.post('/charging/schedule', require('../middlewares/auth.middleware').authenticateToken, require('../utils/asyncHandler')(async (req,res)=>{const data=await require('../modules/charging/charging.service').schedule(req.user,req.body);res.status(201).json({success:true,data});}));
router.use('/', operatorRoutes); // mounts /operator/dashboard, /incidents, /dispatch, /telemetry
router.use('/simulations', simulationRoutes);

module.exports = router;




/** const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const hubsRoutes = require('../modules/hubs/hubs.routes');
const vehiclesRoutes = require('../modules/vehicles/vehicles.routes');
const parkingSlotsRoutes = require('../modules/parking-slots/parking-slots.routes');
const chargingPointsRoutes = require('../modules/charging-points/charging-points.routes');
const stateRoutes = require('../modules/state/state.routes');
const reservationsRoutes = require('../modules/reservations/reservations.routes');
const chargingRoutes = require('../modules/charging/charging.routes');
const operatorRoutes = require('../modules/operator/operator.routes');
const simulationRoutes = require('../modules/simulation/simulation.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/hubs', hubsRoutes);
router.use('/vehicles', vehiclesRoutes);
router.use('/parking-slots', parkingSlotsRoutes);
router.use('/charging-points', chargingPointsRoutes);
router.use('/state-machine', stateRoutes);
router.use('/reservations', reservationsRoutes);
router.use('/charging-requests', chargingRoutes);
router.use('/', operatorRoutes); // mounts /operator/dashboard, /incidents, /dispatch, /telemetry
router.use('/simulations', simulationRoutes);

module.exports = router;

**/