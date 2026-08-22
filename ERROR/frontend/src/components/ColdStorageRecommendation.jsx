import React, { useState, useEffect } from 'react';
import { COLD_STORAGE_LOCATIONS } from '../data/coldStorageLocations.js';
import { ShieldCheck, Truck, CheckCircle, Navigation } from 'lucide-react';

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function ColdStorageRecommendation({
  truckLocation,
  productRange,
  onSelectStorage,
  onRerouteConfirm,
  routeStatus,
  liveFacilities
}) {
  const [facilities, setFacilities] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Live path: the backend already computed the real, road-routed
  // recommendation (28k-facility dataset + OSRM) inside /sensor-data's
  // CRITICAL response. Use it as-is instead of the local mock lookup.
  useEffect(() => {
    if (!liveFacilities || liveFacilities.length === 0) return;

    setFacilities(liveFacilities);
    setSelectedId(liveFacilities[0].id);
    onSelectStorage(liveFacilities[0]);
  }, [liveFacilities]);

  useEffect(() => {
    if (liveFacilities && liveFacilities.length > 0) return; // live data takes priority
    if (!truckLocation) return;

    // 1. Calculate distances & suitability
    const analyzed = COLD_STORAGE_LOCATIONS.map(f => {
      const distance = getDistance(
        truckLocation[0],
        truckLocation[1],
        f.latitude,
        f.longitude
      );
      // Speed estimate: 50 km/h
      const eta = Math.round((distance / 50) * 60);

      // Verify temp range compatibility
      const isCompatible =
        f.minTemp >= productRange.minTemp && f.maxTemp <= productRange.maxTemp;

      const isSuitable =
        f.status === 'ACTIVE' && f.availableCapacity > 0 && isCompatible;

      return {
        ...f,
        distanceKm: Math.round(distance * 10) / 10,
        etaMinutes: eta,
        isCompatible,
        isSuitable
      };
    });

    // 2. Sort by: suitability (true first), then distance (closest first)
    const sorted = analyzed.sort((a, b) => {
      if (a.isSuitable && !b.isSuitable) return -1;
      if (!a.isSuitable && b.isSuitable) return 1;
      return a.distanceKm - b.distanceKm;
    });

    setFacilities(sorted);

    // Pick top suitable facility as default selection
    const best = sorted.find(f => f.isSuitable);
    if (best) {
      setSelectedId(best.id);
      onSelectStorage(best);
    }
  }, [truckLocation, productRange]);

  const handleSelect = (facility) => {
    if (!facility.isSuitable) return;
    setSelectedId(facility.id);
    onSelectStorage(facility);
  };

  if (facilities.length === 0) {
    return <div className="panel recommendation-panel">Calculating nearest depots...</div>;
  }

  const recommended = facilities.find(f => f.isSuitable);
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
              </div>
            </div>
          ) : (
            <div className="no-suitable-alert">
              No compatible active cold storage depots found within range.
            </div>
          )}

          {/* Alternative Facilities */}
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
