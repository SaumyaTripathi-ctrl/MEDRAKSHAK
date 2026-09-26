import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  iconAnchor: [20, 20]
});

function coldStorageIcon(name, isRecommended = false) {
  const color = isRecommended ? '#10b981' : '#64748b';
  const glow = isRecommended ? 'box-shadow: 0 0 15px #10b981;' : '';
  return L.divIcon({
    className: 'storage-marker-icon',
    html: `
      <div class="storage-marker">
        <span class="storage-pin-label" style="background: ${color};">${name}</span>
        <div class="storage-pin" style="border-color: ${color}; ${glow}">
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

export default function EmergencyRouteMap({
  truckLocation,
  trail,
  plannedRoute,
  nearbyFacilities,
  recommendedFacility,
  emergencyRoute,
  routeStatus
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !truckLocation) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
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

    // Two separate point sets: `fitPoints` is everything drawn (used only
    // as a fallback), `zoomPoints` is what the camera actually fits to.
    // Previously these were the same array, so the full inter-city
    // plannedRoute/trail (often hundreds of km) dominated fitBounds and
    // zoomed the map out so far that a real emergency detour -- typically
    // just a few km to the nearest cold-storage facility -- rendered as an
    // invisible sliver or a single overlapping pixel. Once an emergency
    // route/facility is active, zoom to THAT local area instead; only fall
    // back to the wide shot when there's no emergency context yet.
    const fitPoints = [];
    const zoomPoints = [];

    // 1. Draw the planned route as a muted reference line, if one was set
    if (plannedRoute && plannedRoute.routeCoordinates) {
      L.polyline(plannedRoute.routeCoordinates, {
        color: '#334155',
        weight: 3,
        opacity: 0.5,
        dashArray: '2 10',
        lineCap: 'round'
      }).addTo(map);
      fitPoints.push(...plannedRoute.routeCoordinates);
    }

    // 2. Draw the shipment's actual GPS trail so far
    if (trail && trail.length > 1) {
      L.polyline(trail, {
        color: '#475569',
        weight: 3.5,
        opacity: 0.85,
        lineCap: 'round'
      }).addTo(map);
      fitPoints.push(...trail);
    }

    // 3. Draw Emergency Route if available (Red Dashed line)
    if (emergencyRoute) {
      L.polyline(emergencyRoute, {
        color: '#ef4444',
        weight: 4.5,
        opacity: 0.95,
        dashArray: '8 8',
        lineCap: 'round',
        smoothFactor: 1.5
      }).addTo(map);

      fitPoints.push(...emergencyRoute);
      zoomPoints.push(...emergencyRoute);
    }

    // 4. Draw nearby / recommended cold storage facilities
    if (nearbyFacilities) {
      nearbyFacilities.forEach(facility => {
        const isRec = recommendedFacility && recommendedFacility.id === facility.id;
        const storageCoords = [facility.latitude, facility.longitude];

        const marker = L.marker(storageCoords, { icon: coldStorageIcon(facility.name, isRec) }).addTo(map);

        marker.bindPopup(
          `<div class="map-tooltip">
             <div class="map-tooltip-title" style="color: ${isRec ? '#10b981' : '#fff'};">${facility.name}</div>
             <div class="map-tooltip-row">Type: ${facility.type}</div>
             <div class="map-tooltip-row">Range: ${facility.minTemp}–${facility.maxTemp}°C</div>
             <div class="map-tooltip-row">Avail. Cap: ${facility.availableCapacity} units</div>
             <div class="map-tooltip-row">Status: <strong style="color: #10b981;">${facility.status}</strong></div>
             <div class="map-tooltip-row">Distance: ${facility.distanceKm} km</div>
             <div class="map-tooltip-row">ETA: ${facility.etaMinutes} min</div>
             <div class="map-tooltip-row">Coordinates: ${facility.latitude?.toFixed(4)}, ${facility.longitude?.toFixed(4)}</div>
           </div>`,
          { className: 'map-tooltip-popup', offset: [0, -6] }
        );

        if (isRec) {
          fitPoints.push(storageCoords);
          zoomPoints.push(storageCoords);
        }
      });
    }

    // 5. Truck marker
    L.marker(truckLocation, { icon: truckIcon }).addTo(map)
      .bindPopup(
        `<div class="map-tooltip">
           <div class="map-tooltip-title" style="color: #ef4444;">🚨 EMERGENCY REROUTE</div>
           <div class="map-tooltip-row">Status: Excursion Active</div>
           <div class="map-tooltip-row">Coordinates: ${truckLocation[0]?.toFixed(4)}, ${truckLocation[1]?.toFixed(4)}</div>
         </div>`,
        { closeButton: false, className: 'map-tooltip-popup', offset: [0, -6] }
      ).openPopup();

    fitPoints.push(truckLocation);
    zoomPoints.push(truckLocation);

    // Zoom to the local emergency area (truck + detour + facility) when
    // one exists; otherwise fall back to fitting everything drawn.
    const bounds = L.latLngBounds(zoomPoints.length > 1 ? zoomPoints : fitPoints);
    // A detour that's only a couple of km wide would still fit at a very
    // tight zoom -- cap how far in fitBounds is allowed to go so the truck
    // and facility markers/popups stay comfortably on screen together.
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });

    const t = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
    }, 150);

    mapRef.current = map;

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [truckLocation, trail, plannedRoute, nearbyFacilities, recommendedFacility, emergencyRoute, routeStatus]);

  return (
    <div className="emergency-map-container">
      {truckLocation ? (
        <div className="map-canvas emergency-map-canvas" ref={containerRef} />
      ) : (
        <div
          className="map-canvas emergency-map-canvas"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
        >
          Waiting for shipment GPS data...
        </div>
      )}
    </div>
  );
}
