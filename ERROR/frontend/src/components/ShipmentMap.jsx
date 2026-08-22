import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Plus, Minus } from 'lucide-react';
import { useRoute } from '../context/RouteContext.jsx';

function pinIcon(color, label, extraWidth = 0) {
  return L.divIcon({
    className: 'map-pin-icon',
    html: `
      <div class="map-pin">
        <span class="pin-label" style="background: ${color}; border-color: ${color};">${label}</span>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="${color}33" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 21.5s7-6.6 7-12A7 7 0 0 0 5 9.5c0 5.4 7 12 7 12Z"/>
          <circle cx="12" cy="9.3" r="2.3" fill="${color}"/>
        </svg>
      </div>`,
    iconSize: [90 + extraWidth, 58],
    iconAnchor: [(90 + extraWidth) / 2, 52],
  });
}

function coldStorageIcon(name, isRecommended = false) {
  const color = isRecommended ? '#10b981' : '#64748b';
  return L.divIcon({
    className: 'storage-marker-icon',
    html: `
      <div class="storage-marker">
        <span class="storage-pin-label" style="background: ${color};">${name}</span>
        <div class="storage-pin" style="border-color: ${color}; box-shadow: 0 0 10px ${color}66;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 0-1.69.9L9.6 8.3a2 2 0 0 1-1.69.9H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16Z"/>
            <path d="M2 10h20"/>
          </svg>
        </div>
      </div>`,
    iconSize: [120, 50],
    iconAnchor: [60, 46]
  });
}

const truckIcon = L.divIcon({
  className: 'truck-marker-icon',
  html: `
    <div class="truck-marker" style="background: #1e60f2; box-shadow: 0 0 14px #1e60f2;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.5 6.5h11v9h-11z"/>
        <path d="M13.5 10h4l3 3v2.5h-7z"/>
        <circle cx="6.5" cy="17.5" r="1.6"/>
        <circle cx="16.5" cy="17.5" r="1.6"/>
      </svg>
    </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

export default function ShipmentMap({ shipmentState }) {
  const { routeState } = useRoute();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeBoundsRef = useRef(null);

  const {
    startName,
    endName,
    startCoordinates,
    endCoordinates,
    routeCoordinates,
    truckPosition,
    routeStatus,
    recommendedFacility,
    emergencyRouteCoordinates
  } = routeState;

  const temp = shipmentState ? shipmentState.temperature : 5.0;
  const humidity = shipmentState ? shipmentState.humidity : 54;
  const riskLabel = shipmentState ? shipmentState.riskLevel : 'SAFE';

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      minZoom: 3,
      maxZoom: 16,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; OpenStreetMap &copy; CARTO')
      .addTo(map);

    const fitPoints = [];

    if (routeStatus === 'REROUTED' && recommendedFacility && emergencyRouteCoordinates) {
      // 1. Render original route MUTED (gray-blue line)
      L.polyline(routeCoordinates, {
        color: '#475569',
        weight: 3.5,
        opacity: 0.7,
        lineCap: 'round'
      }).addTo(map);

      // 2. Render active emergency route (red dashed line)
      L.polyline(emergencyRouteCoordinates, {
        color: '#ef4444',
        weight: 4.5,
        opacity: 0.95,
        dashArray: '8 8',
        lineCap: 'round',
        smoothFactor: 1.5
      }).addTo(map);

      // Start/End pins
      L.marker(startCoordinates, { icon: pinIcon('#64748b', 'START (ORIG)') }).addTo(map);
      L.marker(endCoordinates, { icon: pinIcon('#b91c1c', 'DEST (ORIG)', 30) }).addTo(map);

      // Recommended Cold Storage Pin
      const storageCoords = [recommendedFacility.latitude, recommendedFacility.longitude];
      L.marker(storageCoords, { icon: coldStorageIcon(recommendedFacility.name, true) }).addTo(map);

      fitPoints.push(...routeCoordinates, storageCoords);

    } else {
      // Normal planned or emergency routing stage
      L.polyline(routeCoordinates, {
        color: '#1e60f2',
        weight: 4.5,
        opacity: 0.95,
        lineCap: 'round',
        smoothFactor: 2,
      }).addTo(map);

      // Add Start and End Pins
      L.marker(startCoordinates, { icon: pinIcon('#10b981', 'START') }).addTo(map);
      L.marker(endCoordinates, { icon: pinIcon('#ef4444', 'DESTINATION', 30) }).addTo(map);

      fitPoints.push(...routeCoordinates);
    }

    // Add Truck Position Marker
    const truckMarker = L.marker(truckPosition, { icon: truckIcon }).addTo(map);
    truckMarker
      .bindPopup(
        `<div class="map-tooltip">
           <div class="map-tooltip-title">SUR-001</div>
           <div class="map-tooltip-row">Temp: ${temp}°C</div>
           <div class="map-tooltip-row">Humidity: ${humidity}%</div>
           <div class="map-tooltip-row">Risk: <strong style="color: ${riskLabel === 'CRITICAL' ? '#ef4444' : riskLabel === 'WARNING' ? '#f59e0b' : '#10b981'}">${riskLabel}</strong></div>
         </div>`,
        { closeButton: false, className: 'map-tooltip-popup', offset: [0, -6] }
      );
    
    truckMarker.openPopup();
    fitPoints.push(truckPosition);

    const bounds = L.latLngBounds(fitPoints);
    routeBoundsRef.current = bounds;
    map.fitBounds(bounds, { padding: [70, 70] });

    const t = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [70, 70] });
    }, 150);

    mapRef.current = map;

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [routeState, shipmentState, startCoordinates, endCoordinates, routeCoordinates, truckPosition, routeStatus]);

  return (
    <div className="panel map-panel">
      <div className="panel-header">
        <h3>LIVE SHIPMENT TRACKING</h3>
        <div className="map-controls">
          <button
            className="map-ctrl-btn"
            aria-label="Fit route"
            onClick={() => routeBoundsRef.current && mapRef.current?.fitBounds(routeBoundsRef.current, { padding: [70, 70] })}
          >
            <Maximize2 size={14} />
          </button>
          <button className="map-ctrl-btn" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
            <Plus size={15} />
          </button>
          <button className="map-ctrl-btn" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
            <Minus size={15} />
          </button>
        </div>
      </div>

      <div className="map-canvas" ref={containerRef} />

      <div className="map-legend">
        <span className="legend-item">
          <span className="legend-swatch solid" style={{ borderTopColor: routeStatus === 'REROUTED' ? '#475569' : '#1e60f2' }} />
          {routeStatus === 'REROUTED' ? 'Original Route (Muted)' : 'Planned Route'}
        </span>
        {routeStatus === 'REROUTED' && (
          <>
            <span className="legend-item">
              <span className="legend-swatch dashed" style={{ borderTopColor: '#ef4444' }} />
              Active Emergency Route
            </span>
            <span className="legend-item">
              <span className="legend-swatch dot-swatch" style={{ background: '#10b981' }} />
              Recommended Facility
            </span>
          </>
        )}
      </div>
    </div>
  );
}
