import React, { createContext, useState, useContext } from 'react';

const RouteContext = createContext(null);

// Everything about the shipment's live movement (as opposed to the planned
// route, which is set once per demo/shipment and survives a stream restart).
const TRAIL_INITIAL = {
  trail: [],              // [lat, lng] history of real GPS readings
  truckPosition: null,    // most recent [lat, lng], or null before the first reading
  routeStatus: 'LIVE',    // LIVE | REROUTED
  recommendedFacility: null,
  emergencyRouteCoordinates: null
};

const INITIAL_STATE = {
  ...TRAIL_INITIAL,
  // Optional demo route, set from the Simulation page's start/end picker:
  // { startName, endName, startCoordinates, endCoordinates, routeCoordinates,
  //   distanceKm, durationMinutes, estimatedTime }
  plannedRoute: null
};

const MAX_TRAIL_POINTS = 200;

export function RouteProvider({ children }) {
  const [routeState, setRouteState] = useState(INITIAL_STATE);

  // Called every time a new sensor reading (real or simulated) arrives, so
  // the map tracks the shipment's actual position.
  const recordPosition = (latitude, longitude) => {
    if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) return;
    setRouteState(prev => ({
      ...prev,
      trail: [...prev.trail, [latitude, longitude]].slice(-MAX_TRAIL_POINTS),
      truckPosition: [latitude, longitude]
    }));
  };

  // Sets/replaces the demo start->end route and starts a fresh trail (a new
  // route means a new shipment leg).
  const setPlannedRoute = (route) => {
    setRouteState(prev => ({
      ...prev,
      ...TRAIL_INITIAL,
      plannedRoute: route
    }));
  };

  const setReroute = (facility, emergencyPath) => {
    setRouteState(prev => ({
      ...prev,
      routeStatus: 'REROUTED',
      recommendedFacility: facility,
      emergencyRouteCoordinates: emergencyPath
    }));
  };

  // Clears the live trail/truck position (e.g. on disconnect/stop) but
  // keeps the planned route so reconnecting doesn't require re-entering it.
  const resetStream = () => {
    setRouteState(prev => ({
      ...prev,
      ...TRAIL_INITIAL
    }));
  };

  // Full reset, including the planned route (e.g. on logout).
  const resetRoute = () => {
    setRouteState(INITIAL_STATE);
  };

  return (
    <RouteContext.Provider value={{
      routeState,
      recordPosition,
      setPlannedRoute,
      setReroute,
      resetStream,
      resetRoute
    }}>
      {children}
    </RouteContext.Provider>
  );
}

export function useRoute() {
  const context = useContext(RouteContext);
  if (!context) {
    throw new Error('useRoute must be used within a RouteProvider');
  }
  return context;
}
export { RouteContext };
