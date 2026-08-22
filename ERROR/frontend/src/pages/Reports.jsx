import React, { useState, useEffect } from 'react';
import { logService } from '../services/logService.js';
import { FileText, Trash2 } from 'lucide-react';

export default function Reports() {
  const [logs, setLogs] = useState([]);

  const loadLogs = () => {
    setLogs(logService.getLogs());
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleClearLogs = () => {
    if (window.confirm('Are you sure you want to clear all irregularity logs?')) {
      logService.clearLogs();
      loadLogs();
    }
  };

  return (
    <div className="reports-page-wrapper">
      <div className="panel reports-panel">
        <div className="panel-header">
          <h3>
            <FileText size={15} className="inline-ic" />
            COLD-CHAIN IRREGULARITY LOG
          </h3>
          {logs.length > 0 && (
            <button className="clear-logs-btn" onClick={handleClearLogs}>
              <Trash2 size={13} />
              Clear Log History
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="no-logs-state">
            <p>No logged irregularity events found. Running in stable range.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>TIMESTAMP</th>
                  <th>TYPE</th>
                  <th>MESSAGE</th>
                  <th>VALUE</th>
                  <th>SEVERITY</th>
                  <th>LOCATION</th>
                  <th>LATITUDE</th>
                  <th>LONGITUDE</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className={`severity-row-${log.severity.toLowerCase()}`}>
                    <td className="time-col">{log.timestamp}</td>
                    <td><span className="log-type-badge">{log.event_type}</span></td>
                    <td className="msg-col">{log.message}</td>
                    <td className="val-col font-bold">{log.value}</td>
                    <td>
                      <span className={`severity-badge badge-${log.severity.toLowerCase()}`}>
                        {log.severity}
                      </span>
                    </td>
                    <td>{log.location_name}</td>
                    <td className="coords-col">{log.latitude.toFixed(4)}</td>
                    <td className="coords-col">{log.longitude.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
