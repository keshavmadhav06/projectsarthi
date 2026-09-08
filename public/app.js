const themeLink=document.createElement('link');themeLink.rel='stylesheet';themeLink.href='/gov-theme.css';document.head.appendChild(themeLink);const landingLink=document.createElement('link');landingLink.rel='stylesheet';landingLink.href='/landing.css';document.head.appendChild(landingLink);const interactionLink=document.createElement('link');interactionLink.rel='stylesheet';interactionLink.href='/interactions.css';document.head.appendChild(interactionLink);const cameraLink=document.createElement('link');cameraLink.rel='stylesheet';cameraLink.href='/camera.css';document.head.appendChild(cameraLink);const cameraFeedLink=document.createElement('link');cameraFeedLink.rel='stylesheet';cameraFeedLink.href='/camera-feed.css';document.head.appendChild(cameraFeedLink);const mobileCctvLink=document.createElement('link');mobileCctvLink.rel='stylesheet';mobileCctvLink.href='/mobile-cctv.css';document.head.appendChild(mobileCctvLink);const mapsLink=document.createElement('link');mapsLink.rel='stylesheet';mapsLink.href='/maps.css';document.head.appendChild(mapsLink);const mapCss=document.createElement('link');mapCss.rel='stylesheet';mapCss.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';mapCss.integrity='sha256-p4NxAoJBhIINfQ4cWPcXLO8N8uVDC/k3KQ9mM7QdV2w=';mapCss.crossOrigin='';document.head.appendChild(mapCss);
const isNativeApp=Boolean(window.Capacitor?.isNativePlatform?.());
const hostedOrigin='https://saarthi-monitoring.onrender.com';
const apiOrigin=isNativeApp?hostedOrigin:'';
const appPublicOrigin=isNativeApp?hostedOrigin:location.origin;
const state={data:null,view:'overview'}; const $=s=>document.querySelector(s);
const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const badge=v=>`<span class="badge ${String(v).toLowerCase().replace(' ','-')}">${esc(v)}</span>`;
const evidencePreview=evidence=>{if(!evidence?.data)return '<span class="evidence-none">No media attached</span>';const source=esc(evidence.data),name=esc(evidence.name);if(evidence.type.startsWith('image/'))return `<img class="evidence-media image" src="${source}" alt="${name}">`;if(evidence.type.startsWith('audio/'))return `<audio class="evidence-media" controls src="${source}"></audio>`;if(evidence.type.startsWith('video/'))return `<video class="evidence-media video" controls src="${source}"></video>`;return '<span class="evidence-none">Unsupported evidence type</span>'};
const showToast=m=>{const el=$('#toast');el.textContent=m;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3500)};
const api=(url,options={})=>fetch(`${apiOrigin}${url}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{}),...(sessionStorage.saarthiToken?{Authorization:`Bearer ${sessionStorage.saarthiToken}`}:{})}});
let dashboardFingerprint='';let dashboardSyncTimer=null;
let liveSocket = null;
try {
  if (typeof io !== 'undefined') {
    liveSocket = io();
    liveSocket.on('connect', () => {
      console.log('[Live Sync] Connected to Saarthi real-time gateway via WebSockets');
    });
    liveSocket.on('checklist:updated', (data) => {
      if (!state.data || !state.data.sites) return;
      const project = state.data.sites.find(s => s.id === data.projectId);
      if (project) {
        project.checklist = data.checklist;
        project.score = data.score;
        project.lastUpdated = data.lastUpdated;
        if (data.status) {
          project.status = data.status;
          project.camera = data.status === 'Closed' ? 'Offline' : 'Live';
        }
        const cardEl = document.querySelector(`.project-card[data-project-id="${project.id}"]`);
        if (cardEl) {
          const cardScore = cardEl.querySelector('.card-score');
          const cardProgress = cardEl.querySelector('.card-progress-bar');
          if (cardScore) cardScore.textContent = `${data.score}%`;
          if (cardProgress) cardProgress.style.width = `${data.score}%`;
        }
        const drawerWrap = $('#drawer-wrap');
        if (drawerWrap && !drawerWrap.classList.contains('hidden') && window._activeDrawerProjectId === project.id) {
          const scoreValEl = $('#drawer-score-val'), progressEl = $('#drawer-progress-bar'), updatedEl = $('#drawer-last-updated');
          if (scoreValEl) scoreValEl.textContent = `${data.score}%`;
          if (progressEl) progressEl.style.width = `${data.score}%`;
          if (updatedEl) updatedEl.textContent = `Last updated: ${formatRelativeOrDate(data.lastUpdated)}`;
        }
      }
    });
    liveSocket.on('audit:new_entry', (entry) => {
      if (!state.data) return;
      state.data.logs = state.data.logs || [];
      if (!state.data.logs.some(l => l.id === entry.id)) {
        state.data.logs.unshift(entry);
        if (state.view === 'logs' && typeof applyLogFilters === 'function') {
          applyLogFilters();
        }
      }
    });
  }
} catch (e) {
  console.warn('[Socket.io Notice]', e.message);
}

async function load(){
  if(!sessionStorage.saarthiUser){
    sessionStorage.saarthiUser=JSON.stringify({name:'Arjun Mehta',employeeId:'GOV-2026-1001',role:'PMU Inspector'});
  }
  const r=await api('/api/dashboard');
  if(r.status===401){
    delete sessionStorage.saarthiToken;
    delete sessionStorage.saarthiUser;
    showAuth();
    return;
  }
  state.data=await r.json();
  dashboardFingerprint=JSON.stringify({sites:state.data.sites,inspections:state.data.inspections,stats:state.data.stats,logs:state.data.logs});
  if(new URLSearchParams(location.search).get('cameraRoom'))state.view='cctv';
  render();
}

function startDashboardSync(){
  if(dashboardSyncTimer)return;
  dashboardSyncTimer=setInterval(async()=>{
    if(!sessionStorage.saarthiToken||state.view==='cctv')return;
    try{
      const r=await api('/api/dashboard',{cache:'no-store'});
      if(!r.ok)return;
      const next=await r.json(),fingerprint=JSON.stringify({sites:next.sites,inspections:next.inspections,stats:next.stats,logs:next.logs});
      if(fingerprint!==dashboardFingerprint){
        state.data=next;
        dashboardFingerprint=fingerprint;
        render();
        if(state.view!=='logs')showToast('Dashboard updated with the latest project information.');
      }
    }catch{}
  },5000);
}

function overview(){
  const d=state.data || {};
  const stats=d.stats || { monitored: 0, live: 0, inspections: 0, compliance: 0 };
  const alerts=d.alerts || [];
  const inspectionsList=d.inspections || [];
  return `<div class="stats"><div class="card"><div class="stat-label">Registered projects</div><div class="stat-value">${stats.monitored}</div><span class="trend">Live data from registered organisations</span></div><div class="card"><div class="stat-label">CCTV feeds live</div><div class="stat-value">${stats.live}<small style="font-size:13px;color:var(--muted)"> / ${stats.monitored}</small></div><span class="trend">Authorized field devices only</span></div><button class="card dashboard-link" data-view-go="inspections"><div class="stat-label">Open inspections</div><div class="stat-value">${stats.inspections}</div><span class="trend down">Open inspection workspace →</span></button><div class="card"><div class="stat-label">Average compliance</div><div class="stat-value">${stats.compliance}%</div><span class="trend">Calculated from registered projects</span></div></div><div class="grid"><div class="card"><div class="card-head"><h2>Project location map</h2><button class="text-btn" data-view-go="projects">View projects →</button></div><div id="india-project-map" class="real-map" aria-label="Map showing registered project locations"></div><div class="map-legend"><span class="map-high">●</span> High risk <span class="map-medium">●</span> Medium risk <span class="map-low">●</span> Low risk <span class="map-pending">●</span> Pending review</div></div><div class="card"><div class="card-head"><h2>Priority alerts</h2><button class="text-btn" data-view-go="reports">View all</button></div>${alerts.slice(0,3).map(a=>`<div class="alert"><span class="alert-icon ${a.severity}">!</span><div><strong>${esc(a.type)}</strong><p>${esc(a.site)} · ${esc(a.text)}</p></div><time>${a.time}</time></div>`).join('')||'<div class="empty">No active alerts.</div>'}</div></div><div class="card section"><div class="card-head"><h2>Inspection queue</h2><button class="text-btn" data-view-go="inspections">Manage inspections →</button></div>${inspectionsList.length?inspectionTable(inspectionsList.slice(0,3)):'<div class="empty">No inspections are assigned. Create one from the Inspections page.</div>'}</div>`;
}

function inspectionTable(items,showActions=false){
  return `<table class="table"><thead><tr><th>INSPECTION</th><th>ASSIGNED TO</th><th>WHEN</th><th>PRIORITY</th><th>STATUS</th>${showActions?'<th>ACTION</th>':''}</tr></thead><tbody>${(items||[]).map(i=>`<tr><td><strong>${esc(i.site)}</strong><br><small style="color:var(--muted)">${esc(i.id)}</small></td><td>${esc(i.inspector)}</td><td>${esc(i.due)}</td><td>${badge(i.priority)}</td><td>${badge(i.status)}</td>${showActions?`<td>${i.status==='Assigned'?`<button class="secondary start-ground" data-start-inspection="${esc(i.id)}">Start on ground</button>`:i.status==='In progress'?'<span class="ground-live">● On ground</span>':'<span class="report-ready">Report submitted</span>'}</td>`:''}</tr>`).join('')}</tbody></table>`;
}

function projects(){
  const d=state.data || {};
  const sitesList=d.sites || [];
  const states=[...new Set(sitesList.map(s=>s.state))].sort(),available=sitesList.filter(s=>!s.inspectionAssigned);
  return `<div class="project-toolbar"><div><span class="state-label">STATE / UT</span><select id="state-filter" class="state-filter"><option value="">All States & UTs</option>${states.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></div><div id="state-summary" class="state-summary">${available.length} projects available for inspection</div></div><input class="filter" id="search" placeholder="Search within selected state by project, district, or scheme…"><div class="project-grid" id="projects-grid">${projectCards(available)}</div>`;
}

function formatRelativeOrDate(ts){
  if (typeof window.formatRelativeIST === 'function') {
    return window.formatRelativeIST(ts);
  }
  if(!ts) return 'Just now';
  const d = new Date(ts);
  if(isNaN(d.getTime())) return 'Recently';
  const diffSec = Math.floor((Date.now() - d.getTime())/1000);
  if(diffSec < 60) return 'Just now';
  if(diffSec < 3600) return `${Math.floor(diffSec/60)} min ago`;
  if(diffSec < 86400) return `${Math.floor(diffSec/3600)} hr ago`;
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function projectCards(sites){
  return sites.map(s=>{
    const statusVal = s.status || (s.camera === 'Offline' ? 'Closed' : 'Live');
    return `<article class="card project-card" data-project-id="${esc(s.id)}" tabindex="0" role="button" aria-label="Open details for ${esc(s.name)}">
      <div class="card-head">
        <span>${badge(s.risk)}</span>
        <span class="badge ${statusVal.toLowerCase()}">${statusVal === 'Live' ? '● Live' : '○ Closed'}</span>
      </div>
      <h3>${esc(s.name)}</h3>
      <div class="meta">${esc(s.scheme)} · ${esc(s.district)}, ${esc(s.state)}</div>
      <div class="project-row">
        <span>Compliance score</span>
        <b class="card-score">${s.score}%</b>
      </div>
      <div class="progress" style="margin:8px 0 16px">
        <i class="card-progress-bar" style="width:${s.score}%"></i>
      </div>
      <div class="project-row">
        <small style="color:var(--muted)">Attendance: ${s.attendance}%</small>
        <span class="project-action-note">View Checklist & Details →</span>
      </div>
    </article>`;
  }).join('');
}

function bindProjectCards(){
  document.querySelectorAll('.project-card').forEach(card=>{
    card.onclick=()=>openProjectDrawer(card.dataset.projectId);
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProjectDrawer(card.dataset.projectId)}};
  });
}

function getCurrentUser(){
  try {
    if(sessionStorage.saarthiUser) return JSON.parse(sessionStorage.saarthiUser);
  } catch(e){}
  return { name: 'Arjun Mehta', role: 'PMU Inspector', employeeId: 'GOV-2026-1001' };
}

function isUserInspectorInCharge(project){
  const user = getCurrentUser();
  if(!user) return false;
  if(user.role === 'Department Official') return true;
  if(!project.assignedInspector) return true;
  return (user.name || '').toLowerCase().trim() === (project.assignedInspector || '').toLowerCase().trim();
}

function normalizeCategoryWeights(cat){
  if(!cat.items || cat.items.length === 0) return;
  const targetCategoryWeight = 25.0;
  const rawSum = cat.items.reduce((sum, it) => sum + (Number(it.weight) || 12.5), 0);
  if(rawSum <= 0){
    const equalWeight = Math.round((targetCategoryWeight / cat.items.length) * 10) / 10;
    cat.items.forEach(it => { it.weight = equalWeight; });
    return;
  }
  let assignedSum = 0;
  cat.items.forEach(it => {
    const raw = Number(it.weight) || 12.5;
    it.weight = Math.round((targetCategoryWeight * raw / rawSum) * 10) / 10;
    assignedSum += it.weight;
  });
  const diff = Math.round((targetCategoryWeight - assignedSum) * 10) / 10;
  if(diff !== 0 && cat.items.length > 0){
    cat.items[0].weight = Math.round((cat.items[0].weight + diff) * 10) / 10;
  }
}

function openProjectDrawer(projectId){
  window._activeDrawerProjectId = projectId;
  const project = state.data?.sites?.find(s=>s.id===projectId);
  if(!project) return showToast('Project details not found.');
  if(!project.assignedInspector) project.assignedInspector = 'Arjun Mehta';
  if(!project.checklist){
    project.checklist = [
      { category:'Infrastructure', weight:25, items:[
        { id:'inf-1', text:'Is the facility physically accessible (ramps, barrier-free corridors, accessible toilets)?', weight:12.5, checked:true },
        { id:'inf-2', text:'Are safety equipment, fire extinguishers, and emergency evacuation exits functional and inspected?', weight:12.5, checked:true }
      ]},
      { category:'Staffing & Attendance', weight:25, items:[
        { id:'stf-1', text:'Is the daily staff attendance register up to date and corroborated with biometric logs?', weight:12.5, checked:true },
        { id:'stf-2', text:'Is the designated project in-charge physically present on-site during operational hours?', weight:12.5, checked:false }
      ]},
      { category:'Documentation', weight:25, items:[
        { id:'doc-1', text:'Are financial accounts, grant utilization certificates, and beneficiary registers updated?', weight:12.5, checked:false },
        { id:'doc-2', text:'Is DPDP-compliant data handling, beneficiary confidentiality, and written consent followed?', weight:12.5, checked:true }
      ]},
      { category:'Service Delivery', weight:25, items:[
        { id:'srv-1', text:'Is the approved DoSJE training syllabus, daily curriculum, and practical module followed?', weight:12.5, checked:true },
        { id:'srv-2', text:'Are course training kits, uniforms/materials, and stipulated beneficiary stipends distributed?', weight:12.5, checked:false }
      ]}
    ];
  }
  const drawerWrap=$('#drawer-wrap');
  if(!drawerWrap) return;
  renderDrawerContent(project);
  drawerWrap.classList.remove('hidden');
  $('#drawer-overlay').onclick=closeProjectDrawer;
}

function closeProjectDrawer(){
  window._activeDrawerProjectId = null;
  const drawerWrap=$('#drawer-wrap');
  if(drawerWrap) drawerWrap.classList.add('hidden');
}

function renderDrawerContent(project){
  const statusVal = project.status || (project.camera === 'Offline' ? 'Closed' : 'Live');
  const updatedText = formatRelativeOrDate(project.lastUpdated);
  const isAuthorized = isUserInspectorInCharge(project);
  const assignedInspector = project.assignedInspector || 'Arjun Mehta';

  let checklistHtml = '';
  project.checklist.forEach((cat, catIdx)=>{
    const catChecked = cat.items.filter(i=>i.checked).length;
    checklistHtml += `<div class="checklist-cat" data-cat-idx="${catIdx}">
      <div class="checklist-cat-head">
        <span>${esc(cat.category)} (${catChecked}/${cat.items.length})</span>
        <span class="cat-weight-pill">Category: ${cat.weight}%</span>
      </div>
      <div class="checklist-items">
        ${cat.items.map(item=>`
          <div class="checklist-item ${item.checked?'checked':''}">
            <input type="checkbox" id="chk-${esc(item.id)}" class="chk-input" data-item-id="${esc(item.id)}" ${item.checked?'checked':''}>
            <label class="chk-label" for="chk-${esc(item.id)}">
              <div class="chk-label-top">
                <span>${esc(item.text)}</span>
                ${item.custom ? `<span class="badge custom">Custom</span>` : ''}
              </div>
              <span class="item-weight">Weight: ${item.weight}%</span>
            </label>
            ${(item.custom && isAuthorized) ? `<button type="button" class="delete-custom-item-btn" data-cat-idx="${catIdx}" data-item-id="${esc(item.id)}" title="Delete custom item">🗑</button>` : ''}
          </div>
        `).join('')}
      </div>
      ${isAuthorized ? `
        <div class="inline-form-slot" id="inline-form-slot-${catIdx}"></div>
        <button type="button" class="add-custom-item-btn" data-cat-idx="${catIdx}">+ Add custom item to ${esc(cat.category)}</button>
      ` : `
        <div class="inspector-notice">Only assigned inspector in-charge (${esc(assignedInspector)}) can add custom items.</div>
      `}
    </div>`;
  });

  $('#drawer-content').innerHTML = `
    <div class="drawer-header">
      <button class="drawer-close" id="close-drawer" title="Close">×</button>
      <div class="drawer-badges">
        ${badge(project.risk)}
        <button class="status-toggle ${statusVal.toLowerCase()}" id="toggle-proj-status" title="Click to toggle status">
          ${statusVal === 'Live' ? '● Live (Operational)' : '○ Closed (Offline)'} ⇄
        </button>
        <span class="badge info">${esc(project.scheme)}</span>
        <span class="badge incharge ${isAuthorized ? 'mine' : ''}">Inspector: ${esc(assignedInspector)} ${isAuthorized ? '(In-Charge)' : ''}</span>
      </div>
      <h2 class="drawer-title">${esc(project.name)}</h2>
      <div class="drawer-meta">${esc(project.district)}, ${esc(project.state)} · ID: ${esc(project.id)}</div>
      <div class="score-box">
        <div class="score-row">
          <span class="score-label">Compliance score</span>
          <span class="score-val" id="drawer-score-val">${project.score}%</span>
        </div>
        <div class="progress" style="margin:4px 0 8px; height:8px">
          <i id="drawer-progress-bar" style="width:${project.score}%"></i>
        </div>
        <div class="score-row" style="margin-bottom:0">
          <span class="score-updated" id="drawer-last-updated">Last updated: <span data-timestamp="${esc(project.lastUpdated)}">${updatedText}</span></span>
          <small style="color:var(--muted);font-weight:600">Attendance: ${project.attendance}%</small>
        </div>
      </div>
    </div>
    <div class="drawer-body">
      <div style="margin-bottom:14px">
        <h3 style="font-size:15px;color:var(--deep);margin-bottom:4px">Compliance Inspection Checklist</h3>
        <p style="font-size:12px;color:var(--muted);margin:0">Ticking any item automatically recalculates the compliance score and logs the change in real time.</p>
      </div>
      ${checklistHtml}
      <div class="drawer-notes">
        <h4>Inspector Field Observations & Notes</h4>
        <textarea id="drawer-note-text" placeholder="Add verified field observation or corrective action note for this project…"></textarea>
        <button class="secondary" id="save-drawer-note" style="font-size:12px;padding:8px 14px">+ Add Inspector Note to Audit Log</button>
      </div>
    </div>
    <div class="drawer-footer">
      <button class="secondary" id="drawer-done-btn">Close details</button>
    </div>
  `;

  $('#close-drawer').onclick = closeProjectDrawer;
  const doneBtn = $('#drawer-done-btn');
  if(doneBtn) doneBtn.onclick = closeProjectDrawer;

  document.querySelectorAll('#drawer-content .chk-input').forEach(chk=>{
    chk.onchange = (e) => handleChecklistToggle(project, e.target);
  });
  $('#toggle-proj-status').onclick = () => handleStatusToggle(project);
  $('#save-drawer-note').onclick = () => handleSaveInspectorNote(project);

  // Bind Add Custom Item button triggers
  document.querySelectorAll('#drawer-content .add-custom-item-btn').forEach(btn=>{
    btn.onclick = () => {
      const catIdx = parseInt(btn.dataset.catIdx, 10);
      const slot = $(`#inline-form-slot-${catIdx}`);
      if (!slot) return;
      btn.style.display = 'none';
      slot.innerHTML = `
        <div class="inline-custom-form">
          <label>Custom Inspection Item / Question</label>
          <input type="text" class="custom-text-input" placeholder="e.g. Are accessibility ramps certified by local engineer?" />
          <div class="form-row">
            <div style="flex:1">
              <label>Raw Weight Allocation (Option b proportional rescaling)</label>
              <input type="number" class="custom-weight-input" value="10" min="1" max="50" step="0.5" />
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="secondary cancel-custom-btn">Cancel</button>
            <button type="button" class="primary save-custom-btn">Save custom item</button>
          </div>
        </div>
      `;
      const textInput = slot.querySelector('.custom-text-input');
      if (textInput) textInput.focus();
      slot.querySelector('.cancel-custom-btn').onclick = () => {
        slot.innerHTML = '';
        btn.style.display = '';
      };
      slot.querySelector('.save-custom-btn').onclick = () => {
        const text = slot.querySelector('.custom-text-input').value.trim();
        const rawWeight = parseFloat(slot.querySelector('.custom-weight-input').value) || 10;
        if (!text) {
          showToast('Please enter the custom item text.');
          return;
        }
        handleAddCustomItem(project, catIdx, text, rawWeight);
      };
    };
  });

  // Bind Delete Custom Item buttons
  document.querySelectorAll('#drawer-content .delete-custom-item-btn').forEach(delBtn=>{
    delBtn.onclick = (e) => {
      e.stopPropagation();
      const catIdx = parseInt(delBtn.dataset.catIdx, 10);
      const itemId = delBtn.dataset.itemId;
      handleDeleteCustomItem(project, catIdx, itemId);
    };
  });
}

async function handleAddCustomItem(project, catIdx, text, rawWeight){
  const cat = project.checklist[catIdx];
  if(!cat) return;
  const newItem = {
    id: 'cst-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    text: text,
    weight: rawWeight,
    checked: false,
    custom: true
  };
  cat.items.push(newItem);
  normalizeCategoryWeights(cat);

  const oldScore = project.score;
  let totalWeights = 0, checkedWeights = 0;
  project.checklist.forEach(c=>{
    c.items.forEach(it=>{
      const w = Number(it.weight) || 0;
      totalWeights += w;
      if(it.checked) checkedWeights += w;
    });
  });
  const newScore = Math.round((checkedWeights / (totalWeights || 100)) * 100);
  const delta = newScore - oldScore;
  project.score = newScore;
  project.lastUpdated = new Date().toISOString();

  const user = getCurrentUser();
  const actorName = `${user.name} (${user.role})`;
  const addLog = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: project.lastUpdated,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'checklist',
    actor: actorName,
    field: 'Custom Checklist Item Added',
    oldValue: '',
    newValue: text.slice(0, 45) + (text.length > 45 ? '…' : ''),
    description: `Custom checklist item added in ${cat.category} by ${user.name}: "${text}" (weights proportionally rescaled to 25%)`
  };
  state.data.logs = state.data.logs || [];
  state.data.logs.unshift(addLog);

  if(delta !== 0){
    const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;
    const scoreLog = {
      id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
      timestamp: project.lastUpdated,
      projectId: project.id,
      projectName: project.name,
      state: project.state,
      actionType: 'score',
      actor: actorName,
      field: 'Compliance Score',
      oldValue: `${oldScore}%`,
      newValue: `${newScore}%`,
      delta: deltaStr,
      description: `Compliance score recalculated to ${newScore}% (${deltaStr}) following custom item addition`
    };
    state.data.logs.unshift(scoreLog);
  }
  if(state.view === 'logs') applyLogFilters();

  renderDrawerContent(project);

  const cardEl = document.querySelector(`.project-card[data-project-id="${project.id}"]`);
  if(cardEl){
    const cardScore = cardEl.querySelector('.card-score');
    const cardProgress = cardEl.querySelector('.card-progress-bar');
    if(cardScore) cardScore.textContent = `${newScore}%`;
    if(cardProgress) cardProgress.style.width = `${newScore}%`;
  }

  showToast('Custom item added and category weights rescaled.');

  try {
    const res = await api(`/api/projects/${encodeURIComponent(project.id)}/custom-item`, {
      method: 'POST',
      body: JSON.stringify({ category: cat.category, text, rawWeight })
    });
    if (res.ok) {
      const resp = await res.json();
      if (resp.checklist) project.checklist = resp.checklist;
      if (typeof resp.score === 'number') project.score = resp.score;
    }
  } catch(e){
    try { localStorage.setItem(`checklist_${project.id}`, JSON.stringify(project.checklist)); } catch{}
  }
}

async function handleDeleteCustomItem(project, catIdx, itemId){
  const cat = project.checklist[catIdx];
  if(!cat) return;
  const itemIndex = cat.items.findIndex(it => it.id === itemId);
  if(itemIndex === -1) return;
  const itemToDelete = cat.items[itemIndex];

  if(!confirm(`Are you sure you want to delete this custom checklist item?\n\n"${itemToDelete.text}"`)){
    return;
  }

  cat.items.splice(itemIndex, 1);
  normalizeCategoryWeights(cat);

  const oldScore = project.score;
  let totalWeights = 0, checkedWeights = 0;
  project.checklist.forEach(c=>{
    c.items.forEach(it=>{
      const w = Number(it.weight) || 0;
      totalWeights += w;
      if(it.checked) checkedWeights += w;
    });
  });
  const newScore = Math.round((checkedWeights / (totalWeights || 100)) * 100);
  const delta = newScore - oldScore;
  project.score = newScore;
  project.lastUpdated = new Date().toISOString();

  const user = getCurrentUser();
  const actorName = `${user.name} (${user.role})`;
  const deleteLog = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: project.lastUpdated,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'checklist',
    actor: actorName,
    field: 'Custom Checklist Item Deleted',
    oldValue: itemToDelete.text.slice(0, 45) + (itemToDelete.text.length > 45 ? '…' : ''),
    newValue: '',
    description: `Custom checklist item deleted by ${user.name}: "${itemToDelete.text}" (weights re-normalized to 25%)`
  };
  state.data.logs = state.data.logs || [];
  state.data.logs.unshift(deleteLog);

  if(delta !== 0){
    const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;
    const scoreLog = {
      id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
      timestamp: project.lastUpdated,
      projectId: project.id,
      projectName: project.name,
      state: project.state,
      actionType: 'score',
      actor: actorName,
      field: 'Compliance Score',
      oldValue: `${oldScore}%`,
      newValue: `${newScore}%`,
      delta: deltaStr,
      description: `Compliance score recalculated to ${newScore}% (${deltaStr}) following custom item removal`
    };
    state.data.logs.unshift(scoreLog);
  }
  if(state.view === 'logs') applyLogFilters();

  renderDrawerContent(project);

  const cardEl = document.querySelector(`.project-card[data-project-id="${project.id}"]`);
  if(cardEl){
    const cardScore = cardEl.querySelector('.card-score');
    const cardProgress = cardEl.querySelector('.card-progress-bar');
    if(cardScore) cardScore.textContent = `${newScore}%`;
    if(cardProgress) cardProgress.style.width = `${newScore}%`;
  }

  showToast('Custom item removed and category weights re-normalized.');

  try {
    const res = await api(`/api/projects/${encodeURIComponent(project.id)}/custom-item/${encodeURIComponent(itemId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const resp = await res.json();
      if (resp.checklist) project.checklist = resp.checklist;
      if (typeof resp.score === 'number') project.score = resp.score;
    }
  } catch(e){
    try { localStorage.setItem(`checklist_${project.id}`, JSON.stringify(project.checklist)); } catch{}
  }
}

async function handleChecklistToggle(project, checkbox){
  const itemId = checkbox.dataset.itemId;
  const isChecked = checkbox.checked;
  checkbox.closest('.checklist-item')?.classList.toggle('checked', isChecked);
  let targetItem = null, totalWeights = 0, checkedWeights = 0;
  project.checklist.forEach(cat=>{
    cat.items.forEach(item=>{
      const w = Number(item.weight) || 0;
      totalWeights += w;
      if(item.id === itemId){ item.checked = isChecked; targetItem = item; }
      if(item.checked) checkedWeights += w;
    });
  });
  const oldScore = project.score;
  const newScore = Math.round((checkedWeights / (totalWeights || 100)) * 100);
  const delta = newScore - oldScore;
  project.score = newScore;
  project.lastUpdated = new Date().toISOString();

  // 1. Update Drawer Sticky Header DOM smoothly
  const scoreValEl = $('#drawer-score-val'), progressEl = $('#drawer-progress-bar'), updatedEl = $('#drawer-last-updated');
  if(scoreValEl) scoreValEl.textContent = `${newScore}%`;
  if(progressEl) progressEl.style.width = `${newScore}%`;
  if(updatedEl) updatedEl.textContent = `Last updated: Just now`;

  // Update category count in header
  const catHead = checkbox.closest('.checklist-cat')?.querySelector('.checklist-cat-head span');
  if(catHead){
    const catItems = checkbox.closest('.checklist-items')?.querySelectorAll('.chk-input');
    const catChecked = [...catItems].filter(c=>c.checked).length;
    const catTitle = catHead.textContent.split('(')[0].trim();
    catHead.textContent = `${catTitle} (${catChecked}/${catItems.length})`;
  }

  // 2. Update Main List Project Card DOM immediately (no page reload)
  const cardEl = document.querySelector(`.project-card[data-project-id="${project.id}"]`);
  if(cardEl){
    const cardScore = cardEl.querySelector('.card-score');
    const cardProgress = cardEl.querySelector('.card-progress-bar');
    if(cardScore) cardScore.textContent = `${newScore}%`;
    if(cardProgress) cardProgress.style.width = `${newScore}%`;
  }

  // 3. Create Audit Log entries immediately for real-time feed
  const user = getCurrentUser();
  const actorName = `${user.name} (${user.role})`;
  const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;
  const isCustomBadge = targetItem?.custom ? ' [Custom Item]' : '';
  const checklistLog = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: project.lastUpdated,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'checklist',
    actor: actorName,
    field: targetItem ? (targetItem.text.slice(0, 40) + '…' + isCustomBadge) : 'Checklist Item',
    oldValue: isChecked ? 'Unchecked' : 'Checked',
    newValue: isChecked ? 'Checked' : 'Unchecked',
    description: `Checklist item ${isChecked ? 'verified' : 'unmarked'}${isCustomBadge}: "${targetItem ? targetItem.text : ''}"`
  };
  const scoreLog = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: project.lastUpdated,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'score',
    actor: actorName,
    field: 'Compliance Score',
    oldValue: `${oldScore}%`,
    newValue: `${newScore}%`,
    delta: deltaStr,
    description: `Compliance score recalculated from ${oldScore}% to ${newScore}% (${deltaStr})`
  };
  state.data.logs = state.data.logs || [];
  state.data.logs.unshift(scoreLog);
  state.data.logs.unshift(checklistLog);
  if(state.view === 'logs') applyLogFilters();

  // 4. Persist to Backend API
  try {
    await api(`/api/projects/${encodeURIComponent(project.id)}/checklist`, {
      method: 'PUT',
      body: JSON.stringify({ checklist: project.checklist, score: project.score, logEntry: checklistLog })
    });
  } catch(e){
    try { localStorage.setItem(`checklist_${project.id}`, JSON.stringify(project.checklist)); } catch{}
  }
}

async function handleStatusToggle(project){
  const currentStatus = project.status || (project.camera === 'Offline' ? 'Closed' : 'Live');
  const nextStatus = currentStatus === 'Live' ? 'Closed' : 'Live';
  project.status = nextStatus;
  project.camera = nextStatus === 'Closed' ? 'Offline' : 'Live';
  project.lastUpdated = new Date().toISOString();
  const toggleBtn = $('#toggle-proj-status');
  if(toggleBtn){
    toggleBtn.className = `status-toggle ${nextStatus.toLowerCase()}`;
    toggleBtn.innerHTML = `${nextStatus === 'Live' ? '● Live (Operational)' : '○ Closed (Offline)'} ⇄`;
  }
  const cardEl = document.querySelector(`.project-card[data-project-id="${project.id}"]`);
  if(cardEl){
    const cardStatus = cardEl.querySelector('.badge.live, .badge.closed, .badge.offline');
    if(cardStatus){
      cardStatus.className = `badge ${nextStatus.toLowerCase()}`;
      cardStatus.textContent = nextStatus === 'Live' ? '● Live' : '○ Closed';
    }
  }
  const actorName = sessionStorage.saarthiUser ? JSON.parse(sessionStorage.saarthiUser).name : 'Arjun Mehta (PMU Inspector)';
  const statusLog = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: project.lastUpdated,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'status',
    actor: actorName,
    field: 'Status',
    oldValue: currentStatus,
    newValue: nextStatus,
    description: `Project operational status changed from ${currentStatus} to ${nextStatus}`
  };
  state.data.logs = state.data.logs || [];
  state.data.logs.unshift(statusLog);
  if(state.view === 'logs') applyLogFilters();
  showToast(`Project status updated to ${nextStatus}.`);
  try {
    await api(`/api/projects/${encodeURIComponent(project.id)}/checklist`, {
      method: 'PUT',
      body: JSON.stringify({ status: nextStatus, logEntry: statusLog })
    });
  } catch{}
}

async function handleSaveInspectorNote(project){
  const noteInput = $('#drawer-note-text');
  const text = noteInput ? noteInput.value.trim() : '';
  if(!text) return showToast('Please enter an observation note.');
  project.lastUpdated = new Date().toISOString();
  const actorName = sessionStorage.saarthiUser ? JSON.parse(sessionStorage.saarthiUser).name : 'Arjun Mehta (PMU Inspector)';
  const commentLog = {
    id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: project.lastUpdated,
    projectId: project.id,
    projectName: project.name,
    state: project.state,
    actionType: 'comment',
    actor: actorName,
    field: 'Inspector Observation',
    oldValue: '',
    newValue: text.slice(0, 50) + (text.length > 50 ? '…' : ''),
    description: `Inspector Note: "${text}"`
  };
  state.data.logs = state.data.logs || [];
  state.data.logs.unshift(commentLog);
  if(state.view === 'logs') applyLogFilters();
  noteInput.value = '';
  showToast('Inspector observation added to audit log.');
  try {
    await api('/api/logs', { method: 'POST', body: JSON.stringify(commentLog) });
  } catch{}
}

function logs(){
  const d = state.data;
  const sitesList = d.sites || [];
  const states = [...new Set(sitesList.map(s => s.state))].sort();
  return `
    <div class="logs-header-box">
      <div>
        <h2 style="font-size:20px;margin-bottom:4px">Audit Logs & Activity Trail</h2>
        <p style="font-size:12px;color:var(--muted);margin:0">Real-time immutable ledger of checklist inspections, score adjustments, and status changes across all projects.</p>
      </div>
      <div class="live-stream-badge">
        <span class="pulse-dot"></span> LIVE STREAMING
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;padding:16px">
      <div class="logs-toolbar">
        <div>
          <span class="state-label">FILTER BY PROJECT</span>
          <select id="log-filter-project" class="state-filter" style="width:100%">
            <option value="">All Projects</option>
            ${sitesList.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <span class="state-label">ACTION TYPE</span>
          <select id="log-filter-action" class="state-filter" style="width:100%">
            <option value="all">All Action Types</option>
            <option value="checklist">Checklist Updates</option>
            <option value="score">Compliance Score Changes</option>
            <option value="status">Status Changes</option>
            <option value="comment">Inspector Notes</option>
            <option value="inspection">Inspections</option>
          </select>
        </div>
        <div>
          <span class="state-label">DATE RANGE</span>
          <select id="log-filter-date" class="state-filter" style="width:100%">
            <option value="0">All Time</option>
            <option value="1">Today</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
          </select>
        </div>
        <div>
          <span class="state-label">STATE / UT</span>
          <select id="log-filter-state" class="state-filter" style="width:100%">
            <option value="all">All States & UTs</option>
            ${states.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="log-feed" id="logs-container">
      ${renderLogRows(d.logs || [])}
    </div>
  `;
}

function renderLogRows(logsList){
  if(!logsList || !logsList.length){
    return `<div class="card empty">No audit log entries match the selected filters.</div>`;
  }
  return logsList.map(l => {
    let actionBadge = '';
    if (l.actionType === 'checklist') actionBadge = `<span class="badge info">Checklist</span>`;
    else if (l.actionType === 'score') actionBadge = `<span class="badge warning">Score Recalc</span>`;
    else if (l.actionType === 'status') actionBadge = `<span class="badge high">Status Toggle</span>`;
    else if (l.actionType === 'comment') actionBadge = `<span class="badge live">Inspector Note</span>`;
    else if (l.actionType === 'custom_item_added') actionBadge = `<span class="badge live">Custom Item</span>`;
    else if (l.actionType === 'custom_item_deleted') actionBadge = `<span class="badge warning">Item Deleted</span>`;
    else actionBadge = `<span class="badge info">${esc(l.actionType || 'Action')}</span>`;

    let valueChange = '';
    if (l.oldValue && l.newValue) {
      valueChange = `<span class="change-pill">${esc(l.oldValue)} → <b>${esc(l.newValue)}</b></span>`;
    } else if (l.delta) {
      valueChange = `<span class="change-pill">Delta: <b>${esc(l.delta)}</b></span>`;
    }
    const exactIst = typeof window.formatToIST === 'function' ? window.formatToIST(l.timestamp) : new Date(l.timestamp).toLocaleString('en-IN');
    const relTime = formatRelativeOrDate(l.timestamp);

    return `
      <div class="log-row" data-project-id="${esc(l.projectId)}" title="Click to view ${esc(l.projectName)} details">
        <div class="log-time">
          <div class="relative-time" data-timestamp="${esc(l.timestamp)}">${esc(relTime)}</div>
          <small class="exact-time" style="color:var(--muted);font-size:11px;white-space:nowrap">${esc(exactIst)}</small>
        </div>
        <div class="log-proj">${esc(l.projectName)}</div>
        <div class="log-desc">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            ${actionBadge}
            <span>${esc(l.description || l.field)}</span>
          </div>
          ${(l.actorName || l.actor) ? `<span class="log-actor">By ${esc(l.actorName || l.actor)}</span>` : ''}
        </div>
        <div>${valueChange}</div>
        <div class="log-arrow">→</div>
      </div>
    `;
  }).join('');
}

function applyLogFilters(){
  const projectVal = $('#log-filter-project')?.value || '';
  const actionVal = $('#log-filter-action')?.value || 'all';
  const dateDays = parseInt($('#log-filter-date')?.value || '0', 10);
  const stateVal = $('#log-filter-state')?.value || 'all';
  let filtered = [...(state.data?.logs || [])];
  if(projectVal) filtered = filtered.filter(l => l.projectId === projectVal);
  if(actionVal && actionVal !== 'all') filtered = filtered.filter(l => l.actionType === actionVal);
  if(stateVal && stateVal !== 'all') filtered = filtered.filter(l => l.state === stateVal);
  if(dateDays > 0){
    const cutoff = Date.now() - dateDays * 86400000;
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= cutoff);
  }
  const container = $('#logs-container');
  if(container){
    container.innerHTML = renderLogRows(filtered);
    bindLogClicks();
  }
}

function bindLogClicks(){
  document.querySelectorAll('#logs-container .log-row').forEach(row=>{
    row.onclick = () => {
      const projId = row.dataset.projectId;
      if(projId && projId !== 'P-General') openProjectDrawer(projId);
    };
  });
}

function inspections(){return `<div class="card"><div class="card-head"><div><h2>Inspections</h2><p style="margin:5px 0 0;color:var(--muted);font-size:12px">Create a field inspection, capture verified evidence and location, then choose fair auto-assignment or a specific inspector.</p></div></div><div class="assignment-explainer"><b>On-ground workflow:</b> start the assignment when the inspector reaches the site. The registered NGO/institute is notified. Submitting the verified report completes the inspection and shares the report with that organisation.</div>${state.data.inspections.length?inspectionTable(state.data.inspections,true):'<div class="empty">No inspection has been created yet.</div>'}</div>`}
function cctv(){return `<div class="card"><div class="card-head"><div><h2>Authorized live CCTV feeds</h2><p style="margin:5px 0 0;color:var(--muted);font-size:12px">Connect up to four authorised field phones. The video is relayed securely to this monitoring screen.</p></div><span class="badge live">● AI SCREENING ACTIVE</span></div><div class="ai-monitor-note"><b>AI-assisted monitoring:</b> monitors connected feeds for feed loss and unusual movement. <span>Every AI alert requires an officer’s review before any action.</span></div><div class="cctv-grid mobile-cctv-grid">${[1,2,3,4].map(slot=>`<div class="feed mobile-cctv" id="mobile-cctv-card-${slot}"><video id="mobile-cctv-video-${slot}" autoplay playsinline></video><span class="status">● MOBILE CCTV ${slot}</span><span class="cam-time" data-clock></span><button class="connect-mobile-camera" data-mobile-slot="${slot}">Connect phone camera</button><button class="cctv-fullscreen" data-fullscreen-slot="${slot}" disabled>Full screen</button><div class="cctv-ai-status" id="cctv-ai-status-${slot}">AI: Awaiting camera connection</div><h3>Field camera ${slot}</h3><small id="mobile-cctv-caption-${slot}">Ready for authorised device</small></div>`).join('')}</div></div>`}
function reports(){const r=state.data.reports,grievances=state.data.feedback||[];return `<div class="card"><div class="card-head"><div><h2>Inspection reports</h2><p style="margin:5px 0 0;color:var(--muted);font-size:12px">Server timestamps and rules are used to flag evidence for human review.</p></div><button class="primary" id="report-top">+ New report</button></div>${r.length?`<table class="table"><thead><tr><th>REPORT</th><th>PROJECT</th><th>FINDING</th><th>STATUS</th></tr></thead><tbody>${r.map(x=>`<tr><td><strong>${x.id}</strong><br><small style="color:var(--muted)">${new Date(x.submittedAt).toLocaleString()}</small></td><td>${esc(x.site)}</td><td>${esc(x.finding)}${x.anomalies?.length?`<small class="integrity-flag">⚠ ${esc(x.anomalies[0])}</small>`:''}</td><td>${badge(x.status)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No submitted reports yet. Start a mobile inspection to create a geo-tagged report.</div>'}</div><div class="card section"><div class="card-head"><div><h2>Beneficiary grievances & media evidence</h2><p style="margin:5px 0 0;color:var(--muted);font-size:12px">Visible to authorised officials and the linked project / NGO account.</p></div></div>${grievances.length?`<div class="evidence-grid">${grievances.map(item=>`<article class="evidence-card"><div><span>${badge(item.category)}</span><small>${esc(item.id)} · ${new Date(item.submittedAt).toLocaleString('en-IN')}</small></div><h3>${esc(item.ngo)}</h3><p>${esc(item.message)}</p>${evidencePreview(item.evidence)}${item.evidence?`<small class="integrity-note">✓ ${esc(item.evidence.integrity)}<br>Server time: ${new Date(item.evidence.serverReceivedAt).toLocaleString('en-IN')}<br>Hash: ${esc(item.evidence.serverHash.slice(0,16))}…</small>`:''}</article>`).join('')}</div>`:'<div class="empty">No beneficiary grievances with evidence have been received.</div>'}</div><div class="integrity-card"><h3>Evidence integrity controls</h3><div><b>Server evidence hash</b><span>SHA-256 is calculated from uploaded media on the server; any changed bytes produce a different hash.</span></div><div><b>Location and time</b><span>Server network time is authoritative. Production Android uses native mock-location attestation plus cellular/network corroboration; this web demo cannot truthfully detect mock-location apps.</span></div><div><b>Offline protection</b><span>Production mobile builds store queued media in encrypted SQLite/IndexedDB and retain its capture hash; altered files fail verification when synced.</span></div><div><b>Active anomaly rules</b><span>Flags: project geo-fence deviation over 100 m; two inspections 15 km apart within 10 minutes; evidence outside 08:00–20:00 IST.</span></div></div>`}
function render(){
  if(window.nationwideMap){window.nationwideMap.remove();window.nationwideMap=null}
  const user = getCurrentUser();
  const firstName = user?.name ? user.name.split(' ')[0] : 'Arjun';
  const greeting = typeof window.getISTGreeting === 'function' ? window.getISTGreeting(firstName) : `Good morning, ${firstName}`;
  const titles={overview:greeting,projects:'Project monitoring',inspections:'Inspections',cctv:'Live CCTV monitoring',reports:'Inspection reports',logs:'Real-Time Audit Trail'};
  $('#page-title').textContent=titles[state.view]||'Saarthi Monitoring';
  $('#content').innerHTML=({overview,projects,inspections,cctv,reports,logs})[state.view]();
  document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===state.view));
  bind();
  if(state.view==='overview')initIndiaMap();
}
function reportModal(){return `<h2>Submit inspection report</h2><p>Capture verified field evidence and use device GPS to stamp the actual inspection location.</p><form id="report-form"><div class="form-grid"><label class="field full">Project<select name="site" required>${state.data.sites.map(s=>`<option>${esc(s.name)}</option>`).join('')}</select></label><label class="field">Inspection outcome<select name="finding"><option>Compliant</option><option>Needs corrective action</option><option>Critical non-compliance</option></select></label><label class="field">Evidence type<select name="evidence"><option>Photo + geo-tag</option><option>Video evidence</option><option>VC verification</option></select></label><label class="field full">Inspection notes<textarea name="notes" placeholder="Enter verified observations and required corrective action…" required></textarea></label><div class="field full geo-field"><div class="geo-heading"><span>Geo-tagged inspection location</span><button class="text-btn" type="button" id="expand-geo-map">Expand map ↗</button></div><div id="inspection-geo-map" class="inspection-map"><div class="geo-loading">Loading secure map…</div></div><div class="geo-actions"><button class="secondary geo-button" type="button" id="get-current-location">⌖ Capture precise GPS</button><button class="secondary" type="button" id="center-geo-pin" disabled>◎ Center location</button></div><div class="geo-details" id="geo-details"><span class="geo-dot"></span><span>GPS location not captured yet</span></div><input name="location" id="inspection-location" value="GPS location not captured yet" readonly></div></div><div class="form-actions"><button type="button" class="secondary" id="close-form">Cancel</button><button class="primary">Submit verified report</button></div></form>`}
function inspectionModal(){const available=state.data.sites.filter(site=>!site.inspectionAssigned),inspectors=state.data.inspectors||[];return `<h2>New inspection</h2><p>Capture the field details and geo-tagged evidence, then choose how the responsible inspector should be assigned.</p><form id="inspection-assign-form"><div class="form-grid"><label class="field full">Project<select name="siteId" required>${available.map(site=>`<option value="${esc(site.id)}">${esc(site.name)} · ${esc(site.district)}, ${esc(site.state)}</option>`).join('')}</select></label><label class="field">Due by<select name="due"><option>Within 24 hours</option><option>Within 48 hours</option><option>Within 7 days</option><option>Scheduled follow-up</option></select></label><label class="field">Priority<select name="priority"><option>High</option><option>Medium</option><option>Low</option></select></label><label class="field">Inspection outcome<select name="finding"><option>Compliant</option><option>Needs corrective action</option><option>Critical non-compliance</option></select></label><label class="field">Evidence type<select name="evidence"><option>Photo + geo-tag</option><option>Video evidence</option><option>VC verification</option></select></label><label class="field full">Inspection notes<textarea name="notes" placeholder="Enter verified observations and required corrective action…" required></textarea></label><div class="field full geo-field"><div class="geo-heading"><span>Geo-tagged inspection location</span><button class="text-btn" type="button" id="expand-geo-map">Expand map ↗</button></div><div id="inspection-geo-map" class="inspection-map"><div class="geo-loading">Loading secure map…</div></div><div class="geo-actions"><button class="secondary geo-button" type="button" id="get-current-location">⌖ Capture precise GPS</button><button class="secondary" type="button" id="center-geo-pin" disabled>◎ Center location</button></div><div class="geo-details" id="geo-details"><span class="geo-dot"></span><span>GPS location not captured yet</span></div><input name="location" id="inspection-location" value="GPS location not captured yet" readonly></div><label class="field full">Specific inspector <small>(only used for Specific assign)</small><select name="inspectorName"><option value="">Select inspector</option>${inspectors.map(inspector=>`<option value="${esc(inspector.name)}">${esc(inspector.name)} · ${esc(inspector.role)} · workload ${inspector.workload}</option>`).join('')}</select></label></div><div class="assignment-choice"><b>Choose assignment method</b><span>Auto-assignment is fair by design; specific assignment is recorded in the audit trail.</span></div><div class="form-actions"><button type="button" class="secondary" id="close-form">Cancel</button><button class="secondary assignment-button" type="submit" value="specific">Assign to selected inspector</button><button class="primary" type="submit" value="auto">✦ Auto-assign fairly</button></div></form>`}
function notificationsModal(){return `<h2>Notifications</h2><p>Latest system alerts and inspection activity.</p><div class="notification-list">${state.data.alerts.map(a=>`<div class="alert"><span class="alert-icon ${a.severity}">!</span><div><strong>${esc(a.type)}</strong><p>${esc(a.site)} · ${esc(a.text)}</p></div><time>${esc(a.time)}</time></div>`).join('')||'<div class="empty">You have no new notifications.</div>'}</div>`}
function toggleProfileMenu(){let menu=$('#profile-menu');if(menu){menu.remove();return}menu=document.createElement('div');menu.id='profile-menu';menu.innerHTML=`<div class="profile-menu-head"><span class="avatar">AM</span><div><b>Arjun Mehta</b><small>PMU Inspector · GOV-2026-1001</small></div></div><button data-profile-action="account">◉ My profile</button><button data-profile-action="settings">⚙ Account settings</button><hr><button data-profile-action="logout" class="logout-action">↪ Log out</button>`;document.body.appendChild(menu);menu.querySelector('[data-profile-action="account"]').onclick=()=>{menu.remove();showToast('Profile details are verified through your Government Employee ID.')};menu.querySelector('[data-profile-action="settings"]').onclick=()=>{menu.remove();showToast('Account settings will be managed through the official identity service.')};menu.querySelector('[data-profile-action="logout"]').onclick=logout}
async function logout(){try{await api('/api/auth/logout',{method:'POST',body:'{}'})}catch{}delete sessionStorage.saarthiToken;if(dashboardSyncTimer){clearInterval(dashboardSyncTimer);dashboardSyncTimer=null}clearInterval(window.partnerDashboardSync);clearInterval(window.partnerEvidenceSync);$('#profile-menu')?.remove();$('#partner-portal')?.remove();showLanding();showToast('You have been logged out securely.')}
function vcModal(site){return `<h2>Initiate surprise VC</h2><p>A secure verification request will be sent immediately and retained in the audit trail.</p><form id="vc-form"><div class="form-grid"><label class="field full">Project<select name="site">${state.data.sites.map(s=>`<option ${s.name===site?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label class="field full">Contact / role<input name="contact" placeholder="Project Incharge / Staff / Beneficiary" required></label></div><div class="form-actions"><button type="button" class="secondary" id="close-form">Cancel</button><button class="primary">Send VC request</button></div></form>`}
let leafletLoader;
function ensureLeaflet(){if(window.L)return Promise.resolve(window.L);if(leafletLoader)return leafletLoader;leafletLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';script.crossOrigin='';script.onload=()=>resolve(window.L);script.onerror=reject;document.head.appendChild(script)});return leafletLoader}
function addMapTiles(map){L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19,maxNativeZoom:18,updateWhenIdle:true,updateWhenZooming:false,keepBuffer:1,attribution:'© OpenStreetMap contributors © CARTO'}).addTo(map)}
function initIndiaMap(){const el=$('#india-project-map');if(!el)return;const point=state.data.sites.find(site=>Number.isFinite(site.lat)&&Number.isFinite(site.lng));if(!point){el.innerHTML='<div class="map-fallback">No registered project has a map location yet.</div>';return}const delta=.035,bounds=[point.lng-delta,point.lat-delta,point.lng+delta,point.lat+delta].map(value=>value.toFixed(6)).join('%2C');const marker=`${point.lat.toFixed(6)}%2C${point.lng.toFixed(6)}`;el.innerHTML=`<iframe class="official-map-frame" title="Registered project location map" loading="eager" src="https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${marker}"></iframe><div class="official-map-label"><b>${esc(point.name)}</b><span>${esc(point.district)}, ${esc(point.state)}</span></div>`}
async function initInspectionMap(){const el=$('#inspection-geo-map');if(!el)return;try{await ensureLeaflet();const map=L.map(el,{scrollWheelZoom:true,zoomControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,inertia:false,preferCanvas:true}).setView([20.5937,78.9629],5);window.inspectionGeo={map,marker:null,accuracyCircle:null,point:null};const error=document.createElement('div');error.className='map-service-error hidden';error.textContent='Map tiles could not load. GPS capture and the inspection report remain available.';el.append(error);const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors',crossOrigin:true});let tileFailureTimer;tiles.on('tileerror',()=>{clearTimeout(tileFailureTimer);tileFailureTimer=setTimeout(()=>error.classList.remove('hidden'),800)}).addTo(map);el.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});el.addEventListener('pointerdown',event=>event.stopPropagation());requestAnimationFrame(()=>map.invalidateSize({animate:false}));setTimeout(()=>map.invalidateSize({animate:false}),160);const capture=$('#get-current-location'),center=$('#center-geo-pin'),expand=$('#expand-geo-map');center.title='Use device location to center map';const applyPosition=(position,announce)=>{const {latitude,longitude,accuracy}=position.coords,point=[latitude,longitude],capturedAt=new Date(position.timestamp),geo=window.inspectionGeo;geo.point=point;if(geo.marker)geo.marker.setLatLng(point);else geo.marker=L.marker(point,{title:'Verified inspection location'}).addTo(map);if(geo.accuracyCircle)geo.accuracyCircle.setLatLng(point).setRadius(accuracy);else geo.accuracyCircle=L.circle(point,{radius:accuracy,color:'#1a5ca8',weight:1,fillColor:'#3d83cf',fillOpacity:.14}).addTo(map);geo.marker.bindPopup(`<b>Verified inspection location</b><br>${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>Accuracy: ±${Math.round(accuracy)} m`);map.setView(point,16,{animate:false});const locationValue=`${latitude.toFixed(6)}, ${longitude.toFixed(6)} · accuracy ±${Math.round(accuracy)}m · ${capturedAt.toLocaleString()}`;$('#inspection-location').value=locationValue;$('#geo-details').innerHTML=`<span class="geo-dot verified">✓</span><span><b>GPS captured</b> · ${latitude.toFixed(6)}, ${longitude.toFixed(6)} · ±${Math.round(accuracy)} m</span>`;capture.textContent='↻ Refresh precise GPS';capture.disabled=false;center.disabled=false;center.title='Center on captured GPS location';if(announce)showToast('Precise GPS location captured and pinned on the map.')};const requestLocation=(announce=false)=>{if(!navigator.geolocation){center.disabled=true;center.title='Capture GPS first — this device does not provide geolocation';showToast('This browser does not support GPS location.');return}navigator.geolocation.getCurrentPosition(position=>applyPosition(position,announce),locationError=>{center.disabled=true;center.title='Capture GPS first — location permission is required';$('#geo-details').innerHTML='<span class="geo-dot error">!</span><span>Location unavailable. Enable device location and capture GPS first.</span>';showToast(locationError.code===1?'Location permission was not granted.':'Could not obtain location. Enable GPS and try again.')},{enableHighAccuracy:true,timeout:12000,maximumAge:0})};center.onclick=()=>{if(window.inspectionGeo?.point){map.setView(window.inspectionGeo.point,16,{animate:false});window.inspectionGeo.marker.openPopup();return}center.disabled=true;center.title='Locating device…';requestLocation(false)};expand.onclick=()=>{el.classList.toggle('expanded');expand.textContent=el.classList.contains('expanded')?'Collapse map ↙':'Expand map ↗';setTimeout(()=>{map.invalidateSize({animate:false});if(window.inspectionGeo?.point)map.setView(window.inspectionGeo.point,16,{animate:false})},80)};capture.onclick=()=>{capture.disabled=true;capture.textContent='Locating device…';$('#geo-details').innerHTML='<span class="geo-dot locating"></span><span>Acquiring high-accuracy GPS signal…</span>';requestLocation(true)}}catch{el.innerHTML='<div class="map-fallback">Map service unavailable. GPS coordinates can still be captured and included in the report.</div>'}}
function openModal(html){$('#modal-content').innerHTML=html;$('#modal').classList.remove('hidden');if($('#inspection-geo-map'))setTimeout(initInspectionMap,0)}function closeModal(){$('#modal').classList.add('hidden')}
function bind(){
  document.querySelectorAll('[data-view-go]').forEach(x=>x.onclick=()=>{state.view=x.dataset.viewGo;render()});
  $('#open-report').onclick=()=>openModal(inspectionModal());
  const notifications=$('.icon-btn'); if(notifications) notifications.onclick=()=>openModal(notificationsModal());
  const profile=$('.profile'); if(profile) profile.onclick=toggleProfileMenu;
  const reportTop=$('#report-top'); if(reportTop) reportTop.onclick=()=>openModal(reportModal());
  const newInspection=$('#new-inspection'); if(newInspection) newInspection.onclick=()=>openModal(inspectionModal());
  bindProjectCards();
  const logProj = $('#log-filter-project');
  const logAction = $('#log-filter-action');
  const logDate = $('#log-filter-date');
  const logState = $('#log-filter-state');
  if(logProj) logProj.onchange = applyLogFilters;
  if(logAction) logAction.onchange = applyLogFilters;
  if(logDate) logDate.onchange = applyLogFilters;
  if(logState) logState.onchange = applyLogFilters;
  bindLogClicks();
  const search=$('#search');
  if(search) search.oninput=e=>{ const q=e.target.value.toLowerCase(); $('#projects-grid').innerHTML=projectCards(state.data.sites.filter(s=>Object.values(s).join(' ').toLowerCase().includes(q))); bindProjectCards(); };
  const stateFilter=$('#state-filter');
  if(stateFilter){const applyState=()=>{const chosen=stateFilter.value,q=($('#search').value||'').toLowerCase(),shown=state.data.sites.filter(s=>!s.inspectionAssigned&&(!chosen||s.state===chosen)&&Object.values(s).join(' ').toLowerCase().includes(q));$('#projects-grid').innerHTML=projectCards(shown);bindProjectCards();$('#state-summary').textContent=chosen?`${shown.length} project${shown.length===1?'':'s'} available in ${chosen}`:`${shown.length} projects available for inspection`;};stateFilter.onchange=applyState;$('#search').oninput=applyState;}
  document.querySelectorAll('[data-start-inspection]').forEach(button=>button.onclick=()=>startGroundInspection(button.dataset.startInspection));
  document.querySelectorAll('[data-vc]').forEach(button=>button.onclick=()=>openModal(vcModal(button.dataset.vc)));
  const startCamera=$('#start-camera'), stopCamera=$('#stop-camera');
  if(startCamera) startCamera.onclick=startLiveCamera;
  if(stopCamera) stopCamera.onclick=stopLiveCamera;
  document.querySelectorAll('[data-mobile-slot]').forEach(button=>button.onclick=()=>createMobileCctvRoom(Number(button.dataset.mobileSlot)));
  document.querySelectorAll('[data-fullscreen-slot]').forEach(button=>button.onclick=()=>openCctvFullscreen(Number(button.dataset.fullscreenSlot)));
  document.querySelectorAll('[data-clock]').forEach(clock=>clock.textContent=new Date().toLocaleTimeString('en-IN',{hour12:false}));
}
async function startLiveCamera(){try{const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});const video=$('#local-camera');video.srcObject=stream;$('#camera-feed').classList.add('camera-active');$('#stop-camera').classList.remove('hidden');showToast('Secure live test camera started')}catch(err){showToast('Camera access was not granted. Please allow it in the browser.') }}
function stopLiveCamera(){const video=$('#local-camera');if(video&&video.srcObject){video.srcObject.getTracks().forEach(t=>t.stop());video.srcObject=null}$('#camera-feed').classList.remove('camera-active');$('#stop-camera').classList.add('hidden');showToast('Live test camera stopped')}
const mobileRtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}],iceCandidatePoolSize:2};
const mobileFrameStyle=document.createElement('style');mobileFrameStyle.textContent='.mobile-cctv .mobile-cctv-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#0c2642;display:none}.mobile-cctv .mobile-cctv-frame.active{display:block}.mobile-cctv .status,.mobile-cctv .cam-time,.mobile-cctv .cctv-ai-status,.mobile-cctv h3,.mobile-cctv small,.mobile-cctv .mobile-link,.mobile-cctv .cctv-fullscreen{z-index:2}.mobile-cctv .cctv-fullscreen{top:47px}.mobile-cctv .cctv-fullscreen:disabled{opacity:.45;cursor:not-allowed}.mobile-cctv:fullscreen{width:100vw;height:100vh;max-width:none;border-radius:0;background:#061c31}.mobile-cctv:fullscreen .mobile-cctv-frame{object-fit:contain}.mobile-cctv:fullscreen h3,.mobile-cctv:fullscreen small{font-size:16px;bottom:25px}';document.head.appendChild(mobileFrameStyle);
async function createMobileCctvRoom(slot){try{const response=await api('/api/mobile-cctv/room',{method:'POST',body:'{}'});if(!response.ok)throw new Error('Room creation failed');const {roomId}=await response.json();const clientId=crypto.randomUUID();const peer=new RTCPeerConnection(mobileRtcConfig);window.mobileCctv=window.mobileCctv||{};window.mobileCctv[slot]={roomId,clientId,peer,phoneId:null,pendingCandidates:[],isRelayActive:false};peer.onicecandidate=e=>{if(e.candidate)sendMobileCctvSignal(roomId,clientId,{kind:'candidate',candidate:e.candidate},window.mobileCctv[slot].phoneId)};peer.onconnectionstatechange=()=>{const label=$(`#cctv-ai-status-${slot}`);if(peer.connectionState==='failed'||peer.connectionState==='disconnected')label.textContent='Direct connection interrupted. Secure camera relay remains active.'};peer.ontrack=e=>{const video=$(`#mobile-cctv-video-${slot}`);video.srcObject=e.streams[0];video.play().catch(()=>{});$(`#mobile-cctv-caption-${slot}`).textContent='Connected field phone · live';$(`#cctv-ai-status-${slot}`).textContent='AI: Analysing feed health and movement';startCctvAnalysis(slot,video);};await sendMobileCctvSignal(roomId,clientId,{kind:'monitor-ready',monitorId:clientId});window.mobileCctv[slot].poll=setInterval(()=>pollMobileCctvSignals(slot),1000);startMobileFrameRelay(slot);const link=`${appPublicOrigin}/?mobileCctv=${roomId}&slot=${slot}`;$(`#mobile-cctv-caption-${slot}`).textContent='Open this link on the field phone';const card=$(`#mobile-cctv-card-${slot}`);card.querySelector('.connect-mobile-camera').outerHTML=`<button class="connect-mobile-camera" id="copy-mobile-link-${slot}">Copy phone link</button><div class="mobile-link">${link}</div>`;$(`#copy-mobile-link-${slot}`).onclick=async()=>{try{await navigator.clipboard.writeText(link);showToast(`Mobile CCTV ${slot} link copied.`)}catch{showToast('Copy the displayed link and open it on the field phone.')}};$(`#cctv-ai-status-${slot}`).textContent='AI: Waiting for field phone to allow camera';}catch(e){showToast('Could not create the mobile CCTV room. Please try again.')}}
function openCctvFullscreen(slot){const card=$(`#mobile-cctv-card-${slot}`);if(!card?.querySelector('.mobile-cctv-frame.active')&&!card?.querySelector('video')?.srcObject)return showToast('Connect the phone camera before using full screen.');if(document.fullscreenElement){document.exitFullscreen?.();return}card.requestFullscreen?.().catch(()=>showToast('Full screen is unavailable in this browser.'))}
function setMobileRelayActive(slot,active){const current=window.mobileCctv?.[slot],card=$(`#mobile-cctv-card-${slot}`);if(!current||!card||current.isRelayActive===active)return;current.isRelayActive=active;const copy=$(`#copy-mobile-link-${slot}`),link=card.querySelector('.mobile-link');if(active){copy?.remove();return}/* Re-show link sharing after a dropped relay so the field device can reconnect; confirm this recovery behaviour if you prefer it hidden. */if(!copy&&link){const button=document.createElement('button');button.className='connect-mobile-camera';button.id=`copy-mobile-link-${slot}`;button.textContent='Copy phone link';link.before(button);button.onclick=async()=>{try{await navigator.clipboard.writeText(`${appPublicOrigin}/?mobileCctv=${current.roomId}&slot=${slot}`);showToast(`Mobile CCTV ${slot} link copied.`)}catch{showToast('Copy the displayed link and open it on the field phone.')}}}}
function startMobileFrameRelay(slot){const current=window.mobileCctv?.[slot];if(!current)return;const card=$(`#mobile-cctv-card-${slot}`);let image=card.querySelector('.mobile-cctv-frame');if(!image){image=document.createElement('img');image.className='mobile-cctv-frame';image.alt='Live field camera feed';card.prepend(image)}current.framePoll=setInterval(async()=>{try{if(current.isRelayActive&&current.lastFrameAt&&Date.now()-current.lastFrameAt>5000){setMobileRelayActive(slot,false);$(`#cctv-ai-status-${slot}`).textContent='AI: Camera relay disconnected — share link to reconnect';}const response=await api(`/api/mobile-cctv/frame?roomId=${encodeURIComponent(current.roomId)}&t=${Date.now()}`,{cache:'no-store'});if(!response.ok)return;const frame=await response.json();if(!frame.image||frame.updatedAt===current.lastFrameAt)return;current.lastFrameAt=frame.updatedAt;image.src=frame.image;image.classList.add('active');setMobileRelayActive(slot,true);const full=$(`[data-fullscreen-slot="${slot}"]`);if(full)full.disabled=false;$(`#mobile-cctv-caption-${slot}`).textContent='Field phone camera · secure live relay';$(`#cctv-ai-status-${slot}`).textContent='AI: Analysing live camera relay';startCctvImageAnalysis(slot,image)}catch{}},450)}
async function sendMobileCctvSignal(roomId,clientId,signal,target=null){return api('/api/mobile-cctv/signal',{method:'POST',body:JSON.stringify({roomId,clientId,signal,target})})}
async function pollMobileCctvSignals(slot){const current=window.mobileCctv?.[slot];if(!current)return;try{const response=await api(`/api/mobile-cctv/signals?roomId=${encodeURIComponent(current.roomId)}&clientId=${encodeURIComponent(current.clientId)}&t=${Date.now()}`,{cache:'no-store'});if(!response.ok)return;const {signals}=await response.json();for(const message of signals){const signal=message.signal;if(signal.kind==='offer'){current.phoneId=message.from;await current.peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));for(const candidate of current.pendingCandidates.splice(0))await current.peer.addIceCandidate(candidate);const answer=await current.peer.createAnswer();await current.peer.setLocalDescription(answer);await sendMobileCctvSignal(current.roomId,current.clientId,{kind:'answer',sdp:answer},current.phoneId)}else if(signal.kind==='candidate'){const candidate=new RTCIceCandidate(signal.candidate);if(current.peer.remoteDescription)await current.peer.addIceCandidate(candidate);else current.pendingCandidates.push(candidate)}}}catch{}}
function startCctvAnalysis(slot,video){if(window.mobileCctv?.[slot]?.analysis)return;const canvas=document.createElement('canvas');canvas.width=48;canvas.height=36;const context=canvas.getContext('2d',{willReadFrequently:true});let previous=null;window.mobileCctv[slot].analysis=setInterval(()=>{if(video.readyState<2)return;context.drawImage(video,0,0,48,36);const data=context.getImageData(0,0,48,36).data;if(previous){let change=0;for(let i=0;i<data.length;i+=12)change+=Math.abs(data[i]-previous[i]);const average=change/(data.length/12);const label=$(`#cctv-ai-status-${slot}`);if(average>26){label.textContent='AI alert: Unusual movement detected — review required';label.classList.add('ai-alert')}else{label.textContent='AI: Feed stable · movement within normal range';label.classList.remove('ai-alert')}}previous=data},2500)}
function startCctvImageAnalysis(slot,image){if(window.mobileCctv?.[slot]?.relayAnalysis)return;const canvas=document.createElement('canvas');canvas.width=48;canvas.height=36;const context=canvas.getContext('2d',{willReadFrequently:true});let previous=null;window.mobileCctv[slot].relayAnalysis=setInterval(()=>{if(!image.complete||!image.naturalWidth)return;context.drawImage(image,0,0,48,36);const data=context.getImageData(0,0,48,36).data;if(previous){let change=0;for(let i=0;i<data.length;i+=12)change+=Math.abs(data[i]-previous[i]);const average=change/(data.length/12),label=$(`#cctv-ai-status-${slot}`);if(average>26){label.textContent='AI alert: Unusual movement detected — review required';label.classList.add('ai-alert')}else{label.textContent='AI: Live relay stable · movement within normal range';label.classList.remove('ai-alert')}}previous=data},2500)}
function showMobileCctvPhone(roomId,slot){document.querySelector('#public-portal')?.remove();document.querySelector('#auth-gate')?.remove();const panel=document.createElement('div');panel.id='mobile-cctv-phone';panel.innerHTML=`<div class="phone-camera-panel"><span>SAARTHI · AUTHORIZED FIELD DEVICE</span><h1>Mobile CCTV camera ${esc(slot||'')}</h1><p>Allow camera access. Keep this page open while the official dashboard receives your live feed.</p><video id="phone-camera-preview" autoplay muted playsinline></video><button id="start-phone-cctv">Start secure camera</button><p id="phone-camera-status">Ready to connect.</p></div>`;document.body.appendChild(panel);$('#start-phone-cctv').onclick=()=>startPhoneCctv(roomId,slot)}
async function startPhoneCctv(roomId,slot){const button=$('#start-phone-cctv');try{button.disabled=true;button.textContent='Starting camera…';const phoneId=crypto.randomUUID();const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});$('#phone-camera-preview').srcObject=stream;startPhoneFrameRelay(roomId,stream);const peer=new RTCPeerConnection(mobileRtcConfig);const pendingCandidates=[];let monitorId=null;const send=(signal,target=null)=>fetch(`/api/mobile-cctv/signal`,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({roomId,clientId:phoneId,signal,target})});peer.onicecandidate=e=>{if(e.candidate&&monitorId)send({kind:'candidate',candidate:e.candidate},monitorId)};peer.onconnectionstatechange=()=>{if(peer.connectionState==='connected')$('#phone-camera-status').textContent='Live — your phone is now shown in CCTV monitoring.';if(peer.connectionState==='failed'){$('#phone-camera-status').textContent='Secure live relay is active; direct video connection is unavailable on this network.';button.disabled=false;button.textContent='Try again'}};stream.getTracks().forEach(track=>peer.addTrack(track,stream));$('#phone-camera-status').textContent='Camera started. Sending secure live relay…';setInterval(async()=>{try{const response=await fetch(`/api/mobile-cctv/signals?roomId=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(phoneId)}&t=${Date.now()}`,{cache:'no-store'});if(!response.ok)return;const {signals}=await response.json();for(const message of signals){const signal=message.signal;if(signal.kind==='monitor-ready'&&!monitorId){monitorId=signal.monitorId;const offer=await peer.createOffer();await peer.setLocalDescription(offer);await send({kind:'offer',sdp:offer},monitorId)}else if(signal.kind==='answer'){await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));for(const candidate of pendingCandidates.splice(0))await peer.addIceCandidate(candidate)}else if(signal.kind==='candidate'){const candidate=new RTCIceCandidate(signal.candidate);if(peer.remoteDescription)await peer.addIceCandidate(candidate);else pendingCandidates.push(candidate)}}}catch{}},800)}catch{button.disabled=false;button.textContent='Start secure camera';$('#phone-camera-status').textContent='Camera permission was not granted. Allow camera access and try again.'}}
function startPhoneFrameRelay(roomId,stream){const preview=$('#phone-camera-preview'),canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const context=canvas.getContext('2d',{alpha:false});let sending=false;setInterval(async()=>{if(sending||preview.readyState<2||document.hidden)return;sending=true;try{context.drawImage(preview,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',.5);await fetch('/api/mobile-cctv/frame',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({roomId,image})});$('#phone-camera-status').textContent='Live — secure camera relay is active.'}catch{}finally{sending=false}},550)}
async function sendCameraSignal(signal){return api('/api/camera/signal',{method:'POST',body:JSON.stringify({roomId:window.cameraRoom,clientId:window.cameraClientId,signal})})}
async function setupPeer(withCamera){window.cameraClientId=crypto.randomUUID();window.peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});window.peer.onicecandidate=e=>{if(e.candidate)sendCameraSignal({kind:'candidate',candidate:e.candidate})};window.peer.ontrack=e=>{const remote=$('#peer-remote');remote.srcObject=e.streams[0];$('#camera-status').textContent='Connected — live teammate camera is visible.'};if(withCamera){window.peerStream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});$('#peer-local').srcObject=window.peerStream;window.peerStream.getTracks().forEach(t=>window.peer.addTrack(t,window.peerStream))}window.cameraPoll=setInterval(pollCameraSignals,1200)}
async function createCameraRoom(){try{const r=await api('/api/camera/room',{method:'POST',body:'{}'});const x=await r.json();window.cameraRoom=x.roomId;await setupPeer(true);const offer=await window.peer.createOffer();await window.peer.setLocalDescription(offer);await sendCameraSignal({kind:'offer',sdp:offer});const link=`${location.origin}${location.pathname}?cameraRoom=${x.roomId}`;$('#camera-invite').classList.remove('hidden');$('#camera-invite').innerHTML=`<b>Room ${x.roomId} created.</b><br><small>Send this link to one verified teammate:</small><input readonly value="${link}"><button id="copy-camera-link">Copy link</button>`;$('#copy-camera-link').onclick=async()=>{await navigator.clipboard.writeText(link);showToast('Secure camera room link copied.')};$('#camera-status').textContent='Camera is live. Waiting for your teammate to join.'}catch(e){showToast('Camera access was not granted. Please allow it in the browser.')}}
async function joinCameraRoom(){const roomId=$('#camera-room-code').value.trim();if(!roomId)return showToast('Enter the teammate camera room code.');try{window.cameraRoom=roomId;await api('/api/camera/room',{method:'POST',body:JSON.stringify({roomId})});await setupPeer(false);$('#camera-status').textContent='Joining camera room — waiting for host connection.'}catch(e){showToast('Could not join this camera room.')}}
async function pollCameraSignals(){if(!window.cameraRoom||!window.peer)return;const r=await api(`/api/camera/signals?roomId=${encodeURIComponent(window.cameraRoom)}&clientId=${encodeURIComponent(window.cameraClientId)}`);if(!r.ok)return;const x=await r.json();for(const item of x.signals){const s=item.signal;if(s.kind==='offer'){await window.peer.setRemoteDescription(new RTCSessionDescription(s.sdp));const answer=await window.peer.createAnswer();await window.peer.setLocalDescription(answer);await sendCameraSignal({kind:'answer',sdp:answer});}else if(s.kind==='answer')await window.peer.setRemoteDescription(new RTCSessionDescription(s.sdp));else if(s.kind==='candidate')await window.peer.addIceCandidate(new RTCIceCandidate(s.candidate));}}
const liveCss=`.feed.demo{min-height:240px;isolation:isolate}.feed.demo:after{content:'';position:absolute;inset:0;z-index:-2;background:radial-gradient(ellipse at 25% 35%,#4c795f 0 6%,transparent 7%),radial-gradient(ellipse at 65% 67%,#759770 0 5%,transparent 6%),linear-gradient(115deg,#0b211c,#1c4a3c 55%,#0e3027);animation:feedShift 7s ease-in-out infinite alternate}.feed video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;background:#102a22}.feed.demo .scan{position:absolute;inset:0;background:linear-gradient(transparent 48%,rgba(211,243,106,.16) 50%,transparent 52%);background-size:100% 12px;opacity:.35;pointer-events:none}.feed .cam-time{position:absolute;left:15px;top:45px;font:11px monospace;letter-spacing:.5px}.feed button{position:absolute;right:14px;top:13px;border:1px solid #ffffff66;background:#143c30cc;color:white;border-radius:6px;padding:6px 8px;font-size:11px;font-weight:bold;cursor:pointer}.feed .camera-start{left:50%;top:50%;right:auto;transform:translate(-50%,-50%);background:#d5f36a;color:#0b3d30;border:0;padding:10px 13px;white-space:nowrap}.feed.camera-active .camera-start{display:none}.feed.camera-active:after{display:none}@keyframes feedShift{from{transform:scale(1) translateX(-1%)}to{transform:scale(1.12) translateX(2%)}}`;const liveStyle=document.createElement('style');liveStyle.textContent=liveCss;document.head.appendChild(liveStyle);
async function assign(siteId,details={}){const r=await api('/api/assign',{method:'POST',body:JSON.stringify({siteId,...details})});const x=await r.json();if(!r.ok)return showToast(x.error||'Could not assign this inspection.');await load();showToast(`Inspection assigned to ${x.inspector}: ${x.assignmentBasis}.`)}
async function startGroundInspection(inspectionId){const button=$(`[data-start-inspection="${inspectionId}"]`);if(button){button.disabled=true;button.textContent='Starting…'}const r=await api('/api/inspections/start',{method:'POST',body:JSON.stringify({inspectionId})}),data=await r.json();if(!r.ok){if(button){button.disabled=false;button.textContent='Start on ground'}return showToast(data.error||'Could not start the inspection.')}await load();showToast('On-ground inspection started. The registered organisation has been notified.')}
$('#close-modal').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};document.addEventListener('click',async e=>{if(e.target.id==='close-form')closeModal();if(e.target.closest('.nav')){state.view=e.target.closest('.nav').dataset.view;render()}if(e.target.closest('#inspection-assign-form')){e.preventDefault();if(e.target.tagName==='BUTTON'&&e.target.type!=='button'){const form=e.target.closest('form'),data=Object.fromEntries(new FormData(form)),method=e.target.value;if(String(data.location||'').startsWith('GPS location'))return showToast('Capture the current GPS location before assigning this inspection.');if(method==='specific'&&!data.inspectorName)return showToast('Select an inspector before using Specific assign.');const button=e.target;button.disabled=true;button.textContent='Assigning…';await assign(data.siteId,{due:data.due,priority:data.priority,notes:data.notes,finding:data.finding,evidence:data.evidence,location:data.location,inspectorName:method==='specific'?data.inspectorName:''});closeModal();state.view='inspections';render()}}if(e.target.closest('#report-form')){e.preventDefault();if(e.target.tagName==='BUTTON'&&e.target.type!=='button'){const f=new FormData(e.target.closest('form'));const data=Object.fromEntries(f);if(String(data.location||'').startsWith('GPS location'))return showToast('Capture the current GPS location before submitting the report.');await api('/api/reports',{method:'POST',body:JSON.stringify(data)});closeModal();state.view='reports';await load();showToast('Verified inspection report submitted')}}if(e.target.closest('#vc-form')){e.preventDefault();if(e.target.tagName==='BUTTON'&&e.target.type!=='button'){const data=Object.fromEntries(new FormData(e.target.closest('form')));await api('/api/vc',{method:'POST',body:JSON.stringify(data)});closeModal();await load();showToast('Secure VC verification request sent')}}});
function showAuth(){
  document.querySelector('#public-portal')?.remove();
  let gate=document.querySelector('#auth-gate'); if(!gate){gate=document.createElement('div');gate.id='auth-gate';document.body.appendChild(gate)}
  gate.innerHTML=`<section class="auth-shell"><div class="auth-panel"><div class="auth-brand"><b>Ｓ</b><span>Saarthi</span></div><div class="auth-copy"><span class="auth-kicker">DEPARTMENT OF SOCIAL JUSTICE & EMPOWERMENT</span><h1>Secure monitoring starts with verified access.</h1><p>Use your official government employee identity to access programme monitoring and inspection workflows.</p><div class="auth-points"><span>✓ Role-based access</span><span>✓ Audit-ready activity</span><span>✓ Protected beneficiary data</span></div></div></div><div class="auth-card"><div id="auth-form"></div></div></section>`;
  authLogin();
}
const authLogin=()=>{$('#auth-form').innerHTML=`<button class="back" id="back-portal">← Back to public portal</button><span class="auth-kicker">SECURE SIGN IN</span><h2>Welcome back</h2><p class="auth-muted">Sign in with your verified government employee account.</p><form id="login-form" class="auth-form"><label>Government Employee ID or email<input name="identifier" value="GOV-2026-1001" placeholder="GOV-2026-1001 or name@gov.in" required></label><label>Password<input name="password" type="password" value="Saarthi@2026" placeholder="Enter your password" required></label><button class="auth-primary">Sign in as default officer</button></form><p class="auth-switch">New government employee? <button id="go-signup">Create verified account</button></p><div class="demo-note"><b>Default government account</b><br><b>Employee ID:</b> GOV-2026-1001<br><b>Government email:</b> arjun.mehta@dosje.gov.in<br><b>Role:</b> PMU Inspector</div>`;$('#login-form').onsubmit=login;$('#go-signup').onclick=authSignup;$('#back-portal').onclick=()=>{$('#auth-gate').remove();showLanding()}};
const authSignup=()=>{$('#auth-form').innerHTML=`<button class="back" id="go-login">← Back to sign in</button><span class="auth-kicker">EMPLOYEE VERIFICATION</span><h2>Create secure access</h2><p class="auth-muted">Your details will be verified through your official government email.</p><form id="signup-form" class="auth-form"><label>Full name<input name="name" placeholder="Your official name" required></label><label>Government Employee ID<input name="employeeId" placeholder="GOV-2026-1002" required></label><label>Official government email<input name="email" type="email" placeholder="name@dosje.gov.in" required></label><label>Create password<input name="password" type="password" minlength="8" placeholder="Minimum 8 characters" required></label><button class="auth-primary">Send verification code</button></form>`;$('#go-login').onclick=authLogin;$('#signup-form').onsubmit=signup};
const localAccounts=()=>JSON.parse(localStorage.getItem('saarthiLocalAccounts')||'[]');
async function login(e){e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const r=await api('/api/auth/login',{method:'POST',body:JSON.stringify(data)}),x=await r.json();if(r.status===404){const accounts=[{name:'Arjun Mehta',email:'arjun.mehta@dosje.gov.in',employeeId:'GOV-2026-1001',password:'Saarthi@2026',role:'PMU Inspector'},...localAccounts()];const user=accounts.find(a=>(a.email.toLowerCase()===data.identifier.toLowerCase()||a.employeeId===data.identifier.toUpperCase())&&a.password===data.password);return user?completeLogin({token:'local-'+crypto.randomUUID(),user:{name:user.name,employeeId:user.employeeId,role:user.role}}):authError('Employee ID/email or password is incorrect.')}if(!r.ok)return authError(x.error);completeLogin(x)}
async function signup(e){e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.employeeId=data.employeeId.trim().toUpperCase().replace(/[ _]+/g,'-');if(!/^GOV-\d{4}-\d{4,}$/.test(data.employeeId))return authError('Use a valid Government Employee ID (for example GOV-2026-1001).');if(!/^[^@]+@(gov\.in|nic\.in|dosje\.gov\.in)$/.test(data.email.toLowerCase()))return authError('Use your authorized government email address.');if(data.password.length<8)return authError('Password must contain at least 8 characters.');const r=await api('/api/auth/signup',{method:'POST',body:JSON.stringify(data)}),x=await r.json();if(r.status===404)return authVerify(data.email,'123456',data);if(!r.ok)return authError(x.error);authVerify(data.email,x.demoCode,data)}
const authVerify=(email,code,pending)=>{$('#auth-form').innerHTML=`<button class="back" id="go-signup">← Edit details</button><span class="auth-kicker">EMAIL VERIFICATION</span><h2>Enter your verification code</h2><p class="auth-muted">A six-digit code was sent to <b>${esc(email)}</b>.</p><form id="verify-form" class="auth-form"><label>Verification code<input name="code" inputmode="numeric" maxlength="6" placeholder="••••••" required></label><button class="auth-primary">Verify and continue</button></form><div class="demo-note">Prototype code: <b>${code}</b>. Production uses an approved NIC/DoSJE identity service.</div>`;$('#go-signup').onclick=authSignup;$('#verify-form').onsubmit=async e=>{e.preventDefault();const entered=new FormData(e.target).get('code');const r=await api('/api/auth/verify',{method:'POST',body:JSON.stringify({email,code:entered})}),x=await r.json();if(r.status===404){if(entered!=='123456')return authError('Invalid verification code.');const user={name:pending.name,email,employeeId:pending.employeeId.toUpperCase(),password:pending.password,role:'Department Official'};const users=localAccounts().filter(a=>a.email!==email);users.push(user);localStorage.setItem('saarthiLocalAccounts',JSON.stringify(users));return completeLogin({token:'local-'+crypto.randomUUID(),user})}if(!r.ok)return authError(x.error);completeLogin(x)}};
function completeLogin(x){sessionStorage.saarthiToken=x.token;sessionStorage.saarthiUser=JSON.stringify(x.user);$('#auth-gate').remove();if(x.user.role==='Project / NGO Administrator'){showPartnerPortal(x.user);startPartnerEvidenceSync();return}load().then(startDashboardSync);showToast(`Verified access granted — ${x.user.role}`)}
function showPartnerAuth(){showAuth();$('#auth-form').innerHTML=`<button class="back" id="back-portal">← Back to public portal</button><span class="auth-kicker">REGISTERED ORGANISATION ACCESS</span><h2>Project / NGO portal</h2><p class="auth-muted">Sign in to register a DoSJE scheme project and keep your project details current.</p><form id="partner-login-form" class="auth-form"><label>DoSJE registration ID or email<input name="identifier" placeholder="NGO/2026/1001 or organisation@email.org" required></label><label>Password<input name="password" type="password" placeholder="Enter your password" required></label><button class="auth-primary">Sign in to organisation portal</button></form><p class="auth-switch">New organisation? <button id="partner-signup">Register organisation</button></p>`;$('#partner-login-form').onsubmit=partnerLogin;$('#partner-signup').onclick=partnerSignup;$('#back-portal').onclick=()=>{$('#auth-gate').remove();showLanding()}}
function partnerSignup(){$('#auth-form').innerHTML=`<button class="back" id="partner-login">← Back to organisation sign in</button><span class="auth-kicker">DOSJE ORGANISATION VERIFICATION</span><h2>Register your organisation</h2><p class="auth-muted">Use the organisation’s DoSJE registration ID and verified email.</p><form id="partner-signup-form" class="auth-form"><label>NGO / institute / project name<input name="organisation" placeholder="Registered organisation name" required></label><label>DoSJE registration ID<input name="registrationId" placeholder="NGO/2026/1001" required></label><label>Organisation email<input name="email" type="email" placeholder="organisation@email.org" required></label><label>Create password<input name="password" type="password" minlength="8" placeholder="Minimum 8 characters" required></label><button class="auth-primary">Send verification code</button></form>`;$('#partner-login').onclick=showPartnerAuth;$('#partner-signup-form').onsubmit=partnerRegister}
async function partnerLogin(e){e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const r=await api('/api/partner/login',{method:'POST',body:JSON.stringify(data)}),x=await r.json();if(!r.ok)return authError(x.error);completeLogin(x)}
async function partnerRegister(e){e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const r=await api('/api/partner/signup',{method:'POST',body:JSON.stringify(data)}),x=await r.json();if(!r.ok)return authError(x.error);$('#auth-form').innerHTML=`<span class="auth-kicker">EMAIL VERIFICATION</span><h2>Verify organisation email</h2><p class="auth-muted">Enter the code sent to <b>${esc(data.email)}</b>.</p><form id="partner-verify-form" class="auth-form"><label>Verification code<input name="code" inputmode="numeric" maxlength="6" required></label><button class="auth-primary">Verify and continue</button></form><div class="demo-note">Prototype verification code: <b>${x.demoCode}</b>. Production uses DoSJE registration validation.</div>`;$('#partner-verify-form').onsubmit=async event=>{event.preventDefault();const code=new FormData(event.target).get('code'),verify=await api('/api/partner/verify',{method:'POST',body:JSON.stringify({email:data.email,code})}),result=await verify.json();if(!verify.ok)return authError(result.error);completeLogin(result)}}
const indiaStates=['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Lakshadweep'];
async function showPartnerPortal(user){let page=document.querySelector('#partner-portal');if(!page){page=document.createElement('div');page.id='partner-portal';document.body.appendChild(page)}const refresh=async()=>{const r=await api('/api/partner/projects',{cache:'no-store'});const data=r.ok?await r.json():{projects:[]};const list=data.projects.length?data.projects.map(project=>`<li><b>${esc(project.name)}</b><span>${esc(project.district)}, ${esc(project.state)} · ${esc(project.scheme)}</span></li>`).join(''):'<li><span>No projects have been registered from this account yet.</span></li>';$('#partner-project-list').innerHTML=list};page.innerHTML=`<main class="partner-shell"><header><div><span class="auth-kicker">DOSJE SCHEME ORGANISATION PORTAL</span><h1>${esc(user.name)}</h1><p>Register project information for Department review. Official dashboards refresh automatically after submission.</p></div><button class="secondary" id="partner-logout">Log out</button></header><section class="partner-grid"><form id="partner-project-form" class="partner-card"><h2>Add a project</h2><label>Project / institute name<input name="name" required></label><label>DoSJE scheme<input name="scheme" placeholder="For example: SMILE" required></label><label>State / UT<select name="state" required><option value="">Select State / UT</option>${indiaStates.map(item=>`<option>${item}</option>`).join('')}</select></label><label>District<input name="district" required></label><div class="partner-coordinates"><span id="partner-location-status">Location optional — capture for a precise map pin.</span><button type="button" class="secondary" id="partner-capture-location">Use my location</button></div><input name="lat" id="partner-lat" type="hidden"><input name="lng" id="partner-lng" type="hidden"><button class="primary">Register project securely</button><p id="partner-result" class="feedback-result"></p></form><section class="partner-card"><h2>Your registered projects</h2><ul id="partner-project-list" class="partner-project-list"></ul></section></section></main>`;$('#partner-logout').onclick=logout;$('#partner-capture-location').onclick=()=>{if(!navigator.geolocation)return showToast('Location is not supported on this device.');$('#partner-location-status').textContent='Capturing GPS…';navigator.geolocation.getCurrentPosition(position=>{const {latitude,longitude,accuracy}=position.coords;$('#partner-lat').value=latitude;$('#partner-lng').value=longitude;$('#partner-location-status').textContent=`GPS pinned: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`},()=>{$('#partner-location-status').textContent='GPS not available. You may still submit the project.'},{enableHighAccuracy:true,timeout:12000,maximumAge:15000})};$('#partner-project-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button.primary');button.disabled=true;button.textContent='Registering…';const r=await api('/api/partner/projects',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}),data=await r.json();button.disabled=false;button.textContent='Register project securely';if(!r.ok){$('#partner-result').textContent=data.error;$('#partner-result').className='feedback-result error';return}$('#partner-result').textContent='Project registered. It is now visible to officials for review.';$('#partner-result').className='feedback-result success';event.currentTarget.reset();$('#partner-location-status').textContent='Location optional — capture for a precise map pin.';refresh()};refresh()}
function showPartnerAuth(){showAuth();$('#auth-form').innerHTML=`<button class="back" id="back-portal">← Back to public portal</button><span class="auth-kicker">REGISTERED ORGANISATION ACCESS</span><h2>Project / NGO portal</h2><p class="auth-muted">Sign in to see your project dashboard, live inspection updates and verified reports.</p><form id="partner-login-form" class="auth-form"><label>DoSJE registration ID or email<input name="identifier" value="NGO/2026/1001" placeholder="NGO/2026/1001 or organisation@email.org" required></label><label>Password<input name="password" type="password" value="Saarthi@2026" placeholder="Enter your password" required></label><button class="auth-primary">Sign in to organisation dashboard</button></form><p class="auth-switch">New organisation? <button id="partner-signup">Register organisation</button></p><div class="demo-note"><b>Default project / NGO account</b><br><b>Registration ID:</b> NGO/2026/1001<br><b>Email:</b> udan@dosje-demo.org<br><b>Password:</b> Saarthi@2026</div>`;$('#partner-login-form').onsubmit=partnerLogin;$('#partner-signup').onclick=partnerSignup;$('#back-portal').onclick=()=>{$('#auth-gate').remove();showLanding()}}
function showPartnerPortal(user){let page=document.querySelector('#partner-portal');if(!page){page=document.createElement('div');page.id='partner-portal';document.body.appendChild(page)}const refresh=async()=>{const response=await api('/api/partner/dashboard',{cache:'no-store'});if(!response.ok)return;const data=await response.json();$('#partner-project-count').textContent=data.stats.projects;$('#partner-active-count').textContent=data.stats.activeInspections;$('#partner-report-count').textContent=data.stats.reports;$('#partner-project-list').innerHTML=data.projects.length?data.projects.map(project=>`<li><b>${esc(project.name)}</b><span>${esc(project.district)}, ${esc(project.state)} · ${esc(project.scheme)}</span><small>${esc(project.risk)} · ${project.camera==='Live'?'CCTV available':'CCTV not connected'}</small></li>`).join(''):'<li><span>No projects have been registered from this account yet.</span></li>';$('#partner-inspection-list').innerHTML=data.inspections.length?data.inspections.map(item=>`<li class="partner-event ${String(item.status).toLowerCase().replace(' ','-')}"><b>${item.status==='In progress'?'● On-ground inspection in progress':item.status==='Completed'?'✓ Inspection completed':'Inspection assigned'}</b><span>${esc(item.site)} · ${esc(item.inspector)}</span><small>${esc(item.status==='In progress'?'The inspection team is currently at the project.':item.status==='Completed'?'Verified report is available below.':`Scheduled: ${item.due}`)}</small></li>`).join(''):'<li><span>No inspection activity yet.</span></li>';$('#partner-report-list').innerHTML=data.reports.length?data.reports.map(report=>`<article class="partner-report"><div><b>${esc(report.id)}</b><span>${new Date(report.submittedAt).toLocaleString('en-IN')}</span></div><strong>${esc(report.site)}</strong><p><b>Finding:</b> ${esc(report.finding)} · <b>Evidence:</b> ${esc(report.evidence)}</p><p>${esc(report.notes||'No additional notes.')}</p><small>GPS: ${esc(report.location||'Not available')}</small></article>`).join(''):'<p class="partner-empty">Verified reports will appear here after the officer submits them.</p>'};page.innerHTML=`<main class="partner-shell"><header><div><span class="auth-kicker">DOSJE SCHEME ORGANISATION PORTAL</span><h1>${esc(user.name)}</h1><p>Project information, inspection status and officer reports in one secure workspace.</p></div><button class="secondary" id="partner-logout">Log out</button></header><section class="partner-stats"><article><span>Your projects</span><b id="partner-project-count">0</b></article><article><span>On-ground / active inspections</span><b id="partner-active-count">0</b></article><article><span>Officer reports</span><b id="partner-report-count">0</b></article></section><section class="partner-grid"><form id="partner-project-form" class="partner-card"><h2>Add a project / NGO</h2><p class="partner-help">After submission, the project appears on the official dashboard automatically for Department review.</p><label>Project / institute name<input name="name" required></label><label>DoSJE scheme<input name="scheme" placeholder="For example: SMILE" required></label><label>State / UT<select name="state" required><option value="">Select State / UT</option>${indiaStates.map(item=>`<option>${item}</option>`).join('')}</select></label><label>District<input name="district" required></label><div class="partner-coordinates"><span id="partner-location-status">Location optional — capture for a precise map pin.</span><button type="button" class="secondary" id="partner-capture-location">Use my location</button></div><input name="lat" id="partner-lat" type="hidden"><input name="lng" id="partner-lng" type="hidden"><button class="primary">Submit project for review</button><p id="partner-result" class="feedback-result"></p></form><section class="partner-card"><h2>Your projects</h2><ul id="partner-project-list" class="partner-project-list"></ul></section></section><section class="partner-activity"><section class="partner-card"><h2>Inspection updates</h2><p class="partner-help">This refreshes automatically when an officer starts the on-ground inspection.</p><ul id="partner-inspection-list" class="partner-project-list"></ul></section><section class="partner-card"><h2>Verified officer reports</h2><div id="partner-report-list"></div></section></section></main>`;$('#partner-logout').onclick=logout;$('#partner-capture-location').onclick=()=>{if(!navigator.geolocation)return showToast('Location is not supported on this device.');$('#partner-location-status').textContent='Capturing GPS…';navigator.geolocation.getCurrentPosition(position=>{const {latitude,longitude,accuracy}=position.coords;$('#partner-lat').value=latitude;$('#partner-lng').value=longitude;$('#partner-location-status').textContent=`GPS pinned: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`},()=>{$('#partner-location-status').textContent='GPS not available. You may still submit the project.'},{enableHighAccuracy:true,timeout:12000,maximumAge:15000})};$('#partner-project-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button.primary');button.disabled=true;button.textContent='Submitting…';const response=await api('/api/partner/projects',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}),data=await response.json();button.disabled=false;button.textContent='Submit project for review';if(!response.ok){$('#partner-result').textContent=data.error;$('#partner-result').className='feedback-result error';return}$('#partner-result').textContent='Project submitted. Officials can now see it on their dashboard.';$('#partner-result').className='feedback-result success';event.currentTarget.reset();$('#partner-location-status').textContent='Location optional — capture for a precise map pin.';refresh()};refresh();clearInterval(window.partnerDashboardSync);window.partnerDashboardSync=setInterval(refresh,5000)}
async function syncPartnerEvidence(){const response=await api('/api/partner/dashboard',{cache:'no-store'});if(!response.ok)return;const data=await response.json(),host=$('.partner-activity');if(!host)return;let card=$('#partner-grievance-card');if(!card){host.insertAdjacentHTML('beforeend',`<section class="partner-card" id="partner-grievance-card"><h2>Beneficiary grievances & evidence</h2><p class="partner-help">Media evidence is shared with this registered organisation and authorised officials.</p><div id="partner-grievance-list"></div></section>`);card=$('#partner-grievance-card')}$('#partner-grievance-list').innerHTML=data.feedback?.length?data.feedback.map(item=>`<article class="partner-report"><div><b>${esc(item.id)}</b><span>${new Date(item.submittedAt).toLocaleString('en-IN')}</span></div><strong>${esc(item.category)}</strong><p>${esc(item.message)}</p>${evidencePreview(item.evidence)}${item.evidence?`<small>✓ ${esc(item.evidence.integrity)} · ${esc(item.evidence.serverHash.slice(0,16))}…</small>`:''}</article>`).join(''):'<p class="partner-empty">No beneficiary grievances have been shared with this organisation.</p>'}
function startPartnerEvidenceSync(){clearInterval(window.partnerEvidenceSync);syncPartnerEvidence().catch(()=>{});window.partnerEvidenceSync=setInterval(()=>syncPartnerEvidence().catch(()=>{}),5000)}
function showLanding(){
  let page=document.querySelector('#public-portal');if(!page){page=document.createElement('div');page.id='public-portal';document.body.appendChild(page)}
  page.innerHTML=`<header class="portal-header"><div class="portal-brand"><span class="emblem">☸</span><div><b>सामाजिक न्याय और अधिकारिता विभाग</b><small>Department of Social Justice & Empowerment · Government of India</small></div></div><nav><a href="#about">About</a><a href="#monitoring">Monitoring</a><a href="#grievance">Grievances</a><button id="portal-partner" class="portal-login">NGO / Project Portal</button><button id="portal-login" class="portal-login">Official Login</button><button id="portal-signup" class="portal-signup">Official Sign Up</button></nav></header><main class="portal-main"><section class="portal-hero"><div><span class="flag-label">SMART GOVERNANCE PLATFORM</span><h1>Transparent monitoring.<br><i>Better public service.</i></h1><p>Real-time oversight of DoSJE-supported institutes, projects and NGOs—built for accountability and beneficiary welfare.</p><div class="hero-actions"><button id="hero-login" class="portal-login">Official Login →</button><button id="hero-partner" class="portal-outline">NGO / Project Portal</button><a href="#grievance" class="portal-outline">Share feedback</a></div></div><div class="hero-orbit"><span>☸</span><b>SAARTHI</b><small>Secure · Accountable · Accessible</small></div></section><section id="monitoring" class="portal-stats"><article><b>Live</b><span>Registered project data</span></article><article><b>4</b><span>Authorised phone CCTV slots</span></article><article><b>AI</b><span>Human-reviewed monitoring</span></article><article><b>24×7</b><span>Monitoring support</span></article></section><section id="about" class="portal-info"><div><span class="flag-label">ONE CONNECTED SYSTEM</span><h2>Monitoring that puts people first.</h2><p>Officials can monitor project compliance, conduct inspections, and act on alerts. Registered NGOs and institutes can submit their current project information directly. Beneficiaries can share concerns with the Department.</p></div><div class="info-cards"><article><span>◉</span><b>Live monitoring</b><p>Authorized CCTV, attendance and operational-status oversight.</p></article><article><span>✓</span><b>Fair inspections</b><p>Risk-based, transparent inspection assignments.</p></article><article><span>◎</span><b>Direct grievance access</b><p>Raise issues without depending on the NGO.</p></article></div></section><section id="grievance" class="grievance"><div class="grievance-copy"><span class="flag-label">BENEFICIARY FEEDBACK & GRIEVANCE</span><h2>Your voice matters.</h2><p>Share feedback or a concern about an NGO, project, institute, service, or staff member. Your grievance goes directly to the Department for review.</p><ul><li>You may submit anonymously.</li><li>You will receive a grievance reference number.</li><li>Urgent concerns may trigger a review or surprise inspection.</li></ul></div><form id="feedback-form" class="feedback-form"><h3>Submit feedback</h3><label>Project / NGO / Institute (optional)<input name="ngo" placeholder="Name of project or organisation"></label><label>Type of grievance<select name="category" required><option value="">Select a category</option><option>Service not provided</option><option>Staff misconduct</option><option>Fake attendance / reporting</option><option>Discrimination or harassment</option><option>Other concern</option></select></label><label>Tell us what happened<textarea name="message" placeholder="Write your feedback or grievance here…" required></textarea></label><label class="anonymous"><input type="checkbox" name="anonymous"> Submit anonymously</label><button class="portal-submit">Submit grievance securely</button><p id="feedback-result" class="feedback-result"></p></form></section></main><footer class="portal-footer"><div><b>Saarthi</b> · Smart Real-Time Monitoring & Inspection</div><span>© Department of Social Justice & Empowerment, Government of India</span></footer>`;
  $('#portal-login').onclick=$('#hero-login').onclick=showAuth;$('#portal-signup').onclick=()=>{showAuth();authSignup()};$('#portal-partner').onclick=$('#hero-partner').onclick=showPartnerAuth;const feedbackForm=$('#feedback-form');feedbackForm.querySelector('label').insertAdjacentHTML('afterend',`<label>Beneficiary mobile number <span class="required">*</span><input name="phone" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" placeholder="10-digit mobile number" required><small class="contact-note">Used only by DoSJE to verify and follow up. It is never shown to the NGO.</small></label><label>Evidence type (optional)<select name="evidenceType"><option value="">No media</option><option value="image">Photo evidence</option><option value="video">Video evidence</option><option value="audio">Audio evidence</option></select></label><label>Attach evidence (optional)<input name="evidenceFile" type="file" accept="image/*,video/*,audio/*"><small class="contact-note">One photo, video or audio file up to 3 MB. The server records an SHA-256 integrity hash and server receipt time.</small></label>`);feedbackForm.querySelector('.anonymous').innerHTML=`<input type="checkbox" name="anonymous"> Keep my identity hidden from the NGO <small>(DoSJE can still verify this grievance privately.)</small>`;feedbackForm.onsubmit=submitFeedback;
}
const readAsDataUrl=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
const hashFile=async file=>{const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
async function submitFeedback(e){e.preventDefault();const form=e.currentTarget,data=Object.fromEntries(new FormData(form));data.phone=String(data.phone||'').replace(/\D/g,'');const result=$('#feedback-result'),file=data.evidenceFile;delete data.evidenceFile;if(!/^\d{10}$/.test(data.phone)){result.textContent='Enter a valid 10-digit beneficiary mobile number.';result.className='feedback-result error';return}if(file?.size){if(file.size>3_000_000){result.textContent='Evidence must be 3 MB or smaller.';result.className='feedback-result error';return}const selected=String(data.evidenceType||'');if(selected&&!file.type.startsWith(`${selected}/`)){result.textContent=`Select a ${selected} file or change the evidence type.`;result.className='feedback-result error';return}try{result.textContent='Hashing evidence securely…';result.className='feedback-result';data.evidence={name:file.name,type:file.type,data:await readAsDataUrl(file),clientHash:await hashFile(file),capturedAt:new Date().toISOString()}}catch{result.textContent='Could not process this evidence file.';result.className='feedback-result error';return}}else if(data.evidenceType){result.textContent='Choose the evidence file you selected.';result.className='feedback-result error';return}delete data.evidenceType;data.anonymous=Boolean(data.anonymous);const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.status===404){const ref='GRV-'+Math.floor(100000+Math.random()*899999);result.textContent=`Grievance submitted. Your reference number is ${ref}.`;result.className='feedback-result success';form.reset();return}const x=await r.json();if(!r.ok){result.textContent=x.error;result.className='feedback-result error';return}result.textContent=`Grievance submitted securely. Reference number: ${x.reference}.`;result.className='feedback-result success';form.reset()}
function authError(message){const form=$('#auth-form');let error=form.querySelector('.auth-error');if(!error){error=document.createElement('div');error.className='auth-error';form.prepend(error)}error.textContent=message}
const authStyle=document.createElement('style');authStyle.textContent=`#auth-gate{position:fixed;inset:0;z-index:30;background:#eff5f1;font-family:DM Sans,sans-serif}.auth-shell{min-height:100%;display:grid;grid-template-columns:1.1fr .9fr}.auth-panel{background:linear-gradient(145deg,#093b2f,#175a45);color:#fff;padding:58px clamp(35px,8vw,130px);display:flex;flex-direction:column}.auth-brand{font:800 27px Manrope;display:flex;gap:10px;align-items:center}.auth-brand b{color:#0b3d30;background:#d5f36a;padding:5px 8px;border-radius:9px;font-size:16px}.auth-copy{margin:auto 0}.auth-kicker{font:700 10px DM Sans;letter-spacing:1.3px;color:#7cb9a2}.auth-copy h1{font:800 clamp(32px,4vw,54px) Manrope;line-height:1.12;max-width:550px;margin:18px 0}.auth-copy p{font-size:16px;line-height:1.7;color:#c5dbd1;max-width:490px}.auth-points{display:grid;gap:13px;margin-top:36px;color:#e7f5ec;font-size:13px}.auth-card{display:grid;place-items:center;padding:40px}.auth-card>div{width:min(390px,100%)}.auth-card h2{font:800 29px Manrope;margin:10px 0 5px}.auth-muted{color:#6b7774;line-height:1.55;margin:0 0 25px}.auth-form{display:grid;gap:15px}.auth-form label{font-size:12px;font-weight:700;color:#344640;display:grid;gap:7px}.auth-form input{padding:12px;border:1px solid #dbe5e0;border-radius:8px;font:14px DM Sans}.auth-primary{border:0;background:#167d59;color:#fff;padding:13px;border-radius:8px;font:700 14px DM Sans;cursor:pointer;margin-top:4px}.auth-switch{text-align:center;color:#6b7774;font-size:13px;margin-top:22px}.auth-switch button,.back{border:0;background:transparent;color:#167d59;font-weight:700;cursor:pointer}.back{padding:0;margin-bottom:20px}.demo-note{margin-top:22px;background:#f0f7f3;border-radius:8px;padding:11px;color:#557068;font-size:11px;line-height:1.55}.auth-error{background:#ffebe9;color:#b8312f;padding:9px;border-radius:7px;font-size:12px;margin-bottom:12px}@media(max-width:760px){.auth-shell{grid-template-columns:1fr}.auth-panel{min-height:260px;padding:30px}.auth-copy{margin-top:45px}.auth-copy h1{font-size:30px}.auth-copy p,.auth-points{display:none}.auth-card{padding:34px 25px}}`;document.head.appendChild(authStyle);
const partnerStyle=document.createElement('style');partnerStyle.textContent=`#partner-portal{position:fixed;inset:0;z-index:35;overflow:auto;background:#eff5f1;color:#173b5e;font-family:DM Sans,sans-serif}.partner-shell{max-width:1100px;margin:auto;padding:45px 24px}.partner-shell header{display:flex;justify-content:space-between;gap:20px;align-items:start;margin-bottom:28px}.partner-shell h1{font:800 34px Manrope;margin:8px 0}.partner-shell header p{max-width:620px;color:#5c7280;line-height:1.55}.partner-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(260px,.9fr);gap:20px}.partner-card{background:#fff;padding:25px;border-radius:13px;box-shadow:0 8px 25px #11385814}.partner-card h2{font:800 21px Manrope;margin:0 0 18px}.partner-card form,.partner-card{display:grid;gap:13px}.partner-card label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#344d5c}.partner-card input,.partner-card select{padding:11px;border:1px solid #d6e2e7;border-radius:7px;font:14px DM Sans}.partner-coordinates{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;background:#eef6f0;border-radius:7px;font-size:11px;color:#4c6c5c}.partner-project-list{list-style:none;padding:0;margin:0;display:grid;gap:10px}.partner-project-list li{padding:12px;border-left:3px solid #e87826;background:#fff8f0;border-radius:4px}.partner-project-list b{display:block;font-size:13px}.partner-project-list span{font-size:11px;color:#607382}.dashboard-link{border:0;text-align:left;cursor:pointer;font:inherit;color:inherit;width:100%}.dashboard-link:hover{outline:2px solid #e87826}.map-pending{color:#54758d}@media(max-width:720px){.partner-shell{padding:28px 16px}.partner-shell header,.partner-grid{display:grid;grid-template-columns:1fr}.partner-shell h1{font-size:28px}.partner-coordinates{align-items:start;flex-direction:column}}`;document.head.appendChild(partnerStyle);
const partnerDashboardStyle=document.createElement('style');partnerDashboardStyle.textContent=`.partner-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}.partner-stats article{background:#123b68;color:#fff;padding:18px;border-radius:11px}.partner-stats span{display:block;font-size:11px;color:#c9ddeb}.partner-stats b{display:block;font:800 31px Manrope;margin-top:4px}.partner-activity{display:grid;grid-template-columns:.9fr 1.1fr;gap:20px;margin-top:20px}.partner-help{font-size:12px;color:#63788c;line-height:1.5;margin:-7px 0 4px}.partner-project-list small{display:block;font-size:10px;color:#64798a;margin-top:4px}.partner-event.in-progress{border-left-color:#13804b;background:#edf8ef}.partner-event.completed{border-left-color:#1a5ca8;background:#eef5fb}.ground-live{color:#15854d;font-weight:bold;font-size:11px}.report-ready{color:#1a5ca8;font-weight:bold;font-size:11px}.start-ground{font-size:11px;white-space:nowrap;padding:8px 10px}.partner-report{padding:12px 0;border-bottom:1px solid #dce6eb;color:#445d6e;font-size:12px;line-height:1.45}.partner-report:last-child{border-bottom:0}.partner-report div{display:flex;justify-content:space-between;gap:10px}.partner-report div span,.partner-report small{font-size:10px;color:#718494}.partner-report strong{display:block;color:#173b5e;margin-top:5px}.partner-report p{margin:6px 0}.partner-empty{font-size:12px;color:#718494;margin:0}@media(max-width:720px){.partner-stats,.partner-activity{grid-template-columns:1fr}.partner-stats article{padding:14px}}`;document.head.appendChild(partnerDashboardStyle);
const evidenceStyle=document.createElement('style');evidenceStyle.textContent=`.evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.evidence-card{border:1px solid #dbe6ea;border-radius:10px;padding:14px;background:#fbfdfd}.evidence-card>div{display:flex;justify-content:space-between;gap:8px;align-items:center}.evidence-card>div small{font-size:10px;color:#718494}.evidence-card h3{font-size:14px;margin:12px 0 5px}.evidence-card p{font-size:12px;line-height:1.5;color:#576c78}.evidence-media{display:block;max-width:100%;width:100%;max-height:190px;border-radius:7px;margin-top:10px;background:#101d28}.evidence-media.image{object-fit:cover}.evidence-media.video{object-fit:contain}.evidence-none{display:block;color:#718494;font-size:11px;margin-top:8px}.integrity-note,.integrity-flag{display:block;font-size:10px;line-height:1.55;color:#1e6950;margin-top:10px}.integrity-flag{color:#a56300;margin-top:5px}.integrity-card{margin-top:18px;border-radius:11px;padding:18px;background:#edf5f1;border-left:4px solid #13804b;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.integrity-card h3{grid-column:1/-1;font-size:15px}.integrity-card div{font-size:11px;line-height:1.5;color:#536c64}.integrity-card b,.integrity-card span{display:block}.integrity-card b{color:#174e3d;margin-bottom:3px}@media(max-width:700px){.integrity-card{grid-template-columns:1fr}}`;document.head.appendChild(evidenceStyle);
function showPartnerConfirmation(user,project){
  const page=document.querySelector('#partner-portal');
  if(!page)return;
  page.innerHTML=`<main class="partner-shell"><header><div><span class="auth-kicker">PROJECT SUBMISSION RECEIVED</span><h1>Submitted for Department review</h1><p>${esc(project?.name||'Your project')} has been securely registered. It is now visible to the authorised DoSJE official dashboard.</p></div><button class="secondary" id="partner-logout">Log out</button></header><section class="partner-card partner-confirmation"><h2>What happens next</h2><p>Your organisation dashboard will show inspection updates when an officer begins field verification. Once the officer submits a verified report, it will appear there automatically.</p><div class="form-actions"><button class="secondary" id="view-partner-dashboard">View organisation dashboard</button><button class="primary" id="add-another-project">Add another project</button></div></section></main>`;
  $('#partner-logout').onclick=logout;
  $('#view-partner-dashboard').onclick=()=>showPartnerPortal(user);
  $('#add-another-project').onclick=()=>{showPartnerPortal(user);setTimeout(()=>$('#partner-project-form')?.scrollIntoView({behavior:'smooth',block:'start'}),0)};
}
function showPartnerPortal(user){
  let page=document.querySelector('#partner-portal');
  if(!page){page=document.createElement('div');page.id='partner-portal';document.body.appendChild(page)}
  const refresh=async()=>{
    const response=await api('/api/partner/dashboard',{cache:'no-store'});
    if(!response.ok||!$('#partner-project-count'))return;
    const data=await response.json();
    $('#partner-project-count').textContent=data.stats.projects;
    $('#partner-active-count').textContent=data.stats.activeInspections;
    $('#partner-report-count').textContent=data.stats.reports;
    $('#partner-project-list').innerHTML=data.projects.length?data.projects.map(project=>`<li><b>${esc(project.name)}</b><span>${esc(project.district)}, ${esc(project.state)} · ${esc(project.scheme)}</span><small>${esc(project.risk)} · ${project.camera==='Live'?'CCTV available':'CCTV not connected'}</small></li>`).join(''):'<li><span>No projects have been registered from this account yet.</span></li>';
    $('#partner-inspection-list').innerHTML=data.inspections.length?data.inspections.map(item=>`<li class="partner-event ${String(item.status).toLowerCase().replace(' ','-')}"><b>${item.status==='In progress'?'● On-ground inspection in progress':item.status==='Completed'?'✓ Inspection completed':'Inspection assigned'}</b><span>${esc(item.site)} · ${esc(item.inspector)}</span><small>${esc(item.status==='In progress'?'The inspection team is currently at the project.':item.status==='Completed'?'Verified report is available below.':`Scheduled: ${item.due}`)}</small></li>`).join(''):'<li><span>No inspection activity yet.</span></li>';
    $('#partner-report-list').innerHTML=data.reports.length?data.reports.map(report=>`<article class="partner-report"><div><b>${esc(report.id)}</b><span>${new Date(report.submittedAt).toLocaleString('en-IN')}</span></div><strong>${esc(report.site)}</strong><p><b>Finding:</b> ${esc(report.finding)} · <b>Evidence:</b> ${esc(report.evidence)}</p><p>${esc(report.notes||'No additional notes.')}</p><small>GPS: ${esc(report.location||'Not available')}</small></article>`).join(''):'<p class="partner-empty">Verified reports will appear here after the officer submits them.</p>';
  };
  page.innerHTML=`<main class="partner-shell"><header><div><span class="auth-kicker">DOSJE SCHEME ORGANISATION PORTAL</span><h1>${esc(user.name)}</h1><p>Project information, inspection status and officer reports in one secure workspace.</p></div><button class="secondary" id="partner-logout">Log out</button></header><section class="partner-stats"><article><span>Your projects</span><b id="partner-project-count">0</b></article><article><span>On-ground / active inspections</span><b id="partner-active-count">0</b></article><article><span>Officer reports</span><b id="partner-report-count">0</b></article></section><section class="partner-grid"><form id="partner-project-form" class="partner-card"><h2>Add a project / NGO</h2><p class="partner-help">After submission, the project appears on the official dashboard automatically for Department review.</p><label>Project / institute name<input name="name" required></label><label>DoSJE scheme<input name="scheme" placeholder="For example: SMILE" required></label><label>State / UT<select name="state" required><option value="">Select State / UT</option>${indiaStates.map(item=>`<option>${item}</option>`).join('')}</select></label><label>District<input name="district" required></label><div class="partner-coordinates"><span id="partner-location-status">Location optional — capture for a precise map pin.</span><button type="button" class="secondary" id="partner-capture-location">Use my location</button></div><input name="lat" id="partner-lat" type="hidden"><input name="lng" id="partner-lng" type="hidden"><button class="primary" type="submit">Submit project for review</button><p id="partner-result" class="feedback-result" aria-live="polite"></p></form><section class="partner-card"><h2>Your projects</h2><ul id="partner-project-list" class="partner-project-list"></ul></section></section><section class="partner-activity"><section class="partner-card"><h2>Inspection updates</h2><p class="partner-help">This refreshes automatically when an officer starts the on-ground inspection.</p><ul id="partner-inspection-list" class="partner-project-list"></ul></section><section class="partner-card"><h2>Verified officer reports</h2><div id="partner-report-list"></div></section></section></main>`;
  $('#partner-logout').onclick=logout;
  $('#partner-capture-location').onclick=()=>{
    if(!navigator.geolocation)return showToast('Location is not supported on this device.');
    $('#partner-location-status').textContent='Capturing GPS…';
    navigator.geolocation.getCurrentPosition(position=>{const {latitude,longitude,accuracy}=position.coords;$('#partner-lat').value=latitude;$('#partner-lng').value=longitude;$('#partner-location-status').textContent=`GPS pinned: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`},()=>{$('#partner-location-status').textContent='GPS not available. You may still submit the project.'},{enableHighAccuracy:true,timeout:12000,maximumAge:15000});
  };
  $('#partner-project-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button.primary'),result=$('#partner-result');
    if(form.dataset.submitting==='true')return;
    form.dataset.submitting='true';button.disabled=true;button.textContent='Submitting…';
    try{
      const response=await api('/api/partner/projects',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      const data=await response.json();
      if(!response.ok){result.textContent=data.error||'Could not submit the project. Please try again.';result.className='feedback-result error';return}
      // Redirect only after the API confirms the project was saved.
      showPartnerConfirmation(user,data.project);
    }catch{
      result.textContent='Could not submit the project. Check your connection and try again.';result.className='feedback-result error';
    }finally{
      form.dataset.submitting='false';
      if(document.body.contains(button)){button.disabled=false;button.textContent='Submit project for review'}
    }
  };
  refresh();clearInterval(window.partnerDashboardSync);window.partnerDashboardSync=setInterval(refresh,5000);
}
async function initInspectionMap(){
  const el=$('#inspection-geo-map');
  if(!el)return;
  try{
    await ensureLeaflet();
    const map=L.map(el,{scrollWheelZoom:true,zoomControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,inertia:false,preferCanvas:true}).setView([20.5937,78.9629],5);
    const geo=window.inspectionGeo={map,marker:null,accuracyCircle:null,point:null};
    const error=document.createElement('div');
    error.className='map-service-error hidden';
    error.textContent='Map tiles could not load. GPS capture and the inspection report remain available.';
    el.append(error);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors',crossOrigin:true});
    let tileFailureTimer;
    tiles.on('tileerror',()=>{clearTimeout(tileFailureTimer);tileFailureTimer=setTimeout(()=>error.classList.remove('hidden'),800)});
    tiles.on('load',()=>error.classList.add('hidden')).addTo(map);
    // Keep Leaflet gestures inside the modal instead of scrolling the page behind it.
    el.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
    el.addEventListener('pointerdown',event=>event.stopPropagation());
    requestAnimationFrame(()=>map.invalidateSize({animate:false}));
    setTimeout(()=>map.invalidateSize({animate:false}),180);
    const capture=$('#get-current-location'),center=$('#center-geo-pin'),expand=$('#expand-geo-map'),details=$('#geo-details');
    center.disabled=false;
    center.title='Use device location to center map';
    navigator.permissions?.query?.({name:'geolocation'}).then(permission=>{
      if(permission.state==='denied'&&!geo.point){center.disabled=true;center.title='Capture GPS first — location permission is required'}
    }).catch(()=>{});
    const applyPosition=(position,announce)=>{
      const {latitude,longitude,accuracy}=position.coords,point=[latitude,longitude],capturedAt=new Date(position.timestamp);
      geo.point=point;
      if(geo.marker)geo.marker.setLatLng(point);else geo.marker=L.marker(point,{title:'Verified inspection location'}).addTo(map);
      if(geo.accuracyCircle)geo.accuracyCircle.setLatLng(point).setRadius(accuracy);else geo.accuracyCircle=L.circle(point,{radius:accuracy,color:'#1a5ca8',weight:1,fillColor:'#3d83cf',fillOpacity:.14}).addTo(map);
      geo.marker.bindPopup(`<b>Verified inspection location</b><br>${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>Accuracy: ±${Math.round(accuracy)} m`);
      map.setView(point,16,{animate:false});
      $('#inspection-location').value=`${latitude.toFixed(6)}, ${longitude.toFixed(6)} · accuracy ±${Math.round(accuracy)}m · ${capturedAt.toLocaleString()}`;
      details.innerHTML=`<span class="geo-dot verified">✓</span><span><b>GPS captured</b> · ${latitude.toFixed(6)}, ${longitude.toFixed(6)} · ±${Math.round(accuracy)} m</span>`;
      capture.disabled=false;capture.textContent='↻ Refresh precise GPS';
      center.disabled=false;center.title='Center on captured GPS location';
      if(announce)showToast('Precise GPS location captured and pinned on the map.');
    };
    const requestLocation=(announce=false)=>{
      if(!navigator.geolocation){
        capture.disabled=false;capture.textContent='⌖ Capture precise GPS';
        center.disabled=true;center.title='Capture GPS first — this device does not provide geolocation';
        showToast('This browser does not support GPS location.');return;
      }
      navigator.geolocation.getCurrentPosition(position=>applyPosition(position,announce),locationError=>{
        capture.disabled=false;capture.textContent='⌖ Capture precise GPS';
        center.disabled=true;center.title='Capture GPS first — location permission is required';
        details.innerHTML='<span class="geo-dot error">!</span><span>Location unavailable. Enable device location and capture GPS first.</span>';
        showToast(locationError.code===1?'Location permission was not granted.':'Could not obtain location. Enable GPS and try again.');
      },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
    };
    center.onclick=()=>{
      if(geo.point){map.setView(geo.point,16,{animate:false});geo.marker?.openPopup();return}
      center.disabled=true;center.title='Locating device…';requestLocation(false);
    };
    capture.onclick=()=>{
      capture.disabled=true;capture.textContent='Locating device…';
      details.innerHTML='<span class="geo-dot locating"></span><span>Acquiring high-accuracy GPS signal…</span>';
      requestLocation(true);
    };
    expand.onclick=()=>{
      el.classList.toggle('expanded');
      expand.textContent=el.classList.contains('expanded')?'Collapse map ↙':'Expand map ↗';
      setTimeout(()=>{map.invalidateSize({animate:false});if(geo.point)map.setView(geo.point,16,{animate:false})},120);
    };
  }catch{
    el.innerHTML='<div class="map-fallback">Map service unavailable. GPS coordinates can still be captured and included in the report.</div>';
  }
}
if ($('#date')) {
  $('#date').textContent = typeof window.formatDashboardDateIST === 'function' 
    ? window.formatDashboardDateIST() 
    : new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
if (typeof window.startRelativeTimeTicker === 'function') {
  window.startRelativeTimeTicker();
}
const mobileCctvParams=new URLSearchParams(location.search);if(mobileCctvParams.get('mobileCctv'))showMobileCctvPhone(mobileCctvParams.get('mobileCctv'),mobileCctvParams.get('slot'));else if(sessionStorage.saarthiToken)load();else showLanding();
