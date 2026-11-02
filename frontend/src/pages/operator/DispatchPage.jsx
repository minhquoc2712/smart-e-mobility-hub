import React, { useEffect, useState } from 'react';
import { chargingApi } from '../../api';

/**
 * Starter Screen for Task 4.1a: Charging Priority Queue & Vehicle Redistribution (UC13, UC15)
 */
export function DispatchPage() {
  const [queue, setQueue] = useState([]);

  const refresh = () => chargingApi.getChargingRequests().then(setQueue);

  useEffect(() => {
    refresh();
  }, []);

  const changePriority = async (id, priority) => {
    await chargingApi.updatePriority(id, priority);
    refresh();
  };

  return (
    <div>
      <h2>Charging Priority & Fleet Redistribution (Task 4.1a)</h2>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Smart Charging Queue Priority Control (UC15)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Hub</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Change Priority</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.requestCode}</strong></td>
                <td>{item.hubName}</td>
                <td>{item.ownershipType}</td>
                <td><strong>{item.priority}</strong></td>
                <td>
                  <select
                    className="select"
                    style={{ width: 140 }}
                    value={item.priority}
                    onChange={(e) => changePriority(item.id, e.target.value)}
                  >
                    <option value="LOW">LOW</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
