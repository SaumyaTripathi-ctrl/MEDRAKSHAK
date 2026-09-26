import React from 'react';
import { MapPin, CloudSun } from 'lucide-react';
import { useRoute } from '../context/RouteContext.jsx';
import { useSensor } from '../context/SensorContext.jsx';

export default function WeatherPanel() {
  const { routeState } = useRoute();
  const { lastResponse } = useSensor();
  const { truckPosition, plannedRoute } = routeState;

  let locationLabel = 'Awaiting GPS fix';
  if (plannedRoute) {
    locationLabel = `${plannedRoute.startName} → ${plannedRoute.endName}`;
  } else if (truckPosition) {
    locationLabel = `${truckPosition[0].toFixed(3)}, ${truckPosition[1].toFixed(3)}`;
  }

  // The backend fetches real live weather (Open-Meteo, via GPS) for every
  // /sensor-data reading — services/weather.py. Show it once a reading has
  // come through; otherwise show a waiting state (no fabricated numbers).
  const weather = lastResponse && lastResponse.weather;
  const hasWeather = !!weather;
  const liveTemp = hasWeather ? Math.round(weather.external_temperature) : null;
  const liveHumidity = hasWeather ? Math.round(weather.external_humidity) : null;
  const liveRain = hasWeather ? Math.round(weather.rain_probability) : null;
  const liveWind = hasWeather ? Math.round(weather.wind_speed) : null;

  return (
    <div className="panel weather-panel">
      <div className="panel-header">
        <h3>
          <MapPin size={13} className="inline-ic" />
          WEATHER CONDITIONS
        </h3>
      </div>
      <div className="weather-loc-name">{locationLabel}</div>

      <div className="weather-main-row">
        <div className="weather-main-left">
          <CloudSun size={38} className="weather-big-icon" />
          <div>
            <div className="weather-big-temp">{liveTemp != null ? liveTemp : '--'}<span>°C</span></div>
            <div className="weather-cond">{hasWeather ? 'Live (Open-Meteo)' : 'Waiting for first reading'}</div>
          </div>
        </div>
        <div className="weather-stats">
          <div className="weather-stat">
            <span className="ws-label">Humidity</span>
            <span className="ws-value">{liveHumidity != null ? `${liveHumidity}%` : '--'}</span>
          </div>
          <div className="weather-stat">
            <span className="ws-label">Rain Prob.</span>
            <span className="ws-value">{liveRain != null ? `${liveRain}%` : '--'}</span>
          </div>
          <div className="weather-stat">
            <span className="ws-label">Wind Speed</span>
            <span className="ws-value">{liveWind != null ? `${liveWind} km/h` : '--'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
