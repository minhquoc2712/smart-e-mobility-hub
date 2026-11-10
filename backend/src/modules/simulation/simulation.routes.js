const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');

const router = express.Router();

// router.use(authenticateToken, requireRole('OPERATOR'));

router.get('/scenarios', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM scenarios ORDER BY id ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/run', async (req, res, next) => {
  try {
    const { scenarioCode, params = {} } = req.body;

    // 1. Snapshot operational state in memory (read-only)
    const [hubsSnapshot] = await pool.execute('SELECT id, code, name, total_parking_slots, total_charging_points FROM hubs');
    const [vehiclesSnapshot] = await pool.execute('SELECT id, code, current_hub_id, battery_level, status FROM vehicles');
    const [chargersSnapshot] = await pool.execute('SELECT id, hub_id, status FROM charging_points');

    // Deep copy for simulation
    const simState = {
      hubs: JSON.parse(JSON.stringify(hubsSnapshot)),
      vehicles: JSON.parse(JSON.stringify(vehiclesSnapshot)),
      chargers: JSON.parse(JSON.stringify(chargersSnapshot))
    };

    let impactSummary = {};
    let recommendations = [];

    // 2. Scenario Evolution & Impact Calculus
    switch (scenarioCode) {
      case 'SCN-METRO-SURGE': {
        const targetHubCode = params.targetHubCode || 'HUB-METRO-VNU';
        const demand = params.extraDemandRequests || 45;

        const targetHub = simState.hubs.find(h => h.code === targetHubCode);
        if (!targetHub) throw new Error('Hub not found');

        const availableVehicles = simState.vehicles.filter(v => v.current_hub_id === targetHub.id && v.status === 'AVAILABLE');
        const unmetDemand = Math.max(0, demand - availableVehicles.length);
        const fulfilled = Math.min(demand, availableVehicles.length);

        impactSummary = {
          requestedVehicles: demand,
          fulfilledRequests: fulfilled,
          unmetDemandEstimate: unmetDemand,
          peakUtilizationPercent: Math.round(((simState.vehicles.filter(v => v.current_hub_id === targetHub.id).length - availableVehicles.length + fulfilled) / Math.max(1, simState.vehicles.filter(v => v.current_hub_id === targetHub.id).length)) * 100),
        };

        if (unmetDemand > 0) {
          recommendations.push({
            id: `REC-${Date.now()}-1`,
            actionType: 'DISPATCH',
            summary: `Redistribute ${unmetDemand} available vehicles to ${targetHub.name} to meet metro surge demand.`
          });
        }
        break;
      }

      case 'SCN-DORMB-FULL': {
        const targetHubCode = params.targetHubCode || 'HUB-DORM-B';
        const incoming = params.incomingReturns || 18;

        const targetHub = simState.hubs.find(h => h.code === targetHubCode);
        if (!targetHub) throw new Error('Hub not found');

        const parkedVehicles = simState.vehicles.filter(v => v.current_hub_id === targetHub.id && v.status !== 'IN_USE');
        const availableSlots = targetHub.total_parking_slots - parkedVehicles.length;

        const stranded = Math.max(0, incoming - availableSlots);

        impactSummary = {
          incomingVehicles: incoming,
          availableSlots: availableSlots,
          strandedVehicles: stranded,
          peakUtilizationPercent: 100
        };

        if (stranded > 0) {
          recommendations.push({ id: `REC-${Date.now()}-1`, actionType: 'REROUTE_USERS', summary: `Reroute ${stranded} incoming users from ${targetHub.name} to Central Library Hub.` });
          recommendations.push({ id: `REC-${Date.now()}-2`, actionType: 'DISPATCH', summary: `Dispatch a collection truck to ${targetHub.name} to remove ${stranded} vehicles.` });
        }
        break;
      }

      case 'SCN-CHARGER-OUTAGE': {
        const targetHubCode = params.targetHubCode || 'HUB-CENTRAL';
        const brokenCount = params.failedChargersCount || 4;

        const targetHub = simState.hubs.find(h => h.code === targetHubCode);
        if (!targetHub) throw new Error('Hub not found');

        const activeChargers = simState.chargers.filter(c => c.hub_id === targetHub.id && c.status === 'AVAILABLE');
        const broken = Math.min(brokenCount, activeChargers.length);
        const remaining = activeChargers.length - broken;

        impactSummary = { chargersDisabled: broken, remainingOperational: remaining, impactOnChargingQueue: 'HIGH' };

        if (broken > 0) {
          recommendations.push({ id: `REC-${Date.now()}-1`, actionType: 'MAINTENANCE_TICKET', summary: `Generate CRITICAL incident for ${broken} broken charging points at ${targetHub.name}.` });
        }
        break;
      }

      case 'SCN-FLEET-IMBALANCE': {
        const surplusHubCode = params.surplusHubCode || 'HUB-DORM-B';
        const deficitHubCode = params.deficitHubCode || 'HUB-BK-GATE1';

        const surplusHub = simState.hubs.find(h => h.code === surplusHubCode);
        const deficitHub = simState.hubs.find(h => h.code === deficitHubCode);

        const surplusAvailable = simState.vehicles.filter(v => v.current_hub_id === surplusHub.id && v.status === 'AVAILABLE').length;
        const deficitAvailable = simState.vehicles.filter(v => v.current_hub_id === deficitHub.id && v.status === 'AVAILABLE').length;

        impactSummary = { 
          surplusHubAvailableVehicles: surplusAvailable, 
          deficitHubAvailableVehicles: deficitAvailable,
          imbalanceSeverity: 'CRITICAL' 
        };

        recommendations.push({ id: `REC-${Date.now()}-1`, actionType: 'DISPATCH', summary: `Transfer 10 vehicles from ${surplusHub.name} to ${deficitHub.name} to resolve imbalance.` });
        break;
      }

      default:
        return res.status(400).json({ success: false, error: { message: `Unsupported scenarioCode: ${scenarioCode}` } });
    }

    res.json({
      success: true,
      data: {
        runId: `SIM-${Date.now()}`,
        scenarioCode,
        isolatedSnapshotCounts: { hubsCloned: simState.hubs.length, vehiclesCloned: simState.vehicles.length, chargersCloned: simState.chargers.length },
        paramsUsed: params,
        impactSummary,
        recommendations,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/runs/:runId/apply-recommendation', async (req, res) => {
  const { recommendationId } = req.body;
  res.json({ success: true, data: { runId: req.params.runId, appliedRecommendationId: recommendationId, status: 'APPLIED' } });
});

module.exports = router;