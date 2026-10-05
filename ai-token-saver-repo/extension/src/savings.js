// Tokens-saved bookkeeping. Everything lives in chrome.storage.local on this device.
//
// How savings are counted (an estimate, shown as such in the popup):
// - When a chat of size C is handed off with a summary of size S, every later message in the
//   new chat re-sends about (C - S) fewer tokens than it would have in the old chat. That
//   difference is the chat's "extra".
// - A continued chat that is handed off again carries its extra forward, so chains add up.
// - Making the handoff costs tokens once: the chat is read again to write the summary (C),
//   the request prompt, the summary itself (S) and sending it into the new chat (S). That cost
//   is paid back from the first messages' savings before anything is added to the total, so the
//   total never goes down.
// - The summary message itself isn't counted; only the messages you send after it.

/* exported chSavings */

const chSavings = (() => {
  const PROMPT_TOKENS = 170;
  const KEEP_DAYS = 60;
  const MAX_LINEAGE = 200;
  const PENDING_LINEAGE_MAX_AGE = 15 * 60 * 1000;

  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  async function get(key, fallback) {
    const r = await chrome.storage.local.get(key);
    return r[key] ?? fallback;
  }

  async function getStats() {
    const s = await get("stats", { total: 0, handoffs: 0, since: null, daily: {}, bySite: {} });
    s.bySite = s.bySite || {};
    return s;
  }

  // daily: { "2026-09-29": { claude: 1200, gemini: 300 } } so each site can be priced separately
  async function addSaved(n, site) {
    if (n <= 0) return;
    const s = await getStats();
    const k = dayKey();
    s.total += n;
    s.bySite[site] = (s.bySite[site] || 0) + n;
    const day = typeof s.daily[k] === "object" && s.daily[k] ? s.daily[k] : {};
    day[site] = (day[site] || 0) + n;
    s.daily[k] = day;
    if (!s.since) s.since = k;
    const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 864e5));
    for (const d of Object.keys(s.daily)) if (d < cutoff) delete s.daily[d];
    await chrome.storage.local.set({ stats: s });
  }

  async function countHandoff(plan) {
    const s = await getStats();
    s.handoffs += 1;
    s.sizeSum = (s.sizeSum || 0) + (plan?.hypothetical || 0);
    s.summarySum = (s.summarySum || 0) + (plan?.summaryTokens || 0);
    if (!s.since) s.since = dayKey();
    await chrome.storage.local.set({ stats: s });
  }

  // Sender side: numbers to carry to the new chat.
  async function planHandoff(convId, actualTokens, summaryTokens) {
    const lineage = await get("lineage", {});
    const carried = lineage[convId]?.extra || 0;
    const hypothetical = actualTokens + carried; // size this chat would be without any handoffs
    return {
      hypothetical,
      summaryTokens,
      extra: Math.max(0, hypothetical - summaryTokens),
      debt: actualTokens + PROMPT_TOKENS + 2 * summaryTokens,
    };
  }

  // Receiver side: the summary landed in a new chat whose ID isn't known until it's sent.
  async function awaitLineage(platform, plan) {
    await chrome.storage.local.set({ pendingLineage: { platform, ...plan, ts: Date.now() } });
    await countHandoff(plan);
  }

  // Called every tick on a conversation page. Attaches a pending handoff to the new chat once it
  // has an ID, then credits savings as new messages are sent.
  async function track(platform, convId, userMessageCount) {
    if (!convId) return;
    let lineage = await get("lineage", {});
    let entry = lineage[convId];

    if (!entry) {
      const p = await get("pendingLineage", null);
      if (!p || p.platform !== platform) return;
      if (Date.now() - p.ts > PENDING_LINEAGE_MAX_AGE) { await chrome.storage.local.remove("pendingLineage"); return; }
      if (userMessageCount > 2) return; // an older chat, not the one we just created
      entry = { extra: p.extra, debt: p.debt, seen: userMessageCount, at: Date.now() };
      lineage[convId] = entry;
      const ids = Object.keys(lineage);
      if (ids.length > MAX_LINEAGE) ids.sort((a, b) => lineage[a].at - lineage[b].at).slice(0, ids.length - MAX_LINEAGE).forEach((k) => delete lineage[k]);
      await chrome.storage.local.set({ lineage });
      await chrome.storage.local.remove("pendingLineage");
      return;
    }

    // Only count growth. Long chats can drop old messages from the page, so a lower count
    // is ignored rather than treated as new messages later (this can only under-count).
    if (userMessageCount <= entry.seen) return;
    const gain = (userMessageCount - entry.seen) * entry.extra;
    const pay = Math.min(entry.debt, gain);
    entry.debt -= pay;
    entry.seen = userMessageCount;
    entry.at = Date.now();
    lineage[convId] = entry;
    await chrome.storage.local.set({ lineage });
    await addSaved(gain - pay, platform);
  }

  // Sum of a day's entry (older builds stored a plain number).
  const dayTotal = (v) => (typeof v === "number" ? v : Object.values(v || {}).reduce((a, b) => a + b, 0));

  return { getStats, planHandoff, awaitLineage, track, dayKey, dayTotal };
})();
