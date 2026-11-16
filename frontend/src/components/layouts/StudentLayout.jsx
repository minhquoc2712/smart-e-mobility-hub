import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE, reservationApi } from '../../api';
import { UserAvatarMenu } from '../common/UserAvatarMenu';
import logo from '../common/images/logo.png';

export function StudentLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeBooking, setActiveBooking] = useState(null);

  useEffect(() => {
    let active = true;
    reservationApi
      .getMyReservations(user?.id)
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        const found = rows.find(
          (r) =>
            String(r.reservationType ?? r.reservation_type ?? 'VEHICLE').toUpperCase() ===
              'VEHICLE' &&
            ['CONFIRMED', 'ACTIVE'].includes(String(r.status || '').toUpperCase())
        );
        setActiveBooking(found || null);
      })
      .catch(() => {
        if (active) setActiveBooking(null);
      });
    return () => {
      active = false;
    };
  }, [user?.id, location.pathname]);

  return (
    <div className="app-shell">
      {IS_MOCK_MODE && (
        <div className="mock-banner">
          Running on OpenAPI Mock Client — Set <code>VITE_USE_MOCK_API=false</code> in{' '}
          <code>.env</code> for live MySQL.
        </div>
      )}
      <header className="topbar">
        <NavLink
          to="/student/hubs"
          className="brand-title"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <img src={logo} alt="" />
          <span>Smart E-MOBILITY HUB</span>
        </NavLink>

        <nav className="nav-links" aria-label="Student navigation">
          <NavLink
            to="/student/hubs"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            🚲 Find Hub &amp; Rent
          </NavLink>
          <NavLink
            to="/student/reservations"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            📋 Pickup &amp; Return
          </NavLink>
          <NavLink
            to="/student/charging"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            ⚡ Book Charger
          </NavLink>
          <NavLink
            to="/student/vehicles"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            🛵 Private EV
          </NavLink>
        </nav>

        <UserAvatarMenu variant="student" />
      </header>

      {/* Active Rental / Hold Quick-Action Banner for First-Time Users */}
      {activeBooking && location.pathname !== '/student/reservations' && (
        <div
          style={{
            background: activeBooking.status === 'ACTIVE' ? '#dcfce7' : '#eff9eb',
            borderBottom: '1px solid #bde5bf',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: 14.5,
            color: '#1f3b24',
          }}
        >
          <span>
            {activeBooking.status === 'ACTIVE' ? (
              <>
                🟢 <strong>Active ride in progress:</strong> Vehicle{' '}
                <strong>{activeBooking.vehicleCode || `#${activeBooking.vehicle_id}`}</strong> from{' '}
                {activeBooking.hubName || 'Campus Hub'}
              </>
            ) : (
              <>
                ⏳ <strong>Reserved vehicle held for you (15 min):</strong>{' '}
                <strong>{activeBooking.vehicleCode || `#${activeBooking.vehicle_id}`}</strong> at{' '}
                {activeBooking.hubName || 'Campus Hub'}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => navigate('/student/reservations')}
            style={{
              background: '#2b581c',
              color: '#ffffff',
              border: 'none',
              borderRadius: 999,
              padding: '5px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {activeBooking.status === 'ACTIVE' ? 'Return vehicle now →' : 'Scan QR & Pick up →'}
          </button>
        </div>
      )}

      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
