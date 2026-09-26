// Logging Service for Suraksha Frontend Demo

// Formats an instant (Date object or ISO string — either the real device
// clock for the very first reading, or the demo's accelerated simulated
// clock from SensorContext for every reading after that) as a LOCAL
// wall-clock "YYYY-MM-DD HH:MM:SS" string. Deliberately NOT
// `.toISOString()`, which always renders UTC — on a browser whose OS
// timezone is IST that made every logged timestamp read ~5.5 hours behind
// the device's actual clock. Using the local Date getters here instead
// means the displayed time always matches whatever timezone the viewer's
// own machine is set to (IST for this deployment), with no offset
// hardcoded. The instant being formatted is what actually encodes the demo
// time-acceleration multiplier (see SensorContext's simulatedClockRef) —
// this function only changes how that instant is DISPLAYED, not which
// instant it is.
function formatLocalTimestamp(instant) {
  const d = instant ? new Date(instant) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  const pad = (n) => String(n).padStart(2, '0');
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())} `
       + `${pad(safe.getHours())}:${pad(safe.getMinutes())}:${pad(safe.getSeconds())}`;
}

export const logService = {
  getLogs() {
    const logsStr = localStorage.getItem('suraksha_logs');
    if (!logsStr) return [];
    try {
      // Return logs sorted newest first
      return JSON.parse(logsStr).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (e) {
      localStorage.removeItem('suraksha_logs');
      return [];
    }
  },

  addLog(event) {
    // Expected event structure:
    // { event_type, message, parameter, value, severity, latitude, longitude,
    //   location_name, timestamp }
    // `timestamp` is optional — pass the reading's own instant (e.g.
    // payload.timestamp from the live pipeline, which reflects the demo
    // time-acceleration multiplier) so the log entry's clock matches what
    // triggered it, rather than the real moment this function happened to
    // run. Falls back to the real device clock when omitted (e.g. login/
    // system events with no associated reading).
    const logs = this.getLogs();

    const newLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: formatLocalTimestamp(event.timestamp),
      event_type: event.event_type || 'SYSTEM',
      message: event.message || '',
      parameter: event.parameter || '',
      value: event.value || '',
      severity: event.severity || 'INFO',
      latitude: event.latitude || 13.0827,
      longitude: event.longitude || 80.2707,
      location_name: event.location_name || 'Chennai'
    };

    logs.push(newLog);
    localStorage.setItem('suraksha_logs', JSON.stringify(logs));
    return newLog;
  },

  clearLogs() {
    localStorage.removeItem('suraksha_logs');
  }
};
