// background.js — MV3 Service Worker
// Tracks active time per course for matching file:// paths and website prefixes.
// Uses: tab activation/updates, window focus, idle state, page visibility (from content.js).

const DEFAULT_STATE = {
  courses: [
    // Example shape:
    // {
    //   id: "ECON101",
    //   name: "ECON101",
    //   color: "#3b82f6",
    //   folders: [
    //     { path: "/Users/you/School/ECON101", includeSubfolders: true, filesOnly: false, files: [] }
    //   ],
    //   sites: [
    //     { pattern: "https://chat.openai.com/" },
    //     { pattern: "https://lms.example.edu/course/ECON101" }
    //   ]
    // }
  ],
  // log: { "YYYY-MM-DD": { [courseId]: milliseconds } }
  log: {},
  settings: { idleThresholdSec: 60 }
};

let runtimeState = {
  activeTabId: null,
  activeWindowFocused: true,
  visibleTabIds: new Set(),
  tracking: null, // { courseId, startMs }
  lastUrl: null,
  idleState: "active"
};

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function matchesPrefix(url, prefix) {
  if (!prefix) return false;
  return url.toLowerCase().startsWith(prefix.toLowerCase());
}

function isFileUrl(url) {
  return url.startsWith("file://");
}

async function resolveCourseIdForUrl(url) {
  const { courses = [] } = await chrome.storage.local.get({ courses: [] });

  // Website prefix matches first
  for (const c of courses) {
    if (Array.isArray(c.sites)) {
      for (const s of c.sites) {
        if (s?.pattern && matchesPrefix(url, s.pattern)) return c.id || c.name;
      }
    }
  }

  // file:// path matching
  if (isFileUrl(url)) {
    const path = decodeURIComponent(url.replace("file://", ""));
    const pNorm = path.replace(/\\/g, "/"); // normalize backslashes
    for (const c of courses) {
      if (!Array.isArray(c.folders)) continue;
      for (const f of c.folders) {
        const base = (f?.path || "").trim();
        if (!base) continue;
        const baseNorm = base.replace(/\\/g, "/");
        const filesOnly = !!f.filesOnly;
        const includeSub = !!f.includeSubfolders;

        if (filesOnly) {
          const files = Array.isArray(f.files) ? f.files : [];
          for (const filePath of files) {
            const fileNorm = String(filePath || "").replace(/\\/g, "/");
            if (pNorm.toLowerCase() === fileNorm.toLowerCase()) return c.id || c.name;
          }
        } else {
          if (includeSub) {
            if (pNorm.toLowerCase().startsWith(baseNorm.toLowerCase())) return c.id || c.name;
          } else {
            // same folder only (no deeper)
            const folder = baseNorm.replace(/\/+$/, "");
            const dir = pNorm.substring(0, pNorm.lastIndexOf("/"));
            if (dir.toLowerCase() === folder.toLowerCase()) return c.id || c.name;
          }
        }
      }
    }
  }

  return null;
}

async function saveSlice(courseId, startMs, endMs) {
  const delta = Math.max(0, endMs - startMs);
  if (!delta) return;
  const key = todayKey(startMs);
  const { log = {} } = await chrome.storage.local.get({ log: {} });
  if (!log[key]) log[key] = {};
  if (!log[key][courseId]) log[key][courseId] = 0;
  log[key][courseId] += delta;
  await chrome.storage.local.set({ log });
  updateBadgeCount();
}

async function stopTracking() {
  if (runtimeState.tracking) {
    const now = Date.now();
    await saveSlice(runtimeState.tracking.courseId, runtimeState.tracking.startMs, now);
    runtimeState.tracking = null;
  }
}

async function maybeStartOrSwitch(url) {
  const courseId = await resolveCourseIdForUrl(url);
  if (!courseId) {
    await stopTracking();
    runtimeState.lastUrl = url;
    return;
  }
  if (runtimeState.tracking?.courseId === courseId) {
    runtimeState.lastUrl = url;
    return; // already tracking this course
  }
  await stopTracking();
  runtimeState.tracking = { courseId, startMs: Date.now() };
  runtimeState.lastUrl = url;
}

function computeActive() {
  // active when: window focused, tab visible, not idle/locked
  return (
    runtimeState.activeWindowFocused &&
    runtimeState.visibleTabIds.has(runtimeState.activeTabId) &&
    runtimeState.idleState !== "idle" &&
    runtimeState.idleState !== "locked"
  );
}

async function reevaluateActive(urlIfKnown = null) {
  if (!computeActive()) {
    await stopTracking();
    return;
  }
  const url = urlIfKnown || (await getActiveUrl());
  if (url) await maybeStartOrSwitch(url);
}

async function getActiveUrl() {
  if (runtimeState.activeTabId == null) return null;
  try {
    const tab = await chrome.tabs.get(runtimeState.activeTabId);
    return tab?.url || null;
  } catch {
    return null;
  }
}

// Badge shows today's total minutes
async function updateBadgeCount() {
  const key = todayKey();
  const { log = {} } = await chrome.storage.local.get({ log: {} });
  const totals = log[key] || {};
  let ms = 0;
  for (const v of Object.values(totals)) ms += v || 0;
  const minutes = Math.floor(ms / 60000);
  const text = minutes > 0 ? String(Math.min(minutes, 999)) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
}

// Init
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(null);
  if (!data.courses) await chrome.storage.local.set(DEFAULT_STATE);
  updateBadgeCount();
});

// Track active tab/window focus
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  runtimeState.activeTabId = tabId;
  await reevaluateActive();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === runtimeState.activeTabId && changeInfo.status === "complete") {
    await reevaluateActive(tab.url || null);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === runtimeState.activeTabId) {
    runtimeState.activeTabId = null;
    await stopTracking();
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  runtimeState.activeWindowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  await reevaluateActive();
});

// Visibility events from content script
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg?.type === "visibility") {
    const { tab } = sender;
    if (!tab) return;
    if (msg.visible) runtimeState.visibleTabIds.add(tab.id);
    else runtimeState.visibleTabIds.delete(tab.id);
    await reevaluateActive();
  }
  if (msg?.type === "request-export") {
    const blob = await buildCSVExport();
    sendResponse(blob);
  }
  return true;
});

// Idle tracking
let idleThreshold = 60;
async function refreshIdleThreshold() {
  const { settings = {} } = await chrome.storage.local.get({ settings: { idleThresholdSec: 60 } });
  idleThreshold = settings.idleThresholdSec || 60;
  chrome.idle.setDetectionInterval(Math.max(15, Math.min(600, idleThreshold)));
}
refreshIdleThreshold();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) refreshIdleThreshold();
  if (area === "local" && changes.log) updateBadgeCount();
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  runtimeState.idleState = newState; // 'active' | 'idle' | 'locked'
  await reevaluateActive();
});

// CSV export
async function buildCSVExport() {
  const { log = {}, courses = [] } = await chrome.storage.local.get({ log: {}, courses: [] });
  const nameById = {};
  for (const c of courses) nameById[c.id || c.name] = c.name || c.id;

  const lines = [["date","course","minutes"]];
  for (const [date, perCourse] of Object.entries(log)) {
    for (const [cid, ms] of Object.entries(perCourse)) {
      const minutes = (ms / 60000).toFixed(2);
      lines.push([date, nameById[cid] || cid, minutes]);
    }
  }
  const csv = lines.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  return { mime: "text/csv", filename: "study-time-tracker-export.csv", content: csv };
}
