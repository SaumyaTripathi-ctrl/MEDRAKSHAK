import React from 'react';
import { ChevronDown, Bell, User } from 'lucide-react';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="shipment-selector">
          <span>Shipment:</span>
          <strong>&nbsp;SUR-001</strong>
        </div>
      </div>

      <div className="topbar-right">
        <button className="icon-button" aria-label="Notifications">
          <Bell size={20} />
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
