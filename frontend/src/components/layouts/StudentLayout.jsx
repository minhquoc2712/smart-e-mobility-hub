import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggleButton } from '../../context/ThemeContext';
import { IS_MOCK_MODE, reservationApi } from '../../api';
import { UserAvatarMenu } from '../common/UserAvatarMenu';
import { AccountCreatedBanner } from '../common/AccountCreatedBanner';
import { VnuLogo } from '../common/VnuLogo';
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
            ['PENDING', 'CONFIRMED', 'ACTIVE'].includes(String(r.status || '').toUpperCase())
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
        <NavLink to="/student/hubs" className="brand-dual">
          <VnuLogo height={32} />
          <span className="brand-dual__divider" aria-hidden="true" />
          <div className="brand-dual__project">
            <img src={logo} alt="Smart E-Mobility Hub" />
            <div>
              <strong>Smart E-Mobility Hub</strong>
              <span>VNU-HCM Urban Area</span>
            </div>
          </div>
        </NavLink>

        <nav className="nav-links" aria-label="Student navigation">
          <NavLink
            to="/student/hubs"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Hubs &amp; Map
          </NavLink>
          <NavLink
            to="/student/reservations"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Pickup &amp; Return
          </NavLink>
          <NavLink
            to="/student/charging"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Book Charger
          </NavLink>
          <NavLink
            to="/student/vehicles"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Private EV
          </NavLink>
        </nav>

        <div className="topbar-actions">
          <ThemeToggleButton compact />
          <UserAvatarMenu variant="student" />
        </div>
      </header>

      {/* Active Rental / Hold Quick-Action Banner */}
      {activeBooking && location.pathname !== '/student/reservations' && (
        <div className="active-ride-strip">
          <div className="active-ride-strip__info">
            <span className="live-pulse-dot" />
            {activeBooking.status === 'ACTIVE' ? (
              <span>
                <strong>Active ride in progress:</strong> Vehicle{' '}
                <strong>{activeBooking.vehicleCode || `#${activeBooking.vehicle_id}`}</strong> from{' '}
                {activeBooking.hubName || 'Campus Hub'}
              </span>
            ) : activeBooking.status === 'PENDING' ? (
              <span>
                <strong>Booking awaiting operator approval:</strong>{' '}
                <strong>{activeBooking.vehicleCode || `#${activeBooking.vehicle_id}`}</strong> at{' '}
                {activeBooking.hubName || 'Campus Hub'}
              </span>
            ) : (
              <span>
                <strong>Approved &amp; held (15 min):</strong>{' '}
                <strong>{activeBooking.vehicleCode || `#${activeBooking.vehicle_id}`}</strong> at{' '}
                {activeBooking.hubName || 'Campus Hub'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="active-ride-strip__btn"
            onClick={() => navigate('/student/reservations')}
          >
            {activeBooking.status === 'ACTIVE'
              ? 'View ride & Return'
              : activeBooking.status === 'PENDING'
              ? 'Track status'
              : 'Scan QR & Pick up'}
          </button>
        </div>
      )}

      <main className="container">
        <AccountCreatedBanner />
        <Outlet />
      </main>
    </div>
  );
}
