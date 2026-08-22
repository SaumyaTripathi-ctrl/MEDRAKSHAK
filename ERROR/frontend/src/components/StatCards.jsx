import React from 'react';
import { Thermometer, Droplet, Activity, Clock, ShieldCheck } from 'lucide-react';

function StatusPill({ tone, children }) {
  return (
    <div className={`stat-status status-${tone}`}>
      <span className="status-dot" />
      {children}
    </div>
  );
}

export default function StatCards({ shipmentState }) {
  // Use global shared shipmentState if defined, fallback to approved default dashboard values
  const hasState = shipmentState !== undefined;

  const temp = hasState ? shipmentState.temperature : 6.4;
  const humidity = hasState ? shipmentState.humidity : 54;
  const shock = hasState ? shipmentState.shock : 0.32;
  const safeTime = hasState ? shipmentState.safeTime : '3h 45m';
  const riskScore = hasState ? shipmentState.riskScore : 24;
  const riskLevel = hasState ? shipmentState.riskLevel : 'SAFE';

  // Range text based on product category select
  const product = hasState ? shipmentState.product : null;
  const rangeText = product ? `${product.minTemp}°C – ${product.maxTemp}°C` : '2°C – 8°C';

  // Determine status tones
  let tempTone = 'green';
  let tempLabel = 'NORMAL';
  if (hasState && product) {
    if (temp < product.minTemp || temp > product.maxTemp) {
      if (riskLevel === 'CRITICAL') {
        tempTone = 'red';
        tempLabel = 'CRITICAL';
      } else {
        tempTone = 'amber';
        tempLabel = 'HIGH';
      }
    }
  }

  let humidTone = 'green';
  let humidLabel = 'NORMAL';
  if (humidity < 40 || humidity > 60) {
    humidTone = 'amber';
    humidLabel = 'ABNORMAL';
  }

  let shockTone = 'green';
  let shockLabel = 'NORMAL';
  if (shock > 1.0) {
    shockTone = 'red';
    shockLabel = 'SHOCK WARNING';
  }

  let timeTone = 'amber';
  let timeLabel = 'MODERATE';
  if (riskLevel === 'SAFE') {
    timeTone = 'green';
    timeLabel = 'NORMAL';
  } else if (riskLevel === 'CRITICAL') {
    timeTone = 'red';
    timeLabel = 'CRITICAL';
  }

  let riskTone = 'green';
  let riskLabelText = 'LOW RISK';
  if (riskLevel === 'CRITICAL') {
    riskTone = 'red';
    riskLabelText = 'CRITICAL RISK';
  } else if (riskLevel === 'WARNING') {
    riskTone = 'amber';
    riskLabelText = 'MODERATE RISK';
  }

  return (
    <section className="stat-grid">
      {/* Temperature Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-blue"><Thermometer size={20} /></div>
          <span className="stat-label">TEMPERATURE</span>
        </div>
        <div className="stat-value">{temp}<span className="stat-unit">°C</span></div>
        <div className="stat-range">Safe Range: {rangeText}</div>
        <StatusPill tone={tempTone}>{tempLabel}</StatusPill>
      </div>

      {/* Humidity Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-blue"><Droplet size={20} /></div>
          <span className="stat-label">HUMIDITY</span>
        </div>
        <div className="stat-value">{humidity}<span className="stat-unit">%</span></div>
        <div className="stat-range">Safe Range: 40% – 60%</div>
        <StatusPill tone={humidTone}>{humidLabel}</StatusPill>
      </div>

      {/* Shock Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-purple"><Activity size={20} /></div>
          <span className="stat-label">SHOCK</span>
        </div>
        <div className="stat-value">{shock}<span className="stat-unit">g</span></div>
        <div className="stat-range">Limit threshold: 1.0g</div>
        <StatusPill tone={shockTone}>{shockLabel}</StatusPill>
      </div>

      {/* Estimated Safe Time Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-amber"><Clock size={20} /></div>
          <span className="stat-label">ESTIMATED SAFE TIME</span>
        </div>
        <div className="stat-value">{safeTime}</div>
        <div className="stat-range">Before risk becomes HIGH</div>
        <StatusPill tone={timeTone}>{timeLabel}</StatusPill>
      </div>

      {/* AI Risk Score Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-green"><ShieldCheck size={20} /></div>
          <span className="stat-label">AI RISK SCORE</span>
        </div>
        <div className="stat-value-row">
          <div className="stat-value">{riskScore}<span className="stat-unit">%</span></div>
          <svg className="sparkline" viewBox="0 0 120 44" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={riskTone === 'red' ? '#ef4444' : riskTone === 'amber' ? '#f59e0b' : '#10b981'} stopOpacity="0.35" />
                <stop offset="100%" stopColor={riskTone === 'red' ? '#ef4444' : riskTone === 'amber' ? '#f59e0b' : '#10b981'} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon
              points="0,34 12,30 24,33 36,22 48,26 60,16 72,20 84,10 96,14 108,6 120,9 120,44 0,44"
              fill="url(#sparkFill)"
            />
            <polyline
              points="0,34 12,30 24,33 36,22 48,26 60,16 72,20 84,10 96,14 108,6 120,9"
              fill="none"
              stroke={riskTone === 'red' ? '#ef4444' : riskTone === 'amber' ? '#f59e0b' : '#10b981'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className={`stat-status status-${riskTone}`} style={{ marginTop: 14 }}>
          <span className="status-dot" />
          {riskLabelText}
        </div>
      </div>
    </section>
  );
}
