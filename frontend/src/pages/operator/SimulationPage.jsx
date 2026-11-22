import React, { useEffect, useState } from 'react';
import { operatorApi, simulationApi } from '../../api';

const SCENARIO_DEFAULTS = {
  'SCN-METRO-SURGE': { targetHubCode: 'HUB-METRO-VNU', extraDemandRequests: 45 },
  'SCN-DORMB-FULL': { targetHubCode: 'HUB-DORM-B', incomingReturns: 18 },
  'SCN-CHARGER-OUTAGE': { targetHubCode: 'HUB-CENTRAL', failedChargersCount: 4 },
  'SCN-FLEET-IMBALANCE': { surplusHubCode: 'HUB-DORM-B', deficitHubCode: 'HUB-BK-GATE1' },
};

const METRIC_LABELS = {
  sourceHubAvailableVehicles: 'Source Hub Available',
  destinationHubAvailableVehicles: 'Destination Hub Available',
  requestedVehicles: 'Requested Vehicles',
  fulfilledRequests: 'Fulfilled Requests',
  unmetDemandEstimate: 'Unmet Demand',
  peakUtilizationPercent: 'Peak Utilization (%)',
  incomingVehicles: 'Incoming Vehicles',
  availableSlots: 'Available Parking Slots',
  strandedVehicles: 'Stranded Vehicles',
  chargersDisabled: 'Chargers Disabled',
  remainingOperational: 'Remaining Operational',
  impactOnChargingQueue: 'Charging Queue Impact',
  surplusHubAvailableVehicles: 'Surplus Hub Available',
  deficitHubAvailableVehicles: 'Deficit Hub Available',
  imbalanceSeverity: 'Imbalance Severity',
};

/**
 * Staff / What-if (Task 4.2a & 4.2b — Thùy Trang & Nils Bousquet)
 * Evaluates isolated snapshot state evolution via Backend Simulation Engine
 * (`/api/v1/simulations/scenarios` & `/api/v1/simulations/run`) without mutating live operational data.
 */
export function SimulationPage() {
  const [hubs, setHubs] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioCode, setSelectedScenarioCode] = useState('SCN-METRO-SURGE');

  // Dynamic parameters matching backend simulation.routes.js
  const [targetHubCode, setTargetHubCode] = useState('HUB-METRO-VNU');
  const [surplusHubCode, setSurplusHubCode] = useState('HUB-DORM-B');
  const [deficitHubCode, setDeficitHubCode] = useState('HUB-BK-GATE1');
  const [extraDemandRequests, setExtraDemandRequests] = useState(45);
  const [incomingReturns, setIncomingReturns] = useState(18);
  const [failedChargersCount, setFailedChargersCount] = useState(4);

  const [engineResult, setEngineResult] = useState(null);
  const [appliedRecIds, setAppliedRecIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    operatorApi.getDashboardBundle().then((bundle) => {
      const list = bundle?.hubUtilization?.hubs || [];
      setHubs(list);
    });

    simulationApi
      .getScenarios()
      .then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setScenarios(rows);
          handleScenarioChange(rows[0].code);
        }
      })
      .catch(() => {});
  }, []);

  const handleScenarioChange = (code) => {
    setSelectedScenarioCode(code);
    setEngineResult(null);
    setError(null);
    setAppliedRecIds([]);

    const defaults = SCENARIO_DEFAULTS[code];
    if (!defaults) return;
    if (defaults.targetHubCode) setTargetHubCode(defaults.targetHubCode);
    if (defaults.surplusHubCode) setSurplusHubCode(defaults.surplusHubCode);
    if (defaults.deficitHubCode) setDeficitHubCode(defaults.deficitHubCode);
    if (defaults.extraDemandRequests !== undefined) setExtraDemandRequests(defaults.extraDemandRequests);
    if (defaults.incomingReturns !== undefined) setIncomingReturns(defaults.incomingReturns);
    if (defaults.failedChargersCount !== undefined) setFailedChargersCount(defaults.failedChargersCount);
  };

  const buildParams = () => {
    switch (selectedScenarioCode) {
      case 'SCN-METRO-SURGE':
        return { targetHubCode: 'HUB-METRO-VNU', extraDemandRequests: Number(extraDemandRequests) || 0 };
      case 'SCN-DORMB-FULL':
        return { targetHubCode: 'HUB-DORM-B', incomingReturns: Number(incomingReturns) || 0 };
      case 'SCN-CHARGER-OUTAGE':
        return { targetHubCode, failedChargersCount: Number(failedChargersCount) || 0 };
      case 'SCN-FLEET-IMBALANCE':
        return { surplusHubCode, deficitHubCode };
      default:
        return {};
    }
  };

  const handleRunScenario = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setAppliedRecIds([]);
      const res = await simulationApi.runSimulation({
        scenarioCode: selectedScenarioCode,
        params: buildParams(),
      });
      setEngineResult(res);
    } catch (err) {
      setError(err?.message || 'Failed to run simulation.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRecommendation = async (recId) => {
    if (!engineResult?.runId || appliedRecIds.includes(recId)) return;
    try {
      await simulationApi.applyRecommendation(engineResult.runId, recId);
    } finally {
      setAppliedRecIds((prev) => [...prev, recId]);
    }
  };

  const activeScenario = scenarios.find((s) => s.code === selectedScenarioCode);

  return (
    <>
      <h1 className="staff-page-title">What-if</h1>

      <form onSubmit={handleRunScenario} className="staff-panel staff-panel--narrow">
        {scenarios.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>
              Simulation scenario
            </label>
            <select
              className="staff-field-green"
              value={selectedScenarioCode}
              onChange={(e) => handleScenarioChange(e.target.value)}
            >
              {scenarios.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            {activeScenario?.description && (
              <span style={{ fontSize: 14, color: 'var(--staff-olive)' }}>
                {activeScenario.description}
              </span>
            )}
          </div>
        )}

        {/* Dynamic inputs depending on the selected scenario */}
        {selectedScenarioCode === 'SCN-FLEET-IMBALANCE' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Source hub</label>
              <select
                className="staff-field-green"
                value={surplusHubCode}
                onChange={(e) => setSurplusHubCode(e.target.value)}
              >
                {hubs.map((h) => (
                  <option key={h.code} value={h.code}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Destination hub</label>
              <select
                className="staff-field-green"
                value={deficitHubCode}
                onChange={(e) => setDeficitHubCode(e.target.value)}
              >
                {hubs.map((h) => (
                  <option key={h.code} value={h.code}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 24,
            }}
          >
            {selectedScenarioCode === 'SCN-CHARGER-OUTAGE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Target hub</label>
                <select
                  className="staff-field-green"
                  value={targetHubCode}
                  onChange={(e) => setTargetHubCode(e.target.value)}
                >
                  {hubs.map((h) => (
                    <option key={h.code} value={h.code}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedScenarioCode === 'SCN-METRO-SURGE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>
                  Extra demand requests
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="staff-field-green"
                  value={extraDemandRequests}
                  onChange={(e) => setExtraDemandRequests(e.target.value)}
                />
              </div>
            )}

            {selectedScenarioCode === 'SCN-DORMB-FULL' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>
                  Incoming vehicle returns
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="staff-field-green"
                  value={incomingReturns}
                  onChange={(e) => setIncomingReturns(e.target.value)}
                />
              </div>
            )}

            {selectedScenarioCode === 'SCN-CHARGER-OUTAGE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>
                  Failed chargers count
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="staff-field-green"
                  value={failedChargersCount}
                  onChange={(e) => setFailedChargersCount(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <div>
          <button type="submit" className="staff-pill-btn" disabled={loading}>
            {loading ? 'Running simulation...' : 'Run scenario'}
          </button>
        </div>

        {error && (
          <div style={{ color: '#c62828', fontSize: 15, fontWeight: 500 }}>{error}</div>
        )}

        {engineResult && (
          <div
            style={{
              background: '#ffffff',
              border: '1.5px solid #34c759',
              borderRadius: 16,
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 17.5, color: 'var(--staff-forest)' }}>
                Backend Simulation Engine · {engineResult.runId}
              </strong>
              {engineResult.isolatedSnapshotCounts && (
                <span style={{ fontSize: 13, color: 'var(--staff-olive)' }}>
                  Snapshot cloned: {engineResult.isolatedSnapshotCounts.hubsCloned} hubs ·{' '}
                  {engineResult.isolatedSnapshotCounts.vehiclesCloned} vehicles ·{' '}
                  {engineResult.isolatedSnapshotCounts.chargersCloned} chargers (Read-only)
                </span>
              )}
            </div>

            {engineResult.impactSummary && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: 10,
                  background: 'var(--staff-pill)',
                  padding: '12px 14px',
                  borderRadius: 12,
                }}
              >
                {Object.entries(engineResult.impactSummary).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 12.5, color: 'var(--staff-olive)' }}>
                      {METRIC_LABELS[k] || k}
                    </div>
                    <strong style={{ fontSize: 16, color: 'var(--staff-forest)' }}>
                      {String(v)}
                    </strong>
                  </div>
                ))}
              </div>
            )}

            {Array.isArray(engineResult.recommendations) && engineResult.recommendations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--staff-forest)' }}>
                  System recommendations:
                </div>
                {engineResult.recommendations.map((rec) => {
                  const isApplied = appliedRecIds.includes(rec.id);
                  return (
                    <div
                      key={rec.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        background: 'var(--staff-pill)',
                        padding: '10px 14px',
                        borderRadius: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: 14.5, color: 'var(--staff-ink)' }}>
                        <strong>[{rec.actionType}]</strong> {rec.summary}
                      </span>
                      <button
                        type="button"
                        className="staff-mini-link"
                        style={{ background: '#cdf4cf', fontWeight: 600 }}
                        onClick={() => handleApplyRecommendation(rec.id)}
                        disabled={isApplied}
                      >
                        {isApplied ? '✓ Applied' : 'Apply recommendation'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 14.5, color: 'var(--staff-olive)' }}>
                No critical impact detected — no action required.
              </div>
            )}
          </div>
        )}
      </form>
    </>
  );
}