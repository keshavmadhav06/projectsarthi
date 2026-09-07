require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const { Server } = require('socket.io');

const { connectDB, isDBConnected, initialSites, defaultChecklistTemplate, initialLogs, initialUsers } = require('./config/db');
const Project = require('./models/Project');
const ChecklistItem = require('./models/ChecklistItem');
const AuditLog = require('./models/AuditLog');
const User = require('./models/User');
const { formatToIST, formatRelativeIST, logServerTime } = require('./utils/istTime');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));

// In-memory runtime state for fast access & non-DB fallback
let memorySites = JSON.parse(JSON.stringify(initialSites));
let memoryLogs = JSON.parse(JSON.stringify(initialLogs));
let memoryInspections = [];
let memoryAlerts = [
  { id: 'AL-102', type: 'Attendance anomaly', site: 'Udaan Skill Centre (sample)', text: 'Sample alert: attendance needs human review.', severity: 'warning', time: 'Demo' }
];
let memoryReports = [];
let memoryFeedback = [];
let memoryEmployees = JSON.parse(JSON.stringify(initialUsers));
let memoryPartnerAccounts = [
  { organisation: 'Udaan Skill Centre', registrationId: 'NGO/2026/1001', email: 'udan@dosje-demo.org', password: 'Saarthi@2026', role: 'Project / NGO Administrator' }
];
const pendingVerifications = new Map();
const pendingPartnerVerifications = new Map();
const sessions = new Map();

// Camera & WebRTC rooms
const cameraRooms = new Map();
const mobileCctvRooms = new Map();
const mobileCctvFrames = new Map();

const inspectorRoster = [
  { name: 'Arjun Mehta', states: ['Uttar Pradesh', 'Uttarakhand', 'Delhi', 'Haryana'], workload: 2, conflicts: [] },
  { name: 'Nisha Kapoor', states: ['Rajasthan', 'Gujarat', 'Madhya Pradesh', 'Maharashtra', 'Goa'], workload: 1, conflicts: [] },
  { name: 'Vikram Singh', states: ['Bihar', 'Jharkhand', 'West Bengal', 'Odisha', 'Assam', 'Sikkim'], workload: 2, conflicts: [] },
  { name: 'Meera Iyer', states: ['Tamil Nadu', 'Kerala', 'Karnataka', 'Telangana', 'Andhra Pradesh', 'Puducherry'], workload: 1, conflicts: [] }
];

// Initialize in-memory checklist for projects
function initChecklistForProject(score = 60) {
  const cl = JSON.parse(JSON.stringify(defaultChecklistTemplate));
  const targetChecked = Math.max(0, Math.min(8, Math.round((score / 100) * 8)));
  let c = 0;
  for (const cat of cl) {
    for (const item of cat.items) {
      item.checked = c < targetChecked;
      c++;
    }
  }
  return cl;
}
memorySites.forEach(s => { s.checklist = initChecklistForProject(s.score); });

// Option (b) Proportional Weight Normalization Helper
function normalizeCategoryWeights(cat) {
  if (!cat.items || cat.items.length === 0) return;
  const targetWeight = 25.0;
  const rawSum = cat.items.reduce((sum, it) => sum + (Number(it.weight) || 12.5), 0);
  if (rawSum <= 0) {
    const eq = Math.round((targetWeight / cat.items.length) * 10) / 10;
    cat.items.forEach(it => { it.weight = eq; });
    return;
  }
  let assignedSum = 0;
  cat.items.forEach(it => {
    const raw = Number(it.weight) || 12.5;
    it.weight = Math.round((targetWeight * raw / rawSum) * 10) / 10;
    assignedSum += it.weight;
  });
  const diff = Math.round((targetWeight - assignedSum) * 10) / 10;
  if (diff !== 0 && cat.items.length > 0) {
    cat.items[0].weight = Math.round((cat.items[0].weight + diff) * 10) / 10;
  }
}

// Recalculate Compliance Score
function computeComplianceScore(checklist) {
  let totalWeight = 0;
  let checkedWeight = 0;
  for (const cat of checklist) {
    for (const it of cat.items) {
      const w = Number(it.weight) || 0;
      totalWeight += w;
      if (it.checked || it.isChecked) checkedWeight += w;
    }
  }
  return Math.round((checkedWeight / (totalWeight || 100)) * 100);
}

// Helpers
const sessionUser = req => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  return sessions.get(token);
};
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const parseCoordinates = value => {
  const match = String(value || '').match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const metersBetween = (a, b) => {
  const r = 6371000, toRad = x => x * Math.PI / 180, dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(q));
};
const storedEvidence = evidence => {
  if (!evidence) return null;
  const type = String(evidence.type || '');
  const data = String(evidence.data || '');
  if (!/^((image|audio|video)\/[\w.+-]+)$/.test(type) || !data.startsWith(`data:${type};base64,`) || data.length > 4_000_000) {
    return { error: 'Attach one image, video, or audio file up to 3 MB.' };
  }
  const payload = data.split(',')[1] || '', serverHash = sha256(Buffer.from(payload, 'base64'));
  if (evidence.clientHash && evidence.clientHash !== serverHash) return { error: 'Evidence integrity check failed. Please capture the file again.' };
  return {
    id: 'EVD-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    name: String(evidence.name || 'Evidence').slice(0, 120),
    type,
    data,
    clientHash: evidence.clientHash || null,
    serverHash,
    integrity: 'SHA-256 verified on server upload',
    deviceCapturedAt: String(evidence.capturedAt || ''),
    serverReceivedAt: new Date().toISOString()
  };
};

// Dashboard Stats Calculation
const dashboardStats = () => {
  const monitored = memorySites.length;
  const live = memorySites.filter(site => site.camera === 'Live' || site.status === 'Live').length;
  const compliance = monitored ? Math.round(memorySites.reduce((sum, site) => sum + Number(site.score || 0), 0) / monitored) : 0;
  return {
    monitored,
    live,
    inspections: memoryInspections.filter(item => item.status !== 'Completed').length,
    compliance
  };
};

// ==========================================
// Authentication Endpoints
// ==========================================
app.post('/api/auth/signup', async (req, res) => {
  const data = req.body;
  const email = String(data.email || '').toLowerCase();
  const employeeId = String(data.employeeId || '').toUpperCase();
  if (!/^GOV-\d{4}-\d{4,}$/.test(employeeId)) return res.status(400).json({ error: 'Use a valid Government Employee ID (for example GOV-2026-1001).' });
  if (!/^[^@]+@(gov\.in|nic\.in|dosje\.gov\.in)$/.test(email)) return res.status(400).json({ error: 'Use your authorized government email address.' });
  if (String(data.password || '').length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });

  if (memoryEmployees.some(e => e.employeeId === employeeId || e.email === email)) {
    return res.status(409).json({ error: 'This employee account already exists. Please sign in.' });
  }
  pendingVerifications.set(email, { employeeId, name: String(data.name || 'Government Employee'), email, password: data.password, role: 'Department Official' });
  return res.json({ verificationRequired: true, message: 'Verification code sent to your registered government email.', demoCode: '123456' });
});

app.post('/api/auth/verify', async (req, res) => {
  const data = req.body;
  const pending = pendingVerifications.get(String(data.email || '').toLowerCase());
  if (!pending || data.code !== '123456') return res.status(400).json({ error: 'Invalid or expired verification code.' });

  const employee = { ...pending, verified: true };
  memoryEmployees.push(employee);
  pendingVerifications.delete(employee.email);

  if (isDBConnected()) {
    try {
      await User.findOneAndUpdate({ employeeId: employee.employeeId }, employee, { upsert: true, new: true });
    } catch (e) { console.warn('[DB User Upsert Error]', e.message); }
  }

  const token = crypto.randomUUID();
  sessions.set(token, employee);
  return res.json({ token, user: { name: employee.name, employeeId: employee.employeeId, role: employee.role } });
});

app.post('/api/auth/login', async (req, res) => {
  const data = req.body;
  const identifier = String(data.identifier || '').trim();
  const password = String(data.password || '');

  let user = null;
  if (isDBConnected()) {
    try {
      user = await User.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { employeeId: identifier.toUpperCase() }
        ],
        password: password
      });
    } catch (e) { console.warn('[DB User Find Error]', e.message); }
  }

  if (!user) {
    user = memoryEmployees.find(e =>
      (e.email.toLowerCase() === identifier.toLowerCase() || e.employeeId.toUpperCase() === identifier.toUpperCase() || e.id === identifier.toUpperCase()) &&
      e.password === password
    );
  }

  if (!user) return res.status(401).json({ error: 'Employee ID/email or password is incorrect.' });

  const token = crypto.randomUUID();
  const userInfo = { name: user.name, employeeId: user.employeeId || user.id, role: user.role };
  sessions.set(token, userInfo);
  return res.json({ token, user: userInfo });
});

app.post('/api/auth/logout', (req, res) => {
  sessions.delete((req.headers.authorization || '').replace('Bearer ', ''));
  return res.json({ ok: true });
});

// Partner NGO Auth
app.post('/api/partner/signup', (req, res) => {
  const data = req.body;
  const email = String(data.email || '').trim().toLowerCase();
  const registrationId = String(data.registrationId || '').trim().toUpperCase();
  if (!String(data.organisation || '').trim()) return res.status(400).json({ error: 'Enter the registered NGO, institute or project name.' });
  if (!/^[A-Z0-9][A-Z0-9/-]{4,}$/.test(registrationId)) return res.status(400).json({ error: 'Enter a valid DoSJE registration ID.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid organisation email address.' });
  if (String(data.password || '').length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });

  if (memoryPartnerAccounts.some(account => account.email === email || account.registrationId === registrationId)) {
    return res.status(409).json({ error: 'This organisation already has an account. Please sign in.' });
  }
  pendingPartnerVerifications.set(email, { organisation: String(data.organisation).trim(), registrationId, email, password: data.password, role: 'Project / NGO Administrator' });
  return res.json({ verificationRequired: true, demoCode: '123456', message: 'Verification code sent to your registered organisation email.' });
});

app.post('/api/partner/verify', (req, res) => {
  const data = req.body;
  const account = pendingPartnerVerifications.get(String(data.email || '').toLowerCase());
  if (!account || data.code !== '123456') return res.status(400).json({ error: 'Invalid or expired verification code.' });
  memoryPartnerAccounts.push(account);
  pendingPartnerVerifications.delete(account.email);
  const token = crypto.randomUUID();
  sessions.set(token, account);
  return res.json({ token, user: { name: account.organisation, registrationId: account.registrationId, role: account.role } });
});

app.post('/api/partner/login', (req, res) => {
  const data = req.body;
  const identifier = String(data.identifier || '').trim().toLowerCase();
  const account = memoryPartnerAccounts.find(item => (item.email === identifier || item.registrationId.toLowerCase() === identifier) && item.password === data.password);
  if (!account) return res.status(401).json({ error: 'Organisation ID/email or password is incorrect.' });
  const token = crypto.randomUUID();
  sessions.set(token, account);
  return res.json({ token, user: { name: account.organisation, registrationId: account.registrationId, role: account.role } });
});

// ==========================================
// Middleware: Auth Check for /api
// ==========================================
app.use('/api', (req, res, next) => {
  const publicPaths = [
    '/auth/signup', '/auth/verify', '/auth/login',
    '/partner/signup', '/partner/verify', '/partner/login',
    '/feedback',
    '/mobile-cctv/room', '/mobile-cctv/signal', '/mobile-cctv/signals', '/mobile-cctv/frame'
  ];
  if (publicPaths.some(p => req.path === p)) return next();
  if (!sessionUser(req)) return res.status(401).json({ error: 'Authentication required.' });
  next();
});

// ==========================================
// Dashboard Endpoint
// ==========================================
app.get('/api/dashboard', async (req, res) => {
  let sites = memorySites;
  let logs = memoryLogs;

  if (isDBConnected()) {
    try {
      const dbSites = await Project.find({}).lean();
      if (dbSites && dbSites.length) {
        sites = dbSites.map(s => {
          const mem = memorySites.find(m => m.id === s.id);
          return { ...s, checklist: mem ? mem.checklist : initChecklistForProject(s.score) };
        });
      }
      const dbLogs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(50).lean();
      if (dbLogs && dbLogs.length) logs = dbLogs;
    } catch (e) {
      console.warn('[DB Dashboard Fetch Error]', e.message);
    }
  }

  // Format logs for response with IST time
  const formattedLogs = logs.map(l => ({
    ...l,
    formattedIST: formatToIST(l.timestamp),
    relativeIST: formatRelativeIST(l.timestamp)
  }));

  return res.json({
    sites,
    inspections: memoryInspections,
    alerts: memoryAlerts,
    reports: memoryReports,
    feedback: memoryFeedback,
    logs: formattedLogs,
    inspectors: inspectorRoster.map(({ name, workload }) => ({ name, workload, role: 'PMU Inspector' })),
    stats: dashboardStats()
  });
});

// ==========================================
// Projects & Server-Authoritative Checklist
// ==========================================
app.get('/api/projects', async (req, res) => {
  let sites = memorySites;
  if (isDBConnected()) {
    try {
      const dbSites = await Project.find({}).lean();
      if (dbSites && dbSites.length) sites = dbSites;
    } catch (e) { console.warn('[DB Projects Fetch Error]', e.message); }
  }
  return res.json({ sites });
});

app.get('/api/projects/:id/checklist', async (req, res) => {
  const projectId = req.params.id;
  let project = memorySites.find(s => s.id === projectId);

  if (isDBConnected()) {
    try {
      const dbProject = await Project.findOne({ id: projectId }).lean();
      if (dbProject) project = { ...dbProject, checklist: project ? project.checklist : initChecklistForProject(dbProject.score) };
    } catch (e) { console.warn('[DB Project Find Error]', e.message); }
  }

  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.checklist) project.checklist = initChecklistForProject(project.score || 60);

  return res.json({
    id: project.id,
    name: project.name,
    scheme: project.scheme,
    district: project.district,
    state: project.state,
    risk: project.risk,
    status: project.status || (project.camera === 'Offline' ? 'Closed' : 'Live'),
    score: project.score,
    lastUpdated: project.lastUpdated || new Date().toISOString(),
    lastUpdatedIST: formatToIST(project.lastUpdated),
    assignedInspector: project.assignedInspector || 'Arjun Mehta',
    checklist: project.checklist
  });
});

// PUT /api/projects/:id/checklist
// Server-Authoritative Compliance Score Calculation & Socket.io Broadcast
app.put('/api/projects/:id/checklist', async (req, res) => {
  const projectId = req.params.id;
  const project = memorySites.find(s => s.id === projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const data = req.body;
  if (data.checklist) {
    project.checklist = data.checklist;
  }

  // Server-authoritative score calculation from weights
  const oldScore = project.score;
  const serverScore = computeComplianceScore(project.checklist);
  project.score = serverScore;

  if (data.status) {
    project.status = data.status;
    project.camera = data.status === 'Closed' ? 'Offline' : 'Live';
  }
  project.lastUpdated = new Date().toISOString();

  // Create Audit Log entry
  let newLogEntry = null;
  const user = sessionUser(req) || { name: 'Arjun Mehta', role: 'PMU Inspector' };
  const actorName = `${user.name} (${user.role})`;

  if (data.logEntry) {
    newLogEntry = {
      id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
      timestamp: new Date(), // stored as UTC Date
      projectId: project.id,
      projectName: project.name,
      state: project.state,
      actionType: data.logEntry.actionType || 'checklist',
      actorId: user.employeeId || 'GOV-2026-1001',
      actorName: actorName,
      ...data.logEntry
    };
    memoryLogs.unshift(newLogEntry);
  }

  // Persist to MongoDB if connected
  if (isDBConnected()) {
    try {
      await Project.findOneAndUpdate(
        { id: projectId },
        {
          score: project.score,
          status: project.status,
          camera: project.camera,
          lastUpdated: project.lastUpdated
        },
        { new: true }
      );
      if (newLogEntry) {
        await AuditLog.create(newLogEntry);
      }
    } catch (e) {
      console.warn('[DB Project Update Error]', e.message);
    }
  }

  // Real-time broadcast to all connected clients via Socket.io
  const broadcastPayload = {
    projectId: project.id,
    checklist: project.checklist,
    score: project.score,
    status: project.status,
    lastUpdated: project.lastUpdated,
    lastUpdatedIST: formatToIST(project.lastUpdated)
  };
  io.emit('checklist:updated', broadcastPayload);
  if (newLogEntry) {
    io.emit('audit:new_entry', {
      ...newLogEntry,
      formattedIST: formatToIST(newLogEntry.timestamp),
      relativeIST: formatRelativeIST(newLogEntry.timestamp)
    });
  }

  return res.json({
    ok: true,
    score: project.score,
    status: project.status,
    lastUpdated: project.lastUpdated,
    checklist: project.checklist
  });
});

// POST /api/projects/:id/custom-item
// Inspector-Only Custom Checklist Item Addition with Option (b) Proportional Rescaling
app.post('/api/projects/:id/custom-item', async (req, res) => {
  const projectId = req.params.id;
  const project = memorySites.find(s => s.id === projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const user = sessionUser(req) || { name: 'Arjun Mehta', role: 'PMU Inspector' };
  // Verify authorization: Assigned Inspector or Department Official
  const isAuthorized = user.role === 'Department Official' ||
    (project.assignedInspector && project.assignedInspector.toLowerCase().trim() === user.name.toLowerCase().trim());
  if (!isAuthorized) {
    return res.status(403).json({ error: `Only the assigned inspector in-charge (${project.assignedInspector}) can add custom items.` });
  }

  const { category, text, rawWeight } = req.body;
  if (!category || !text || !String(text).trim()) {
    return res.status(400).json({ error: 'Category and question text are required.' });
  }

  const cat = project.checklist.find(c => c.category.toLowerCase() === category.toLowerCase());
  if (!cat) return res.status(400).json({ error: 'Invalid checklist category.' });

  const weightNum = parseFloat(rawWeight) || 10;
  const newItem = {
    id: 'cst-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    text: String(text).trim(),
    weight: weightNum,
    checked: false,
    custom: true
  };
  cat.items.push(newItem);

  // Option (b) Proportional Weight Rescaling to 25.0%
  normalizeCategoryWeights(cat);

  const oldScore = project.score;
  const newScore = computeComplianceScore(project.checklist);
  const delta = newScore - oldScore;
  project.score = newScore;
  project.lastUpdated = new Date().toISOString();

  const actorName = `${user.name} (${user.role})`;
  const logEntry = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: new Date(),
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'custom_item_added',
    actorId: user.employeeId || 'GOV-2026-1001',
    actorName: actorName,
    field: 'Custom Checklist Item Added',
    oldValue: '',
    newValue: newItem.text.slice(0, 45) + (newItem.text.length > 45 ? '…' : ''),
    delta: delta !== 0 ? (delta > 0 ? `+${delta}%` : `${delta}%`) : '',
    description: `Custom checklist item added to ${cat.category} by ${user.name}: "${newItem.text}" (weights rescaled to 25%)`
  };
  memoryLogs.unshift(logEntry);

  if (isDBConnected()) {
    try {
      await Project.findOneAndUpdate({ id: projectId }, { score: project.score, lastUpdated: project.lastUpdated });
      await ChecklistItem.create({
        id: newItem.id,
        projectId: project.id,
        category: cat.category,
        questionText: newItem.text,
        weight: newItem.weight,
        isChecked: false,
        isCustom: true,
        createdBy: user.name
      });
      await AuditLog.create(logEntry);
    } catch (e) { console.warn('[DB Custom Item Insert Error]', e.message); }
  }

  // Socket.io Broadcast
  io.emit('checklist:updated', {
    projectId: project.id,
    checklist: project.checklist,
    score: project.score,
    lastUpdated: project.lastUpdated,
    lastUpdatedIST: formatToIST(project.lastUpdated)
  });
  io.emit('audit:new_entry', {
    ...logEntry,
    formattedIST: formatToIST(logEntry.timestamp),
    relativeIST: formatRelativeIST(logEntry.timestamp)
  });

  return res.status(201).json({
    ok: true,
    score: project.score,
    checklist: project.checklist,
    logEntry
  });
});

// DELETE /api/projects/:id/custom-item/:itemId
// Inspector-Only Custom Checklist Item Deletion with Re-normalization
app.delete('/api/projects/:id/custom-item/:itemId', async (req, res) => {
  const { id: projectId, itemId } = req.params;
  const project = memorySites.find(s => s.id === projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const user = sessionUser(req) || { name: 'Arjun Mehta', role: 'PMU Inspector' };
  const isAuthorized = user.role === 'Department Official' ||
    (project.assignedInspector && project.assignedInspector.toLowerCase().trim() === user.name.toLowerCase().trim());
  if (!isAuthorized) {
    return res.status(403).json({ error: `Only the assigned inspector in-charge (${project.assignedInspector}) can delete custom items.` });
  }

  let targetCat = null;
  let targetItem = null;
  for (const cat of project.checklist) {
    const idx = cat.items.findIndex(it => it.id === itemId && it.custom);
    if (idx !== -1) {
      targetCat = cat;
      targetItem = cat.items.splice(idx, 1)[0];
      break;
    }
  }

  if (!targetItem) {
    return res.status(404).json({ error: 'Custom item not found or item is a non-deletable core item.' });
  }

  // Re-normalize category weights to 25.0%
  normalizeCategoryWeights(targetCat);

  const oldScore = project.score;
  const newScore = computeComplianceScore(project.checklist);
  const delta = newScore - oldScore;
  project.score = newScore;
  project.lastUpdated = new Date().toISOString();

  const actorName = `${user.name} (${user.role})`;
  const logEntry = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: new Date(),
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'custom_item_deleted',
    actorId: user.employeeId || 'GOV-2026-1001',
    actorName: actorName,
    field: 'Custom Checklist Item Deleted',
    oldValue: targetItem.text.slice(0, 45) + (targetItem.text.length > 45 ? '…' : ''),
    newValue: '',
    delta: delta !== 0 ? (delta > 0 ? `+${delta}%` : `${delta}%`) : '',
    description: `Custom checklist item deleted by ${user.name}: "${targetItem.text}" (category weights re-normalized)`
  };
  memoryLogs.unshift(logEntry);

  if (isDBConnected()) {
    try {
      await Project.findOneAndUpdate({ id: projectId }, { score: project.score, lastUpdated: project.lastUpdated });
      await ChecklistItem.deleteOne({ id: itemId });
      await AuditLog.create(logEntry);
    } catch (e) { console.warn('[DB Custom Item Delete Error]', e.message); }
  }

  // Socket.io Broadcast
  io.emit('checklist:updated', {
    projectId: project.id,
    checklist: project.checklist,
    score: project.score,
    lastUpdated: project.lastUpdated,
    lastUpdatedIST: formatToIST(project.lastUpdated)
  });
  io.emit('audit:new_entry', {
    ...logEntry,
    formattedIST: formatToIST(logEntry.timestamp),
    relativeIST: formatRelativeIST(logEntry.timestamp)
  });

  return res.json({
    ok: true,
    score: project.score,
    checklist: project.checklist,
    logEntry
  });
});

// ==========================================
// Audit Logs Endpoint with Multi-Field Filters
// ==========================================
app.get('/api/logs', async (req, res) => {
  let logs = memoryLogs;
  if (isDBConnected()) {
    try {
      const dbLogs = await AuditLog.find({}).sort({ timestamp: -1 }).lean();
      if (dbLogs && dbLogs.length) logs = dbLogs;
    } catch (e) { console.warn('[DB Logs Fetch Error]', e.message); }
  }

  let filtered = [...logs];
  const qProject = req.query.project;
  const qAction = req.query.action;
  const qState = req.query.state;
  const qDays = parseInt(req.query.days || '0', 10);

  if (qProject) {
    filtered = filtered.filter(l => l.projectId === qProject || (l.projectName || '').toLowerCase().includes(qProject.toLowerCase()));
  }
  if (qAction && qAction !== 'all') {
    filtered = filtered.filter(l => l.actionType === qAction || l.actionType.startsWith(qAction));
  }
  if (qState && qState !== 'all') {
    filtered = filtered.filter(l => l.state === qState);
  }
  if (qDays > 0) {
    const cutoff = Date.now() - qDays * 86400000;
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= cutoff);
  }

  const formattedLogs = filtered.map(l => ({
    ...l,
    formattedIST: formatToIST(l.timestamp),
    timestampIST: formatToIST(l.timestamp),
    relativeIST: formatRelativeIST(l.timestamp)
  }));

  return res.json({ logs: formattedLogs });
});

app.post('/api/logs', async (req, res) => {
  const data = req.body;
  const user = sessionUser(req) || { name: 'Arjun Mehta', role: 'PMU Inspector' };
  const entry = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: new Date(),
    projectId: data.projectId || 'P-General',
    projectName: data.projectName || 'General Project',
    state: data.state || '',
    actionType: data.actionType || 'checklist',
    actorId: user.employeeId || 'GOV-2026-1001',
    actorName: data.actor || `${user.name} (${user.role})`,
    oldValue: data.oldValue || '',
    newValue: data.newValue || '',
    delta: data.delta || '',
    description: data.description || '',
    field: data.field || ''
  };
  memoryLogs.unshift(entry);

  if (isDBConnected()) {
    try {
      await AuditLog.create(entry);
    } catch (e) { console.warn('[DB Log Create Error]', e.message); }
  }

  io.emit('audit:new_entry', {
    ...entry,
    formattedIST: formatToIST(entry.timestamp),
    relativeIST: formatRelativeIST(entry.timestamp)
  });

  return res.status(201).json({ ok: true, log: entry });
});

// ==========================================
// Inspections & Assignments
// ==========================================
app.post('/api/assign', (req, res) => {
  const data = req.body;
  const riskOrder = { High: 0, Medium: 1, Low: 2, 'Pending review': 3 };
  const availableSites = memorySites.filter(s => !s.inspectionAssigned);
  const target = data.siteId ? memorySites.find(s => s.id === data.siteId) : availableSites.sort((a, b) => (riskOrder[a.risk] || 2) - (riskOrder[b.risk] || 2))[0];
  if (!target) return res.status(409).json({ error: 'No unassigned projects are currently available for inspection.' });
  if (target.inspectionAssigned) return res.status(409).json({ error: 'This project has already been assigned for inspection.' });

  const conflictFree = inspectorRoster.filter(inspector => !inspector.conflicts.includes(target.id));
  let inspector, assignmentBasis;
  if (data.inspectorName) {
    inspector = conflictFree.find(person => person.name === data.inspectorName);
    if (!inspector) return res.status(400).json({ error: 'Selected inspector is unavailable or has a conflict for this project.' });
    assignmentBasis = 'Specific inspector selected by authorised official';
  } else {
    const stateEligible = conflictFree.filter(person => person.states.includes(target.state));
    inspector = (stateEligible.length ? stateEligible : conflictFree).sort((a, b) => a.workload - b.workload)[0];
    assignmentBasis = 'Automated, conflict-free state jurisdiction assignment';
  }
  if (!inspector) return res.status(503).json({ error: 'No conflict-free inspector is available.' });

  inspector.workload++;
  target.inspectionAssigned = true;
  const record = {
    id: 'INS-' + Math.floor(1000 + Math.random() * 9000),
    site: target.name,
    siteId: target.id,
    inspector: inspector.name,
    due: data.due || 'Within 48 hours',
    priority: data.priority || target.risk,
    status: 'Assigned',
    notes: data.notes || '',
    assignmentBasis,
    evidence: storedEvidence(data.evidence),
    location: data.location || 'Pending capture',
    finding: data.finding || 'Pending on-ground review'
  };
  memoryInspections.unshift(record);

  const logEntry = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: new Date(),
    projectId: target.id,
    projectName: target.name,
    state: target.state,
    actionType: 'inspection',
    actorName: inspector.name + ' (PMU Inspector)',
    field: 'Inspection Assignment',
    oldValue: 'Unassigned',
    newValue: 'Assigned',
    description: `Inspection ${record.id} assigned to ${inspector.name} (${assignmentBasis})`
  };
  memoryLogs.unshift(logEntry);
  io.emit('audit:new_entry', {
    ...logEntry,
    formattedIST: formatToIST(logEntry.timestamp),
    relativeIST: formatRelativeIST(logEntry.timestamp)
  });

  return res.status(201).json({ id: record.id, inspector: inspector.name, assignmentBasis });
});

app.post('/api/inspections/start', (req, res) => {
  const { inspectionId } = req.body;
  const inspection = memoryInspections.find(item => item.id === inspectionId);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });
  if (inspection.status !== 'Assigned') return res.status(409).json({ error: `Inspection is already ${inspection.status.toLowerCase()}.` });
  inspection.status = 'In progress';
  inspection.startedAt = new Date().toISOString();
  return res.json({ ok: true, inspection });
});

app.post('/api/reports', (req, res) => {
  const data = req.body;
  const inspection = data.inspectionId ? memoryInspections.find(i => i.id === data.inspectionId) : null;
  const site = memorySites.find(s => s.name === data.site) || { lat: 20.5937, lng: 78.9629, state: '' };
  const user = sessionUser(req) || { name: 'Arjun Mehta' };
  const evidence = storedEvidence(data.evidence);
  if (evidence?.error) return res.status(400).json({ error: evidence.error });

  const flags = [];
  const coords = parseCoordinates(data.location);
  if (coords && Number.isFinite(site.lat) && metersBetween(coords, [site.lat, site.lng]) > 100) {
    flags.push('Geo-fence mismatch: evidence is more than 100 m from the registered project location.');
  }

  const report = {
    id: 'REP-' + Math.floor(1000 + Math.random() * 9000),
    site: data.site,
    finding: data.finding || 'Compliance observed',
    notes: data.notes || '',
    evidence: evidence ? 'Verified media attached' : 'No media attached',
    location: data.location || '',
    inspector: user.name,
    submittedAt: new Date().toISOString(),
    flags
  };
  memoryReports.unshift(report);
  if (inspection) inspection.status = 'Completed';
  return res.status(201).json({ ok: true, report });
});

app.post('/api/vc', (req, res) => {
  return res.json({ ok: true, message: 'Secure VC verification scheduled' });
});

// Partner NGO Portal
app.get('/api/partner/projects', (req, res) => {
  const user = sessionUser(req);
  if (user?.role !== 'Project / NGO Administrator') return res.status(403).json({ error: 'Organisation access required.' });
  return res.json({ projects: memorySites.filter(site => site.owner === user.registrationId) });
});

app.get('/api/partner/dashboard', (req, res) => {
  const user = sessionUser(req);
  if (user?.role !== 'Project / NGO Administrator') return res.status(403).json({ error: 'Organisation access required.' });
  const projects = memorySites.filter(site => site.owner === user.registrationId);
  const projectNames = new Set(projects.map(site => site.name));
  const projectInspections = memoryInspections.filter(item => projectNames.has(item.site));
  const projectReports = memoryReports.filter(item => projectNames.has(item.site));
  const projectAlerts = memoryAlerts.filter(item => projectNames.has(item.site));
  const projectFeedback = memoryFeedback.filter(item => [...projectNames].some(name => name === item.ngo || name.replace(' (sample)', '') === item.ngo));
  return res.json({
    projects,
    inspections: projectInspections,
    reports: projectReports,
    alerts: projectAlerts,
    feedback: projectFeedback,
    stats: {
      projects: projects.length,
      activeInspections: projectInspections.filter(item => item.status !== 'Completed').length,
      reports: projectReports.length,
      grievances: projectFeedback.length
    }
  });
});

app.post('/api/partner/projects', (req, res) => {
  const user = sessionUser(req);
  if (user?.role !== 'Project / NGO Administrator') return res.status(403).json({ error: 'Organisation access required.' });
  const data = req.body;
  const name = String(data.name || '').trim();
  const state = String(data.state || '').trim();
  const district = String(data.district || '').trim();
  if (!name || !state || !district || !String(data.scheme || '').trim()) return res.status(400).json({ error: 'Project name, scheme, State/UT and district are required.' });

  const lat = Number(data.lat), lng = Number(data.lng);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const project = {
    id: 'P-' + Math.floor(100000 + Math.random() * 899999),
    name,
    district,
    state,
    scheme: String(data.scheme).trim(),
    risk: 'Pending review',
    score: 0,
    camera: 'Not connected',
    attendance: 0,
    lastInspection: 'Not yet inspected',
    lat: hasCoordinates ? lat : 20.5937,
    lng: hasCoordinates ? lng : 78.9629,
    inspectionAssigned: false,
    owner: user.registrationId,
    createdAt: new Date().toISOString()
  };
  project.checklist = initChecklistForProject(0);
  memorySites.unshift(project);

  if (isDBConnected()) {
    Project.create(project).catch(e => console.warn('[DB Partner Project Error]', e.message));
  }

  return res.status(201).json({ project });
});

// Grievance / Feedback
app.post('/api/feedback', (req, res) => {
  const data = req.body;
  if (!data.category || !data.message) return res.status(400).json({ error: 'Please select a grievance category and describe the issue.' });
  if (!/^\d{10}$/.test(String(data.phone || '').replace(/\D/g, ''))) return res.status(400).json({ error: 'Enter a valid 10-digit beneficiary mobile number.' });

  const evidence = storedEvidence(data.evidence);
  if (evidence?.error) return res.status(400).json({ error: evidence.error });

  const item = {
    id: 'GRV-' + Math.floor(100000 + Math.random() * 899999),
    category: data.category,
    ngo: data.ngo || 'Not specified',
    message: data.message,
    phone: String(data.phone).replace(/\D/g, ''),
    anonymous: Boolean(data.anonymous),
    evidence,
    submittedAt: new Date().toISOString(),
    status: 'Received'
  };
  memoryFeedback.unshift(item);
  return res.status(201).json({ reference: item.id, status: item.status });
});

// Camera & WebRTC Signaling
app.post('/api/camera/room', (req, res) => {
  const data = req.body;
  const roomId = data.roomId || crypto.randomUUID().slice(0, 8);
  if (!cameraRooms.has(roomId)) cameraRooms.set(roomId, []);
  return res.json({ roomId });
});
app.post('/api/camera/signal', (req, res) => {
  const data = req.body;
  if (!data.roomId || !data.clientId || !data.signal) return res.status(400).json({ error: 'Invalid camera signal.' });
  if (!cameraRooms.has(data.roomId)) cameraRooms.set(data.roomId, []);
  cameraRooms.get(data.roomId).push({ from: data.clientId, signal: data.signal });
  return res.json({ ok: true });
});
app.get('/api/camera/signals', (req, res) => {
  const roomId = req.query.roomId, clientId = req.query.clientId;
  const signals = cameraRooms.get(roomId) || [];
  const received = signals.filter(x => x.from !== clientId);
  cameraRooms.set(roomId, signals.filter(x => x.from === clientId));
  return res.json({ signals: received });
});

// Mobile CCTV Signaling
app.post('/api/mobile-cctv/room', (req, res) => {
  const data = req.body;
  const roomId = data.roomId || crypto.randomUUID().slice(0, 10);
  if (!mobileCctvRooms.has(roomId)) mobileCctvRooms.set(roomId, []);
  return res.json({ roomId });
});
app.post('/api/mobile-cctv/signal', (req, res) => {
  const data = req.body;
  if (!data.roomId || !data.clientId || !data.signal) return res.status(400).json({ error: 'Invalid mobile CCTV signal.' });
  if (!mobileCctvRooms.has(data.roomId)) mobileCctvRooms.set(data.roomId, []);
  mobileCctvRooms.get(data.roomId).push({ id: crypto.randomUUID(), from: data.clientId, target: data.target || null, signal: data.signal, createdAt: Date.now() });
  return res.json({ ok: true });
});
app.get('/api/mobile-cctv/signals', (req, res) => {
  const roomId = req.query.roomId, clientId = req.query.clientId, queued = mobileCctvRooms.get(roomId) || [];
  const received = queued.filter(item => item.from !== clientId && (!item.target || item.target === clientId));
  const receivedIds = new Set(received.map(item => item.id));
  mobileCctvRooms.set(roomId, queued.filter(item => !receivedIds.has(item.id) && Date.now() - item.createdAt < 600000));
  return res.json({ signals: received });
});
app.post('/api/mobile-cctv/frame', (req, res) => {
  const data = req.body;
  if (!data.roomId || typeof data.image !== 'string' || !data.image.startsWith('data:image/') || data.image.length > 700000) {
    return res.status(400).json({ error: 'Invalid camera frame.' });
  }
  mobileCctvFrames.set(data.roomId, { image: data.image, updatedAt: Date.now() });
  return res.json({ ok: true });
});
app.get('/api/mobile-cctv/frame', (req, res) => {
  const frame = mobileCctvFrames.get(req.query.roomId);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.json(frame || { image: null, updatedAt: null });
});

// Static Assets & SPA Fallback
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io Connection Event
io.on('connection', socket => {
  socket.emit('connected', { ok: true, socketId: socket.id, serverTimeIST: formatToIST(new Date()) });
});

// Initialize DB and Start Server
async function startServer() {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`Saarthi Smart Monitoring & Inspection Server Running`);
    console.log(`URL:         http://localhost:${PORT}`);
    logServerTime();
    console.log(`Database:    ${isDBConnected() ? 'MongoDB Atlas (Connected)' : 'In-Memory Hybrid Provider'}`);
    console.log(`Real-Time:   Socket.io Enabled (Zero-Latency Sync)`);
    console.log(`=======================================================`);
  });
}

startServer();
