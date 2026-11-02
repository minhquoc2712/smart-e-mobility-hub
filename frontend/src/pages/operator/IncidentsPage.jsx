import React, { useEffect, useState } from 'react';
import { operatorApi, hubApi } from '../../api';
import { StatusBadge } from '../../components/common/StatusBadge';

/**
 * Starter Screen for Incident Handling UI (Task 3.3a — Owner: Minh Quốc)
 * Implements UC11 (Record incident) & UC12 (Close incident after repair).
 */
export function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [hubId, setHubId] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const refresh = () => operatorApi.getIncidents().then(setIncidents);

  useEffect(() => {
    refresh();
    hubApi.getHubs().then(setHubs);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await operatorApi.createIncident({
      hubId,
      targetType: 'CHARGING_POINT',
      severity: 'HIGH',
      title,
      description: description || 'Reported by operator console',
    });
    setTitle('');
    setDescription('');
    refresh();
  };

  const handleClose = async (id) => {
    await operatorApi.closeIncident(id, 'Repaired & tested by maintenance team.');
    refresh();
  };

  return (
    <div className="grid-2">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Record Operational Incident (UC11)</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <select className="select" value={hubId} onChange={(e) => setHubId(Number(e.target.value))}>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <input className="input" placeholder="Incident title (e.g., Charger CT-C02 offline)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Description / error details" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button type="submit" className="btn btn-danger">Log Incident</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Incident Log (UC11 / UC12)</h3>
        {incidents.map((inc) => (
          <div key={inc.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid #d3e5d8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <strong>{inc.incidentCode}</strong>
                <StatusBadge status={inc.status} />
              </div>
              <div style={{ fontSize: '0.9rem', marginTop: 4 }}>{inc.title}</div>
              <div style={{ fontSize: '0.8rem', color: '#556b5d' }}>{inc.hubName}</div>
            </div>
            {inc.status !== 'CLOSED' && (
              <button type="button" className="btn btn-outline" onClick={() => handleClose(inc.id)}>
                Close After Repair
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
