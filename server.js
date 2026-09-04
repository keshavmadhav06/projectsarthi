const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const defaultChecklistTemplate = [
  {
    category: 'Infrastructure',
    weight: 25,
    items: [
      { id: 'inf-1', text: 'Is the facility physically accessible (ramps, barrier-free corridors, accessible toilets)?', weight: 12.5, checked: true },
      { id: 'inf-2', text: 'Are safety equipment, fire extinguishers, and emergency evacuation exits functional and inspected?', weight: 12.5, checked: true }
    ]
  },
  {
    category: 'Staffing & Attendance',
    weight: 25,
    items: [
      { id: 'stf-1', text: 'Is the daily staff attendance register up to date and corroborated with biometric logs?', weight: 12.5, checked: true },
      { id: 'stf-2', text: 'Is the designated project in-charge physically present on-site during operational hours?', weight: 12.5, checked: false }
    ]
  },
  {
    category: 'Documentation',
    weight: 25,
    items: [
      { id: 'doc-1', text: 'Are financial accounts, grant utilization certificates, and beneficiary registers updated?', weight: 12.5, checked: false },
      { id: 'doc-2', text: 'Is DPDP-compliant data handling, beneficiary confidentiality, and written consent followed?', weight: 12.5, checked: true }
    ]
  },
  {
    category: 'Service Delivery',
    weight: 25,
    items: [
      { id: 'srv-1', text: 'Is the approved DoSJE training syllabus, daily curriculum, and practical module followed?', weight: 12.5, checked: true },
      { id: 'srv-2', text: 'Are course training kits, uniforms/materials, and stipulated beneficiary stipends distributed?', weight: 12.5, checked: false }
    ]
  }
];

function initProjectChecklist(score = 60) {
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

let sites = [
  { id:'P-2041', name:'Udaan Skill Centre (sample)', district:'Lucknow', state:'Uttar Pradesh', scheme:'SMILE', risk:'High', score:58, camera:'Live', status:'Live', attendance:62, lastInspection:'14 Aug 2026', lat:26.8467, lng:80.9462, inspectionAssigned:false, owner:'NGO/2026/1001', lastUpdated: new Date(Date.now() - 12 * 60 * 1000).toISOString() },
  { id:'P-1872', name:'Saksham Residential Institute', district:'Jaipur', state:'Rajasthan', scheme:'PM-DAKSH', risk:'Medium', score:75, camera:'Live', status:'Live', attendance:84, lastInspection:'09 Aug 2026', lat:26.9124, lng:75.7873, inspectionAssigned:false, owner:'NGO/2026/1002', lastUpdated: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
  { id:'P-3108', name:'Nayi Disha Foundation', district:'Bhopal', state:'Madhya Pradesh', scheme:'NAMASTE', risk:'Low', score:88, camera:'Offline', status:'Closed', attendance:89, lastInspection:'18 Aug 2026', lat:23.2599, lng:77.4126, inspectionAssigned:false, owner:'NGO/2026/1003', lastUpdated: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
  { id:'P-2234', name:'Aasha Rehabilitation Centre', district:'Patna', state:'Bihar', scheme:'SMILE', risk:'High', score:50, camera:'Live', status:'Live', attendance:57, lastInspection:'02 Aug 2026', lat:25.5941, lng:85.1376, inspectionAssigned:false, owner:'NGO/2026/1004', lastUpdated: new Date(Date.now() - 5 * 3600 * 1000).toISOString() },
  { id:'P-1146', name:'Prerna Education Trust', district:'Kolkata', state:'West Bengal', scheme:'PM-DAKSH', risk:'Low', score:100, camera:'Live', status:'Live', attendance:93, lastInspection:'12 Aug 2026', lat:22.5726, lng:88.3639, inspectionAssigned:false, owner:'NGO/2026/1005', lastUpdated: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
  { id:'P-4011', name:'Bengaluru Skill Academy', district:'Bengaluru', state:'Karnataka', scheme:'PM-DAKSH', risk:'Medium', score:63, camera:'Live', status:'Live', attendance:78, lastInspection:'10 Aug 2026', lat:12.9716, lng:77.5946, inspectionAssigned:false, owner:'NGO/2026/1006', lastUpdated: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }
];
sites.forEach(s => { s.checklist = initProjectChecklist(s.score); });

let auditLogs = [
  {
    id: 'LOG-1005',
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    projectId: 'P-2041',
    projectName: 'Udaan Skill Centre (sample)',
    state: 'Uttar Pradesh',
    actionType: 'checklist',
    actor: 'Arjun Mehta (PMU Inspector)',
    field: 'Fire extinguishers & safety gear',
    oldValue: 'Unchecked',
    newValue: 'Checked',
    description: 'Updated Infrastructure checklist: Fire safety compliance confirmed on-site'
  },
  {
    id: 'LOG-1004',
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    projectId: 'P-2041',
    projectName: 'Udaan Skill Centre (sample)',
    state: 'Uttar Pradesh',
    actionType: 'score',
    actor: 'Arjun Mehta (PMU Inspector)',
    field: 'Compliance Score',
    oldValue: '50%',
    newValue: '58%',
    delta: '+8%',
    description: 'Compliance score recalculated from 50% to 58% (+8%)'
  },
  {
    id: 'LOG-1003',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    projectId: 'P-1872',
    projectName: 'Saksham Residential Institute',
    state: 'Rajasthan',
    actionType: 'status',
    actor: 'System / CCTV Daemon',
    field: 'Status',
    oldValue: 'Closed',
    newValue: 'Live',
    description: 'Project verified online; status updated to Live'
  },
  {
    id: 'LOG-1002',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    projectId: 'P-4011',
    projectName: 'Bengaluru Skill Academy',
    state: 'Karnataka',
    actionType: 'comment',
    actor: 'Arjun Mehta (PMU Inspector)',
    field: 'Inspector Observation',
    oldValue: '',
    newValue: 'Biometric fingerprint scanner synced with NIC attendance gateway.',
    description: 'Inspector added observation note: Biometric gateway verified'
  },
  {
    id: 'LOG-1001',
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    projectId: 'P-2234',
    projectName: 'Aasha Rehabilitation Centre',
    state: 'Bihar',
    actionType: 'inspection',
    actor: 'Nisha Kapoor (PMU Inspector)',
    field: 'Inspection Assignment',
    oldValue: 'Unassigned',
    newValue: 'Assigned',
    description: 'Surprise on-ground inspection scheduled for compliance verification'
  }
];

let inspections = [];
let alerts = [
  { id:'AL-102', type:'Attendance anomaly', site:'Udaan Skill Centre (sample)', text:'Sample alert: attendance needs human review.', severity:'warning', time:'Demo' }
];
let reports = [];
let feedback = [];
const cameraRooms = new Map();
const mobileCctvRooms = new Map();
const mobileCctvFrames = new Map();
const inspectorRoster = [
  {name:'Arjun Mehta',states:['Uttar Pradesh','Uttarakhand','Delhi','Haryana'],workload:2,conflicts:[]},
  {name:'Nisha Kapoor',states:['Rajasthan','Gujarat','Madhya Pradesh','Maharashtra','Goa'],workload:1,conflicts:[]},
  {name:'Vikram Singh',states:['Bihar','Jharkhand','West Bengal','Odisha','Assam','Sikkim'],workload:2,conflicts:[]},
  {name:'Meera Iyer',states:['Tamil Nadu','Kerala','Karnataka','Telangana','Andhra Pradesh','Puducherry'],workload:1,conflicts:[]}
];
const employees = [{id:'GOV-2026-1001',name:'Arjun Mehta',email:'arjun.mehta@dosje.gov.in',password:'Saarthi@2026',role:'PMU Inspector',verified:true}];
const pendingVerifications = new Map();
const partnerAccounts = [{organisation:'Udaan Skill Centre',registrationId:'NGO/2026/1001',email:'udan@dosje-demo.org',password:'Saarthi@2026',role:'Project / NGO Administrator'}];
const pendingPartnerVerifications = new Map();
const sessions = new Map();
const json = (res, data, status=200) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
const body = req => new Promise(resolve => { let raw='',size=0; req.on('data', c => {size+=c.length;if(size<=5_500_000)raw+=c}); req.on('end', () => { if(size>5_500_000)return resolve({__tooLarge:true});try { resolve(JSON.parse(raw||'{}')); } catch { resolve({}); } }); });
const sessionUser = req => { const token=(req.headers.authorization||'').replace('Bearer ',''); return sessions.get(token); };
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const parseCoordinates = value => {const match=String(value||'').match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);return match?[Number(match[1]),Number(match[2])]:null};
const metersBetween = (a,b) => {const r=6371000,toRad=x=>x*Math.PI/180,dLat=toRad(b[0]-a[0]),dLng=toRad(b[1]-a[1]);const q=Math.sin(dLat/2)**2+Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLng/2)**2;return 2*r*Math.asin(Math.sqrt(q))};
const storedEvidence = evidence => {if(!evidence)return null;const type=String(evidence.type||'');const data=String(evidence.data||'');if(!/^((image|audio|video)\/[\w.+-]+)$/.test(type)||!data.startsWith(`data:${type};base64,`)||data.length>4_000_000)return {error:'Attach one image, video, or audio file up to 3 MB.'};const payload=data.split(',')[1]||'',serverHash=sha256(Buffer.from(payload,'base64'));if(evidence.clientHash&&evidence.clientHash!==serverHash)return {error:'Evidence integrity check failed. Please capture the file again.'};return {id:'EVD-'+crypto.randomUUID().slice(0,8).toUpperCase(),name:String(evidence.name||'Evidence').slice(0,120),type,data,clientHash:evidence.clientHash||null,serverHash,integrity:'SHA-256 verified on server upload',deviceCapturedAt:String(evidence.capturedAt||''),serverReceivedAt:new Date().toISOString()};};
const evidenceRules = (data,site,inspector,now) => {const flags=[],coords=parseCoordinates(data.location),registered=[site.lat,site.lng];if(coords&&Number.isFinite(site.lat)&&metersBetween(coords,registered)>100)flags.push('Geo-fence mismatch: evidence is more than 100 m from the registered project location.');const minutes=now.getUTCHours()*60+now.getUTCMinutes()+330;if(minutes<8*60||minutes>20*60)flags.push('Working-hours inconsistency: evidence was uploaded outside the 08:00–20:00 IST inspection window.');const prior=reports.find(report=>report.inspector===inspector&&parseCoordinates(report.location)&&Math.abs(now-new Date(report.submittedAt))<10*60*1000);if(prior&&coords&&metersBetween(coords,parseCoordinates(prior.location))>=15000)flags.push('Inspection time vs. distance: two inspections are at least 15 km apart within 10 minutes.');return flags;};
const dashboardStats = () => {
  const monitored=sites.length, live=sites.filter(site=>site.camera==='Live').length;
  const compliance=monitored?Math.round(sites.reduce((sum,site)=>sum+Number(site.score||0),0)/monitored):0;
  return {monitored,live,inspections:inspections.filter(item=>item.status!=='Completed').length,compliance};
};

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const origin=req.headers.origin||'';
  if(['https://saarthi-monitoring.onrender.com','capacitor://localhost','http://localhost'].includes(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
    const data=await body(req); const email=String(data.email||'').toLowerCase(); const employeeId=String(data.employeeId||'').toUpperCase();
    if(!/^GOV-\d{4}-\d{4,}$/.test(employeeId)) return json(res,{error:'Use a valid Government Employee ID (for example GOV-2026-1001).'},400);
    if(!/^[^@]+@(gov\.in|nic\.in|dosje\.gov\.in)$/.test(email)) return json(res,{error:'Use your authorized government email address.'},400);
    if(String(data.password||'').length<8) return json(res,{error:'Password must contain at least 8 characters.'},400);
    if(employees.some(e=>e.id===employeeId||e.email===email)) return json(res,{error:'This employee account already exists. Please sign in.'},409);
    pendingVerifications.set(email,{id:employeeId,name:String(data.name||'Government Employee'),email,password:data.password,role:'Department Official'});
    return json(res,{verificationRequired:true,message:'Verification code sent to your registered government email.',demoCode:'123456'});
  }
  if (url.pathname === '/api/auth/verify' && req.method === 'POST') {
    const data=await body(req); const pending=pendingVerifications.get(String(data.email||'').toLowerCase());
    if(!pending || data.code!=='123456') return json(res,{error:'Invalid or expired verification code.'},400);
    const employee={...pending,verified:true}; employees.push(employee); pendingVerifications.delete(employee.email);
    const token=crypto.randomUUID(); sessions.set(token,employee); return json(res,{token,user:{name:employee.name,employeeId:employee.id,role:employee.role}});
  }
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const data=await body(req); const user=employees.find(e=>(e.email===String(data.identifier||'').toLowerCase()||e.id===String(data.identifier||'').toUpperCase())&&e.password===data.password);
    if(!user) return json(res,{error:'Employee ID/email or password is incorrect.'},401);
    const token=crypto.randomUUID(); sessions.set(token,user); return json(res,{token,user:{name:user.name,employeeId:user.id,role:user.role}});
  }
  if (url.pathname === '/api/partner/signup' && req.method === 'POST') {
    const data=await body(req); const email=String(data.email||'').trim().toLowerCase(); const registrationId=String(data.registrationId||'').trim().toUpperCase();
    if(!String(data.organisation||'').trim()) return json(res,{error:'Enter the registered NGO, institute or project name.'},400);
    if(!/^[A-Z0-9][A-Z0-9/-]{4,}$/.test(registrationId)) return json(res,{error:'Enter a valid DoSJE registration ID.'},400);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res,{error:'Enter a valid organisation email address.'},400);
    if(String(data.password||'').length<8) return json(res,{error:'Password must contain at least 8 characters.'},400);
    if(partnerAccounts.some(account=>account.email===email||account.registrationId===registrationId)) return json(res,{error:'This organisation already has an account. Please sign in.'},409);
    pendingPartnerVerifications.set(email,{organisation:String(data.organisation).trim(),registrationId,email,password:data.password,role:'Project / NGO Administrator'});
    return json(res,{verificationRequired:true,demoCode:'123456',message:'Verification code sent to your registered organisation email.'});
  }
  if (url.pathname === '/api/partner/verify' && req.method === 'POST') {
    const data=await body(req); const account=pendingPartnerVerifications.get(String(data.email||'').toLowerCase());
    if(!account||data.code!=='123456') return json(res,{error:'Invalid or expired verification code.'},400);
    partnerAccounts.push(account); pendingPartnerVerifications.delete(account.email);
    const token=crypto.randomUUID(); sessions.set(token,account); return json(res,{token,user:{name:account.organisation,registrationId:account.registrationId,role:account.role}});
  }
  if (url.pathname === '/api/partner/login' && req.method === 'POST') {
    const data=await body(req); const identifier=String(data.identifier||'').trim().toLowerCase();
    const account=partnerAccounts.find(item=>(item.email===identifier||item.registrationId.toLowerCase()===identifier)&&item.password===data.password);
    if(!account) return json(res,{error:'Organisation ID/email or password is incorrect.'},401);
    const token=crypto.randomUUID(); sessions.set(token,account); return json(res,{token,user:{name:account.organisation,registrationId:account.registrationId,role:account.role}});
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { sessions.delete((req.headers.authorization||'').replace('Bearer ','')); return json(res,{ok:true}); }
  if (url.pathname === '/api/feedback' && req.method === 'POST') {
    const data=await body(req); if(data.__tooLarge)return json(res,{error:'Evidence is too large. Attach one image, video, or audio file up to 3 MB.'},413); if(!data.category||!data.message) return json(res,{error:'Please select a grievance category and describe the issue.'},400);
    if(!/^\d{10}$/.test(String(data.phone||'').replace(/\D/g,''))) return json(res,{error:'Enter a valid 10-digit beneficiary mobile number for verification.'},400);
    const evidence=storedEvidence(data.evidence);if(evidence?.error)return json(res,{error:evidence.error},400);
    const item={id:'GRV-'+Math.floor(100000+Math.random()*899999),category:data.category,ngo:data.ngo||'Not specified',message:data.message,phone:String(data.phone).replace(/\D/g,''),anonymous:Boolean(data.anonymous),evidence,submittedAt:new Date().toISOString(),status:'Received'};
    feedback.unshift(item); alerts.unshift({id:'AL-'+Math.floor(500+Math.random()*99),type:'Beneficiary grievance',site:item.ngo,text:`New ${item.category.toLowerCase()} grievance received.`,severity:'warning',time:'Just now'}); return json(res,{reference:item.id,status:item.status},201);
  }
  const publicCameraEndpoint=['/api/mobile-cctv/room','/api/mobile-cctv/signal','/api/mobile-cctv/signals','/api/mobile-cctv/frame'].includes(url.pathname);
  if (url.pathname.startsWith('/api/') && !publicCameraEndpoint && !sessionUser(req)) return json(res,{error:'Authentication required.'},401);
  if (url.pathname === '/api/dashboard') return json(res, { sites, inspections, alerts, reports, feedback, logs: auditLogs, inspectors:inspectorRoster.map(({name,workload})=>({name,workload,role:'PMU Inspector'})), stats:dashboardStats() });
  if (url.pathname === '/api/logs' && req.method === 'GET') {
    let filtered = [...auditLogs];
    const qProject = url.searchParams.get('project');
    const qAction = url.searchParams.get('action');
    const qState = url.searchParams.get('state');
    const qDays = parseInt(url.searchParams.get('days') || '0', 10);
    if (qProject) filtered = filtered.filter(l => l.projectId === qProject || (l.projectName||'').toLowerCase().includes(qProject.toLowerCase()));
    if (qAction && qAction !== 'all') filtered = filtered.filter(l => l.actionType === qAction);
    if (qState && qState !== 'all') filtered = filtered.filter(l => l.state === qState);
    if (qDays > 0) {
      const cutoff = Date.now() - qDays * 86400000;
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= cutoff);
    }
    return json(res, { logs: filtered });
  }
  if (url.pathname === '/api/logs' && req.method === 'POST') {
    const data = await body(req);
    const entry = {
      id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
      timestamp: new Date().toISOString(),
      projectId: data.projectId || 'P-General',
      projectName: data.projectName || 'General Project',
      state: data.state || '',
      actionType: data.actionType || 'checklist',
      actor: data.actor || sessionUser(req)?.name || 'Arjun Mehta (PMU Inspector)',
      oldValue: data.oldValue || '',
      newValue: data.newValue || '',
      delta: data.delta || '',
      description: data.description || '',
      field: data.field || ''
    };
    auditLogs.unshift(entry);
    return json(res, { ok: true, log: entry }, 201);
  }
  if (url.pathname.startsWith('/api/projects/') && url.pathname.endsWith('/checklist')) {
    const parts = url.pathname.split('/');
    const projectId = parts[3];
    const project = sites.find(s => s.id === projectId);
    if (!project) return json(res, { error: 'Project not found' }, 404);
    if (req.method === 'GET') {
      if (!project.checklist) project.checklist = initProjectChecklist(project.score || 60);
      return json(res, {
        id: project.id,
        name: project.name,
        scheme: project.scheme,
        district: project.district,
        state: project.state,
        risk: project.risk,
        status: project.status || (project.camera === 'Offline' ? 'Closed' : 'Live'),
        score: project.score,
        lastUpdated: project.lastUpdated || new Date().toISOString(),
        checklist: project.checklist
      });
    }
    if (req.method === 'PUT') {
      const data = await body(req);
      if (data.checklist) project.checklist = data.checklist;
      if (typeof data.score === 'number') project.score = data.score;
      if (data.status) {
        project.status = data.status;
        project.camera = data.status === 'Closed' ? 'Offline' : 'Live';
      }
      project.lastUpdated = new Date().toISOString();
      if (data.logEntry) {
        auditLogs.unshift({
          id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
          timestamp: project.lastUpdated,
          projectId: project.id,
          projectName: project.name,
          state: project.state,
          actor: data.actor || sessionUser(req)?.name || 'Arjun Mehta (PMU Inspector)',
          ...data.logEntry
        });
      }
      return json(res, {
        ok: true,
        score: project.score,
        status: project.status,
        lastUpdated: project.lastUpdated,
        checklist: project.checklist
      });
    }
  }
  if (url.pathname === '/api/partner/projects' && req.method === 'GET') {
    const user=sessionUser(req); if(user?.role!=='Project / NGO Administrator') return json(res,{error:'Organisation access required.'},403);
    return json(res,{projects:sites.filter(site=>site.owner===user.registrationId)});
  }
  if (url.pathname === '/api/partner/dashboard' && req.method === 'GET') {
    const user=sessionUser(req); if(user?.role!=='Project / NGO Administrator') return json(res,{error:'Organisation access required.'},403);
    const projects=sites.filter(site=>site.owner===user.registrationId), projectNames=new Set(projects.map(site=>site.name));
    const projectInspections=inspections.filter(item=>projectNames.has(item.site));
    const projectReports=reports.filter(item=>projectNames.has(item.site));
    const projectAlerts=alerts.filter(item=>projectNames.has(item.site));
    const projectFeedback=feedback.filter(item=>[...projectNames].some(name=>name===item.ngo||name.replace(' (sample)','')===item.ngo));
    return json(res,{projects,inspections:projectInspections,reports:projectReports,alerts:projectAlerts,feedback:projectFeedback,stats:{projects:projects.length,activeInspections:projectInspections.filter(item=>item.status!=='Completed').length,reports:projectReports.length,grievances:projectFeedback.length}});
  }
  if (url.pathname === '/api/partner/projects' && req.method === 'POST') {
    const user=sessionUser(req); if(user?.role!=='Project / NGO Administrator') return json(res,{error:'Organisation access required.'},403);
    const data=await body(req); const name=String(data.name||'').trim(), state=String(data.state||'').trim(), district=String(data.district||'').trim();
    if(!name||!state||!district||!String(data.scheme||'').trim()) return json(res,{error:'Project name, scheme, State/UT and district are required.'},400);
    const lat=Number(data.lat),lng=Number(data.lng); const hasCoordinates=Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
    const project={id:'P-'+Math.floor(100000+Math.random()*899999),name,district,state,scheme:String(data.scheme).trim(),risk:'Pending review',score:0,camera:'Not connected',attendance:0,lastInspection:'Not yet inspected',lat:hasCoordinates?lat:20.5937,lng:hasCoordinates?lng:78.9629,inspectionAssigned:false,owner:user.registrationId,createdAt:new Date().toISOString()};
    sites.unshift(project); alerts.unshift({id:'AL-'+Math.floor(500+Math.random()*499),type:'Project registered',site:project.name,text:`Added by ${user.organisation}; awaiting DoSJE review.`,severity:'info',time:'Just now'});
    return json(res,{project},201);
  }
  if (url.pathname === '/api/assign' && req.method === 'POST') {
    const data = await body(req);
    const riskOrder={High:0,Medium:1,Low:2}; const availableSites=sites.filter(s=>!s.inspectionAssigned);
    const target = data.siteId ? sites.find(s=>s.id===data.siteId) : availableSites.sort((a,b)=>riskOrder[a.risk]-riskOrder[b.risk])[0];
    if(!target) return json(res,{error:'No unassigned projects are currently available for inspection.'},409);
    if(target.inspectionAssigned) return json(res,{error:'This project has already been assigned for inspection.'},409);
    const conflictFree=inspectorRoster.filter(inspector=>!inspector.conflicts.includes(target.id));
    let inspector,assignmentBasis;
    if(data.inspectorName){
      inspector=conflictFree.find(person=>person.name===data.inspectorName);
      if(!inspector)return json(res,{error:'Selected inspector is unavailable or has a conflict for this project.'},400);
      assignmentBasis='Specific inspector selected by authorised official';
    }else{
      const stateEligible=conflictFree.filter(person=>person.states.includes(target.state));
      const candidatePool=stateEligible.length?stateEligible:conflictFree;
      const lowestWorkload=Math.min(...candidatePool.map(person=>person.workload));
      const balancedCandidates=candidatePool.filter(person=>person.workload===lowestWorkload);
      inspector=balancedCandidates[Math.floor(Math.random()*balancedCandidates.length)];
      assignmentBasis=stateEligible.length?'State coverage + lowest workload + randomized tie-break':'Lowest workload + randomized tie-break';
    }
    inspector.workload+=1;
    target.inspectionAssigned=true;
    const job = {id:'INSP-'+Math.floor(9000+Math.random()*999), site:target.name, inspector:inspector.name, due:data.due||'Within 24 hours', status:'Assigned', priority:data.priority||target.risk, notes:data.notes||'', finding:data.finding||'', evidence:data.evidence||'', location:data.location||'', assignmentBasis};
    inspections.unshift(job); alerts.unshift({id:'AL-'+Math.floor(200+Math.random()*99),type:'Inspection assigned',site:target.name,text:`Assigned to ${inspector.name}: ${assignmentBasis}.`,severity:'info',time:'Just now'});
    return json(res, job, 201);
  }
  if (url.pathname === '/api/inspections/start' && req.method === 'POST') {
    const user=sessionUser(req); if(user?.role==='Project / NGO Administrator') return json(res,{error:'Only authorised officials can start an inspection.'},403);
    const data=await body(req), job=inspections.find(item=>item.id===data.inspectionId);
    if(!job) return json(res,{error:'Inspection not found.'},404);
    if(job.status==='Completed') return json(res,{error:'This inspection is already completed.'},409);
    job.status='In progress'; job.startedAt=new Date().toISOString();
    alerts.unshift({id:'AL-'+Math.floor(700+Math.random()*299),type:'On-ground inspection started',site:job.site,text:`${job.inspector} has started the on-ground inspection.`,severity:'info',time:'Just now'});
    return json(res,{inspection:job});
  }
  if (url.pathname === '/api/reports' && req.method === 'POST') {
    const data = await body(req); const site=sites.find(item=>item.name===data.site); if(!site)return json(res,{error:'Select a registered project.'},400); const job=inspections.find(item=>item.site===data.site&&item.status!=='Completed'); const submittedAt=new Date();const anomalies=evidenceRules(data,site,job?.inspector||'Unassigned',submittedAt);const report = {id:'RPT-'+crypto.randomUUID().slice(0,6).toUpperCase(), ...data, inspector:job?.inspector||'Unassigned',submittedAt:submittedAt.toISOString(),status:'Submitted for review',anomalies};
    if(job){job.status='Completed';job.completedAt=report.submittedAt;job.reportId=report.id;}
    reports.unshift(report); alerts.unshift({id:'AL-'+Math.floor(300+Math.random()*99),type:anomalies.length?'Evidence integrity review required':'Inspection report submitted',site:data.site,text:anomalies.length?anomalies[0]:'The on-ground inspection report is ready for organisation review.',severity:anomalies.length?'warning':'info',time:'Just now'});
    return json(res, report, 201);
  }
  if (url.pathname === '/api/vc' && req.method === 'POST') {
    const data = await body(req); const alert={id:'AL-'+Math.floor(400+Math.random()*99),type:'VC verification initiated',site:data.site,text:`Secure surprise VC request sent to ${data.contact||'project staff'}.`,severity:'info',time:'Just now'}; alerts.unshift(alert); return json(res, alert, 201);
  }
  if (url.pathname === '/api/camera/room' && req.method === 'POST') {
    const data=await body(req); const roomId=data.roomId || crypto.randomUUID().slice(0,8); if(!cameraRooms.has(roomId)) cameraRooms.set(roomId,[]); return json(res,{roomId});
  }
  if (url.pathname === '/api/camera/signal' && req.method === 'POST') {
    const data=await body(req); if(!data.roomId||!data.clientId||!data.signal) return json(res,{error:'Invalid camera signal.'},400); if(!cameraRooms.has(data.roomId)) cameraRooms.set(data.roomId,[]); cameraRooms.get(data.roomId).push({from:data.clientId,signal:data.signal}); return json(res,{ok:true});
  }
  if (url.pathname === '/api/camera/signals' && req.method === 'GET') {
    const roomId=url.searchParams.get('roomId'), clientId=url.searchParams.get('clientId'); const signals=(cameraRooms.get(roomId)||[]); const received=signals.filter(x=>x.from!==clientId); cameraRooms.set(roomId,signals.filter(x=>x.from===clientId)); return json(res,{signals:received});
  }
  if (url.pathname === '/api/mobile-cctv/room' && req.method === 'POST') {
    const data=await body(req); const roomId=data.roomId || crypto.randomUUID().slice(0,10); if(!mobileCctvRooms.has(roomId)) mobileCctvRooms.set(roomId,[]); return json(res,{roomId});
  }
  if (url.pathname === '/api/mobile-cctv/signal' && req.method === 'POST') {
    const data=await body(req); if(!data.roomId||!data.clientId||!data.signal) return json(res,{error:'Invalid mobile CCTV signal.'},400);
    if(!mobileCctvRooms.has(data.roomId)) mobileCctvRooms.set(data.roomId,[]);
    mobileCctvRooms.get(data.roomId).push({id:crypto.randomUUID(),from:data.clientId,target:data.target||null,signal:data.signal,createdAt:Date.now()}); return json(res,{ok:true});
  }
  if (url.pathname === '/api/mobile-cctv/signals' && req.method === 'GET') {
    const roomId=url.searchParams.get('roomId'), clientId=url.searchParams.get('clientId'), queued=mobileCctvRooms.get(roomId)||[];
    const received=queued.filter(item=>item.from!==clientId&&(!item.target||item.target===clientId)); const receivedIds=new Set(received.map(item=>item.id));
    mobileCctvRooms.set(roomId,queued.filter(item=>!receivedIds.has(item.id)&&Date.now()-item.createdAt<600000)); return json(res,{signals:received});
  }
  if (url.pathname === '/api/mobile-cctv/frame' && req.method === 'POST') {
    const data=await body(req);
    if(!data.roomId||typeof data.image!=='string'||!data.image.startsWith('data:image/')||data.image.length>700000) return json(res,{error:'Invalid camera frame.'},400);
    mobileCctvFrames.set(data.roomId,{image:data.image,updatedAt:Date.now()});
    return json(res,{ok:true});
  }
  if (url.pathname === '/api/mobile-cctv/frame' && req.method === 'GET') {
    const frame=mobileCctvFrames.get(url.searchParams.get('roomId'));
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
    return json(res,frame||{image:null,updatedAt:null});
  }
  let file = url.pathname === '/' ? 'public/index.html' : `public${decodeURIComponent(url.pathname)}`;
  file = path.resolve(file); const root = path.resolve('public');
  if (!file.startsWith(root)) return json(res,{error:'Forbidden'},403);
  fs.readFile(file, (err, content) => { if (err) return json(res,{error:'Not found'},404); const ext=path.extname(file); const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'}); res.end(content); });
});
server.listen(PORT, () => console.log(`Saarthi is running at http://localhost:${PORT}`));
