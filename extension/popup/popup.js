/* global chFmtTokens, CH_COST */
const $ = (id) => document.getElementById(id);
const DAY = 864e5;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

$("opts").onclick = () => chrome.runtime.openOptionsPage();
$("howBtn").onclick = () => { const h = $("how"); h.hidden = !h.hidden; $("howBtn").setAttribute("aria-expanded", String(!h.hidden)); };
function period(which) {
  $("bWeek").setAttribute("aria-pressed", String(which === "week"));
  $("bAll").setAttribute("aria-pressed", String(which === "all"));
  $("weekView").hidden = which !== "week"; $("allView").hidden = which !== "all";
}
$("bWeek").onclick = () => period("week");
$("bAll").onclick = () => period("all");

const dayTotal = (v) => (typeof v === "number" ? v : Object.values(v || {}).reduce((a, b) => a + b, 0));
function addSites(into, v) { if (v && typeof v === "object") for (const [k, n] of Object.entries(v)) into[k] = (into[k] || 0) + n; return into; }
let costCfg = null, lastStats = null;

async function renderStats() {
  costCfg = await CH_COST.load();
  const { stats = { total: 0, handoffs: 0, since: null, daily: {}, bySite: {} } } = await chrome.storage.local.get("stats");
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const days = [...Array(7)].map((_, i) => new Date(today - (6 - i) * DAY));
  const week = days.reduce((a, d) => a + dayTotal(stats.daily[dayKey(d)]), 0);
  const weekBySite = days.reduce((acc, d) => addSites(acc, stats.daily[dayKey(d)]), {});
  const prev = [...Array(7)].map((_, i) => new Date(today - (13 - i) * DAY)).reduce((a, d) => a + dayTotal(stats.daily[dayKey(d)]), 0);
  const api = costCfg.billing === "api";
  if (stats.total > 0) {
    const all = CH_COST.valueOf(stats.bySite, stats.total, stats, costCfg);
    $("moneyN").textContent = api ? all : all.replace(/ extra messages?$/, " extra");
    $("moneyL").textContent = api ? "at API prices" : "long messages of usage";
    $("money").hidden = false;
    $("allMoneyN").textContent = all; $("allMoneyN").hidden = false;
    if (week > 0) { $("weekMoneyN").textContent = CH_COST.valueOf(weekBySite, week, stats, costCfg); $("weekMoneyN").hidden = false; }
  }
  $("howValue").textContent = api
    ? "The cost uses each site's API price for input tokens, which you can change in Settings."
    : `An "extra message" is one message at the size your chats usually reach before a handoff (about ${chFmtTokens(CH_COST.avgChat(stats))} tokens for you). Plans don't publish exact limits, but longer chats use up your limit faster, so this is how much further your plan goes.`;
  lastStats = stats;

  $("total").textContent = chFmtTokens(stats.total);
  if (stats.handoffs > 0) {
    const since = stats.since ? new Date(stats.since + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
    $("totalSub").textContent = `across ${stats.handoffs} handoff${stats.handoffs === 1 ? "" : "s"}${since ? " · since " + since : ""}`;
  }
  $("weekN").textContent = chFmtTokens(week);
  const d = $("delta");
  if (prev > 0) { const pct = Math.round(((week - prev) / prev) * 100); d.textContent = `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs last week`; d.className = pct >= 0 ? "up" : ""; }
  else d.textContent = week > 0 ? "your first week" : "";
  $("allN").textContent = chFmtTokens(stats.total);
  $("allSub").textContent = `${stats.handoffs} handoff${stats.handoffs === 1 ? "" : "s"}`;

  const vals = days.map((x) => dayTotal(stats.daily[dayKey(x)])), max = Math.max(1, ...vals);
  const bars = $("bars"); bars.replaceChildren();
  bars.setAttribute("aria-label", "Tokens saved each day for the last 7 days: " + days.map((x, i) => `${x.toLocaleDateString(undefined, { weekday: "short" })} ${chFmtTokens(vals[i])}`).join(", "));
  days.forEach((x, i) => {
    const b = document.createElement("div"); b.className = "b";
    const v = document.createElement("div"); v.className = "bv" + (i === 6 ? " today" : "");
    v.style.height = Math.max(3, (vals[i] / max) * 56) + "px";
    v.title = `${x.toLocaleDateString(undefined, { weekday: "long" })}: ${chFmtTokens(vals[i])} tokens saved`;
    const l = document.createElement("span"); l.textContent = x.toLocaleDateString(undefined, { weekday: "narrow" });
    b.append(v, l); bars.appendChild(b);
  });
}

async function renderChat() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  let s;
  try { s = await chrome.tabs.sendMessage(tab.id, { type: "status" }); } catch { return; }
  if (!s) return;
  $("site").textContent = s.platform; $("site").hidden = false;
  if (!s.inConversation) { $("noChat").textContent = `Open a ${s.platform} conversation to see its size.`; return; }
  $("noChat").hidden = true; $("chat").hidden = false;
  $("chatN").textContent = `~${chFmtTokens(s.tokens)} tokens`;
  $("bar").style.width = Math.min(100, (s.tokens / s.threshold) * 100) + "%";
  const cfg = costCfg || await CH_COST.load();
  const hint = $("hint"); hint.replaceChildren();
  const fresh = CH_COST.avgSummary(lastStats || {});
  const ratio = Math.round(s.tokens / fresh);
  if (cfg.billing === "api" && s.site) {
    hint.textContent = `Each message re-sends ${chFmtTokens(s.tokens)} tokens (≈ ${CH_COST.format(CH_COST.usd({ [s.site]: s.tokens }, cfg), cfg)} at API prices). Continuing in a new chat cuts that to about ${chFmtTokens(fresh)}.`;
  } else if (ratio >= 2) {
    const b = document.createElement("b"); b.textContent = `~${ratio} messages`;
    hint.append("Each message here uses as much of your limit as ", b, " in a fresh chat.");
  } else {
    hint.textContent = `Each message re-sends ${chFmtTokens(s.tokens)} tokens. You'll be asked to continue fresh at ${chFmtTokens(s.threshold)}.`;
  }
  const go = $("go");
  if (s.busy) { go.disabled = true; go.textContent = "Handoff in progress…"; }
  go.onclick = async () => {
    go.disabled = true;
    const r = await chrome.tabs.sendMessage(tab.id, { type: "handoffNow" });
    if (r?.ok) window.close(); else { go.textContent = r?.error || "Something went wrong"; }
  };
}

renderStats().then(renderChat);
