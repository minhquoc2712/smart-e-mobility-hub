import React, { useEffect, useState } from 'react';
import { reservationApi, hubApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../../components/common/StatusBadge';

/**
 * Starter Screen for Wireframes 6, 7, 8 (Reservations, Pickup & Return — UC04..UC07)
 * Owner for Task 3.2a expansion: Lê Minh Nhật
 */
export function ReservationsPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [returnHubId, setReturnHubId] = useState(1);

  const loadData = () => {
    reservationApi.getMyReservations(user?.id).then(setReservations);
    hubApi.getHubs().then((list) => {
      setHubs(list);
      if (list[0]) setReturnHubId(list[0].id);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePickup = async (id) => {
    await reservationApi.pickupReservation(id);
    loadData();
  };

  const handleReturn = async (id) => {
    await reservationApi.returnReservation(id, { returnHubId });
    loadData();
  };

  const handleCancel = async (id) => {
    await reservationApi.cancelReservation(id);
    loadData();
  };

  return (
    <div>
      <h2>My Reservations, Pickup & Return</h2>
      <p style={{ color: '#556b5d' }}>
        Demonstrates state transitions: <code>CONFIRMED → ACTIVE (Picked up) → COMPLETED (Returned)</code>.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {reservations.map((r) => (
          <div key={r.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <strong>{r.reservationCode}</strong>
                <StatusBadge status={r.status} />
              </div>
              <div style={{ fontSize: '0.9rem', marginTop: 4 }}>
                Vehicle: <strong>{r.vehicleCode || 'Parking Slot'}</strong> · Hub: <strong>{r.hubName}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {r.status === 'CONFIRMED' && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => handlePickup(r.id)}>
                    Confirm Pickup (UC06)
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => handleCancel(r.id)}>
                    Cancel (UC05)
                  </button>
                </>
              )}
              {r.status === 'ACTIVE' && (
                <>
                  <select className="select" style={{ width: 210 }} value={returnHubId} onChange={(e) => setReturnHubId(Number(e.target.value))}>
                    {hubs.map((h) => (
                      <option key={h.id} value={h.id}>
                        Return to: {h.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-primary" onClick={() => handleReturn(r.id)}>
                    Confirm Return (UC07)
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
