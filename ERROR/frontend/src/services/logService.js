// Logging Service for Suraksha Frontend Demo

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
    // { event_type, message, parameter, value, severity, latitude, longitude, location_name }
    const logs = this.getLogs();
    
    const newLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
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
