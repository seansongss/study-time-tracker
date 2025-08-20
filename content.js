// content.js — emits tab visibility to background for accurate tracking
function notify() {
  chrome.runtime.sendMessage({ type: "visibility", visible: !document.hidden });
}
document.addEventListener("visibilitychange", notify);
window.addEventListener("focus", notify);
window.addEventListener("blur", notify);
notify();
