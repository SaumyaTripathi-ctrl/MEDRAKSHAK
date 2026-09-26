import React, { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import Simulation from './pages/Simulation.jsx';
import Alerts from './pages/Alerts.jsx';
import Reports from './pages/Reports.jsx';
import AlertPopup from './components/AlertPopup.jsx';
import EmergencyModal from './components/EmergencyModal.jsx';
import { authService } from './services/authService.js';
import { apiService } from './services/apiService.js';
import { logService } from './services/logService.js';
import { RouteProvider, useRoute } from './context/RouteContext.jsx';
import { SensorProvider, useSensor, formatMinutes } from './context/SensorContext.jsx';
import { normalizeColdStorageRecommendation } from './utils/normalizeFacility.js';
import { PRODUCT_TYPE_MAP, DEFAULT_SHIPMENT_ID } from './config.js';

const DEFAULT_PRODUCT = {
  id: 'VACCINES',
  name: 'VACCINES',
  minTemp: 2,
  maxTemp: 8,
  desc: 'Required temperature: 2°C – 8°C'
};

// The shipment has no readings until a stream starts (simulated demo or
// real ESP32 over BLE) and the first packet has been converted + sent.
const NOT_CONNECTED_STATE = {
  temperature: null,
  humidity: null,
  shock: null,
  riskScore: null,
  riskLevel: null,
  safeTime: null,
  coolingActive: false,
  isRunning: false,
  stage: 'NOT_CONNECTED',
  lastReadingTimestamp: null
};

function AppContent() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { routeState, recordPosition, resetStream, resetRoute } = useRoute();
  const sensor = useSensor();

  // Shared shipment state — driven entirely by real backend predictions
  // (see SensorContext), whether the reading came from the simulated demo
  // stream or a real ESP32 over Bluetooth.
  const [shipmentState, setShipmentState] = useState({
    ...NOT_CONNECTED_STATE,
    product: DEFAULT_PRODUCT
  });

  const [emergencyMode, setEmergencyMode] = useState(false);
  const [liveColdStorageFacilities, setLiveColdStorageFacilities] = useState([]);

  // Overlay triggers
  const [activeAlert, setActiveAlert] = useState(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyAlertData, setEmergencyAlertData] = useState(null);
  const [alertsCount, setAlertsCount] = useState(0);
  // Mirrors the ESP32's own criticalAlertAcknowledged latch (see the
  // firmware's ACK_CRITICAL handling) purely for the UI — pressing
  // "Acknowledge" sends ACK_CRITICAL over BLE to silence the physical
  // buzzer; the LEDs/alert tier keep tracking live readings regardless.
  const [criticalAcknowledged, setCriticalAcknowledged] = useState(false);

  // Edge-trigger tracking so alerts/log entries/modals fire once per
  // excursion rather than on every reading while conditions persist.
  const shockAlertActiveRef = useRef(false);
  const tempAlertActiveRef = useRef(false);
  const doorAlertActiveRef = useRef(false);
  const criticalModalFiredRef = useRef(false);
  // Tracks the last risk_level tier pushed to the ESP32's own green/blue/red
  // alert LEDs + buzzer over BLE, so it's only re-sent when the backend's
  // classification actually changes tier (not on every 2s reading).
  const lastAlertLevelSentRef = useRef(null);
  // Holds the red LED on for a bit after a CRITICAL episode clears, instead
  // of snapping straight to green the instant one reading comes back in
  // range — a single borderline reading right after a spike shouldn't flip
  // the light. Set to the simulated-clock instant (see payload.timestamp,
  // TIME ACCELERATION on the Simulation page) that the reading first left
  // CRITICAL; null while not holding. Measured on the SIMULATED clock, not
  // the real one, so the hold compresses along with the demo ramp when
  // accelerated instead of dragging out in real time regardless of speed.
  const criticalRecoveryStartRef = useRef(null);
  const CRITICAL_RECOVERY_HOLD_SECONDS = 15; // "10 to 20 seconds" — picked the midpoint

  // Check auth session
  useEffect(() => {
    const loggedInUser = authService.getCurrentUser();
    if (loggedInUser) {
      setUser(loggedInUser);
    }
    updateAlertBadgeCount();

    return () => {
      sensor.stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAlertBadgeCount = () => {
    const logs = logService.getLogs();
    const count = logs.filter(log =>
      log.event_type === 'TEMPERATURE' ||
      log.event_type === 'HUMIDITY' ||
      log.event_type === 'SHOCK' ||
      log.event_type === 'DOOR' ||
      log.event_type === 'BATTERY' ||
      log.event_type === 'CRITICAL'
    ).length;
    setAlertsCount(count);
  };

  const resetAlertState = () => {
    shockAlertActiveRef.current = false;
    tempAlertActiveRef.current = false;
    doorAlertActiveRef.current = false;
    criticalModalFiredRef.current = false;
    lastAlertLevelSentRef.current = null;
    criticalRecoveryStartRef.current = null;
    setEmergencyMode(false);
    setActiveAlert(null);
    setShowEmergencyModal(false);
    setLiveColdStorageFacilities([]);
    setCriticalAcknowledged(false);
  };

  // Silences the ESP32's latching CRITICAL buzzer via BLE. Does not touch
  // the LED tier or the ML pipeline in any way — purely an audible-alarm ack.
  const handleAcknowledgeCritical = () => {
    sensor.sendCommand('ACK_CRITICAL');
    setCriticalAcknowledged(true);
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    authService.logout();
    sensor.stopStream();
    resetRoute();
    resetAlertState();
    setEmergencyAlertData(null);
    setShipmentState({ ...NOT_CONNECTED_STATE, product: DEFAULT_PRODUCT });
    setUser(null);
    setCurrentPage('dashboard');
  };

  const handleSelectProduct = (product) => {
    setShipmentState(prev => ({ ...prev, product }));
  };

  // -----------------------------------------------------------------
  // Live pipeline: react to every new backend prediction as it arrives
  // (ESP32/simulated packet -> BLE gateway -> /sensor-data -> features +
  // weather -> ML -> here).
  // -----------------------------------------------------------------
  useEffect(() => {
    const response = sensor.lastResponse;
    const payload = sensor.lastPayload;
    if (!response || !response.prediction || !payload) return;

    const prediction = response.prediction;
    const product = shipmentState.product || DEFAULT_PRODUCT;
    const plannedRoute = routeState.plannedRoute;
    const location = {
      lat: payload.latitude,
      lng: payload.longitude,
      name: plannedRoute ? plannedRoute.startName : `${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}`
    };

    // Track the shipment's real (or simulated) GPS position on the map.
    recordPosition(payload.latitude, payload.longitude);

    // Was the device still latched on the red CRITICAL LED as of the LAST
    // reading? (lastAlertLevelSentRef isn't mutated until the dispatch
    // block below, so this reads the pre-this-reading value.) Used both to
    // keep the PCM flap/coolant indicator visibly ON through the recovery
    // hold below, and to decide whether this reading needs to pass the hold
    // before the board is allowed to downgrade off red.
    const wasLatchedCritical = lastAlertLevelSentRef.current === 'CRITICAL';

    setShipmentState(prev => ({
      ...prev,
      temperature: payload.temperature,
      humidity: payload.humidity,
      shock: payload.shock,
      riskScore: Math.round(prediction.spoilage_risk),
      riskLevel: prediction.risk_level,
      safeTime: formatMinutes(prediction.estimated_remaining_safe_time),
      // Keep showing "coolant activated / PCM flap open" for as long as the
      // board is still latched red (including through the recovery hold
      // below), even on the reading(s) where cooling_required has already
      // flipped back to false — so the flap visibly closes at the same
      // moment the LED actually goes green, not before.
      coolingActive: prediction.cooling_required || wasLatchedCritical,
      isRunning: true,
      stage: prediction.risk_level,
      // The reading's own (possibly time-accelerated, see the Simulation
      // page's TIME ACCELERATION control) instant — carried on shipmentState
      // so any log entry fired outside this effect, e.g. Alerts.jsx's
      // reroute confirmation, can stamp itself with the same clock instead
      // of the real device time at click-time.
      lastReadingTimestamp: payload.timestamp
    }));

    // --- Push the backend's risk tier to the ESP32's own alert LEDs +
    // buzzer over BLE, so the physical device reflects the same ML-driven
    // SAFE/WARNING/CRITICAL classification the dashboard shows, instead of
    // the board guessing from its own raw temperature threshold. Only sent
    // when the tier actually changes (not on every 2s reading), so this
    // doesn't flood the command channel, and it's what drives the board's
    // LEDs via CommandCB::onWrite() seeing ALERT_SAFE / ALERT_WARNING /
    // ALERT_CRITICAL.
    //
    // Escalation (into WARNING or CRITICAL) is always sent immediately —
    // no delay on a worsening reading, ever. De-escalation OFF of CRITICAL
    // is different: instead of dropping red the instant a single reading
    // comes back in range, hold red for CRITICAL_RECOVERY_HOLD_SECONDS of
    // *simulated* time (so the hold speeds up with the TIME ACCELERATION
    // control, same as the ramp that put it in CRITICAL) of sustained
    // non-CRITICAL readings before actually downgrading. Any CRITICAL
    // reading during that hold cancels it and the hold restarts next time.
    if (prediction.risk_level === 'CRITICAL') {
      criticalRecoveryStartRef.current = null;
      if (lastAlertLevelSentRef.current !== 'CRITICAL') {
        lastAlertLevelSentRef.current = 'CRITICAL';
        sensor.sendCommand('ALERT_CRITICAL');
      }
    } else if (wasLatchedCritical) {
      const nowSimMs = new Date(payload.timestamp).getTime();
      if (criticalRecoveryStartRef.current == null) {
        criticalRecoveryStartRef.current = nowSimMs;
      }
      const heldSeconds = (nowSimMs - criticalRecoveryStartRef.current) / 1000;
      if (heldSeconds >= CRITICAL_RECOVERY_HOLD_SECONDS) {
        lastAlertLevelSentRef.current = prediction.risk_level;
        sensor.sendCommand(`ALERT_${prediction.risk_level}`);
        criticalRecoveryStartRef.current = null;
      }
      // else: still holding red this reading — no command sent, so the
      // board (and shipmentState.coolingActive above) both stay latched.
    } else if (prediction.risk_level && prediction.risk_level !== lastAlertLevelSentRef.current) {
      lastAlertLevelSentRef.current = prediction.risk_level;
      sensor.sendCommand(`ALERT_${prediction.risk_level}`);
    }

    // --- Shock excursion (edge-triggered on raw sensor value) ---
    const shockActive = payload.shock > 1.0;
    if (shockActive && !shockAlertActiveRef.current) {
      shockAlertActiveRef.current = true;
      setActiveAlert({
        parameter: 'SHOCK',
        value: `${payload.shock} g`,
        safeRange: '< 1.0 g',
        message: 'Drive slowly. Excessive vibration recorded.',
        recommended: 'Reduce vehicle speed immediately.',
        severity: 'WARNING',
        timestamp: new Date(payload.timestamp).toLocaleTimeString()
      });
      logService.addLog({
        event_type: 'SHOCK',
        message: 'High vibration detected',
        parameter: 'SHOCK',
        value: `${payload.shock} g`,
        severity: 'WARNING',
        latitude: location.lat,
        longitude: location.lng,
        location_name: location.name,
        timestamp: payload.timestamp
      });
      updateAlertBadgeCount();
    } else if (!shockActive) {
      shockAlertActiveRef.current = false;
    }

    // --- Temperature excursion (edge-triggered on raw sensor value) ---
    const tempOutside = payload.temperature < product.minTemp || payload.temperature > product.maxTemp;
    if (tempOutside && !tempAlertActiveRef.current) {
      tempAlertActiveRef.current = true;
      setActiveAlert({
        parameter: 'TEMPERATURE',
        value: `${payload.temperature}°C`,
        safeRange: `${product.minTemp}°C – ${product.maxTemp}°C`,
        message: 'Temperature is outside the safe range.',
        recommended: 'Monitor shipment condition.',
        severity: 'WARNING',
        timestamp: new Date(payload.timestamp).toLocaleTimeString()
      });
      logService.addLog({
        event_type: 'TEMPERATURE',
        message: 'Temperature exceeded safe limit',
        parameter: 'TEMPERATURE',
        value: `${payload.temperature}°C`,
        severity: 'HIGH',
        latitude: location.lat,
        longitude: location.lng,
        location_name: location.name,
        timestamp: payload.timestamp
      });
      updateAlertBadgeCount();
    } else if (!tempOutside) {
      tempAlertActiveRef.current = false;
    }

    // --- Door / anti-tamper and battery checks, from the raw ESP32 packet ---
    // (bat_pct, door, door_s aren't part of the ML feature vector, so they
    // only exist on sensor.lastPacket, not on the converted payload.)
    const packet = sensor.lastPacket;
    if (packet) {
      // The firmware itself buzzes + lights the white LED once the lid has
      // been open longer than 5s — mirror that same threshold here.
      const doorOpenSustained = packet.door === true && (packet.door_s || 0) > 5;
      if (doorOpenSustained && !doorAlertActiveRef.current) {
        doorAlertActiveRef.current = true;
        setActiveAlert({
          parameter: 'DOOR',
          value: `${packet.door_s}s open`,
          safeRange: 'Closed',
          message: 'Cargo box lid has been open for an extended period.',
          recommended: 'Check for tampering or an unsecured latch.',
          severity: 'WARNING',
          timestamp: new Date(payload.timestamp).toLocaleTimeString()
        });
        logService.addLog({
          event_type: 'DOOR',
          message: 'Cargo box lid open beyond safe duration',
          parameter: 'DOOR',
          value: `${packet.door_s}s`,
          severity: 'WARNING',
          latitude: location.lat,
          longitude: location.lng,
          location_name: location.name,
          timestamp: payload.timestamp
        });
        updateAlertBadgeCount();
      } else if (!doorOpenSustained) {
        doorAlertActiveRef.current = false;
      }

      // Battery-low popup intentionally removed (per explicit request: "we
      // dont want battery excursion at all at any condition"). The v_bat /
      // bat_pct readout is still visible on the Simulation page's DEVICE
      // STATUS -> LAST RAW ESP32 PACKET panel for anyone who wants to check
      // it manually — it just no longer pops an alert or writes a log entry.
      // The underlying reading (packet.bat_pct) was also found to swing
      // wildly on this board (e.g. v_bat 2.57V / 0% while temp/humidity/GPS
      // all read normally), which looks like a real hardware/calibration
      // issue (wrong voltage-divider assumption, a loose battery connector
      // during the shake-test action, or a genuinely unreliable cell) rather
      // than sensor noise the firmware's ADC averaging can smooth over. If
      // you want this alert back once the battery reading itself is trusted,
      // reintroduce a `bat_pct <= threshold` check here.
    }

    // --- CRITICAL: the real ML model has flagged spoilage risk ---
    if (prediction.risk_level === 'CRITICAL' && !criticalModalFiredRef.current) {
      criticalModalFiredRef.current = true;
      // Fresh CRITICAL episode — mirrors the firmware re-arming its own
      // criticalAlertAcknowledged flag on a new ALERT_CRITICAL, so the UI's
      // "Acknowledge" button/label reflects THIS episode's ack state, not a
      // stale ack carried over from an earlier excursion.
      setCriticalAcknowledged(false);

      setEmergencyAlertData({
        temperature: payload.temperature,
        safeRange: `${product.minTemp}°C – ${product.maxTemp}°C`,
        remainingTime: formatMinutes(prediction.estimated_remaining_safe_time),
        recipients: ['driver@suraksha.com', 'manager@suraksha.com', 'admin@suraksha.com']
      });
      setShowEmergencyModal(true);

      logService.addLog({
        event_type: 'CRITICAL',
        message: 'Critical spoilage risk threshold breached (ML prediction)',
        parameter: 'TEMPERATURE',
        value: `${payload.temperature}°C`,
        severity: 'CRITICAL',
        latitude: location.lat,
        longitude: location.lng,
        location_name: location.name,
        timestamp: payload.timestamp
      });

      if (prediction.cooling_required) {
        logService.addLog({
          event_type: 'COOLING',
          message: 'Active auxiliary cooling activated',
          parameter: 'SYSTEM',
          value: 'ACTIVATED',
          severity: 'HIGH',
          latitude: location.lat,
          longitude: location.lng,
          location_name: location.name,
          timestamp: payload.timestamp
        });
      }
      updateAlertBadgeCount();
    } else if (prediction.risk_level !== 'CRITICAL') {
      criticalModalFiredRef.current = false;
    }

    // --- Cold-storage recommendation (real facility dataset + OSRM) ---
    if (response.cold_storage_recommendation) {
      setLiveColdStorageFacilities(normalizeColdStorageRecommendation(response.cold_storage_recommendation));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensor.lastResponse]);

  // Connects to the real ESP32 over Bluetooth. Triggered automatically by
  // the Simulation page the moment a shipment route is set — there's no
  // separate manual "connect" step.
  const handleConnectDevice = () => {
    const product = shipmentState.product || DEFAULT_PRODUCT;
    const backendProductType = PRODUCT_TYPE_MAP[product.id] || 'vaccine';

    resetAlertState();
    resetStream();
    setShipmentState(prev => ({ ...NOT_CONNECTED_STATE, product: prev.product }));

    // Clear any leftover backend state from a previous run before this
    // run's first reading arrives. The frontend always reuses the same
    // constant shipment_id, so without this, cumulative exposure built up
    // under a PREVIOUS product's temperature range (e.g. a Vaccine run's
    // tight 2-8C band) carries straight into a new run under a different,
    // looser range (e.g. Room-Temperature Medicine's 15-25C) and can make
    // its very first reading predict CRITICAL immediately even when barely
    // out of range. Fire-and-forget — doesn't block starting the BLE
    // connection (and preserves the click's user-gesture timing for
    // requestDevice()), and /sensor-data still works fine on a fresh
    // shipment_id even if this call itself fails.
    apiService.resetShipment(DEFAULT_SHIPMENT_ID).catch((err) => {
      console.warn('Failed to reset backend shipment state:', err);
    });

    sensor.connectBluetooth(backendProductType, DEFAULT_SHIPMENT_ID);
  };

  // Writes "PING" to the device's command characteristic — the ESP32
  // beeps twice in response, a quick way to confirm the right board is
  // paired during hardware bring-up.
  const handlePingDevice = () => {
    sensor.sendCommand('PING');
  };

  const handleDisconnect = () => {
    sensor.stopStream();
    resetStream();
    resetAlertState();
    setShipmentState(prev => ({ ...NOT_CONNECTED_STATE, product: prev.product }));
    setEmergencyAlertData(null);
    updateAlertBadgeCount();
  };

  // If user is not authenticated, render Login Page
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard shipmentState={shipmentState} />;
      case 'simulation':
        return (
          <Simulation
            onConnectDevice={handleConnectDevice}
            onDisconnect={handleDisconnect}
            onPingDevice={handlePingDevice}
            activeProduct={shipmentState.product}
            onSelectProduct={handleSelectProduct}
            sensorStatus={sensor.status}
            sensorStatusMessage={sensor.statusMessage}
            connectionMode={sensor.connectionMode}
            bleSupported={sensor.bleSupported}
            lastPacket={sensor.lastPacket}
            lastResponse={sensor.lastResponse}
            modelMode={sensor.modelMode}
            onSetModelMode={sensor.setModelMode}
            timeAcceleration={sensor.timeAcceleration}
            onSetTimeAcceleration={sensor.setTimeAcceleration}
          />
        );
      case 'alerts':
        return (
          <Alerts
            shipmentState={shipmentState}
            emergencyMode={emergencyMode}
            liveColdStorageFacilities={liveColdStorageFacilities}
            acknowledged={criticalAcknowledged}
            onAcknowledge={handleAcknowledgeCritical}
          />
        );
      case 'reports':
        return <Reports />;
      default:
        return <Dashboard shipmentState={shipmentState} />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={(page) => {
          setCurrentPage(page);
          updateAlertBadgeCount();
        }}
        onLogout={handleLogout}
        alertsBadgeCount={alertsCount}
      />
      <div className="main-wrapper">
        <TopBar />
        <main className="content-container">
          {renderCurrentPage()}
        </main>
      </div>

      {/* Warning Popup — "Acknowledge & Close" also tells the ESP32 to drop
          its blue WARNING LED to green (see ACK_WARNING / warningAcknowledged
          in the firmware). Harmless no-op if the board isn't currently on
          WARNING (e.g. this popup fired from a SHOCK/DOOR excursion while
          the ML risk tier is still SAFE). */}
      <AlertPopup
        alert={activeAlert}
        onClose={() => {
          setActiveAlert(null);
          updateAlertBadgeCount();
          sensor.sendCommand('ACK_WARNING');
        }}
      />

      {/* Emergency Modal */}
      <EmergencyModal
        isOpen={showEmergencyModal}
        alertData={emergencyAlertData}
        coolingActive={shipmentState.coolingActive}
        acknowledged={criticalAcknowledged}
        onAcknowledge={handleAcknowledgeCritical}
        onViewAlert={() => setShowEmergencyModal(false)}
        onGoToEmergency={() => {
          setShowEmergencyModal(false);
          setEmergencyMode(true);
          setCurrentPage('alerts');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <RouteProvider>
      <SensorProvider>
        <AppContent />
      </SensorProvider>
    </RouteProvider>
  );
}
