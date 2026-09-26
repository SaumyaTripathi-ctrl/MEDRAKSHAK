import React from 'react';
import StatCards from '../components/StatCards.jsx';
import ShipmentMap from '../components/ShipmentMap.jsx';
import WeatherPanel from '../components/WeatherPanel.jsx';
import PcmFlapStatus from '../components/PcmFlapStatus.jsx';

export default function Dashboard({ shipmentState }) {
  return (
    <>
      <StatCards shipmentState={shipmentState} />
      <section className="main-grid">
        <ShipmentMap shipmentState={shipmentState} />
        <div className="side-col">
          <PcmFlapStatus active={!!shipmentState.coolingActive} />
          <WeatherPanel />
        </div>
      </section>
    </>
  );
}
