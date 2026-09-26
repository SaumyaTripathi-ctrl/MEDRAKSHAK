import React, { useState } from 'react';
import { routeService } from '../services/routeService.js';
import { useRoute } from '../context/RouteContext.jsx';
import { Package, MapPin, ArrowRight, Radio, Square, Zap, FlaskConical, Gauge } from 'lucide-react';

const TIME_SPEEDS = [1, 5, 10, 20];

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
  onConnectDevice,
  onDisconnect,
  onPingDevice,
  activeProduct,
  onSelectProduct,
  sensorStatus,
  sensorStatusMessage,
  connectionMode,
  bleSupported,
  lastPacket,
  lastResponse,
  modelMode,
  onSetModelMode,
  timeAcceleration,
  onSetTimeAcceleration
}) {
  const { routeState, setPlannedRoute } = useRoute();
  const plannedRoute = routeState.plannedRoute;
  const [startLoc, setStartLoc] = useState(plannedRoute ? plannedRoute.startName : 'Chennai');
  const [destLoc, setDestLoc] = useState(plannedRoute ? plannedRoute.endName : 'Bangalore');
  const [errorMessage, setErrorMessage] = useState('');
  const [isBuildingRoute, setIsBuildingRoute] = useState(false);

  // connectionMode flips to 'ble' the moment a connection attempt STARTS,
  // before it's known to succeed — so connectionMode alone can't tell us
  // whether a device is actually connected. A failed attempt (status
  // 'error') or a lost connection (status 'disconnected', e.g. the board
  // powered off or walked out of range) must not keep the form locked, or
  // the product/route inputs stay disabled forever after any failure.
  const isConnected = connectionMode !== 'idle' && (sensorStatus === 'connecting' || sensorStatus === 'connected');

  const handleCreateRoute = async () => {
    setErrorMessage('');

    const cleanStart = routeService.normalizeName(startLoc);
    const cleanDest = routeService.normalizeName(destLoc);

    if (!cleanStart || !cleanDest) {
      setErrorMessage('Please fill in both start and destination locations.');
      return;
    }

    setIsBuildingRoute(true);

    // Trigger the real ESP32 Bluetooth connection immediately, in this same
    // click handler — Web Bluetooth's device picker requires a direct user
    // gesture and won't open if fired after an awaited network call below.
    if (!bleSupported) {
      setErrorMessage(
        'Web Bluetooth is not available in this browser/context — use Chrome or Edge ' +
        'served from http://127.0.0.1 or https.'
      );
      setIsBuildingRoute(false);
      return;
    }
    onConnectDevice();

    try {
      const resolvedRoute = await routeService.createRoute(cleanStart, cleanDest);
      setPlannedRoute(resolvedRoute);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to build route path. Please try again.');
    } finally {
      setIsBuildingRoute(false);
    }
  };

  return (
    <div className="simulation-page-wrapper">
      <div className="panel simulation-config-panel">
        <div className="panel-header">
          <h3>SHIPMENT SETUP</h3>
          {isConnected && (
            <span className="live-pill">
              {sensorStatus.toUpperCase()}
            </span>
          )}
        </div>

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
                  onClick={() => !isConnected && onSelectProduct(p)}
                >
                  <span className="card-badge">{p.id === 'ROOM_TEMP_MEDS' ? 'Standard' : 'Cold Chain'}</span>
                  <h5>{p.name}</h5>
                  <p className="product-range-text">{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section B: Shipment Route — set it, and the ESP32 connects automatically */}
        <div className="sim-section spacing-top">
          <h4 className="sim-section-title">
            <MapPin size={16} /> B. SHIPMENT ROUTE
          </h4>
          <div className="sim-location-inputs" style={{ marginTop: 12 }}>
            <div className="input-group">
              <label>START LOCATION</label>
              <input
                type="text"
                placeholder="e.g. Chennai"
                value={startLoc}
                onChange={(e) => !isConnected && setStartLoc(e.target.value)}
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
                onChange={(e) => !isConnected && setDestLoc(e.target.value)}
              />
            </div>
            <button
              className="route-build-btn"
              onClick={handleCreateRoute}
              disabled={isConnected || isBuildingRoute}
            >
              {isBuildingRoute ? 'CONNECTING...' : 'SET ROUTE & CONNECT'}
            </button>
          </div>

          {plannedRoute && (
            <div className="route-summary-panel">
              <div className="summary-field">
                <span className="sum-label">ACTIVE ROUTE</span>
                <strong className="sum-value">{plannedRoute.startName} to {plannedRoute.endName}</strong>
              </div>
              <div className="summary-field">
                <span className="sum-label">DISTANCE</span>
                <strong className="sum-value">{plannedRoute.distanceKm} km</strong>
              </div>
              <div className="summary-field">
                <span className="sum-label">ESTIMATED TIME</span>
                <strong className="sum-value">{plannedRoute.estimatedTime}</strong>
              </div>
            </div>
          )}

          {!bleSupported && (
            <p className="product-range-text" style={{ marginTop: 8 }}>
              Web Bluetooth isn't available in this browser/context — use Chrome or Edge
              served from <code>http://127.0.0.1</code> or https.
            </p>
          )}
        </div>

        {/* Section C: Prediction model — switchable live, no reconnect needed */}
        <div className="sim-section spacing-top">
          <h4 className="sim-section-title">
            <FlaskConical size={16} /> C. PREDICTION MODEL
          </h4>
          <div className="sim-start-row" style={{ gap: 10, marginTop: 12 }}>
            <button
              className="route-build-btn"
              onClick={() => onSetModelMode('real')}
              style={modelMode === 'real' ? { outline: '2px solid currentColor' } : { opacity: 0.6 }}
            >
              REAL MODEL
            </button>
            <button
              className="route-build-btn"
              onClick={() => onSetModelMode('demo')}
              style={modelMode === 'demo' ? { outline: '2px solid currentColor' } : { opacity: 0.6 }}
            >
              DEMO MODE
            </button>
            <span className="live-pill">
              ACTIVE: {modelMode === 'demo' ? 'DEMO MODE' : 'REAL MODEL'}
            </span>
          </div>
        </div>

        {/* Section D: Time acceleration — speeds up the simulated clock fed
            into the backend's ramp calculation, independent of GPS/real
            wall-clock time. Switchable live, no reconnect needed. */}
        <div className="sim-section spacing-top">
          <h4 className="sim-section-title">
            <Gauge size={16} /> D. TIME ACCELERATION
          </h4>
          <div className="sim-start-row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            {TIME_SPEEDS.map((speed) => (
              <button
                key={speed}
                className="route-build-btn"
                onClick={() => onSetTimeAcceleration(speed)}
                style={timeAcceleration === speed ? { outline: '2px solid currentColor' } : { opacity: 0.6 }}
              >
                {speed}×
              </button>
            ))}
            <span className="live-pill">
              SPEED: {timeAcceleration}×
            </span>
          </div>
        </div>

        {/* Device status — read-only, no manual connect controls */}
        {(plannedRoute || isConnected) && (
          <div className="sim-section spacing-top">
            <h4 className="sim-section-title">
              <Radio size={16} /> DEVICE STATUS
            </h4>

            {sensorStatusMessage && (
              <div className="route-summary-panel">
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

            {isConnected && (
              <div className="sim-start-row" style={{ gap: 10, marginTop: 10 }}>
                <button className="route-build-btn" onClick={onPingDevice}>
                  <Zap size={14} />
                  PING DEVICE
                </button>
                <button className="route-build-btn" onClick={onDisconnect}>
                  <Square size={14} />
                  DISCONNECT
                </button>
              </div>
            )}

            {(lastPacket || lastResponse) && (
              <div className="route-summary-panel" style={{ marginTop: 12, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                {lastPacket && (
                  <div>
                    <span className="sum-label">LAST RAW ESP32 PACKET (as received over BLE)</span>
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
        )}
      </div>
    </div>
  );
}
