import React from 'react';
import { MapPin, CloudSun } from 'lucide-react';
import { useRoute } from '../context/RouteContext.jsx';
import { useSensor } from '../context/SensorContext.jsx';

export default function WeatherPanel() {
  const { routeState } = useRoute();
  const { lastResponse } = useSensor();
  const startLoc = routeState ? routeState.startName : 'Chennai';

  // The backend fetches real live weather (Open-Meteo, via GPS) for every
  // /sensor-data reading — services/weather.py. Use the latest values once
  // a reading has come through; otherwise fall back to placeholder demo
  // values so the panel still looks right before the feed starts.
  const weather = lastResponse && lastResponse.weather;
  const liveTemp = weather ? Math.round(weather.external_temperature) : 34;
  const liveHumidity = weather ? Math.round(weather.external_humidity) : 71;
  const liveRain = weather ? Math.round(weather.rain_probability) : 20;
  const liveWind = weather ? Math.round(weather.wind_speed) : 14;

  return (
    <div className="panel weather-panel">
      <div className="panel-header">
        <h3>
          <MapPin size={13} className="inline-ic" />
          WEATHER CONDITIONS
        </h3>
      </div>
      <div className="weather-loc-name">{startLoc}, India</div>

      <div className="weather-main-row">
        <div className="weather-main-left">
          <CloudSun size={38} className="weather-big-icon" />
          <div>
            <div className="weather-big-temp">{liveTemp}<span>°C</span></div>
            <div className="weather-cond">{weather ? 'Live (Open-Meteo)' : 'Partly Cloudy'}</div>
          </div>
        </div>
        <div className="weather-stats">
          <div className="weather-stat">
            <span className="ws-label">Humidity</span>
            <span className="ws-value">{liveHumidity}%</span>
          </div>
          <div className="weather-stat">
            <span className="ws-label">Rain Prob.</span>
            <span className="ws-value">{liveRain}%</span>
          </div>
          <div className="weather-stat">
            <span className="ws-label">Wind Speed</span>
            <span className="ws-value">{liveWind} km/h</span>
          </div>
        </div>
      </div>

      <div className="panel-divider" />

      <div className="forecast-header">
        <span className="forecast-title">Forecast Impact on Risk</span>
        <span className="forecast-link">Next 6 Hours</span>
      </div>
      <div className="forecast-increase">Low Increase</div>
      <p className="forecast-desc">Risk may increase slightly due to rising temperature after 3 hours.</p>

      <svg className="forecast-chart" viewBox="0 0 300 90" preserveAspectRatio="none">
        <defs>
          <linearGradient id="forecastLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="55%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points="0,70 43,64 86,58 129,50 172,40 215,28 258,18 300,10 300,90 0,90"
          fill="url(#forecastFill)"
        />
        <polyline
          points="0,70 43,64 86,58 129,50 172,40 215,28 258,18 300,10"
          fill="none"
          stroke="url(#forecastLine)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="forecast-axis">
        <span>Now</span><span>1h</span><span>2h</span><span>3h</span><span>4h</span><span>5h</span><span>6h</span>
      </div>
    </div>
  );
}
