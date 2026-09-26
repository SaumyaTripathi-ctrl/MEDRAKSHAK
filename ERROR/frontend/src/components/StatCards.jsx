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
  const isConnected = !!shipmentState && shipmentState.temperature != null;

  const temp = isConnected ? shipmentState.temperature : null;
  const humidity = isConnected ? shipmentState.humidity : null;
  const shock = isConnected ? shipmentState.shock : null;
  const safeTime = isConnected ? shipmentState.safeTime : null;
  const riskScore = isConnected ? shipmentState.riskScore : null;
  const riskLevel = isConnected ? shipmentState.riskLevel : null;

  const product = shipmentState ? shipmentState.product : null;
  const rangeText = product ? `${product.minTemp}°C – ${product.maxTemp}°C` : '--';

  let tempTone = 'green';
  let tempLabel = 'NO DATA';
  if (isConnected) {
    tempLabel = 'NORMAL';
    if (product && (temp < product.minTemp || temp > product.maxTemp)) {
      if (riskLevel === 'CRITICAL') {
        tempTone = 'red';
        tempLabel = 'CRITICAL';
      } else {
        tempTone = 'amber';
        tempLabel = 'HIGH';
      }
    }
  } else {
    tempTone = 'amber';
  }

  let humidTone = 'green';
  let humidLabel = 'NO DATA';
  if (isConnected) {
    humidLabel = 'NORMAL';
    if (humidity < 40 || humidity > 60) {
      humidTone = 'amber';
      humidLabel = 'ABNORMAL';
    }
  } else {
    humidTone = 'amber';
  }

  let shockTone = 'green';
  let shockLabel = 'NO DATA';
  if (isConnected) {
    shockLabel = 'NORMAL';
    if (shock > 1.0) {
      shockTone = 'red';
      shockLabel = 'SHOCK WARNING';
    }
  } else {
    shockTone = 'amber';
  }

  let timeTone = 'amber';
  let timeLabel = 'NO DATA';
  if (isConnected) {
    if (riskLevel === 'SAFE') {
      timeTone = 'green';
      timeLabel = 'NORMAL';
    } else if (riskLevel === 'CRITICAL') {
      timeTone = 'red';
      timeLabel = 'CRITICAL';
    } else {
      timeLabel = 'MODERATE';
    }
  }

  let riskTone = 'amber';
  let riskLabelText = 'NO DATA';
  if (isConnected) {
    riskTone = 'green';
    riskLabelText = 'LOW RISK';
    if (riskLevel === 'CRITICAL') {
      riskTone = 'red';
      riskLabelText = 'CRITICAL RISK';
    } else if (riskLevel === 'WARNING') {
      riskTone = 'amber';
      riskLabelText = 'MODERATE RISK';
    }
  }

  return (
    <section className="stat-grid">
      {/* Temperature Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-blue"><Thermometer size={20} /></div>
          <span className="stat-label">TEMPERATURE</span>
        </div>
        <div className="stat-value">{temp != null ? temp : '--'}<span className="stat-unit">°C</span></div>
        <div className="stat-range">Safe Range: {rangeText}</div>
        <StatusPill tone={tempTone}>{tempLabel}</StatusPill>
      </div>

      {/* Humidity Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-blue"><Droplet size={20} /></div>
          <span className="stat-label">HUMIDITY</span>
        </div>
        <div className="stat-value">{humidity != null ? humidity : '--'}<span className="stat-unit">%</span></div>
        <div className="stat-range">Safe Range: 40% – 60%</div>
        <StatusPill tone={humidTone}>{humidLabel}</StatusPill>
      </div>

      {/* Shock Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-purple"><Activity size={20} /></div>
          <span className="stat-label">SHOCK</span>
        </div>
        <div className="stat-value">{shock != null ? shock : '--'}<span className="stat-unit">g</span></div>
        <div className="stat-range">Limit threshold: 1.0g</div>
        <StatusPill tone={shockTone}>{shockLabel}</StatusPill>
      </div>

      {/* Estimated Safe Time Card */}
      <div className="stat-card">
        <div className="stat-head">
          <div className="stat-icon icon-amber"><Clock size={20} /></div>
          <span className="stat-label">ESTIMATED SAFE TIME</span>
        </div>
        <div className="stat-value">{safeTime || '--'}</div>
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
          <div className="stat-value">{riskScore != null ? riskScore : '--'}<span className="stat-unit">{riskScore != null ? '%' : ''}</span></div>
        </div>
        <div className={`stat-status status-${riskTone}`} style={{ marginTop: 14 }}>
          <span className="status-dot" />
          {riskLabelText}
        </div>
      </div>
    </section>
  );
}
