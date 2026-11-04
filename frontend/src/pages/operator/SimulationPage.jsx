import React, { useEffect, useState } from 'react';
import { simulationApi } from '../../api';

/**
 * Starter Screen for Task 4.2a: What-if Simulation & Coordination Recommendations (UC16–UC18)
 */
export function SimulationPage() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    simulationApi.getScenarios().then((list) => {
      setScenarios(list);
      if (list[0]) setSelectedCode(list[0].code);
    });
  }, []);

  const handleRun = async () => {
    const scenario = scenarios.find((s) => s.code === selectedCode);
    const simResult = await simulationApi.runSimulation({
      scenarioCode: selectedCode,
      params: scenario?.defaultParams || {},
    });
    setResult(simResult);
  };

  return (
    <div>
      <h2>What-if Simulation & Coordination Engine (UC16–UC18)</h2>
      <p style={{ color: '#556b5d' }}>
        Runs scenarios on an isolated snapshot of operational state so live Hub data is never corrupted.
      </p>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <label style={{ fontWeight: 600 }}>Select Scenario Template (Task 2B.5)</label>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <select className="select" style={{ flex: '1 1 320px' }} value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)}>
            {scenarios.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.scenarioType})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={handleRun}>
            ▶ Run Isolated Simulation
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Simulation Result · {result.runId}</h3>
          <p style={{ fontSize: '0.9rem', color: '#556b5d' }}>
            Predicted Peak Utilization: <strong>{result.impactSummary.peakUtilizationPercent}%</strong> ·
            Estimated Unmet Requests: <strong>{result.impactSummary.unmetDemandEstimate}</strong> ·
            Avg Wait: <strong>{result.impactSummary.avgWaitMinutes} mins</strong>
          </p>
          <h4>Coordination Recommendations (UC17 / UC18)</h4>
          <ul>
            {result.recommendations.map((rec) => (
              <li key={rec.id} style={{ marginBottom: '0.5rem' }}>
                <strong>[{rec.actionType}]</strong> {rec.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
