import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function AlertPopup({ alert, onClose }) {
  if (!alert) return null;

  const { parameter, value, safeRange, message, recommended, severity, timestamp } = alert;

  // Determine parameter label & icons
  const headerText = `${parameter.toUpperCase()} EXCURSION DETECTED`;
  
  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <div className="popup-header">
          <div className="popup-title">
            <AlertTriangle className="popup-warn-icon" size={20} />
            <span>⚠ {headerText}</span>
          </div>
          <button className="popup-close-btn" onClick={onClose} aria-label="Close alert">
            <X size={18} />
          </button>
        </div>

        <div className="popup-body">
          <div className="popup-meta-grid">
            <div className="popup-meta-item">
              <span className="popup-meta-label">PARAMETER</span>
              <span className="popup-meta-value">{parameter}</span>
            </div>
            <div className="popup-meta-item">
              <span className="popup-meta-label">SEVERITY</span>
              <span className={`popup-meta-value severity-${severity.toLowerCase()}`}>
                {severity}
              </span>
            </div>
            <div className="popup-meta-item">
              <span className="popup-meta-label">CURRENT VALUE</span>
              <span className="popup-meta-value highlight-value">{value}</span>
            </div>
            <div className="popup-meta-item">
              <span className="popup-meta-label">SAFE RANGE</span>
              <span className="popup-meta-value">{safeRange}</span>
            </div>
          </div>

          <div className="popup-message-box">
            <div className="popup-msg-section">
              <strong>Message:</strong>
              <p>{message}</p>
            </div>
            {recommended && (
              <div className="popup-msg-section spacing-top">
                <strong>Recommended Action:</strong>
                <p className="popup-rec-action">{recommended}</p>
              </div>
            )}
          </div>

          <div className="popup-footer-time">
            Logged at: {timestamp}
          </div>
        </div>

        <div className="popup-action-row">
          <button className="popup-btn" onClick={onClose}>
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}
