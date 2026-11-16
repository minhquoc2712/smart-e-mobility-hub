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
  const roleLabel = subtitleOverride || (user?.role === 'OPERATOR' ? 'STAFF · OPERATOR' : 'STUDENT · USER');

  const handleSwitchRole = async () => {
    setOpen(false);
    if (isStaffVariant) {
      if (user?.role === 'OPERATOR') {
        navigate('/student/hubs');
      } else {
        await loginDemo('student@hcmut.edu.vn');
        navigate('/student/hubs');
      }
    } else {
      if (user?.role === 'OPERATOR') {
        navigate('/operator/dashboard');
      } else {
        await loginDemo('operator@hcmut.edu.vn');
        navigate('/operator/dashboard');
      }
    }
  };

  const handleSignOut = () => {
    setOpen(false);
    logout();
    navigate('/');
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: '#1f3b24',
          }}
        >
          {fullName}
        </div>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#2b581c',
            letterSpacing: '0.03em',
          }}
        >
          {roleLabel}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Open account menu"
        aria-expanded={open}
        title="Account & Quick Role Switch"
        style={{
          position: 'relative',
          width: 46,
          height: 46,
          borderRadius: '50%',
          padding: 0,
          border: '2.5px solid #2b581c',
          background: 'linear-gradient(135deg, #d8f8dc 0%, #8ce99a 100%)',
          boxShadow: '0 2px 8px rgba(38, 57, 35, 0.14)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={fullName}
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <circle cx="20" cy="20" r="19" fill={isStaffVariant ? '#d0f4de' : '#e6fcf5'} />
            {/* Hair / Cap */}
            {isStaffVariant ? (
              <path
                d="M11 15C11 10.5 15 8 20 8C25 8 29 10.5 29 15H11Z"
                fill="#2b581c"
              />
            ) : (
              <path
                d="M11.5 17C11.5 11.5 15.2 8.5 20 8.5C24.8 8.5 28.5 11.5 28.5 17C26.5 14.8 23.5 14 20 14C16.5 14 13.5 14.8 11.5 17Z"
                fill="#1f2937"
              />
            )}
            {/* Face */}
            <circle cx="20" cy="17.5" r="6.2" fill="#fde68a" stroke="#263923" strokeWidth="1.4" />
            <circle cx="17.8" cy="17" r="0.9" fill="#263923" />
            <circle cx="22.2" cy="17" r="0.9" fill="#263923" />
            <path
              d="M17.8 19.6C18.5 20.5 21.5 20.5 22.2 19.6"
              stroke="#263923"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            {/* Shoulders / Shirt */}
            <path
              d="M9.5 34.5C10.8 28.2 14.8 25.5 20 25.5C25.2 25.5 29.2 28.2 30.5 34.5"
              fill={isStaffVariant ? '#2b581c' : '#34c759'}
              stroke="#263923"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        )}
        {/* Online indicator dot */}
        <span
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#22c55e',
            border: '2px solid #ffffff',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 268,
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #d7ead7',
            boxShadow: '0 12px 28px rgba(24, 43, 32, 0.16)',
            padding: 12,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              padding: '8px 10px 10px',
              borderBottom: '1px solid #e6f0e6',
              marginBottom: 2,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14.5, color: '#1f3b24' }}>{fullName}</div>
            <div style={{ fontSize: 12.5, color: '#5c6e54', wordBreak: 'break-all' }}>
              {user?.email || 'student@hcmut.edu.vn'}
            </div>
            {user?.privateVehiclePlate && !isStaffVariant && (
              <div
                style={{
                  marginTop: 6,
                  display: 'inline-block',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: '#eff9eb',
                  color: '#2b581c',
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                🛵 Private EV: {user.privateVehiclePlate}
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
                style={menuBtnStyle}
              >
                📋 My reservations &amp; QR pickup
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/student/vehicles');
                }}
                style={menuBtnStyle}
              >
                🛵 My private vehicles
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/operator/profile');
              }}
              style={menuBtnStyle}
            >
              👤 Staff personal information
            </button>
          )}

          <button
            type="button"
            onClick={handleSwitchRole}
            style={{
              ...menuBtnStyle,
              background: '#eff9eb',
              color: '#2b581c',
              fontWeight: 600,
            }}
          >
            {isStaffVariant ? '🔄 Switch to Customer View' : '🔄 Switch to Staff Console'}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              ...menuBtnStyle,
              color: '#b91c1c',
              borderTop: '1px solid #f1f5f1',
              marginTop: 2,
              paddingTop: 10,
            }}
          >
            🚪 Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const menuBtnStyle = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 13.5,
  fontFamily: 'inherit',
  color: '#263923',
  cursor: 'pointer',
};
