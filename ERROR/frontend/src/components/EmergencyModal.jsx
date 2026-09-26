import React from 'react';
import { ShieldAlert, Snowflake, Mail, BellOff } from 'lucide-react';
import PcmFlapStatus from './PcmFlapStatus.jsx';

export default function EmergencyModal({ isOpen, alertData, onViewAlert, onGoToEmergency, onAcknowledge, acknowledged, coolingActive }) {
  if (!isOpen || !alertData) return null;

  const { temperature, safeRange, remainingTime, recipients } = alertData;

  return (
    <div className="emergency-overlay">
      <div className="emergency-card">
        <div className="emergency-glow" />
        
        <div className="emergency-header">
          <ShieldAlert className="emergency-icon" size={32} />
          <h2>🚨 CRITICAL COLD-CHAIN EXCURSION</h2>
        </div>

        <div className="emergency-body">
          <p className="emergency-warn-desc">
            Extreme temperature excursion detected. Cargo integrity is at immediate risk!
          </p>

          <div className="emergency-metrics-grid">
            <div className="em-metric">
              <span className="em-metric-label">TEMPERATURE</span>
              <span className="em-metric-val val-critical">{temperature}°C</span>
            </div>
            <div className="em-metric">
              <span className="em-metric-label">SAFE LIMIT</span>
              <span className="em-metric-val">{safeRange}</span>
            </div>
            <div className="em-metric">
              <span className="em-metric-label">REMAINING TIME</span>
              <span className="em-metric-val val-countdown">{remainingTime}</span>
            </div>
          </div>

          <div className="cooling-activation-banner">
            <Snowflake className="snowflake-icon rotate-anim" size={20} />
            <span>❄ COOLING SYSTEM ACTIVATED</span>
          </div>

          {/* PCM flap — kept as its own distinct indicator (novelty), not
              merged into the cooling banner above. Reflects the same
              cooling_required signal the rest of the app already tracks. */}
          <PcmFlapStatus active={!!coolingActive} variant="banner" />
          <div style={{ height: 22 }} />

          <div className="notification-status-box">
            <div className="notif-status-header">
              <Mail size={16} />
              <span>Notification Queued</span>
            </div>
            <p className="notif-desc">
              Emergency email alert package prepared for:
            </p>
            <div className="recipient-tags">
              {recipients && recipients.map(r => (
                <span key={r} className="recipient-tag">{r}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="emergency-actions">
          <button className="emergency-btn-secondary" onClick={onViewAlert}>
            VIEW ALERT
          </button>
          <button
            className="emergency-btn-ack"
            onClick={onAcknowledge}
            disabled={acknowledged}
            title="Silences the ESP32's critical buzzer. The alert tier and LEDs keep tracking live readings regardless."
          >
            <BellOff size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
            {acknowledged ? 'ALARM SILENCED' : 'ACKNOWLEDGE'}
          </button>
          <button className="emergency-btn-primary" onClick={onGoToEmergency}>
            GO TO EMERGENCY ROUTE
          </button>
        </div>
      </div>
    </div>
  );
}
