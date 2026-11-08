import React, { useEffect, useState } from 'react';
import { hubApi, operatorApi } from '../../api';

const STAFF_MEMBERS = ['S. Patel', 'A. Lee', 'M. Tran', 'K. Nguyen'];

/**
 * Staff / Dispatch (Figma screen: Source hub, Destination hub, Vehicle quantity, Assigned staff)
 */
export function DispatchPage() {
  const [hubs, setHubs] = useState([]);
  const [sourceHubId, setSourceHubId] = useState(2);
  const [destinationHubId, setDestinationHubId] = useState(1);
  const [vehicleCount, setVehicleCount] = useState(4);
  const [assignedStaff, setAssignedStaff] = useState('S. Patel');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hubApi.getHubs().then((list) => {
      setHubs(list || []);
      if (list?.length >= 2) {
        setSourceHubId(list[1].id);
        setDestinationHubId(list[0].id);
      }
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Number(sourceHubId) === Number(destinationHubId)) {
      setMessage('Please choose two different hubs.');
      return;
    }
    try {
      setSubmitting(true);
      setMessage('');
      const res = await operatorApi.redistributeVehicles({
        sourceHubId: Number(sourceHubId),
        destinationHubId: Number(destinationHubId),
        vehicleCount: Number(vehicleCount),
        assignedStaff,
        reason: `Assigned to ${assignedStaff}`,
      });
      setMessage(
        `Dispatch ${res.orderCode || 'submitted'}: ${vehicleCount} vehicle(s) assigned to ${assignedStaff}.`
      );
    } catch (err) {
      setMessage(err.message || 'Could not submit dispatch order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="staff-page-title">Dispatch</h1>

      <form onSubmit={handleSubmit} className="staff-panel staff-panel--narrow">
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Vehicle quantity</label>
            <input
              type="number"
              min={1}
              max={30}
              className="staff-field-green"
              value={vehicleCount}
              onChange={(e) => setVehicleCount(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Assigned staff</label>
            <select
              className="staff-field-green"
              value={assignedStaff}
              onChange={(e) => setAssignedStaff(e.target.value)}
            >
              {STAFF_MEMBERS.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button type="submit" disabled={submitting} className="staff-pill-btn">
            {submitting ? 'Submitting...' : 'Submit dispatch'}
          </button>
          {message && (
            <span style={{ fontSize: 16, color: 'var(--staff-forest)', fontWeight: 500 }}>
              {message}
            </span>
          )}
        </div>
      </form>
    </>
  );
}
