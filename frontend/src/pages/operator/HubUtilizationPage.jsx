import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { operatorApi } from '../../api';

function slotRangeLabel(codes) {
  if (!codes || codes.length === 0) return 'No spaces';
  if (codes.length === 1) return codes[0];
  return `${codes[0]}–${codes[codes.length - 1]}`;
}

/**
 * Staff / Hub utilization (Task 3.3a — Figma node 32:2254)
 * Displays real-time capacity utilization (%) per Hub.
 * Clicking on a Hub's utilization percentage (e.g. 87%, 63%...) pops down
 * the individual % utilization breakdown of each parking lot / zone inside that Hub:
 *   - Zone A: Rental vehicles (SHARED_EV)
 *   - Zone B: Charging area (Charging points)
 *   - Zone C: Customer & Universal parking (PRIVATE_EV / UNIVERSAL)
 */
export function HubUtilizationPage() {
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null);
  const [expandedHubId, setExpandedHubId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUtilization = useCallback(async () => {
    try {
      setError('');
      const data = await operatorApi.getDashboardBundle();
      setBundle(data);
    } catch (err) {
      setError(err.message || 'Could not load hub utilization.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUtilization();
  }, [loadUtilization]);

  const hubs = bundle?.hubUtilization?.hubs || [];
  const allSlots = bundle?.manageParking?.parkingSlots || [];
  const allChargers = bundle?.vehicleCharging?.chargingPoints || [];

  const toggleHubBreakdown = (hubId) => {
    setExpandedHubId((prev) => (prev === hubId ? null : hubId));
  };

  const buildZonesForHub = (hub) => {
    const hubSlots = allSlots.filter((s) => s.hubId === hub.id);
    const hubChargers = allChargers.filter((c) => c.hubId === hub.id);

    // Zone A: Rental fleet parking (SHARED_EV)
    const rentalSlots = hubSlots.filter((s) => s.slotType === 'SHARED_EV');
    const usedA = rentalSlots.filter((s) => s.status === 'OCCUPIED' || s.status === 'RESERVED').length;
    const freeA = rentalSlots.filter((s) => s.status === 'FREE').length;
    const totalA = rentalSlots.length;
    const pctA = totalA > 0 ? Math.round((usedA * 100) / totalA) : 0;

    // Zone B: Charging area (Charging points)
    const usedB = hubChargers.filter((c) => c.status === 'CHARGING' || c.status === 'RESERVED').length;
    const freeB = hubChargers.filter((c) => c.status === 'AVAILABLE').length;
    const totalB = hubChargers.length;
    const pctB = totalB > 0 ? Math.round((usedB * 100) / totalB) : 0;

    // Zone C: Customer & Universal parking (PRIVATE_EV & UNIVERSAL)
    const customerSlots = hubSlots.filter((s) => s.slotType !== 'SHARED_EV');
    const usedC = customerSlots.filter((s) => s.status === 'OCCUPIED' || s.status === 'RESERVED').length;
    const freeC = customerSlots.filter((s) => s.status === 'FREE').length;
    const totalC = customerSlots.length;
    const pctC = totalC > 0 ? Math.round((usedC * 100) / totalC) : 0;

    return [
      {
        code: 'A',
        name: 'Rental parking (Shared EV)',
        range: slotRangeLabel(rentalSlots.map((s) => s.slotCode)),
        used: usedA,
        free: freeA,
        total: totalA,
        pct: pctA,
        unit: freeA === 1 ? 'space' : 'spaces',
      },
      {
        code: 'B',
        name: 'Charging area',
        range: slotRangeLabel(hubChargers.map((c) => c.chargerCode)),
        used: usedB,
        free: freeB,
        total: totalB,
        pct: pctB,
        unit: freeB === 1 ? 'charger' : 'chargers',
      },
      {
        code: 'C',
        name: 'Customer & Universal parking',
        range: slotRangeLabel(customerSlots.map((s) => s.slotCode)),
        used: usedC,
        free: freeC,
        total: totalC,
        pct: pctC,
        unit: freeC === 1 ? 'space' : 'spaces',
      },
    ];
  };

  return (
    <>
      <h1 className="staff-page-title">Hub utilization</h1>

      <div className="staff-panel staff-panel--narrow">
        {loading ? (
          <p style={{ color: 'var(--staff-muted)', margin: 0 }}>Loading hub utilization...</p>
        ) : error ? (
          <p style={{ color: '#991b1b', margin: 0 }}>{error}</p>
        ) : (
          <>
            <div className="staff-list-head" style={{ justifyContent: 'space-between' }}>
              <span>Hub</span>
              <span>Utilization</span>
            </div>

            <div>
              {hubs.map((hub) => {
                const hubSlots = allSlots.filter((s) => s.hubId === hub.id);
                const hubChargers = allChargers.filter((c) => c.hubId === hub.id);
                const liveTotal = hubSlots.length + hubChargers.length;
                const liveUsed =
                  hubSlots.filter((s) => s.status === 'OCCUPIED' || s.status === 'RESERVED').length +
                  hubChargers.filter((c) => c.status === 'CHARGING' || c.status === 'RESERVED').length;

                const pct =
                  liveTotal > 0
                    ? Math.round((liveUsed * 100) / liveTotal)
                    : Math.round(Number(hub.utilizationPercentage ?? 0));

                const nearFull =
                  liveTotal > 0
                    ? pct >= 80
                    : pct >= 80 || hub.hubStatus === 'NEAR_FULL' || hub.hubStatus === 'FULL';
                const isExpanded = expandedHubId === hub.id;
                const zones = isExpanded ? buildZonesForHub(hub) : [];

                return (
                  <div
                    key={hub.id}
                    style={{
                      borderBottom: '1px solid var(--staff-divider)',
                    }}
                  >
                    <div
                      className="staff-list-row"
                      style={{
                        justifyContent: 'space-between',
                        borderBottom: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>{hub.name}</span>
                        {nearFull && (
                          <span className="staff-status-tag staff-status-tag--warn">
                            {pct >= 100 || hub.hubStatus === 'FULL' ? 'Full' : 'Nearing full'}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleHubBreakdown(hub.id)}
                        title="Click to view % breakdown of each parking lot in this Hub"
                        aria-expanded={isExpanded}
                        style={{
                          background: isExpanded
                            ? 'var(--staff-pill-active)'
                            : nearFull
                            ? '#fff7db'
                            : 'var(--staff-pill)',
                          color: nearFull && !isExpanded ? '#854d0e' : 'var(--staff-forest)',
                          border: isExpanded ? '1.5px solid #34c759' : '1px solid transparent',
                          borderRadius: 10,
                          padding: '6px 14px',
                          fontFamily: 'inherit',
                          fontSize: 18,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>{pct}%</span>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>
                          {isExpanded ? '▴' : '▾'}
                        </span>
                      </button>
                    </div>

                    {/* Pop-down breakdown of each parking lot / zone inside this Hub */}
                    {isExpanded && (
                      <div
                        style={{
                          background: 'var(--staff-pill)',
                          borderRadius: 14,
                          padding: '16px 18px',
                          marginBottom: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          border: '1px solid #d5ecd4',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 8,
                            fontSize: 14,
                            color: 'var(--staff-olive)',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--staff-forest)' }}>
                            Parking &amp; charging breakdown · {liveUsed}/{liveTotal} in use ({pct}%)
                          </span>
                          <button
                            type="button"
                            onClick={() => navigate(`/operator/manage-parking?hubId=${hub.id}`)}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cde8cc',
                              borderRadius: 8,
                              padding: '4px 10px',
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--staff-forest)',
                              cursor: 'pointer',
                            }}
                          >
                            Manage parking →
                          </button>
                        </div>

                        {zones.map((z) => {
                          const zoneWarn = z.pct >= 80;
                          return (
                            <div
                              key={z.code}
                              style={{
                                background: '#ffffff',
                                borderRadius: 11,
                                padding: '11px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 7,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span
                                    className="staff-zone-badge"
                                    style={{ width: 26, height: 26, fontSize: 13, borderRadius: 7 }}
                                  >
                                    {z.code}
                                  </span>
                                  <div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--staff-forest)' }}>
                                      {z.name}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: 'var(--staff-muted)' }}>
                                      {z.range} · {z.used}/{z.total} occupied · {z.free} free {z.unit}
                                    </div>
                                  </div>
                                </div>

                                <span
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 16,
                                    color: zoneWarn ? '#854d0e' : 'var(--staff-forest)',
                                    background: zoneWarn ? '#fff7db' : '#eff9eb',
                                    padding: '3px 10px',
                                    borderRadius: 8,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {z.pct}%
                                </span>
                              </div>

                              <div className="staff-progress-track" style={{ height: 7 }}>
                                <div
                                  className="staff-progress-fill"
                                  style={{
                                    width: `${Math.min(100, z.pct)}%`,
                                    background: zoneWarn ? '#eab308' : '#34c759',
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
