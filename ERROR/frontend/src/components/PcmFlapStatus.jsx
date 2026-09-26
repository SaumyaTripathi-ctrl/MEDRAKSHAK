// PcmFlapStatus.jsx
//
// Displays the PCM (Phase Change Material) cooling flap / coolant state —
// a hardware novelty specific to this box, kept as its own distinct
// component rather than folded into the existing AI risk metric cards.
//
// Deliberately reuses the SAME cooling_required signal the rest of the app
// already computes (shipmentState.coolingActive, sourced from the
// backend's prediction.cooling_required in App.jsx's live pipeline) rather
// than adding any new backend/firmware field or state of its own — this
// component is purely a new way of DISPLAYING information the pipeline
// was already producing, so it can't change or break any existing
// prediction/alert/reroute logic.
import React from 'react';
import { DoorOpen, DoorClosed, Snowflake } from 'lucide-react';

export default function PcmFlapStatus({ active, variant = 'panel' }) {
  const flapLabel = active ? 'OPEN' : 'CLOSED';
  const coolantLabel = active ? 'ACTIVATED' : 'INACTIVE';

  if (variant === 'banner') {
    return (
      <div className={`pcm-banner${active ? ' pcm-active' : ''}`}>
        {active ? <DoorOpen size={20} /> : <DoorClosed size={20} />}
        <div className="pcm-banner-text">
          <strong>PCM FLAP: {flapLabel}</strong>
          <span>COOLANT: {coolantLabel}</span>
        </div>
        <Snowflake size={20} className={active ? 'pcm-spin' : ''} />
      </div>
    );
  }

  return (
    <div className={`panel pcm-panel${active ? ' pcm-active' : ''}`}>
      <div className="panel-header">
        <h3>
          {active ? <DoorOpen size={13} className="inline-ic" /> : <DoorClosed size={13} className="inline-ic" />}
          PCM COOLING FLAP
        </h3>
        <Snowflake size={15} className={active ? 'pcm-spin' : ''} style={{ color: active ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
      </div>
      <div className="pcm-status-row">
        <div className="pcm-status-item">
          <span className="ws-label">Flap State</span>
          <span className={`pcm-value${active ? ' pcm-value-active' : ''}`}>{flapLabel}</span>
        </div>
        <div className="pcm-status-item">
          <span className="ws-label">Coolant</span>
          <span className={`pcm-value${active ? ' pcm-value-active' : ''}`}>{coolantLabel}</span>
        </div>
      </div>
    </div>
  );
}
