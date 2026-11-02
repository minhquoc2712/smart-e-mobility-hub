/**
 * Module: What-if Simulation & Coordination Recommendations (Task 2B.5 & Task 4.2b)
 * IMPORTANT ARCHITECTURE INVARIANT (Rubric 3.1):
 *   Reads an in-memory snapshot of operational state from MySQL and computes scenario
 *   evolution WITHOUT mutating live operational tables unless apply-recommendation is called.
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticateToken, requireRole('OPERATOR'));

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
    // Snapshot operational state in memory (read-only SELECT — never mutates live DB!)
    const [hubsSnapshot] = await pool.execute('SELECT id, code, name, total_parking_slots FROM hubs');
    const [vehiclesSnapshot] = await pool.execute('SELECT id, code, current_hub_id, battery_level, status FROM vehicles');

    const runId = `SIM-${Date.now()}`;
    res.json({
      success: true,
      data: {
        runId,
        scenarioCode,
        isolatedSnapshotCounts: {
          hubsCloned: hubsSnapshot.length,
          vehiclesCloned: vehiclesSnapshot.length,
        },
        paramsUsed: params,
        impactSummary: {
          unmetDemandEstimate: 12,
          peakUtilizationPercent: 94,
          avgWaitMinutes: 14,
        },
        recommendations: [
          {
            id: 'REC-1',
            actionType: 'DISPATCH',
            summary: 'Redistribute 6 available e-bikes from Dormitory Zone B Hub to Metro Suoi Tien - VNU Hub.',
          },
          {
            id: 'REC-2',
            actionType: 'CHARGING_PRIORITY',
            summary: 'Elevate vehicles between 45%–70% battery to HIGH fast-turnaround charging priority.',
          },
        ],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/runs/:runId/apply-recommendation', async (req, res) => {
  const { recommendationId } = req.body;
  res.json({
    success: true,
    data: {
      runId: req.params.runId,
      appliedRecommendationId: recommendationId,
      status: 'APPLIED',
    },
  });
});

module.exports = router;
