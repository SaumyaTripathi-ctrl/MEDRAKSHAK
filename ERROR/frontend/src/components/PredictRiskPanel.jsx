import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export default function PredictRiskPanel() {
  return (
    <div className="panel predict-panel">
      <div className="panel-header predict-head">
        <h3>
          PREDICT RISK <span className="muted-span">(Next 6 Hours)</span>
        </h3>
        <div className="peak-risk">
          <span className="peak-label">Peak Risk</span>
          <span className="peak-value">62%</span>
          <span className="peak-sub">in 3 hours</span>
        </div>
      </div>

      <svg className="predict-chart" viewBox="0 0 300 120" preserveAspectRatio="none">
        <defs>
          <linearGradient id="predictLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="45%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <linearGradient id="predictFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points="0,100 30,96 60,92 90,82 120,68 150,52 180,38 210,24 240,14 270,8 300,6 300,120 0,120"
          fill="url(#predictFill)"
        />
        <polyline
          points="0,100 30,96 60,92 90,82 120,68 150,52 180,38 210,24 240,14 270,8 300,6"
          fill="none"
          stroke="url(#predictLine)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="180" cy="38" r="4.5" fill="#ef4444" stroke="#080f20" strokeWidth="2" />
      </svg>

      <div className="predict-stats">
        <div className="predict-stat">
          <span className="ps-label">Current Risk</span>
          <span className="ps-value ps-green">24% LOW</span>
        </div>
        <div className="predict-stat center">
          <span className="ps-label">Average Risk</span>
          <span className="ps-value ps-amber">38% MODERATE</span>
        </div>
        <div className="predict-stat right">
          <span className="ps-label">Trend</span>
          <span className="ps-value ps-red">
            INCREASING
            <ArrowUpRight size={13} />
          </span>
        </div>
      </div>

      <button className="detail-btn">View Detailed Prediction</button>
    </div>
  );
}
