const { GoogleGenAI } = require('@google/genai');

// In-memory conversation sessions: Map<sessionToken, Array<{ role: 'user'|'model', text: string }>>
const userChatSessions = new Map();

function getSessionHistory(token) {
  if (!userChatSessions.has(token)) {
    userChatSessions.set(token, []);
  }
  return userChatSessions.get(token);
}

function clearSessionHistory(token) {
  userChatSessions.delete(token);
}

/**
 * Handle user message, grounding it with live database context
 */
async function handleChatbotMessage({ token, message, dbContext, user }) {
  const history = getSessionHistory(token);
  const cleanMessage = String(message || '').trim();

  if (!cleanMessage) {
    return { error: 'Message cannot be empty.' };
  }

  // Build grounded context
  const contextSummary = `
PROJECTS & SITES OVERVIEW:
${(dbContext.sites || []).map(s => `- [${s.id}] ${s.name}: Scheme: ${s.scheme}, State: ${s.state}, District: ${s.district}, Compliance Score: ${s.score}%, Status: ${s.status}, Attendance: ${s.attendance}%, Risk: ${s.risk}, Inspector: ${s.assignedInspector || 'Unassigned'}`).join('\n')}

RECENT AUDIT LOGS (REAL IMMUTABLE LEDGER):
${(dbContext.logs || []).slice(0, 10).map(l => `- [${l.formattedIST || l.timestamp}] Project ${l.projectName} (${l.projectId}): ${l.actionType} - ${l.description} (by ${l.actorName || l.actor})`).join('\n')}

ACTIVE NOTIFICATIONS & ANOMALIES:
${(dbContext.alerts || []).length ? (dbContext.alerts || []).map(a => `- [${(a.severity || 'WARN').toUpperCase()}] ${a.site || a.projectName}: ${a.text || a.message} (${a.type || a.ruleTriggered})`).join('\n') : 'No active alerts or critical anomalies.'}

CHECKLIST TEMPLATE CATEGORIES:
- Infrastructure (25% weight): Accessibility, safety gear, fire extinguishers.
- Staffing & Attendance (25% weight): Biometric sync, staff registers, in-charge on-site.
- Documentation (25% weight): Financial books, grant utilization, DPDP Act compliance.
- Service Delivery (25% weight): Approved training curriculum, kits/stipends.
`;

  const systemInstruction = `You are SAARTHI AI Assistant, the official AI compliance monitoring advisor for the Department of Social Justice & Empowerment (DoSJE, Government of India - SIH26095).
Your role is to assist PMU inspectors, Department officials, and NGO administrators with:
1. Explaining project compliance scores and breakdown across the 4 key categories (Infrastructure, Staffing & Attendance, Documentation, Service Delivery).
2. Explaining inspection requirements, on-site physical verification, and DPDP compliance.
3. Summarizing recent real audit log actions and immutable trails.
4. Explaining flagged anomalies and safety alerts.

CURRENT USER: ${user?.name || 'Authorized Officer'} (${user?.role || 'PMU Inspector'})

CRITICAL GROUNDING RULES:
- ALWAYS base your answers strictly on the REAL LIVE DATA provided below.
- NEVER invent or hallucinate projects, scores, or log events.
- If the user asks about a specific project (e.g. P-2041 or Udaan Skill Centre), look up its exact score, status, and notes from the context.
- Keep your answers concise, professional, authoritative, and helpful for government oversight.

LIVE SYSTEM DATA CONTEXT:
${contextSummary}
`;

  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  let replyText = '';

  if (apiKey && apiKey.trim() && apiKey !== 'YOUR_GEMINI_API_KEY') {
    try {
      const client = new GoogleGenAI({ apiKey });

      // Build conversation contents including history
      const contents = [];
      // Include system instruction in first prompt or config
      contents.push({
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\n[USER INQUIRY]: ${cleanMessage}` }]
      });

      // Append up to last 4 turns of history
      for (const h of history.slice(-4)) {
        contents.push({
          role: h.role,
          parts: [{ text: h.text }]
        });
      }

      const response = await client.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nPrevious conversation:\n${history.map(h => `${h.role}: ${h.text}`).join('\n')}\n\nUser: ${cleanMessage}` }]
          }
        ]
      });

      replyText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (apiErr) {
      console.warn('[Gemini API Notice]', apiErr.message, '- Using grounded rule-based responder fallback.');
      replyText = generateGroundedFallbackResponse(cleanMessage, dbContext, user);
    }
  } else {
    // Grounded fallback responder using live DB data
    replyText = generateGroundedFallbackResponse(cleanMessage, dbContext, user);
  }

  // Update session history
  history.push({ role: 'user', text: cleanMessage });
  history.push({ role: 'model', text: replyText });
  if (history.length > 20) history.splice(0, history.length - 20);

  return {
    reply: replyText,
    model: apiKey ? modelName : 'saarthi-grounded-engine',
    timestamp: new Date().toISOString()
  };
}

/**
 * Intelligent domain-grounded responder when Gemini API key is absent or offline
 */
function generateGroundedFallbackResponse(query, dbContext, user) {
  const q = query.toLowerCase();
  const sites = dbContext.sites || [];
  const logs = dbContext.logs || [];
  const alerts = dbContext.alerts || [];

  // Match project inquiry by ID or name
  const matchedProject = sites.find(s =>
    q.includes(s.id.toLowerCase()) ||
    q.includes(s.name.toLowerCase()) ||
    s.name.toLowerCase().split(' ').some(w => w.length > 3 && q.includes(w))
  );

  if (matchedProject) {
    return `**${matchedProject.name} (${matchedProject.id})**:\n` +
      `• **Location**: ${matchedProject.district}, ${matchedProject.state} (${matchedProject.scheme} Scheme)\n` +
      `• **Compliance Score**: ${matchedProject.score}% (Risk level: ${matchedProject.risk})\n` +
      `• **Operational Status**: ${matchedProject.status || 'Live'} (Camera: ${matchedProject.camera || 'Connected'})\n` +
      `• **Attendance Rate**: ${matchedProject.attendance}%\n` +
      `• **Assigned Inspector**: ${matchedProject.assignedInspector || 'Arjun Mehta'}\n` +
      `• **Last Inspection**: ${matchedProject.lastInspection || 'Recent'}\n\n` +
      `All checklist categories contribute 25% each to this score (Infrastructure, Staffing & Attendance, Documentation, Service Delivery). Let me know if you would like to review its specific checklist items or inspection logs.`;
  }

  if (q.includes('audit') || q.includes('log') || q.includes('recent') || q.includes('history') || q.includes('activity')) {
    if (!logs.length) {
      return `There are currently no audit log entries recorded in the immutable ledger. Every verified checklist toggle, custom item change, inspection, and status update will be logged with cryptographic integrity and IST timestamps.`;
    }
    const recent = logs.slice(0, 3).map(l =>
      `• **${l.relativeIST || l.formattedIST || 'Recently'}**: Project *${l.projectName}* — ${l.description || l.field} (Action: ${l.actionType} by ${l.actorName || l.actor || 'Inspector'})`
    ).join('\n');
    return `Here is a summary of the most recent audit trail events:\n\n${recent}\n\nAll entries are timestamped in Indian Standard Time (IST) and permanently recorded in the AuditLog collection.`;
  }

  if (q.includes('alert') || q.includes('anomaly') || q.includes('warning') || q.includes('off')) {
    if (!alerts.length) {
      return `Currently, there are no active anomaly alerts. The system continuously evaluates rules such as compliance score drops below 60%, sharp attendance fluctuations (>15%), 0% category compliance, and overdue inspections.`;
    }
    const alertList = alerts.map(a => `• **[${(a.severity || 'WARNING').toUpperCase()}]** ${a.site || a.projectName || 'Project'}: ${a.text || a.message} (${a.type || a.ruleTriggered})`).join('\n');
    return `Active monitoring alerts flagged for official review:\n\n${alertList}\n\nHigh-severity alerts trigger automated email dispatch and require inspector verification.`;
  }

  if (q.includes('checklist') || q.includes('category') || q.includes('categories') || q.includes('weight')) {
    return `The Saarthi compliance checklist is structured into four standardized categories, each strictly rescaled to 25.0% of the overall compliance score:\n` +
      `1. **Infrastructure (25%)**: Physical barrier-free accessibility, emergency exits, and functional fire extinguishers.\n` +
      `2. **Staffing & Attendance (25%)**: Real-time biometric attendance corroboration and physical presence of designated in-charge.\n` +
      `3. **Documentation (25%)**: Updated grant utilization certificates, beneficiary registers, and DPDP-compliant data handling.\n` +
      `4. **Service Delivery (25%)**: Adherence to approved DoSJE curriculum modules and distribution of kits/stipends.\n\n` +
      `Custom checklist items added by inspectors are proportionally normalized within their category so the total always equals 100%.`;
  }

  if (q.includes('attendance') || q.includes('portal') || q.includes('check in') || q.includes('biometric')) {
    return `Saarthi includes a dedicated NGO Attendance Portal. Registered NGO staff record daily attendance with mandatory device GPS geotagging. The compliance dashboard calculates a rolling 30-day attendance score displayed on each project card.`;
  }

  // Default welcome
  return `Hello ${user?.name || 'Officer'}! I am your Saarthi compliance assistant. I have live access to all ${sites.length} registered projects, current audit logs, and anomaly detection feeds. You can ask me:\n` +
    `• "What is the compliance status of Udaan Skill Centre (P-2041)?"\n` +
    `• "Summarize recent audit log activity"\n` +
    `• "Explain the checklist categories and weights"\n` +
    `• "Are there any active anomaly alerts?"`;
}

module.exports = {
  handleChatbotMessage,
  clearSessionHistory
};
