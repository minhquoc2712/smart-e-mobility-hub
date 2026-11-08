import React, { useEffect, useState } from 'react';
import { operatorApi } from '../../api';

/**
 * Staff / What-if (Figma screen: Source hub, Destination hub, Vehicles to move, Hypothetical sample results)
 * Evaluates isolated snapshot state evolution without mutating live operational data.
 */
export function SimulationPage() {
  const [hubs, setHubs] = useState([]);
  const [sourceHubId, setSourceHubId] = useState(2);
  const [destinationHubId, setDestinationHubId] = useState(1);
  const [vehiclesToMove, setVehiclesToMove] = useState(4);
  const [simOutcome, setSimOutcome] = useState(null);

  useEffect(() => {
    operatorApi.getDashboardBundle().then((bundle) => {
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
  }, []);

  const handleRunScenario = (e) => {
    e.preventDefault();
    const src = hubs.find((h) => h.id === Number(sourceHubId));
    const dst = hubs.find((h) => h.id === Number(destinationHubId));
    if (!src || !dst) return;

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
  };

  return (
    <>
      <h1 className="staff-page-title">What-if</h1>

      <form onSubmit={handleRunScenario} className="staff-panel staff-panel--narrow">
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
          <button type="submit" className="staff-pill-btn">
            Run scenario
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
      </form>
    </>
  );
}
