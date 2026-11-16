import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { hubApi } from '../../api';

/**
 * Staff / Personal information (Task 3.3a — Figma node 32:2486)
 */
export function OperatorProfilePage() {
  const { user } = useAuth();
  const [hubs, setHubs] = useState([]);
  const [savedToast, setSavedToast] = useState('');

  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem('semh_staff_profile') || 'null');
    } catch {
      return null;
    }
  })();

  const [name, setName] = useState(stored?.name || user?.fullName || 'A. Lee');
  const [staffCode, setStaffCode] = useState(stored?.staffCode || user?.staffCode || 'ST-014');
  const [email, setEmail] = useState(stored?.email || user?.email || 'operator@hcmut.edu.vn');
  const [phone, setPhone] = useState(stored?.phone || user?.phone || '');
  const [assignedHubId, setAssignedHubId] = useState(stored?.assignedHubId || '2');

  useEffect(() => {
    hubApi.getHubs().then(setHubs).catch(() => {});
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem(
      'semh_staff_profile',
      JSON.stringify({ name, staffCode, email, phone, assignedHubId })
    );
    setSavedToast('Personal information saved.');
    setTimeout(() => setSavedToast(''), 3000);
  };

  return (
    <>
      <h1 className="staff-page-title">Personal information</h1>

      <form onSubmit={handleSave} className="staff-panel staff-panel--narrow">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Name</label>
            <input
              className="staff-field-green"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Staff ID</label>
            <input
              className="staff-field-green"
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Email</label>
          <input
            type="email"
            className="staff-field-green"
            placeholder="Enter email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Phone</label>
          <input
            className="staff-field-green"
            placeholder="Enter phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Role</label>
            <input className="staff-field-green" value="Staff" readOnly />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 18, color: 'var(--staff-forest)' }}>Assigned hub</label>
            <select
              className="staff-field-green"
              value={assignedHubId}
              onChange={(e) => setAssignedHubId(e.target.value)}
            >
              <option value="">Select hub</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button type="submit" className="staff-pill-btn" style={{ height: 54, padding: '0 24px' }}>
            Save changes
          </button>
          {savedToast && <span style={{ color: 'var(--staff-forest)', fontWeight: 500 }}>{savedToast}</span>}
        </div>
      </form>
    </>
  );
}
