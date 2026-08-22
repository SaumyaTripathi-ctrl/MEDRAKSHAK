import React from 'react';
import {
  Home,
  FlaskConical,
  Bell,
  FileText,
  LogOut,
  Shield,
} from 'lucide-react';

const MENU_ITEMS = [
  { name: 'Dashboard', icon: Home, page: 'dashboard' },
  { name: 'Simulation', icon: FlaskConical, page: 'simulation' },
  { name: 'Alerts', icon: Bell, page: 'alerts' },
  { name: 'Reports', icon: FileText, page: 'reports' },
];

export default function Sidebar({ currentPage, setCurrentPage, onLogout, alertsBadgeCount }) {
  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-logo">
          <Shield className="sidebar-logo-icon" size={28} fill="rgba(30, 96, 242, 0.2)" strokeWidth={2.5} />
          <div className="sidebar-logo-info">
            <span className="sidebar-logo-title">SURAKSHA</span>
            <span className="sidebar-logo-subtitle">Cold Chain Protection</span>
          </div>
        </div>

        <nav className="sidebar-menu">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.page;
            const badgeCount = item.page === 'alerts' ? alertsBadgeCount : 0;
            return (
              <a
                key={item.name}
                href="#"
                className={`sidebar-item${isActive ? ' active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage(item.page);
                }}
              >
                <span className="sidebar-item-left">
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.name}</span>
                </span>
                {badgeCount > 0 ? <span className="sidebar-badge">{badgeCount}</span> : null}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        <a 
          className="sidebar-logout" 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            onLogout();
          }}
        >
          <LogOut size={18} strokeWidth={2} />
          <span>Logout</span>
        </a>
      </div>
    </aside>
  );
}
