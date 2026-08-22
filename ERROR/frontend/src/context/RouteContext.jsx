import React, { createContext, useState, useContext } from 'react';

const RouteContext = createContext(null);

// Helper function to find coordinates at a given progress percentage (0.0 to 1.0) along the route
export function getPointAlongRoute(routeCoordinates, progress) {
  if (!routeCoordinates || routeCoordinates.length === 0) return null;
  const index = Math.min(
    routeCoordinates.length - 1,
    Math.max(0, Math.floor(routeCoordinates.length * progress))
  );
  return routeCoordinates[index];
}

export function RouteProvider({ children }) {
  // Default fallback route coordinates (Chennai to Vellore baseline)
  const defaultRoute = {
    startName: 'Chennai',
    endName: 'Vellore',
    startCoordinates: [13.0827, 80.2707],
    endCoordinates: [12.9165, 79.1325],
    routeCoordinates: [
      [13.0827, 80.2707],
      [13.0200, 80.0500],
      [12.9850, 79.8200],
      [12.9650, 79.7350],
      [12.9300, 79.5000],
      [12.9050, 79.3200],
      [12.9165, 79.1325]
    ],
    distanceKm: 124,
    durationMinutes: 150,
    estimatedTime: '2.5 hours',
    truckPosition: [12.9650, 79.7350], // ~40% along coordinates
    routeStatus: 'PLANNED', // PLANNED, EMERGENCY, REROUTED
    recommendedFacility: null,
    emergencyRouteCoordinates: null
  };

  const [routeState, setRouteState] = useState(defaultRoute);

  const updateRoute = (routeData) => {
    // Computes truck position automatically at progress = 0.40
    const truckPos = getPointAlongRoute(routeData.routeCoordinates, 0.40) || routeData.startCoordinates;
    
    setRouteState({
      startName: routeData.startName,
      endName: routeData.endName,
      startCoordinates: routeData.startCoordinates,
      endCoordinates: routeData.endCoordinates,
      routeCoordinates: routeData.routeCoordinates,
      distanceKm: routeData.distanceKm,
      durationMinutes: routeData.durationMinutes || Math.round(routeData.distanceKm / 70 * 60),
      estimatedTime: routeData.estimatedTime || `${(routeData.distanceKm / 70).toFixed(1)} hours`,
      truckPosition: truckPos,
      routeStatus: 'PLANNED',
      recommendedFacility: null,
      emergencyRouteCoordinates: null
    });
  };

  const updateRouteStatus = (status) => {
    setRouteState(prev => ({
      ...prev,
      routeStatus: status
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

  const resetRoute = () => {
    setRouteState(defaultRoute);
  };

  return (
    <RouteContext.Provider value={{
      routeState,
      updateRoute,
      updateRouteStatus,
      setReroute,
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
