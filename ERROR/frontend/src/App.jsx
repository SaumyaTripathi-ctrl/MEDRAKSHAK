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

function AppContent() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { routeState, updateRoute, resetRoute } = useRoute();
  const sensor = useSensor();

  // Shared Shipment State — now driven by real backend predictions
  // (see SensorContext) instead of a scripted timeline.
  const [shipmentState, setShipmentState] = useState({
    temperature: 5.0,
    humidity: 54,
    shock: 0.2,
    riskScore: 8,
    riskLevel: 'SAFE',
    safeTime: '3h 45m',
    coolingActive: false,
    product: DEFAULT_PRODUCT,
    isRunning: false,
    stage: 'SAFE'
  });

  const [emergencyMode, setEmergencyMode] = useState(false);
  const [liveColdStorageFacilities, setLiveColdStorageFacilities] = useState([]);

  // Overlay triggers
  const [activeAlert, setActiveAlert] = useState(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyAlertData, setEmergencyAlertData] = useState(null);
  const [alertsCount, setAlertsCount] = useState(0);

  // Edge-trigger tracking so alerts/log entries/modals fire once per
  // excursion rather than on every 2s reading while conditions persist.
  const shockAlertActiveRef = useRef(false);
  const tempAlertActiveRef = useRef(false);
  const criticalModalFiredRef = useRef(false);

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
      log.event_type === 'CRITICAL'
    ).length;
    setAlertsCount(count);
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setCurrentPage('dashboard');
    handleResetSimulation();
  };

  const handleSelectProduct = (product) => {
    setShipmentState(prev => ({
      ...prev,
      product,
      temperature: product.id === 'ROOM_TEMP_MEDS' ? 19.5 : 5.0
    }));
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
    const location = { lat: payload.latitude, lng: payload.longitude, name: routeState ? routeState.startName : 'Chennai' };

    setShipmentState(prev => ({
      ...prev,
      temperature: payload.temperature,
      humidity: payload.humidity,
      shock: payload.shock,
      riskScore: Math.round(prediction.spoilage_risk),
      riskLevel: prediction.risk_level,
      safeTime: formatMinutes(prediction.estimated_remaining_safe_time),
      coolingActive: prediction.cooling_required,
      isRunning: sensor.connectionMode !== 'idle',
      stage: prediction.risk_level
    }));

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
        timestamp: new Date().toLocaleTimeString()
      });
      logService.addLog({
        event_type: 'SHOCK',
        message: 'High vibration detected',
        parameter: 'SHOCK',
        value: `${payload.shock} g`,
        severity: 'WARNING',
        latitude: location.lat,
        longitude: location.lng,
        location_name: location.name
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
        timestamp: new Date().toLocaleTimeString()
      });
      logService.addLog({
        event_type: 'TEMPERATURE',
        message: 'Temperature exceeded safe limit',
        parameter: 'TEMPERATURE',
        value: `${payload.temperature}°C`,
        severity: 'HIGH',
        latitude: location.lat,
        longitude: location.lng,
        location_name: location.name
      });
      updateAlertBadgeCount();
    } else if (!tempOutside) {
      tempAlertActiveRef.current = false;
    }

    // --- CRITICAL: the real ML model has flagged spoilage risk ---
    if (prediction.risk_level === 'CRITICAL' && !criticalModalFiredRef.current) {
      criticalModalFiredRef.current = true;

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
        location_name: location.name
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
          location_name: location.name
        });
      }
      updateAlertBadgeCount();
    } else if (prediction.risk_level !== 'CRITICAL') {
      criticalModalFiredRef.current = false;
    }

    // --- Cold-storage recommendation (real 28k-facility dataset + OSRM) ---
    if (response.cold_storage_recommendation) {
      setLiveColdStorageFacilities(normalizeColdStorageRecommendation(response.cold_storage_recommendation));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensor.lastResponse]);

  // Automatic streaming engine — replaces the old scripted setTimeout demo
  // with a real ESP32-shaped packet stream feeding the real backend.
  const handleStartSimulation = () => {
    const product = shipmentState.product || DEFAULT_PRODUCT;
    const backendProductType = PRODUCT_TYPE_MAP[product.id] || 'vaccine';
    const origin = routeState && routeState.truckPosition ? routeState.truckPosition : [12.965, 79.735];

    shockAlertActiveRef.current = false;
    tempAlertActiveRef.current = false;
    criticalModalFiredRef.current = false;

    setShipmentState(prev => ({
      ...prev,
      temperature: product.id === 'ROOM_TEMP_MEDS' ? 19.5 : 5.0,
      humidity: 54,
      shock: 0.2,
      riskScore: 8,
      riskLevel: 'SAFE',
      safeTime: '3h 45m',
      coolingActive: false,
      isRunning: true,
      stage: 'SAFE'
    }));

    setEmergencyMode(false);
    setActiveAlert(null);
    setShowEmergencyModal(false);
    setLiveColdStorageFacilities([]);

    logService.addLog({
      event_type: 'SYSTEM',
      message: `Live sensor stream started for ${product.name} (backend: ${backendProductType})`,
      parameter: 'SYSTEM',
      value: 'SAFE',
      severity: 'INFO',
      latitude: origin[0],
      longitude: origin[1],
      location_name: routeState ? routeState.startName : 'Chennai'
    });

    sensor.startSimulatedStream(backendProductType, origin, DEFAULT_SHIPMENT_ID);
  };

  const handleConnectRealDevice = () => {
    const product = shipmentState.product || DEFAULT_PRODUCT;
    const backendProductType = PRODUCT_TYPE_MAP[product.id] || 'vaccine';
    shockAlertActiveRef.current = false;
    tempAlertActiveRef.current = false;
    criticalModalFiredRef.current = false;
    sensor.connectBluetooth(backendProductType, DEFAULT_SHIPMENT_ID);
  };

  // Instantly exercises the extreme/CRITICAL path (emergency modal +
  // live cold-storage reroute) with a burst of out-of-range readings,
  // instead of waiting for the gradual simulated drift.
  const handleForceExtremeTest = async () => {
    const product = shipmentState.product || DEFAULT_PRODUCT;
    const backendProductType = PRODUCT_TYPE_MAP[product.id] || 'vaccine';
    const origin = routeState && routeState.truckPosition ? routeState.truckPosition : [12.965, 79.735];

    shockAlertActiveRef.current = false;
    tempAlertActiveRef.current = false;
    criticalModalFiredRef.current = false;
    setEmergencyMode(false);
    setActiveAlert(null);
    setShowEmergencyModal(false);
    setLiveColdStorageFacilities([]);
    setShipmentState(prev => ({ ...prev, isRunning: true }));

    await sensor.sendExtremeTestBurst(backendProductType, origin, DEFAULT_SHIPMENT_ID);

    setShipmentState(prev => ({ ...prev, isRunning: false }));
  };

  const handleResetSimulation = () => {
    sensor.stopStream();
    resetRoute();
    const initialTemp = shipmentState.product ? (shipmentState.product.id === 'ROOM_TEMP_MEDS' ? 19.5 : 5.0) : 5.0;

    shockAlertActiveRef.current = false;
    tempAlertActiveRef.current = false;
    criticalModalFiredRef.current = false;

    setShipmentState(prev => ({
      ...prev,
      temperature: initialTemp,
      humidity: 54,
      shock: 0.2,
      riskScore: 8,
      riskLevel: 'SAFE',
      safeTime: '3h 45m',
      coolingActive: false,
      isRunning: false,
      stage: 'SAFE'
    }));

    setEmergencyMode(false);
    setActiveAlert(null);
    setShowEmergencyModal(false);
    setEmergencyAlertData(null);
    setLiveColdStorageFacilities([]);
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
            onStartSimulation={handleStartSimulation}
            onConnectRealDevice={handleConnectRealDevice}
            onForceExtremeTest={handleForceExtremeTest}
            onStopSimulation={handleResetSimulation}
            activeProduct={shipmentState.product}
            onSelectProduct={handleSelectProduct}
            simulationState={shipmentState}
            sensorStatus={sensor.status}
            sensorStatusMessage={sensor.statusMessage}
            connectionMode={sensor.connectionMode}
            bleSupported={sensor.bleSupported}
            lastPacket={sensor.lastPacket}
            lastResponse={sensor.lastResponse}
          />
        );
      case 'alerts':
        return (
          <Alerts
            shipmentState={shipmentState}
            emergencyMode={emergencyMode}
            liveColdStorageFacilities={liveColdStorageFacilities}
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
        <TopBar routeState={routeState} />
        <main className="content-container">
          {renderCurrentPage()}
        </main>
      </div>

      {/* Warning Popup */}
      <AlertPopup
        alert={activeAlert}
        onClose={() => {
          setActiveAlert(null);
          updateAlertBadgeCount();
        }}
      />

      {/* Emergency Modal */}
      <EmergencyModal
        isOpen={showEmergencyModal}
        alertData={emergencyAlertData}
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
