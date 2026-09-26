import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Plus, Minus, Satellite } from 'lucide-react';
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
    trail,
    truckPosition,
    routeStatus,
    recommendedFacility,
    emergencyRouteCoordinates,
    plannedRoute
  } = routeState;

  const temp = shipmentState ? shipmentState.temperature : null;
  const humidity = shipmentState ? shipmentState.humidity : null;
  const riskLabel = shipmentState ? shipmentState.riskLevel : null;

  const hasContent = !!truckPosition || !!plannedRoute;

  useEffect(() => {
    if (!containerRef.current || !hasContent) return;

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

    // Standard OpenStreetMap tiles — free, no API key/signup required, full
    // street-level detail (labels, roads, place names). Note: this is a
    // light/white map, not dark — CARTO's basemaps.cartocdn.com (previously
    // used here) now requires a paid account, which is what was showing
    // "API KEY REQUIRED" watermarked across the tiles.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19,
    }).addTo(map);

    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; OpenStreetMap contributors')
      .addTo(map);

    const fitPoints = [];

    // Planned route reference line + start/end pins, when a demo route
    // has been set on the Simulation page.
    if (plannedRoute && plannedRoute.routeCoordinates) {
      L.polyline(plannedRoute.routeCoordinates, {
        color: routeStatus === 'REROUTED' ? '#475569' : '#1e60f2',
        weight: 3.5,
        opacity: routeStatus === 'REROUTED' ? 0.5 : 0.55,
        dashArray: '2 10',
        lineCap: 'round',
      }).addTo(map);

      L.marker(plannedRoute.startCoordinates, { icon: pinIcon('#10b981', 'START') }).addTo(map);
      L.marker(plannedRoute.endCoordinates, { icon: pinIcon('#ef4444', 'DESTINATION', 30) }).addTo(map);
      fitPoints.push(...plannedRoute.routeCoordinates);
    }

    // Actual traveled path (live GPS trail — real hardware or simulated)
    if (trail && trail.length > 1) {
      L.polyline(trail, {
        color: routeStatus === 'REROUTED' ? '#64748b' : '#1e60f2',
        weight: 4.5,
        opacity: 0.95,
        lineCap: 'round',
        smoothFactor: 2,
      }).addTo(map);
      fitPoints.push(...trail);
    }

    if (routeStatus === 'REROUTED' && recommendedFacility && emergencyRouteCoordinates) {
      // Active emergency route (red dashed line) to the recommended facility
      L.polyline(emergencyRouteCoordinates, {
        color: '#ef4444',
        weight: 4.5,
        opacity: 0.95,
        dashArray: '8 8',
        lineCap: 'round',
        smoothFactor: 1.5
      }).addTo(map);

      const storageCoords = [recommendedFacility.latitude, recommendedFacility.longitude];
      L.marker(storageCoords, { icon: coldStorageIcon(recommendedFacility.name, true) }).addTo(map);
      fitPoints.push(...emergencyRouteCoordinates, storageCoords);
    }

    if (truckPosition) {
      const truckMarker = L.marker(truckPosition, { icon: truckIcon }).addTo(map);
      truckMarker.bindPopup(
        `<div class="map-tooltip">
           <div class="map-tooltip-title">SUR-001</div>
           ${temp != null ? `<div class="map-tooltip-row">Temp: ${temp}°C</div>` : ''}
           ${humidity != null ? `<div class="map-tooltip-row">Humidity: ${humidity}%</div>` : ''}
           ${riskLabel ? `<div class="map-tooltip-row">Risk: <strong style="color: ${riskLabel === 'CRITICAL' ? '#ef4444' : riskLabel === 'WARNING' ? '#f59e0b' : '#10b981'}">${riskLabel}</strong></div>` : ''}
         </div>`,
        { closeButton: false, className: 'map-tooltip-popup', offset: [0, -6] }
      );
      truckMarker.openPopup();
      fitPoints.push(truckPosition);
    }

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
  }, [trail, truckPosition, routeStatus, recommendedFacility, emergencyRouteCoordinates, plannedRoute, temp, humidity, riskLabel, hasContent]);

  return (
    <div className="panel map-panel">
      <div className="panel-header">
        <h3>LIVE SHIPMENT TRACKING</h3>
        {hasContent && (
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
        )}
      </div>

      {hasContent ? (
        <>
          <div className="map-canvas" ref={containerRef} />
          <div className="map-legend">
            {plannedRoute && (
              <span className="legend-item">
                <span className="legend-swatch dashed" style={{ borderTopColor: routeStatus === 'REROUTED' ? '#475569' : '#1e60f2' }} />
                Planned Route
              </span>
            )}
            <span className="legend-item">
              <span className="legend-swatch solid" style={{ borderTopColor: routeStatus === 'REROUTED' ? '#64748b' : '#1e60f2' }} />
              {routeStatus === 'REROUTED' ? 'Shipment Path (Diverting)' : 'Live Shipment Path'}
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
        </>
      ) : (
        <div
          className="map-canvas"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: '#64748b',
            textAlign: 'center',
            padding: 24
          }}
        >
          <Satellite size={28} />
          <p style={{ margin: 0 }}>No active shipment yet.</p>
          <p className="product-range-text" style={{ margin: 0 }}>
            Set a route and start the simulated stream, or connect a real ESP32 device, from the Simulation page.
          </p>
        </div>
      )}
    </div>
  );
}
