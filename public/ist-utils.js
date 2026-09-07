/**
 * Saarthi Client-side IST (Indian Standard Time, UTC+5:30) & Greeting Utilities
 * Ensures all timestamps displayed across the application are standardized to IST.
 */

(function(root) {
  const IST_TIMEZONE = 'Asia/Kolkata';

  function getISTParts(dateInput = new Date()) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;

    try {
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
    } catch (e) {
      // Fallback: manual UTC+5:30 offset
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (330 * 60000));
      return {
        year: ist.getFullYear(),
        month: ist.getMonth() + 1,
        day: ist.getDate(),
        hour: ist.getHours(),
        minute: ist.getMinutes(),
        second: ist.getSeconds()
      };
    }
  }

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

    try {
      return new Intl.DateTimeFormat('en-IN', { ...defaultOptions, ...options }).format(d);
    } catch (e) {
      return d.toLocaleString('en-IN');
    }
  }

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

  function getISTGreeting(name = 'Arjun') {
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

  function formatDashboardDateIST(dateInput = new Date()) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: IST_TIMEZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(d);
    } catch (e) {
      return d.toLocaleDateString('en-IN');
    }
  }

  // Periodic ticker to refresh all timestamp attributes in real time
  function startRelativeTimeTicker(tickCallback) {
    if (window._istRelativeTicker) clearInterval(window._istRelativeTicker);
    const update = () => {
      document.querySelectorAll('[data-timestamp]').forEach(el => {
        const ts = el.getAttribute('data-timestamp');
        if (ts) el.textContent = formatRelativeIST(ts);
      });
      if (typeof tickCallback === 'function') tickCallback();
    };
    window._istRelativeTicker = setInterval(update, 30000); // every 30 seconds
  }

  root.formatToIST = formatToIST;
  root.formatRelativeIST = formatRelativeIST;
  root.getISTGreeting = getISTGreeting;
  root.formatDashboardDateIST = formatDashboardDateIST;
  root.startRelativeTimeTicker = startRelativeTimeTicker;
})(typeof window !== 'undefined' ? window : global);
