const mongoose = require('mongoose');
const Project = require('../models/Project');
const ChecklistItem = require('../models/ChecklistItem');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const AttendanceRecord = require('../models/AttendanceRecord');

const defaultChecklistTemplate = [
  {
    category: 'Infrastructure',
    items: [
      { id: 'inf-1', text: 'Is the facility physically accessible (ramps, barrier-free corridors, accessible toilets)?', weight: 12.5, checked: true },
      { id: 'inf-2', text: 'Are safety equipment, fire extinguishers, and emergency evacuation exits functional and inspected?', weight: 12.5, checked: true }
    ]
  },
  {
    category: 'Staffing & Attendance',
    items: [
      { id: 'stf-1', text: 'Is the daily staff attendance register up to date and corroborated with biometric logs?', weight: 12.5, checked: true },
      { id: 'stf-2', text: 'Is the designated project in-charge physically present on-site during operational hours?', weight: 12.5, checked: false }
    ]
  },
  {
    category: 'Documentation',
    items: [
      { id: 'doc-1', text: 'Are financial accounts, grant utilization certificates, and beneficiary registers updated?', weight: 12.5, checked: false },
      { id: 'doc-2', text: 'Is DPDP-compliant data handling, beneficiary confidentiality, and written consent followed?', weight: 12.5, checked: true }
    ]
  },
  {
    category: 'Service Delivery',
    items: [
      { id: 'srv-1', text: 'Is the approved DoSJE training syllabus, daily curriculum, and practical module followed?', weight: 12.5, checked: true },
      { id: 'srv-2', text: 'Are course training kits, uniforms/materials, and stipulated beneficiary stipends distributed?', weight: 12.5, checked: false }
    ]
  }
];

const initialSites = [
  { id:'P-2041', name:'Udaan Skill Centre (sample)', district:'Lucknow', state:'Uttar Pradesh', scheme:'SMILE', risk:'High', score:58, camera:'Live', status:'Live', attendance:62, lastInspection:'14 Aug 2026', lat:26.8467, lng:80.9462, inspectionAssigned:false, owner:'NGO/2026/1001', assignedInspector:'Arjun Mehta', assignedInspectorId:'GOV-2026-1001' },
  { id:'P-1872', name:'Saksham Residential Institute', district:'Jaipur', state:'Rajasthan', scheme:'PM-DAKSH', risk:'Medium', score:75, camera:'Live', status:'Live', attendance:84, lastInspection:'09 Aug 2026', lat:26.9124, lng:75.7873, inspectionAssigned:false, owner:'NGO/2026/1002', assignedInspector:'Vikram Singh', assignedInspectorId:'GOV-2026-1003' },
  { id:'P-3108', name:'Nayi Disha Foundation', district:'Bhopal', state:'Madhya Pradesh', scheme:'NAMASTE', risk:'Low', score:88, camera:'Offline', status:'Closed', attendance:89, lastInspection:'18 Aug 2026', lat:23.2599, lng:77.4126, inspectionAssigned:false, owner:'NGO/2026/1003', assignedInspector:'Nisha Kapoor', assignedInspectorId:'GOV-2026-1002' },
  { id:'P-2234', name:'Aasha Rehabilitation Centre', district:'Patna', state:'Bihar', scheme:'SMILE', risk:'High', score:50, camera:'Live', status:'Live', attendance:57, lastInspection:'02 Aug 2026', lat:25.5941, lng:85.1376, inspectionAssigned:false, owner:'NGO/2026/1004', assignedInspector:'Arjun Mehta', assignedInspectorId:'GOV-2026-1001' },
  { id:'P-1146', name:'Prerna Education Trust', district:'Kolkata', state:'West Bengal', scheme:'PM-DAKSH', risk:'Low', score:100, camera:'Live', status:'Live', attendance:93, lastInspection:'12 Aug 2026', lat:22.5726, lng:88.3639, inspectionAssigned:false, owner:'NGO/2026/1005', assignedInspector:'Vikram Singh', assignedInspectorId:'GOV-2026-1003' },
  { id:'P-4011', name:'Bengaluru Skill Academy', district:'Bengaluru', state:'Karnataka', scheme:'PM-DAKSH', risk:'Medium', score:63, camera:'Live', status:'Live', attendance:78, lastInspection:'10 Aug 2026', lat:12.9716, lng:77.5946, inspectionAssigned:false, owner:'NGO/2026/1006', assignedInspector:'Meera Iyer', assignedInspectorId:'GOV-2026-1004' }
];

// Empty initial logs so only real, authentic system events populate the audit trail
const initialLogs = [];

const initialUsers = [
  { id: 'GOV-2026-1001', employeeId: 'GOV-2026-1001', name: 'Arjun Mehta', email: 'arjun.mehta@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-2041', 'P-2234'] },
  { id: 'GOV-2026-1002', employeeId: 'GOV-2026-1002', name: 'Nisha Kapoor', email: 'nisha.kapoor@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-3108'] },
  { id: 'GOV-2026-1003', employeeId: 'GOV-2026-1003', name: 'Vikram Singh', email: 'vikram.singh@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-1872', 'P-1146'] },
  { id: 'GOV-2026-1004', employeeId: 'GOV-2026-1004', name: 'Meera Iyer', email: 'meera.iyer@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-4011'] },
  { id: 'GOV-2026-9001', employeeId: 'GOV-2026-9001', name: 'Dr. Rajesh Sharma', email: 'rajesh.sharma@dosje.gov.in', password: 'Saarthi@2026', role: 'Department Official', assignedProjectIds: [] },
  { id: 'NGO/2026/1001', employeeId: 'NGO-2026-1001', name: 'Udaan Skill Centre', email: 'udan@dosje-demo.org', password: 'Saarthi@2026', role: 'Project / NGO Administrator', assignedProjectIds: ['P-2041'] }
];

const initialStaffMap = {
  'P-2041': [
    { name: 'Ramesh Kumar', id: 'NGO-STF-101' },
    { name: 'Pooja Verma', id: 'NGO-STF-102' },
    { name: 'Sunil Yadav', id: 'NGO-STF-103' }
  ],
  'P-1872': [
    { name: 'Mahesh Joshi', id: 'NGO-STF-201' },
    { name: 'Kavita Meena', id: 'NGO-STF-202' }
  ],
  'P-3108': [
    { name: 'Deepak Chouhan', id: 'NGO-STF-301' },
    { name: 'Anjali Malviya', id: 'NGO-STF-302' }
  ],
  'P-2234': [
    { name: 'Sanjay Paswan', id: 'NGO-STF-401' },
    { name: 'Rekha Kumari', id: 'NGO-STF-402' }
  ],
  'P-1146': [
    { name: 'Subhash Mukherjee', id: 'NGO-STF-501' },
    { name: 'Debolina Sen', id: 'NGO-STF-502' }
  ],
  'P-4011': [
    { name: 'Venkatesh Rao', id: 'NGO-STF-601' },
    { name: 'Lakshmi Nair', id: 'NGO-STF-602' }
  ]
};

function generateInitialAttendance() {
  const records = [];
  const today = new Date();
  for (const site of initialSites) {
    const staffList = initialStaffMap[site.id] || [{ name: 'Project Coordinator', id: 'NGO-STF-001' }];
    const targetPercent = site.attendance || 75;
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      const dateStr = d.toISOString().split('T')[0];
      if (d.getDay() === 0) continue; // Skip Sundays
      for (const staff of staffList) {
        const hash = (site.id.charCodeAt(3) * 17 + dayOffset * 31 + staff.id.charCodeAt(8) * 13) % 100;
        const isPresent = hash < targetPercent;
        const status = isPresent ? 'Present' : (hash % 2 === 0 ? 'Absent' : 'Half-day');
        records.push({
          id: `ATT-${site.id.replace('P-', '')}-${dateStr.replace(/-/g, '')}-${staff.id.slice(-3)}`,
          projectId: site.id,
          projectName: site.name,
          staffName: staff.name,
          staffId: staff.id,
          date: dateStr,
          checkIn: isPresent ? '09:15' : '10:30',
          checkOut: isPresent ? '17:30' : (status === 'Half-day' ? '13:30' : ''),
          status,
          geoLocation: {
            captured: true,
            latitude: site.lat + (Math.sin(dayOffset) * 0.0005),
            longitude: site.lng + (Math.cos(dayOffset) * 0.0005),
            accuracy: 8 + (dayOffset % 5),
            capturedAt: new Date(d.setHours(9, 15, 0, 0))
          },
          submittedBy: `NGO Field Staff (${site.owner})`,
          createdAt: new Date(d.setHours(9, 15, 0, 0))
        });
      }
    }
  }
  return records;
}

const initialAttendance = generateInitialAttendance();

// Calibrate initialSites attendance to precisely match the real records rolling score
initialSites.forEach(s => {
  const pRecs = initialAttendance.filter(r => r.projectId === s.id);
  let totalScoreWeight = 0;
  pRecs.slice(0, 30).forEach(r => {
    if (r.status === 'Present') totalScoreWeight += 1;
    else if (r.status === 'Half-day' || r.status === 'Late') totalScoreWeight += 0.5;
  });
  if (pRecs.length > 0) {
    s.attendance = Math.round((totalScoreWeight / Math.min(pRecs.length, 30)) * 100);
  }
});

let isConnected = false;

// Attach Mongoose connection event listeners for auto-reconnect & connection resilience
mongoose.connection.on('disconnected', () => {
  console.warn('[Database] Mongoose connection lost. Operating in resilient hybrid fallback mode.');
  isConnected = false;
});
mongoose.connection.on('reconnected', () => {
  console.log('[Database] Mongoose reconnected to MongoDB Atlas.');
  isConnected = true;
});
mongoose.connection.on('error', (err) => {
  console.error('[Database] Mongoose error:', err.message);
});

async function seedDatabase() {
  try {
    // Clean up any historical fake seeded logs if they exist
    await AuditLog.deleteMany({ id: { $in: ['LOG-1001', 'LOG-1002', 'LOG-1003', 'LOG-1004', 'LOG-1005'] } });

    const projectCount = await Project.countDocuments();
    if (projectCount === 0) {
      console.log('[Database Seed] Seeding initial projects into MongoDB...');
      await Project.insertMany(initialSites);

      console.log('[Database Seed] Seeding initial checklist items...');
      const itemsToInsert = [];
      for (const site of initialSites) {
        const targetChecked = Math.max(0, Math.min(8, Math.round((site.score / 100) * 8)));
        let checkedCount = 0;
        for (const cat of defaultChecklistTemplate) {
          for (const item of cat.items) {
            itemsToInsert.push({
              id: `${site.id}-${item.id}`,
              projectId: site.id,
              category: cat.category,
              questionText: item.text,
              weight: item.weight,
              isChecked: checkedCount < targetChecked,
              isCustom: false,
              createdBy: 'System'
            });
            checkedCount++;
          }
        }
      }
      await ChecklistItem.insertMany(itemsToInsert);

      console.log('[Database Seed] Seeding initial users...');
      await User.insertMany(initialUsers);

      console.log('[Database Seed] Seeding initial attendance records...');
      await AttendanceRecord.insertMany(initialAttendance);

      console.log('[Database Seed] Seed completed successfully.');
    }
  } catch (err) {
    console.error('[Database Seed] Error seeding database:', err.message);
  }
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    console.log('[Database] No MONGODB_URI specified in environment. Operating in memory-backed hybrid mode.');
    return false;
  }

  try {
    console.log('[Database] Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });
    isConnected = true;
    console.log('[Database] Connected to MongoDB Atlas successfully.');
    await seedDatabase();
    return true;
  } catch (err) {
    console.warn(`[Database] Could not connect to MongoDB Atlas (${err.message}).`);
    console.log('[Database] Falling back to in-memory store so the application runs seamlessly.');
    isConnected = false;
    return false;
  }
}

module.exports = {
  connectDB,
  isDBConnected: () => isConnected,
  initialSites,
  defaultChecklistTemplate,
  initialLogs,
  initialUsers,
  initialAttendance
};
