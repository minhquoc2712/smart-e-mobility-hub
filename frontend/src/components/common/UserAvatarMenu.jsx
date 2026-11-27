import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function UserAvatarMenu({ variant = 'student', displayNameOverride, subtitleOverride }) {
  const { user, loginDemo, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const fullName = displayNameOverride || user?.fullName || 'Campus Member';
  const isStaffVariant = variant === 'operator';
  const roleLabel =
    subtitleOverride || (user?.role === 'OPERATOR' ? 'STAFF · OPERATOR' : 'STUDENT · USER');

  const initials = String(fullName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'VN';

  const handleSwitchRole = async () => {
    setOpen(false);
    if (isStaffVariant) {
      if (user?.role === 'OPERATOR') {
        navigate('/student/hubs');
      } else {
        await loginDemo('student@hcmut.edu.vn');
        navigate('/student/hubs');
      }
    } else if (user?.role === 'OPERATOR') {
      navigate('/operator/dashboard');
    } else {
      await loginDemo('operator@hcmut.edu.vn');
      navigate('/operator/dashboard');
    }
  };

  const handleSignOut = () => {
    setOpen(false);
    logout();
    navigate('/');
  };

  return (
    <div ref={wrapRef} className="user-menu-wrap">
      <div className="user-menu-meta">
        <div className="user-menu-name">{fullName}</div>
        <div className="user-menu-role">{roleLabel}</div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Open account menu"
        aria-expanded={open}
        className="user-avatar-trigger"
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={fullName} />
        ) : (
          <span className="user-avatar-initials">{initials}</span>
        )}
        <span className="user-avatar-online" />
      </button>

      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-dropdown__head">
            <div className="user-menu-dropdown__name">{fullName}</div>
            <div className="user-menu-dropdown__email">
              {user?.email || 'student@hcmut.edu.vn'}
            </div>
            {user?.privateVehiclePlate && !isStaffVariant && (
              <div className="user-menu-dropdown__plate">
                Private EV · {user.privateVehiclePlate}
              </div>
            )}
          </div>

          {!isStaffVariant ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/student/reservations');
                }}
                className="user-menu-item"
              >
                Reservations &amp; QR pickup
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/student/vehicles');
                }}
                className="user-menu-item"
              >
                Private vehicles
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/operator/profile');
              }}
              className="user-menu-item"
            >
              Staff profile
            </button>
          )}

          <button
            type="button"
            onClick={handleSwitchRole}
            className="user-menu-item user-menu-item--accent"
          >
            {isStaffVariant ? 'Switch to Student Portal' : 'Switch to Operator Console'}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="user-menu-item user-menu-item--danger"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
