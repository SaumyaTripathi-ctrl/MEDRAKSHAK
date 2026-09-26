import React from 'react';
import { ShieldCheck, CheckCircle, Navigation } from 'lucide-react';

export default function ColdStorageRecommendation({
  onSelectStorage,
  onRerouteConfirm,
  routeStatus,
  liveFacilities
}) {
  // The backend already computed the real, road-routed recommendation
  // (facility dataset + OSRM) inside /sensor-data's CRITICAL response —
  // this component just reflects it. Nothing here is calculated locally.
  const facilities = liveFacilities || [];

  React.useEffect(() => {
    if (facilities.length > 0) {
      onSelectStorage(facilities[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFacilities]);

  const handleSelect = (facility) => {
    if (!facility.isSuitable) return;
    onSelectStorage(facility);
  };

  if (facilities.length === 0) {
    return (
      <div className="panel recommendation-panel">
        <div className="no-alerts-placeholder">
          <span className="clean-system-dot" />
          <p>Waiting for a CRITICAL alert. The nearest suitable cold-storage facility will
             appear here once the backend flags an active spoilage risk.</p>
        </div>
      </div>
    );
  }

  const selectedId = facilities[0].id;
  const recommended = facilities.find(f => f.isSuitable) || facilities[0];
  const alternatives = facilities.filter(f => f.id !== (recommended?.id || '')).slice(0, 3);

  return (
    <div className="panel recommendation-panel">
      {routeStatus === 'REROUTED' ? (
        <div className="reroute-success-container">
          <CheckCircle size={32} className="success-icon" />
          <h3>✓ SHIPMENT REROUTED</h3>
          <p className="success-sub">
            The active shipment destination has been updated. The truck is now diverting to the cold-chain facility:
          </p>
          <div className="active-destination-card">
            <h4>{recommended?.name}</h4>
            <span className="facility-type">{recommended?.type}</span>
            <div className="card-row spacing-top">
              <span>Reroute ETA</span>
              <strong>{recommended?.etaMinutes} mins ({recommended?.distanceKm} km)</strong>
            </div>
            <div className="card-row">
              <span>Coordinates</span>
              <strong>{recommended?.latitude?.toFixed(4)}, {recommended?.longitude?.toFixed(4)}</strong>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rec-header">
            <h4>NEAREST SUITABLE COLD STORAGE</h4>
            <span className="rec-badge">
              <ShieldCheck size={13} /> BEST MATCH
            </span>
          </div>

          {recommended ? (
            <div
              className={`recommended-facility-card${selectedId === recommended.id ? ' active-selection' : ''}`}
              onClick={() => handleSelect(recommended)}
            >
              <div className="facility-name-box">
                <h3>{recommended.name}</h3>
                <span className="facility-type">{recommended.type}</span>
              </div>

              <div className="rec-details-grid">
                <div className="rec-detail">
                  <span className="rd-label">DISTANCE</span>
                  <strong className="rd-value">{recommended.distanceKm} km</strong>
                </div>
                <div className="rec-detail">
                  <span className="rd-label">ETA</span>
                  <strong className="rd-value text-accent">{recommended.etaMinutes} min</strong>
                </div>
                <div className="rec-detail">
                  <span className="rd-label">TEMPERATURE</span>
                  <strong className="rd-value val-green">{recommended.minTemp}–{recommended.maxTemp}°C ✓</strong>
                </div>
                <div className="rec-detail">
                  <span className="rd-label">CAPACITY</span>
                  <strong className="rd-value val-green">AVAILABLE ✓</strong>
                </div>
              </div>

              <div className="rec-status-row">
                <div className="active-dot-row">
                  <span className="green-dot" />
                  <span>STATUS: <strong>ACTIVE ✓</strong></span>
                </div>
                <span className="rec-coords">
                  {recommended.latitude?.toFixed(4)}, {recommended.longitude?.toFixed(4)}
                </span>
              </div>
            </div>
          ) : (
            <div className="no-suitable-alert">
              No compatible active cold storage depots found within range.
            </div>
          )}

          {/* Alternative Facilities */}
          {alternatives.length > 0 && (
            <div className="alternatives-section">
              <h4 className="alt-title">ALTERNATIVE FACILITIES</h4>
              <div className="alternatives-list">
                {alternatives.map(facility => {
                  const isSelected = selectedId === facility.id;
                  return (
                    <div
                      key={facility.id}
                      className={`alt-facility-card${isSelected ? ' active-selection' : ''}${!facility.isSuitable ? ' disabled-card' : ''}`}
                      onClick={() => handleSelect(facility)}
                    >
                      <div className="alt-card-header">
                        <h5>{facility.name}</h5>
                        <span className="alt-dist">{facility.distanceKm} km</span>
                      </div>
                      <div className="alt-card-body">
                        <span>{facility.type}</span>
                        <span className={`alt-compatibility ${facility.isSuitable ? 'compatible' : 'incompatible'}`}>
                          {facility.isSuitable ? 'COMPATIBLE' : 'INCOMPATIBLE'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="rec-actions-panel spacing-top">
            <button
              className="rec-btn-nav primary-nav"
              onClick={onRerouteConfirm}
              disabled={!recommended}
            >
              <Navigation size={14} />
              RE-ROUTE NOW
            </button>
          </div>
        </>
      )}
    </div>
  );
}
