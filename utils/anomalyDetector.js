const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const { formatToIST, formatRelativeIST } = require('./istTime');
const { sendAlertEmail } = require('./mailer');

// Default fallback settings
let activeSettings = {
  complianceThreshold: 60,
  attendanceDropThreshold: 15,
  zeroCategoryDaysThreshold: 5,
  inspectionOverdueHours: 48,
  alertEmailRecipient: 'admin@dosje.gov.in'
};

async function getSettings() {
  try {
    const s = await Settings.findOne({ id: 'global_settings' }).lean();
    if (s) {
      activeSettings = { ...activeSettings, ...s };
    }
  } catch (e) {}
  return activeSettings;
}

/**
 * Check if a project's compliance score or category triggers an anomaly
 */
async function checkComplianceAnomaly({ project, oldScore, newScore, io, isDBConnected, memoryNotifications, memoryLogs }) {
  const settings = await getSettings();
  const alerts = [];

  // Rule 1: Compliance below threshold
  if (newScore < settings.complianceThreshold) {
    const severity = newScore < 40 ? 'critical' : 'warning';
    const notifId = 'NOTIF-' + Math.floor(1000 + Math.random() * 9000);
    const msg = `Compliance score for ${project.name} dropped to ${newScore}% (below mandatory threshold of ${settings.complianceThreshold}%).`;

    alerts.push({
      id: notifId,
      projectId: project.id,
      projectName: project.name,
      state: project.state,
      ruleTriggered: 'low_compliance',
      severity,
      message: msg,
      details: { oldScore, newScore, threshold: settings.complianceThreshold }
    });
  }

  // Rule 2: Checklist category at 0%
  if (project.checklist && Array.isArray(project.checklist)) {
    for (const cat of project.checklist) {
      const allUnchecked = cat.items && cat.items.length > 0 && cat.items.every(it => !it.checked && !it.isChecked);
      if (allUnchecked) {
        const notifId = 'NOTIF-' + Math.floor(1000 + Math.random() * 9000);
        alerts.push({
          id: notifId,
          projectId: project.id,
          projectName: project.name,
          state: project.state,
          ruleTriggered: 'zero_category',
          severity: 'warning',
          message: `Category "${cat.category}" in ${project.name} has 0% compliance. Immediate corrective review required.`,
          details: { category: cat.category }
        });
      }
    }
  }

  for (const notifData of alerts) {
    await processAnomalyAlert(notifData, project, io, isDBConnected, memoryNotifications, memoryLogs);
  }

  return alerts;
}

/**
 * Check if attendance submission reveals an anomaly
 */
async function checkAttendanceAnomaly({ project, oldAttendance, newAttendance, io, isDBConnected, memoryNotifications, memoryLogs }) {
  const settings = await getSettings();
  const alerts = [];

  if (oldAttendance > 0 && (oldAttendance - newAttendance) >= settings.attendanceDropThreshold) {
    const drop = oldAttendance - newAttendance;
    const notifId = 'NOTIF-' + Math.floor(1000 + Math.random() * 9000);
    const msg = `Sharp attendance drop of ${drop}% detected for ${project.name} (${oldAttendance}% → ${newAttendance}%). Potential proxy or absenteeism anomaly.`;

    alerts.push({
      id: notifId,
      projectId: project.id,
      projectName: project.name,
      state: project.state,
      ruleTriggered: 'attendance_drop',
      severity: 'warning',
      message: msg,
      details: { oldAttendance, newAttendance, drop }
    });
  }

  for (const notifData of alerts) {
    await processAnomalyAlert(notifData, project, io, isDBConnected, memoryNotifications, memoryLogs);
  }

  return alerts;
}

/**
 * Persist notification and corresponding AuditLog, dispatch email, and emit live socket events
 */
async function processAnomalyAlert(notifData, project, io, isDBConnected, memoryNotifications, memoryLogs) {
  const now = new Date();

  // Create real AuditLog entry
  const logEntry = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: now,
    projectId: notifData.projectId,
    projectName: notifData.projectName,
    state: notifData.state,
    actionType: 'alert_triggered',
    actorId: 'AI-SYSTEM',
    actorName: 'Saarthi Anomaly Engine',
    field: 'System Anomaly Flag',
    oldValue: '',
    newValue: notifData.ruleTriggered,
    delta: notifData.severity.toUpperCase(),
    description: `[${notifData.severity.toUpperCase()}] ${notifData.message}`,
    locationCaptured: false
  };

  const notifObj = {
    ...notifData,
    status: 'active',
    resolved: false,
    createdAt: now
  };

  if (memoryNotifications && Array.isArray(memoryNotifications)) {
    memoryNotifications.unshift(notifObj);
  }
  if (memoryLogs && Array.isArray(memoryLogs)) {
    memoryLogs.unshift(logEntry);
  }

  // Persist to DB if connected
  if (isDBConnected()) {
    try {
      await Notification.create(notifObj);
      await AuditLog.create(logEntry);
    } catch (e) {
      console.warn('[Anomaly DB Error]', e.message);
    }
  }

  // Real-time broadcast
  if (io) {
    io.emit('notification:new', notifData);
    io.emit('audit:new_entry', {
      ...logEntry,
      formattedIST: formatToIST(logEntry.timestamp),
      relativeIST: formatRelativeIST(logEntry.timestamp)
    });
  }

  // Send transactional email alert for high-severity/warning alerts
  sendAlertEmail({
    subject: `Anomaly Detected: ${notifData.message.slice(0, 60)}…`,
    notification: notifData,
    project
  }).catch(e => console.warn('[Mailer Async Error]', e.message));
}

module.exports = {
  checkComplianceAnomaly,
  checkAttendanceAnomaly,
  getSettings
};
