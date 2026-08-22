import React from 'react';
import StatCards from '../components/StatCards.jsx';
import ShipmentMap from '../components/ShipmentMap.jsx';
import WeatherPanel from '../components/WeatherPanel.jsx';
import PredictRiskPanel from '../components/PredictRiskPanel.jsx';

export default function Dashboard({ shipmentState }) {
  return (
    <>
      <StatCards shipmentState={shipmentState} />
      <section className="main-grid">
        <ShipmentMap shipmentState={shipmentState} />
        <div className="side-col">
          <WeatherPanel />
          <PredictRiskPanel />
        </div>
      </section>
    </>
  );
}
