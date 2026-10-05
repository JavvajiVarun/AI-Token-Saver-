// Show whether the extension is pinned (chrome.action.getUserSettings, Chrome 91+).
const el = document.getElementById("pin"), txt = document.getElementById("pin-text");
async function check() {
  try {
    const { isOnToolbar } = await chrome.action.getUserSettings();
    el.classList.toggle("ok", isOnToolbar);
    txt.textContent = isOnToolbar ? "Pinned. You're all set." : "Not pinned yet";
  } catch { el.style.display = "none"; }
}
check();
setInterval(check, 1500);
