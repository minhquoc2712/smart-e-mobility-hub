import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hubApi } from '../../api';
import { EvIllustration } from '../../components/common/EvIllustration';

export function HubInfoPage() {
  const { hubId } = useParams();
  const navigate = useNavigate();
  const [hub, setHub] = useState(null);

  useEffect(() => {
    hubApi.getHubById(hubId).then(setHub);
  }, [hubId]);

  return (
    <div className="hub-info-page">
      <Link className="page-back-link" to="/student/hubs">← Back to hubs</Link>
      <h1>{hub?.name || 'Mobility Hub'} information</h1>

      <div className="hub-service-grid">
        <article className="hub-service-card">
          <h2>Rent Vehicle</h2>
          <div className="hub-service-image">
            <EvIllustration variant="bike" />
          </div>
          <button type="button" onClick={() => navigate(`/student/hubs/${hubId}/vehicles`)}>
            Book now
          </button>
        </article>

        <article className="hub-service-card">
          <h2>Book parking</h2>
          <div className="hub-service-image">
            <EvIllustration variant="parking" />
          </div>
          <button type="button" onClick={() => navigate(`/student/hubs/${hubId}/parking`)}>
            Book now
          </button>
        </article>

        <article className="hub-service-card">
          <h2>Book charger</h2>
          <div className="hub-service-image">
            <EvIllustration variant="charger" />
          </div>
          <button type="button" onClick={() => navigate('/student/charging')}>
            Book now
          </button>
        </article>
      </div>
    </div>
  );
}
