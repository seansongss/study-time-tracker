function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function last7Dates() {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function getData() {
  return chrome.storage.local.get({ log: {}, courses: [] });
}

function render(list, courses, totalsByCourse) {
  list.innerHTML = "";
  const entries = Object.entries(totalsByCourse).sort((a, b) => b[1] - a[1]);
  const empty = document.getElementById("empty");
  if (!entries.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const colorById = {};
  courses.forEach(c => colorById[c.id || c.name] = c.color || "#6366f1");

  for (const [cid, minutes] of entries) {
    const li = document.createElement("li");
    li.className = "card";
    li.innerHTML = `
      <div class="left">
        <span class="badge" style="background:${colorById[cid] || "#6366f1"}"></span>
        <span class="name">${(courses.find(c => (c.id || c.name) === cid)?.name) || cid}</span>
      </div>
      <span class="time">${fmtMin(minutes)}</span>
    `;
    list.appendChild(li);
  }
}

async function showToday() {
  document.getElementById("todayBtn").classList.add("active");
  document.getElementById("weekBtn").classList.remove("active");

  const list = document.getElementById("summary");
  const { log, courses } = await getData();
  const key = new Date().toISOString().slice(0, 10);
  const msMap = log[key] || {};
  const totals = {};
  Object.entries(msMap).forEach(([cid, ms]) => totals[cid] = (ms / 60000));
  render(list, courses, totals);
}

async function showWeek() {
  document.getElementById("weekBtn").classList.add("active");
  document.getElementById("todayBtn").classList.remove("active");

  const list = document.getElementById("summary");
  const { log, courses } = await getData();
  const ds = last7Dates();
  const totals = {};
  for (const d of ds) {
    const m = log[d] || {};
    for (const [cid, ms] of Object.entries(m)) {
      totals[cid] = (totals[cid] || 0) + (ms / 60000);
    }
  }
  render(list, courses, totals);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("todayBtn").addEventListener("click", showToday);
  document.getElementById("weekBtn").addEventListener("click", showWeek);

  document.getElementById("reset").addEventListener("click", async () => {
    if (!confirm("Reset all tracked time?")) return;
    await chrome.storage.local.set({ log: {} });
    await showToday();
  });

  document.getElementById("export").addEventListener("click", async () => {
    const blob = await chrome.runtime.sendMessage({ type: "request-export" });
    const url = URL.createObjectURL(new Blob([blob.content], { type: blob.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = blob.filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  showToday();
});
