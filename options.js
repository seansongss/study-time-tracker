function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

const AUTOSAVE_DEBOUNCE_MS = 400;

function loadState() {
  return chrome.storage.local.get({ courses: [], settings: { idleThresholdSec: 60 } });
}
function saveState(state) {
  // Only update courses & settings; leave log intact
  return chrome.storage.local.set(state);
}

// Helpers for active tab URL and path handling
async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "";
}
function isFileUrl(url) {
  return url.startsWith("file://");
}
function filePathFromUrl(url) {
  if (!isFileUrl(url)) return "";
  // Strip file:// and decode
  return decodeURIComponent(url.replace("file://", ""));
}
function dirname(path) {
  if (!path) return "";
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(0, i) : norm;
}
function sitePrefixFromUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + "/"; // sensible default prefix
  } catch {
    return "";
  }
}

// --- UI builders ---
function makeCourseEl(course = { id: "", name: "", color: "#6366f1", folders: [], sites: [] }) {
  const tpl = document.getElementById("courseTpl").content.cloneNode(true);
  const el = tpl.querySelector(".course");
  el.dataset.cid = course.id || course.name || crypto.randomUUID();

  const idInput = el.querySelector('input[data-field="id"]'); idInput.value = course.id || "";
  const nameInput = el.querySelector('input[data-field="name"]'); nameInput.value = course.name || "";
  const colorInput = el.querySelector('input[data-field="color"]'); colorInput.value = course.color || "#6366f1";

  const foldersWrap = el.querySelector(".folders");
  const sitesWrap = el.querySelector(".sites");

  function addFolder(folder = { path: "", includeSubfolders: true, filesOnly: false, files: [] }) {
    const ftpl = document.getElementById("folderTpl").content.cloneNode(true);
    const fEl = ftpl.querySelector(".folder");

    fEl.querySelector('input[data-field="path"]').value = folder.path || "";
    fEl.querySelector('input[data-field="includeSubfolders"]').checked = !!folder.includeSubfolders;
    fEl.querySelector('input[data-field="filesOnly"]').checked = !!folder.filesOnly;

    const filesWrap = fEl.querySelector(".files");

    function addFile(filePath = "") {
      const fileTpl = document.getElementById("fileTpl").content.cloneNode(true);
      const fileEl = fileTpl.querySelector(".file");
      fileEl.querySelector('input[data-field="file"]').value = filePath || "";
      fileEl.querySelector('[data-action="removeFile"]').addEventListener("click", () => {
        fileEl.remove(); autosave();
      });
      filesWrap.appendChild(fileEl);
      autosaveSoon();
    }

    (folder.files || []).forEach(addFile);

    fEl.querySelector('[data-action="addFile"]').addEventListener("click", () => { addFile(""); });
    fEl.querySelector('[data-action="addActiveFile"]').addEventListener("click", async () => {
      const url = await getActiveTabUrl();
      if (!isFileUrl(url)) { alert("Active tab is not a file:// page."); return; }
      addFile(filePathFromUrl(url));
    });
    fEl.querySelector('[data-action="removeFolder"]').addEventListener("click", () => {
      fEl.remove(); autosave();
    });

    // Fill folder path from active file tab (uses its directory)
    const useActiveFolderBtn = el.querySelector('[data-action="useActiveFolder"]');
    if (useActiveFolderBtn && !useActiveFolderBtn._wired) {
      useActiveFolderBtn._wired = true;
      useActiveFolderBtn.addEventListener("click", async () => {
        const url = await getActiveTabUrl();
        if (!isFileUrl(url)) { alert("Active tab is not a file:// page."); return; }
        const p = filePathFromUrl(url);
        const d = dirname(p);
        // Add a new folder block if current has something and we want multiple
        const emptyFolderInputs = $all('.folder input[data-field="path"]', el).filter(i => !i.value.trim());
        const targetInput = emptyFolderInputs[0] || fEl.querySelector('input[data-field="path"]');
        targetInput.value = d;
        autosaveSoon();
      });
    }

    // Autosave on any change inside this folder block
    fEl.addEventListener("input", autosaveSoon);
    fEl.addEventListener("change", autosaveSoon);

    foldersWrap.appendChild(fEl);
    autosaveSoon();
  }

  function addSite(site = { pattern: "" }) {
    const stpl = document.getElementById("siteTpl").content.cloneNode(true);
    const sEl = stpl.querySelector(".site");
    const input = sEl.querySelector('input[data-field="pattern"]');
    input.value = site.pattern || "";

    sEl.querySelector('[data-action="removeSite"]').addEventListener("click", () => {
      sEl.remove(); autosave();
    });
    sEl.querySelector('[data-action="useActiveSite"]').addEventListener("click", async () => {
      const url = await getActiveTabUrl();
      const pref = sitePrefixFromUrl(url);
      if (!pref) { alert("Active tab URL not available."); return; }
      input.value = pref;
      autosaveSoon();
    });

    // Autosave on edits
    sEl.addEventListener("input", autosaveSoon);
    sEl.addEventListener("change", autosaveSoon);

    sitesWrap.appendChild(sEl);
    autosaveSoon();
  }

  (course.folders || []).forEach(addFolder);
  (course.sites || []).forEach(addSite);

  el.querySelector('[data-action="addFolder"]').addEventListener("click", () => addFolder({}));
  el.querySelector('[data-action="addSite"]').addEventListener("click", () => addSite({}));
  el.querySelector('[data-action="addActiveSite"]').addEventListener("click", async () => {
    const url = await getActiveTabUrl();
    const pref = sitePrefixFromUrl(url);
    if (!pref) { alert("Active tab URL not available."); return; }
    addSite({ pattern: pref });
  });
  el.querySelector('[data-action="remove"]').addEventListener("click", () => { el.remove(); autosave(); });

  // Autosave on general edits
  el.addEventListener("input", autosaveSoon);
  el.addEventListener("change", autosaveSoon);

  return el;
}

// Build a course object from DOM. If id/name missing but content exists, derive a sensible id.
function readCourseEl(courseEl) {
  let id = courseEl.querySelector('input[data-field="id"]').value.trim();
  let name = courseEl.querySelector('input[data-field="name"]').value.trim();
  const color = courseEl.querySelector('input[data-field="color"]').value || "#6366f1";

  const folders = $all(".folder", courseEl).map(fEl => ({
    path: fEl.querySelector('input[data-field="path"]').value.trim(),
    includeSubfolders: fEl.querySelector('input[data-field="includeSubfolders"]').checked,
    filesOnly: fEl.querySelector('input[data-field="filesOnly"]').checked,
    files: $all('.file input[data-field="file"]', fEl).map(i => i.value.trim()).filter(Boolean),
  })).filter(f => f.path || f.files.length);

  const sites = $all(".site", courseEl).map(sEl => ({
    pattern: sEl.querySelector('input[data-field="pattern"]').value.trim()
  })).filter(s => s.pattern);

  // Derive a default id/name if user hasn't set them but there is content
  if (!id && !name && (folders.length || sites.length)) {
    if (folders.length && folders[0].path) {
      const segs = folders[0].path.replace(/\\/g, "/").split("/").filter(Boolean);
      const base = segs[segs.length - 1] || "Course";
      id = name = base;
    } else if (sites.length && sites[0].pattern) {
      try {
        const host = new URL(sites[0].pattern).hostname.replace(/^www\./, "");
        id = name = host;
      } catch { id = name = "Course"; }
    } else {
      id = name = "Course";
    }
  }

  return { id: id || name || "Course", name: name || id || "Course", color, folders, sites };
}

// --- Autosave (debounced) ---
let autosaveTimer = null;
function setAutosaveStatus(msg) {
  const el = $("#autosaveStatus");
  if (!el) return;
  el.textContent = msg || "";
  if (msg) setTimeout(() => { if ($("#autosaveStatus").textContent === msg) $("#autosaveStatus").textContent = ""; }, 2000);
}
async function autosave() {
  const wrap = $("#courses");
  const courses = $all(".course", wrap).map(readCourseEl)
    // keep partially-defined courses to avoid accidental deletion
    .filter(c => (c.id || c.name) && (c.folders.length || c.sites.length || true));

  const idle = Math.max(15, Math.min(600, parseInt($("#idle").value || "60", 10)));
  await saveState({ courses, settings: { idleThresholdSec: idle } });
  setAutosaveStatus("Saved");
}
function autosaveSoon() {
  setAutosaveStatus("Saving…");
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, AUTOSAVE_DEBOUNCE_MS);
}

// --- Page init ---
document.addEventListener("DOMContentLoaded", async () => {
  const state = await loadState();
  $("#idle").value = state.settings?.idleThresholdSec ?? 60;

  const wrap = $("#courses");
  (state.courses || []).forEach(c => wrap.appendChild(makeCourseEl(c)));

  $("#addCourse").addEventListener("click", () => { wrap.appendChild(makeCourseEl({})); autosaveSoon(); });

  // Manual Save (optional)
  $("#save").addEventListener("click", autosave);

  // Autosave on global changes
  $("#idle").addEventListener("input", autosaveSoon);
  $("#idle").addEventListener("change", autosaveSoon);
});
