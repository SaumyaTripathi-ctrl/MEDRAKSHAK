import React, { useState, useEffect } from 'react';
import { logService } from '../services/logService.js';
import { useRoute } from '../context/RouteContext.jsx';
import { routeService } from '../services/routeService.js';
import EmergencyRouteMap from '../components/EmergencyRouteMap.jsx';
import ColdStorageRecommendation from '../components/ColdStorageRecommendation.jsx';
import PcmFlapStatus from '../components/PcmFlapStatus.jsx';
import { ShieldAlert, Bell, BellOff } from 'lucide-react';

export default function Alerts({ shipmentState, emergencyMode, liveColdStorageFacilities, acknowledged, onAcknowledge }) {
  const { routeState, setReroute } = useRoute();
  const [selectedStorage, setSelectedStorage] = useState(null);
  const [emergencyRoutePath, setEmergencyRoutePath] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');

  const {
    trail,
    truckPosition,
    routeStatus,
    plannedRoute
  } = routeState;

  useEffect(() => {
    setLogs(logService.getLogs());
  }, []);

  // Fetch a real road route between the truck's live position and the
  // selected facility.
  useEffect(() => {
    const fetchDetour = async () => {
      if (selectedStorage && truckPosition) {
        try {
          const path = await routeService.createRouteFromCoordinates(
            truckPosition,
            [selectedStorage.latitude, selectedStorage.longitude]
          );
          setEmergencyRoutePath(path);
        } catch (e) {
          console.error('Failed to resolve OSRM detour path:', e);
        }
      }
    };
    fetchDetour();
  }, [selectedStorage, truckPosition]);

  const handleSelectStorage = (facility) => {
    setSelectedStorage(facility);
  };

  const handleConfirmReroute = () => {
    if (!selectedStorage || !emergencyRoutePath || !truckPosition) return;

    // Save globally in Context
    setReroute(selectedStorage, emergencyRoutePath);

    // Stamped with the shipment's own last-reading instant (see App.jsx's
    // lastReadingTimestamp) rather than the real click-time, so a reroute
    // logged while time acceleration is running lands on the same
    // accelerated timeline as the sensor-triggered log entries around it,
    // instead of jumping back to real time.
    logService.addLog({
      event_type: 'ROUTE',
      message: `Shipment rerouted to cold storage: ${selectedStorage.name}`,
      parameter: 'GPS',
      value: `${selectedStorage.distanceKm} km`,
      severity: 'CRITICAL',
      latitude: selectedStorage.latitude,
      longitude: selectedStorage.longitude,
      location_name: selectedStorage.name,
      timestamp: shipmentState.lastReadingTimestamp
    });

    logService.addLog({
      event_type: 'SYSTEM',
      message: `New active route destination set to ${selectedStorage.name}`,
      parameter: 'SYSTEM',
      value: 'REROUTED',
      severity: 'INFO',
      latitude: truckPosition[0],
      longitude: truckPosition[1],
      location_name: 'Transit Diversion Point',
      timestamp: shipmentState.lastReadingTimestamp
    });
  };

  // Filter logs for normal Mode
  const alertLogs = logs.filter(log =>
    log.event_type === 'TEMPERATURE' ||
    log.event_type === 'HUMIDITY' ||
    log.event_type === 'SHOCK' ||
    log.event_type === 'DOOR' ||
    log.event_type === 'BATTERY' ||
    log.event_type === 'CRITICAL' ||
    log.event_type === 'ROUTE' ||
    log.event_type === 'SYSTEM'
  );

  const filteredLogs = alertLogs.filter(log => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'WARNING') return log.severity === 'WARNING' || log.severity === 'HIGH';
    if (activeTab === 'CRITICAL') return log.severity === 'CRITICAL';
    if (activeTab === 'INFO') return log.severity === 'INFO';
    return true;
  });

  if (emergencyMode) {
    return (
      <div className="alerts-emergency-page">
        {/* Emergency Dashboard Header */}
        <div className="panel emergency-status-banner">
          <div className="esb-left">
            <ShieldAlert size={28} className="pulse-danger-icon" />
            <div>
              <h3>🚨 EMERGENCY COLD-CHAIN INTERVENTION</h3>
              <p>Critical temperature excursion detected during transit. Rerouting required.</p>
            </div>
          </div>
          <div className="esb-metrics">
            <div className="esb-m-card">
              <span>TEMP</span>
              <strong>{shipmentState.temperature}°C</strong>
            </div>
            <div className="esb-m-card card-red">
              <span>RISK</span>
              <strong>{shipmentState.riskLevel}</strong>
            </div>
            <div className="esb-m-card card-blue">
              <span>COOLING</span>
              <strong>{shipmentState.coolingActive ? 'ACTIVATED' : 'INACTIVE'}</strong>
            </div>
            <div className="esb-m-card">
              <span>SAFE TIME</span>
              <strong>{shipmentState.safeTime}</strong>
            </div>
          </div>
          <button
            className="emergency-btn-ack"
            style={{ flex: 'none', padding: '10px 18px' }}
            onClick={onAcknowledge}
            disabled={acknowledged}
            title="Silences the ESP32's critical buzzer. The alert tier and LEDs keep tracking live readings regardless."
          >
            <BellOff size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
            {acknowledged ? 'ALARM SILENCED' : 'ACKNOWLEDGE'}
          </button>
        </div>

        {/* PCM cooling flap / coolant status — kept as its own distinct
            box (hardware novelty), not folded into the metric cards above. */}
        <PcmFlapStatus active={!!shipmentState.coolingActive} variant="banner" />

        {/* Emergency Rerouting Grid */}
        <div className="emergency-routing-grid">
          {/* Leaflet map of rerouting */}
          <div className="panel emergency-map-panel">
            <div className="panel-header">
              <h3>🚨 EMERGENCY RE-ROUTE MAP</h3>
              <span className="map-loc-sub">Rerouting Truck SUR-001</span>
            </div>
            <EmergencyRouteMap
              truckLocation={truckPosition}
              trail={trail}
              plannedRoute={plannedRoute}
              nearbyFacilities={selectedStorage ? [selectedStorage] : []}
              recommendedFacility={selectedStorage}
              emergencyRoute={emergencyRoutePath}
              routeStatus={routeStatus}
            />
          </div>

          {/* Details & Recommendation Card */}
          <ColdStorageRecommendation
            onSelectStorage={handleSelectStorage}
            onRerouteConfirm={handleConfirmReroute}
            routeStatus={routeStatus}
            liveFacilities={liveColdStorageFacilities}
          />
        </div>
      </div>
    );
  }

  // Normal alerts history page view
  return (
    <div className="normal-alerts-page">
      <div className="panel alerts-history-panel">
        <div className="panel-header">
          <h3>
            <Bell size={15} className="inline-ic" />
            ALERT & EVENT LOG HISTORY
          </h3>

          <div className="alerts-filter-tabs">
            {['ALL', 'WARNING', 'CRITICAL', 'INFO'].map(tab => (
              <button
                key={tab}
                className={`alerts-tab-btn${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="no-alerts-placeholder">
            <span className="clean-system-dot" />
            <p>No logged events match the active tab selection.</p>
          </div>
        ) : (
          <div className="alerts-list">
            {filteredLogs.map((log) => (
              <div key={log.id} className={`alert-list-item severity-${log.severity.toLowerCase()}`}>
                <div className="ali-header">
                  <span className="ali-pill">
                    {log.severity}
                  </span>
                  <span className="ali-time">{log.timestamp}</span>
                </div>
                <div className="ali-body">
                  <h4>{log.event_type} - {log.message}</h4>
                  <p>
                    Excursion value: <strong>{log.value}</strong> at {log.location_name} ({log.latitude.toFixed(4)}, {log.longitude.toFixed(4)})
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
