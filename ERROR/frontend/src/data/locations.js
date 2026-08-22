// Location Dictionary containing geographical coordinates for major cities

export const LOCATIONS = {
  Chennai: [13.0827, 80.2707],
  Bangalore: [12.9716, 77.5946],
  Mumbai: [19.0760, 72.8777],
  Delhi: [28.6139, 77.2090],
  Goa: [15.4909, 73.8278],
  Kashmir: [34.0837, 74.7973], // Srinagar/Kashmir region
  Hyderabad: [17.3850, 78.4867],
  Pune: [18.5204, 73.8567],
  Kolkata: [22.5726, 88.3639],
  Ahmedabad: [23.0225, 72.5714],
  Jaipur: [26.9124, 75.7873]
};

// Predefined static fallback routes
export const MOCK_ROUTES = {
  'Chennai-Vellore': {
    startName: 'Chennai',
    endName: 'Vellore',
    distanceKm: 139,
    durationHours: 2.8,
    coordinates: [
      [13.0827, 80.2707],
      [13.0100, 80.0100],
      [12.9700, 79.8000],
      [12.8400, 79.7000],
      [12.9300, 79.3300],
      [12.9165, 79.1325]
    ]
  },
  'Default': {
    startName: 'Chennai',
    endName: 'Vellore',
    distanceKm: 124,
    durationHours: 2.5,
    coordinates: [
      [13.0827, 80.2707],
      [13.0200, 80.0500],
      [12.9850, 79.8200],
      [12.9650, 79.7350],
      [12.9300, 79.5000],
      [12.9050, 79.3200],
      [12.9165, 79.1325]
    ]
  }
};
