import React, { useState, useEffect } from 'react';
import { routeService } from '../services/routeService.js';
import { logService } from '../services/logService.js';
import { useRoute } from '../context/RouteContext.jsx';
import { LOCATIONS } from '../data/locations.js';
import { Package, MapPin, Play, ArrowRight, Radio, Bluetooth, Square, AlertOctagon } from 'lucide-react';

const PRODUCT_PROFILES = [
  {
    id: 'VACCINES',
    name: 'VACCINES',
    minTemp: 2,
    maxTemp: 8,
    desc: 'Required temperature: 2°C – 8°C'
  },
  {
    id: 'REFRIGERATED_MEDS',
    name: 'REFRIGERATED MEDICINES',
    minTemp: 2,
    maxTemp: 8,
    desc: 'Required temperature: 2°C – 8°C'
  },
  {
    id: 'ROOM_TEMP_MEDS',
    name: 'ROOM-TEMPERATURE MEDICINES',
    minTemp: 15,
    maxTemp: 25,
    desc: 'Required temperature: 15°C – 25°C'
  }
];

export default function Simulation({
  onStartSimulation,
  onConnectRealDevice,
  onForceExtremeTest,
  onStopSimulation,
  activeProduct,
  onSelectProduct,
  simulationState,
  sensorStatus,
  sensorStatusMessage,
  connectionMode,
  bleSupported,
  lastPacket,
  lastResponse
}) {
  const { routeState, updateRoute } = useRoute();
  const [startLoc, setStartLoc] = useState('Chennai');
  const [destLoc, setDestLoc] = useState('Bangalore');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (routeState) {
      setStartLoc(routeState.startName);
      setDestLoc(routeState.endName);
    }
  }, [routeState]);

  const handleCreateRoute = async () => {
    setErrorMessage('');
    
    const cleanStart = routeService.normalizeName(startLoc);
    const cleanDest = routeService.normalizeName(destLoc);

    if (!cleanStart || !cleanDest) {
      setErrorMessage('Please fill in both start and destination locations.');
      return;
    }

    if (!LOCATIONS[cleanStart]) {
      setErrorMessage(`Unknown Start Location: "${startLoc}". Supported cities: Chennai, Bangalore, Goa, Kashmir, Delhi, Mumbai, Pune, Kolkata, Hyderabad, Ahmedabad, Jaipur.`);
      return;
    }

    if (!LOCATIONS[cleanDest]) {
      setErrorMessage(`Unknown Destination Location: "${destLoc}". Supported cities: Chennai, Bangalore, Goa, Kashmir, Delhi, Mumbai, Pune, Kolkata, Hyderabad, Ahmedabad, Jaipur.`);
      return;
    }

    try {
      const resolvedRoute = await routeService.createRoute(cleanStart, cleanDest);
      updateRoute(resolvedRoute);

      logService.addLog({
        event_type: 'ROUTE',
        message: `Global active route updated from ${resolvedRoute.startName} to ${resolvedRoute.endName}`,
        parameter: 'GPS',
        value: `${resolvedRoute.distanceKm} km`,
        severity: 'INFO',
        latitude: resolvedRoute.startCoordinates[0],
        longitude: resolvedRoute.startCoordinates[1],
        location_name: resolvedRoute.startName
      });
    } catch (err) {
      setErrorMessage('Failed to build route path. Please try again.');
    }
  };

  return (
    <div className="simulation-page-wrapper">
      <div className="panel simulation-config-panel">
        <div className="panel-header">
          <h3>DEMONSTRATION SIMULATION CONFIGURATION</h3>
          {simulationState && simulationState.isRunning && (
            <span className="live-pill">
              STATUS: {simulationState.stage}
            </span>
          )}
        </div>

        {/* Validation Errors */}
        {errorMessage && (
          <div className="validation-error-alert" style={{ marginBottom: '16px' }}>
            {errorMessage}
          </div>
        )}

        {/* Section A: Product Profiles */}
        <div className="sim-section">
          <h4 className="sim-section-title">
            <Package size={16} /> A. PRODUCT CATEGORY
          </h4>
          <div className="product-cards-grid">
            {PRODUCT_PROFILES.map((p) => {
              const isSelected = activeProduct && activeProduct.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`product-profile-card${isSelected ? ' selected' : ''}`}
                  onClick={() => !simulationState.isRunning && onSelectProduct(p)}
                >
                  <span className="card-badge">{p.id === 'ROOM_TEMP_MEDS' ? 'Standard' : 'Cold Chain'}</span>
                  <h5>{p.name}</h5>
                  <p className="product-range-text">{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section B: Locations */}
        <div className="sim-section spacing-top">
          <h4 className="sim-section-title">
            <MapPin size={16} /> B. LOCATION
          </h4>
          <div className="sim-location-inputs">
            <div className="input-group">
              <label>START LOCATION</label>
              <input
                type="text"
                placeholder="e.g. Chennai"
                value={startLoc}
                onChange={(e) => !simulationState.isRunning && setStartLoc(e.target.value)}
              />
            </div>
            <div className="arrow-connector">
              <ArrowRight size={20} />
            </div>
            <div className="input-group">
              <label>END DESTINATION</label>
              <input
                type="text"
                placeholder="e.g. Bangalore"
                value={destLoc}
                onChange={(e) => !simulationState.isRunning && setDestLoc(e.target.value)}
              />
            </div>
            <button 
              className="route-build-btn" 
              onClick={handleCreateRoute}
              disabled={simulationState.isRunning}
            >
              CREATE ROUTE
            </button>
          </div>
        </div>

        {/* Route Details Panel */}
        {routeState && (
          <div className="route-summary-panel">
            <div className="summary-field">
              <span className="sum-label">GLOBAL ACTIVE ROUTE</span>
              <strong className="sum-value">{routeState.startName} to {routeState.endName}</strong>
            </div>
            <div className="summary-field">
              <span className="sum-label">DISTANCE</span>
              <strong className="sum-value">{routeState.distanceKm} km</strong>
            </div>
            <div className="summary-field">
              <span className="sum-label">ESTIMATED TIME</span>
              <strong className="sum-value">{routeState.estimatedTime}</strong>
            </div>
          </div>
        )}

        {/* Section C: Live ESP32 Connection */}
        <div className="sim-section spacing-top">
          <h4 className="sim-section-title">
            <Radio size={16} /> C. LIVE ESP32 CONNECTION
          </h4>
          <p className="product-range-text" style={{ marginBottom: 12 }}>
            Every reading below is sent for real to the FastAPI backend
            (<code>/sensor-data</code>) and runs through the real feature
            engineering + weather + ML pipeline. No hardware is required —
            use the simulated stream to exercise the full system today.
          </p>

          {activeProduct && routeState && (
            <div className="sim-start-row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button
                className="sim-start-btn"
                onClick={onStartSimulation}
                disabled={simulationState.isRunning}
              >
                <Play size={16} fill="#fff" />
                {simulationState.isRunning && connectionMode === 'simulated'
                  ? 'SIMULATED STREAM RUNNING...'
                  : 'START SIMULATED ESP32 STREAM'}
              </button>

              <button
                className="route-build-btn"
                onClick={onConnectRealDevice}
                disabled={simulationState.isRunning || !bleSupported}
                title={!bleSupported ? 'Web Bluetooth is not available in this browser' : ''}
              >
                <Bluetooth size={16} />
                CONNECT ESP32 VIA BLUETOOTH
              </button>

              <button
                className="route-build-btn"
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
                onClick={onForceExtremeTest}
                disabled={simulationState.isRunning}
                title="Sends a burst of deliberately out-of-range readings so you can immediately see the CRITICAL alert, emergency modal, and live cold-storage reroute — without waiting for the gradual drift."
              >
                <AlertOctagon size={16} />
                TEST: FORCE EXTREME / CRITICAL CASE
              </button>

              {simulationState.isRunning && (
                <button className="route-build-btn" onClick={onStopSimulation}>
                  <Square size={14} />
                  STOP
                </button>
              )}
            </div>
          )}

          <p className="product-range-text" style={{ marginTop: 8 }}>
            Not sure how to check the extreme/CRITICAL case? Click <strong>TEST: FORCE
            EXTREME / CRITICAL CASE</strong> above — it fires ~8 badly out-of-range readings
            back-to-back straight at the backend. Within a few seconds you should see: a
            SHOCK popup, a TEMPERATURE popup, then the red emergency modal
            ("🚨 CRITICAL COLD-CHAIN EXCURSION"). Click <strong>GO TO EMERGENCY ROUTE</strong>
            on that modal (or open the <strong>Alerts</strong> page) to see the live,
            road-routed cold-storage recommendation.
          </p>

          {!bleSupported && (
            <p className="product-range-text" style={{ marginTop: 8 }}>
              Web Bluetooth isn't available in this browser/context — use Chrome or Edge
              served from <code>http://127.0.0.1</code>. The simulated stream works everywhere.
            </p>
          )}

          {sensorStatusMessage && (
            <div className="route-summary-panel" style={{ marginTop: 12 }}>
              <div className="summary-field">
                <span className="sum-label">CONNECTION</span>
                <strong className="sum-value">
                  {connectionMode.toUpperCase()} · {sensorStatus.toUpperCase()}
                </strong>
              </div>
              <div className="summary-field" style={{ flex: 2 }}>
                <span className="sum-label">STATUS</span>
                <strong className="sum-value">{sensorStatusMessage}</strong>
              </div>
            </div>
          )}

          {(lastPacket || lastResponse) && (
            <div className="route-summary-panel" style={{ marginTop: 12, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              {lastPacket && (
                <div>
                  <span className="sum-label">LAST RAW ESP32 PACKET (post BLE-gateway conversion)</span>
                  <pre style={{ fontSize: 11, overflowX: 'auto', margin: '6px 0 0' }}>
                    {JSON.stringify(lastPacket, null, 2)}
                  </pre>
                </div>
              )}
              {lastResponse && lastResponse.prediction && (
                <div>
                  <span className="sum-label">LAST BACKEND PREDICTION</span>
                  <pre style={{ fontSize: 11, overflowX: 'auto', margin: '6px 0 0' }}>
                    {JSON.stringify(lastResponse.prediction, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
