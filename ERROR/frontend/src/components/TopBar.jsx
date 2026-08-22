import React from 'react';
import { Menu, ChevronDown, CloudSun, Bell, User } from 'lucide-react';

export default function TopBar({ routeState, onMenuToggle }) {
  const startLoc = routeState ? routeState.startName : 'Chennai';

  // Basic mock weather temps for selected start cities to add realism
  let weatherTemp = '34°C';
  if (startLoc === 'Goa') weatherTemp = '29°C';
  else if (startLoc === 'Kashmir') weatherTemp = '14°C';
  else if (startLoc === 'Delhi') weatherTemp = '32°C';
  else if (startLoc === 'Mumbai') weatherTemp = '30°C';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="shipment-selector">
          <span>Shipment:</span>
          <strong>&nbsp;SUR-001</strong>
        </div>
      </div>

      <div className="topbar-right">
        <div className="weather-widget">
          <div className="weather-icon-container">
            <CloudSun size={24} />
          </div>
          <div className="weather-info">
            <span className="weather-temp">{weatherTemp}</span>
            <span className="weather-loc">{startLoc}</span>
          </div>
        </div>

        <button className="icon-button" aria-label="Notifications">
          <Bell size={20} />
          <span className="icon-badge">3</span>
        </button>

        <div className="user-profile">
          <div className="avatar-placeholder">
            <User size={18} fill="rgba(30, 96, 242, 0.2)" />
          </div>
          <span className="user-name">Admin</span>
          <ChevronDown size={14} />
        </div>
      </div>
    </header>
  );
}
