import React, { useCallback, useEffect, useState } from 'react';
import { operatorApi, simulationApi } from '../../api';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState, describeApiError } from '../../components/common/ErrorState';

/**
 * Staff / What-if (Task 4.2a & 4.2b — Thùy Trang & Nils Bousquet)
 * Evaluates isolated snapshot state evolution via Backend Simulation Engine
 * (`/api/v1/simulations/scenarios` & `/api/v1/simulations/run`) without mutating live operational data.
 */
export function SimulationPage() {
  const [hubs, setHubs] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioCode, setSelectedScenarioCode] = useState('SCN-FLEET-IMBALANCE');
  const [sourceHubId, setSourceHubId] = useState(2);
  const [destinationHubId, setDestinationHubId] = useState(1);
  const [vehiclesToMove, setVehiclesToMove] = useState(4);
  const [simOutcome, setSimOutcome] = useState(null);
  const [engineResult, setEngineResult] = useState(null);
  const [appliedRecId, setAppliedRecId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [runError, setRunError] = useState('');
  const [applyError, setApplyError] = useState('');

  const loadSimulationData = useCallback(() => {
    setInitialLoading(true);
    setLoadError(null);

    const bundleRequest = operatorApi.getDashboardBundle().then((bundle) => {
      const list = bundle?.hubUtilization?.hubs || [];
      setHubs(list);
      if (list.length >= 2) {
        const src = list[1];
        const dst = list[0];
        setSourceHubId(src.id);
        setDestinationHubId(dst.id);
        const move = Math.min(4, src.availableVehicles);
        setSimOutcome({
          sourceName: src.name,
          destName: dst.name,
          beforeSrc: src.availableVehicles,
          afterSrc: Math.max(0, src.availableVehicles - move),
          beforeDst: dst.availableVehicles,
          afterDst: dst.availableVehicles + move,
        });
      }
    });

    const scenariosRequest = simulationApi
      .getScenarios()
      .then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setScenarios(rows);
          setSelectedScenarioCode(rows[0].code);
        }
      });

    return Promise.all([bundleRequest, scenariosRequest])
      .catch((err) => setLoadError(err))
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    loadSimulationData();
  }, [loadSimulationData]);

  const handleRunScenario = async (e) => {
    e.preventDefault();
    const src = hubs.find((h) => h.id === Number(sourceHubId));
    const dst = hubs.find((h) => h.id === Number(destinationHubId));
    if (src && dst) {
      const requested = Math.max(0, Number(vehiclesToMove) || 0);
      const actualMoved = Math.min(requested, src.availableVehicles);
      setSimOutcome({
        sourceName: src.name,
        destName: dst.name,
        beforeSrc: src.availableVehicles,
        afterSrc: src.availableVehicles - actualMoved,
        beforeDst: dst.availableVehicles,
        afterDst: dst.availableVehicles + actualMoved,
      });
    }

    try {
      setLoading(true);
      setAppliedRecId(null);
      setRunError('');
      setApplyError('');
      const res = await simulationApi.runSimulation({
        scenarioCode: selectedScenarioCode,
        params: {
          surplusHubCode: src?.code || 'HUB-CENTRAL',
          deficitHubCode: dst?.code || 'HUB-BK-GATE1',
          targetHubCode: dst?.code || 'HUB-METRO-VNU',
          extraDemandRequests: Number(vehiclesToMove) * 10 || 40,
          incomingReturns: Number(vehiclesToMove) * 4 || 16,
          failedChargersCount: Math.max(1, Number(vehiclesToMove) || 2),
        },
      });
      setEngineResult(res);
    } catch (err) {
      // The local before/after preview above is still shown; the engine result is not.
      setEngineResult(null);
      setRunError(describeApiError(err, 'The simulation engine could not run this scenario.'));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRecommendation = async (recId) => {
    if (!engineResult?.runId) return;
    try {
      setApplyError('');
      await simulationApi.applyRecommendation(engineResult.runId, recId);
      setAppliedRecId(recId);
    } catch (err) {
      // Do not mark it as applied: live data was not changed.
      setApplyError(describeApiError(err, 'Could not apply this recommendation.'));
    }
  };

  const activeScenario = scenarios.find((s) => s.code === selectedScenarioCode);

  return (
    <>
      <h1 className="staff-page-title">What-if</h1>

      {initialLoading && <LoadingState message="Loading hubs and simulation scenarios…" />}
      {loadError && (
        <ErrorState title="Unable to load simulation data" error={loadError} onRetry={loadSimulationData} />
      )}
      {runError && <ErrorState inline error={runError} />}
      {applyError && <ErrorState inline error={applyError} />}

      <form onSubmit={handleRunScenario} className="staff-panel staff-panel--narrow">
        {scenarios.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>
              Simulation scenario (Task 4.2b Engine)
            </label>
            <select
              className="staff-field-green"
              value={selectedScenarioCode}
              onChange={(e) => setSelectedScenarioCode(e.target.value)}
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
              value={sourceHubId}
              onChange={(e) => setSourceHubId(Number(e.target.value))}
            >
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Destination hub</label>
            <select
              className="staff-field-green"
              value={destinationHubId}
              onChange={(e) => setDestinationHubId(Number(e.target.value))}
            >
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Vehicles to move</label>
          <input
            type="number"
            min={1}
            max={30}
            className="staff-field-green"
            value={vehiclesToMove}
            onChange={(e) => setVehiclesToMove(e.target.value)}
          />
        </div>

        <div>
          <button type="submit" className="staff-pill-btn" disabled={loading}>
            {loading ? 'Running simulation...' : 'Run scenario'}
          </button>
        </div>

        {simOutcome && (
          <div
            style={{
              background: 'var(--staff-pill)',
              borderRadius: 16,
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Hypothetical sample results
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 0.7fr 0.7fr',
                color: 'var(--staff-muted)',
                fontSize: 16,
              }}
            >
              <span>Available vehicles</span>
              <span>Before</span>
              <span>After</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 0.7fr 0.7fr',
                fontSize: 18,
                color: 'var(--staff-ink)',
                paddingTop: 4,
              }}
            >
              <span>{simOutcome.sourceName}</span>
              <span>{simOutcome.beforeSrc}</span>
              <span>{simOutcome.afterSrc}</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 0.7fr 0.7fr',
                fontSize: 18,
                color: 'var(--staff-ink)',
              }}
            >
              <span>{simOutcome.destName}</span>
              <span>{simOutcome.beforeDst}</span>
              <span>{simOutcome.afterDst}</span>
            </div>
          </div>
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
              gap: 12,
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
                    <div style={{ fontSize: 12.5, color: 'var(--staff-olive)' }}>{k}</div>
                    <strong style={{ fontSize: 16, color: 'var(--staff-forest)' }}>{String(v)}</strong>
                  </div>
                ))}
              </div>
            )}

            {Array.isArray(engineResult.recommendations) && engineResult.recommendations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--staff-forest)' }}>
                  System recommendations:
                </div>
                {engineResult.recommendations.map((rec) => (
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
                    >
                      {appliedRecId === rec.id ? '✓ Applied' : 'Apply recommendation'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </>
  );
}
