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
  startLocation,
  destinationLocation,
  originalRoute,
  nearbyFacilities,
  recommendedFacility,
  emergencyRoute,
  routeStatus
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

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

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; OpenStreetMap &copy; CARTO')
      .addTo(map);

    const fitPoints = [];

    // 1. Draw Original planned route (Solid blue, or muted gray-blue if rerouted)
    const originalRouteColor = routeStatus === 'REROUTED' ? '#475569' : '#1e60f2';
    L.polyline(originalRoute, {
      color: originalRouteColor,
      weight: 3.5,
      opacity: 0.85,
      lineCap: 'round'
    }).addTo(map);

    fitPoints.push(...originalRoute);

    // 2. Draw Emergency Route if available (Red Dashed line)
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
    }

    // 3. Add Original Start and Destination pins
    L.marker(startLocation, { icon: pinIcon('#10b981', 'START') }).addTo(map);
    L.marker(destinationLocation, { icon: pinIcon('#ef4444', 'DESTINATION', 30) }).addTo(map);

    // 4. Draw Nearby Cold Storages
    if (nearbyFacilities) {
      nearbyFacilities.forEach(facility => {
        const isRec = recommendedFacility && recommendedFacility.id === facility.id;
        const storageCoords = [facility.latitude, facility.longitude];
        
        const marker = L.marker(storageCoords, { icon: coldStorageIcon(facility.name, isRec) }).addTo(map);
        
        // Custom popup on marker click
        marker.bindPopup(
          `<div class="map-tooltip">
             <div class="map-tooltip-title" style="color: ${isRec ? '#10b981' : '#fff'};">${facility.name}</div>
             <div class="map-tooltip-row">Type: ${facility.type}</div>
             <div class="map-tooltip-row">Range: ${facility.minTemp}–${facility.maxTemp}°C</div>
             <div class="map-tooltip-row">Avail. Cap: ${facility.availableCapacity} units</div>
             <div class="map-tooltip-row">Status: <strong style="color: #10b981;">${facility.status}</strong></div>
             <div class="map-tooltip-row">Distance: ${facility.distanceKm} km</div>
             <div class="map-tooltip-row">ETA: ${facility.etaMinutes} min</div>
           </div>`,
          { className: 'map-tooltip-popup', offset: [0, -6] }
        );

        if (isRec) {
          fitPoints.push(storageCoords);
        }
      });
    }

    // 5. Add Truck Marker (Blue truck icon)
    L.marker(truckLocation, { icon: truckIcon }).addTo(map)
      .bindPopup(
        `<div class="map-tooltip">
           <div class="map-tooltip-title" style="color: #ef4444;">🚨 EMERGENCY REROUTE</div>
           <div class="map-tooltip-row">Status: Excursion Active</div>
         </div>`,
        { closeButton: false, className: 'map-tooltip-popup', offset: [0, -6] }
      ).openPopup();

    fitPoints.push(truckLocation);

    // Fit bounds to cover start, end, truck, and recommended facility
    const bounds = L.latLngBounds(fitPoints);
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
  }, [truckLocation, startLocation, destinationLocation, originalRoute, nearbyFacilities, recommendedFacility, emergencyRoute, routeStatus]);

  return (
    <div className="emergency-map-container">
      <div className="map-canvas emergency-map-canvas" ref={containerRef} />
    </div>
  );
}
