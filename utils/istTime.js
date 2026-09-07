/**
 * Utility functions for Indian Standard Time (IST, UTC+5:30)
 * All database records store timestamps in UTC.
 * This utility converts UTC timestamps to IST for display and business logic.
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Extract time parts in Asia/Kolkata timezone
 */
function getISTParts(dateInput = new Date()) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const partMap = {};
  for (const p of parts) {
    if (p.type !== 'literal') partMap[p.type] = parseInt(p.value, 10);
  }
  return partMap;
}

/**
 * Format any UTC timestamp into standardized IST display format
 * e.g. "07 Sep 2026, 10:35 PM" or custom options
 */
function formatToIST(dateInput, options = {}) {
  if (!dateInput) return 'Recently';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'Recently';

  const defaultOptions = {
    timeZone: IST_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };

  return new Intl.DateTimeFormat('en-IN', { ...defaultOptions, ...options }).format(d);
}

/**
 * Calculate human-readable relative time ("Just now", "2 min ago")
 * accurately relative to the current IST clock.
 */
function formatRelativeIST(dateInput) {
  if (!dateInput) return 'Just now';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'Recently';

  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins} min ago`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return `${hrs} hr ago`;
  }
  if (diffSec < 172800) return 'Yesterday';
  return formatToIST(d, { year: undefined });
}

/**
 * Dynamic Time-of-day greeting based on current IST hour (0-23)
 * - 05:00 - 11:59 -> "Good morning, <name>"
 * - 12:00 - 16:59 -> "Good afternoon, <name>"
 * - 17:00 - 20:59 -> "Good evening, <name>"
 * - 21:00 - 04:59 -> "Working late, <name>"
 */
function getISTGreeting(name = 'Officer') {
  const parts = getISTParts(new Date());
  const hour = parts ? parts.hour : 12;

  let salute = 'Good morning';
  if (hour >= 5 && hour < 12) {
    salute = 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    salute = 'Good afternoon';
  } else if (hour >= 17 && hour < 21) {
    salute = 'Good evening';
  } else {
    salute = 'Working late';
  }

  return `${salute}, ${name}`;
}

/**
 * Helper to log both UTC and converted IST on server startup
 */
function logServerTime() {
  const now = new Date();
  console.log(`[Clock Audit] Raw UTC:   ${now.toISOString()}`);
  console.log(`[Clock Audit] Local IST: ${formatToIST(now, { seconds: '2-digit' })} (Asia/Kolkata)`);
}

module.exports = {
  IST_TIMEZONE,
  getISTParts,
  formatToIST,
  formatRelativeIST,
  getISTGreeting,
  logServerTime
};
