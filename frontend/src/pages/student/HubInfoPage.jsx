import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hubApi } from '../../api';
import vehicleImage from '../../components/common/images/vehicle.jpg';
import parkingImage from '../../components/common/images/parking space.jpg';
import chargingImage from '../../components/common/images/charging spot.jpg';

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
            <img src={vehicleImage} alt="Rental vehicle" />
          </div>
          <button type="button" onClick={() => navigate(`/student/hubs/${hubId}/vehicles`)}>
            Book now
          </button>
        </article>

        <article className="hub-service-card">
          <h2>Book parking</h2>
          <div className="hub-service-image">
            <img src={parkingImage} alt="Parking space" />
          </div>
          <button type="button" onClick={() => navigate(`/student/hubs/${hubId}/parking`)}>
            Book now
          </button>
        </article>

        <article className="hub-service-card">
          <h2>Book charger</h2>
          <div className="hub-service-image">
            <img src={chargingImage} alt="Charging station" />
          </div>
          <button type="button" onClick={() => navigate('/student/charging')}>
            Book now
          </button>
        </article>
      </div>
    </div>
  );
}
