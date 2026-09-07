const mongoose = require('mongoose');
const Project = require('../models/Project');
const ChecklistItem = require('../models/ChecklistItem');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

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

const initialLogs = [
  {
    id: 'LOG-1005',
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
    projectId: 'P-2041',
    projectName: 'Udaan Skill Centre (sample)',
    state: 'Uttar Pradesh',
    actionType: 'checklist_toggle',
    actorId: 'GOV-2026-1001',
    actorName: 'Arjun Mehta (PMU Inspector)',
    field: 'Fire extinguishers & safety gear',
    oldValue: 'Unchecked',
    newValue: 'Checked',
    description: 'Updated Infrastructure checklist: Fire safety compliance confirmed on-site'
  },
  {
    id: 'LOG-1004',
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
    projectId: 'P-2041',
    projectName: 'Udaan Skill Centre (sample)',
    state: 'Uttar Pradesh',
    actionType: 'score_changed',
    actorId: 'GOV-2026-1001',
    actorName: 'Arjun Mehta (PMU Inspector)',
    field: 'Compliance Score',
    oldValue: '50%',
    newValue: '58%',
    delta: '+8%',
    description: 'Compliance score recalculated from 50% to 58% (+8%)'
  },
  {
    id: 'LOG-1003',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    projectId: 'P-1872',
    projectName: 'Saksham Residential Institute',
    state: 'Rajasthan',
    actionType: 'status_changed',
    actorId: 'SYSTEM',
    actorName: 'System / CCTV Daemon',
    field: 'Status',
    oldValue: 'Closed',
    newValue: 'Live',
    description: 'Project verified online; status updated to Live'
  },
  {
    id: 'LOG-1002',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000),
    projectId: 'P-4011',
    projectName: 'Bengaluru Skill Academy',
    state: 'Karnataka',
    actionType: 'comment',
    actorId: 'GOV-2026-1001',
    actorName: 'Arjun Mehta (PMU Inspector)',
    field: 'Inspector Observation',
    oldValue: '',
    newValue: 'Biometric fingerprint scanner synced with NIC attendance gateway.',
    description: 'Inspector added observation note: Biometric gateway verified'
  },
  {
    id: 'LOG-1001',
    timestamp: new Date(Date.now() - 5 * 3600 * 1000),
    projectId: 'P-2234',
    projectName: 'Aasha Rehabilitation Centre',
    state: 'Bihar',
    actionType: 'inspection',
    actorId: 'GOV-2026-1002',
    actorName: 'Nisha Kapoor (PMU Inspector)',
    field: 'Inspection Assignment',
    oldValue: 'Unassigned',
    newValue: 'Assigned',
    description: 'Surprise on-ground inspection scheduled for compliance verification'
  }
];

const initialUsers = [
  { id: 'GOV-2026-1001', employeeId: 'GOV-2026-1001', name: 'Arjun Mehta', email: 'arjun.mehta@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-2041', 'P-2234'] },
  { id: 'GOV-2026-1002', employeeId: 'GOV-2026-1002', name: 'Nisha Kapoor', email: 'nisha.kapoor@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-3108'] },
  { id: 'GOV-2026-1003', employeeId: 'GOV-2026-1003', name: 'Vikram Singh', email: 'vikram.singh@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-1872', 'P-1146'] },
  { id: 'GOV-2026-1004', employeeId: 'GOV-2026-1004', name: 'Meera Iyer', email: 'meera.iyer@dosje.gov.in', password: 'Saarthi@2026', role: 'PMU Inspector', assignedProjectIds: ['P-4011'] },
  { id: 'GOV-2026-9001', employeeId: 'GOV-2026-9001', name: 'Dr. Rajesh Sharma', email: 'rajesh.sharma@dosje.gov.in', password: 'Saarthi@2026', role: 'Department Official', assignedProjectIds: [] },
  { id: 'NGO/2026/1001', employeeId: 'NGO-2026-1001', name: 'Udaan Skill Centre', email: 'udan@dosje-demo.org', password: 'Saarthi@2026', role: 'Project / NGO Administrator', assignedProjectIds: ['P-2041'] }
];

let isConnected = false;

async function seedDatabase() {
  try {
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

      console.log('[Database Seed] Seeding initial audit logs...');
      await AuditLog.insertMany(initialLogs);

      console.log('[Database Seed] Seeding initial users...');
      await User.insertMany(initialUsers);

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
      serverSelectionTimeoutMS: 5000
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
  initialUsers
};
