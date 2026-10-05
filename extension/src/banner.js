// On-page notification card. Lives in a shadow root so the host site's CSS can't touch it.

/* exported CHBanner, chToast, chFmtTokens */

class CHBanner {
  constructor({ onAccept, onLater, onNever }) {
    this.host = document.createElement("div");
    this.host.id = "chat-handoff-banner";
    this.host.style.cssText = "position:fixed;right:20px;bottom:96px;z-index:2147483647;";
    const root = this.host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .card { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; width: 372px;
          background: #fff; color: #1f1f1f; border: 1px solid #e3e1da; border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0,0,0,.14); padding: 14px 16px; }
        @media (prefers-color-scheme: dark) {
          .card { background: #2a2a28; color: #eeece6; border-color: #44433f; }
          .ghost { color: #c9c6bd !important; }
          .ghost:hover { background: #3a3936 !important; }
        }
        .title { font-weight: 600; margin: 0 0 4px; display: flex; justify-content: space-between; gap: 8px; }
        .tok { font-variant-numeric: tabular-nums; color: #b4561f; }
        .msg { margin: 0 0 12px; opacity: .85; }
        .row { display: flex; gap: 8px; flex-wrap: wrap; }
        button { font: inherit; border: 0; border-radius: 8px; padding: 7px 12px; cursor: pointer; }
        .primary { background: #c96442; color: #fff; font-weight: 600; }
        .primary:hover { background: #b4561f; }
        .ghost { background: transparent; color: #5b5a55; }
        .ghost:hover { background: #f1efe8; }
        .status { display: none; align-items: center; gap: 8px; }
        .spin { width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent;
          border-radius: 50%; animation: s .8s linear infinite; }
        @keyframes s { to { transform: rotate(360deg); } }
        .busy .row, .busy .msg { display: none; }
        .busy .status { display: flex; }
        .err { color: #c0392b; }
      </style>
      <div class="card" role="dialog" aria-live="polite">
        <p class="title"><span>This chat is getting long</span><span class="tok"></span></p>
        <p class="msg">Every new message re-sends the whole conversation, so each reply uses more of your limit.
          Summarize it and continue in a fresh chat?</p>
        <div class="row">
          <button class="primary" data-a="accept">Summarize &amp; continue</button>
          <button class="ghost" data-a="later">Later</button>
          <button class="ghost" data-a="never">Not for this chat</button>
        </div>
        <div class="status"><span class="spin"></span><span class="status-text"></span></div>
      </div>`;
    this.card = root.querySelector(".card");
    this.tok = root.querySelector(".tok");
    this.statusText = root.querySelector(".status-text");
    root.querySelector('[data-a="accept"]').onclick = onAccept;
    root.querySelector('[data-a="later"]').onclick = onLater;
    root.querySelector('[data-a="never"]').onclick = onNever;
  }

  show(tokens) {
    this.tok.textContent = `~${Math.round(tokens / 1000)}k tokens`;
    if (!this.host.isConnected) document.body.appendChild(this.host);
  }

  hide() {
    this.host.remove();
    this.card.classList.remove("busy");
  }

  get visible() {
    return this.host.isConnected;
  }

  status(text, { error = false } = {}) {
    if (!this.host.isConnected) document.body.appendChild(this.host);
    this.card.classList.add("busy");
    this.statusText.textContent = text;
    this.statusText.classList.toggle("err", error);
    this.card.querySelector(".spin").style.display = error ? "none" : "";
  }
}

// Short token counts for display: 950, 3.4k, 44k, 1.24M.
function chFmtTokens(n) {
  n = Math.max(0, Math.round(n || 0));
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e4) return Math.round(n / 1e3) + "k";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

// Small auto-dismissing note at the top of the page. Accepts a string or {title, text, sub}.
function chToast(msg, ms = 6000) {
  const m = typeof msg === "string" ? { text: msg } : msg;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    .t{display:flex;gap:10px;align-items:flex-start;max-width:min(440px,86vw);padding:10px 14px;border-radius:10px;
       font:13.5px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22);
       background:${dark ? "#262624" : "#fff"};color:${dark ? "#eeece6" : "#1f1f1f"};border:1px solid ${dark ? "#3a3935" : "#ecE9e1"}}
    img{width:20px;height:20px;margin-top:1px;flex:none}
    .s{color:${dark ? "#f0833a" : "#c9541a"};font-weight:600;font-size:12.5px;margin-top:2px}
  </style><div class="t"><img alt=""><div><b></b><span></span><div class="s"></div></div></div>`;
  try { root.querySelector("img").src = chrome.runtime.getURL("icons/48.png"); } catch { root.querySelector("img").remove(); }
  root.querySelector("b").textContent = m.title || "";
  root.querySelector("span").textContent = m.text || "";
  const sub = root.querySelector(".s");
  if (m.sub) sub.textContent = m.sub; else sub.remove();
  document.body.appendChild(host);
  setTimeout(() => host.remove(), ms);
}
