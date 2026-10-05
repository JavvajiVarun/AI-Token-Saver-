// Main flow: watch conversation size → notify → on accept, ask the chat for a handoff summary,
// open a new chat, and paste the summary there.

/* global CH_ADAPTERS, CHBanner, chToast, chSleep, chWaitFor, chComposerText, chClearComposer,
   chInsertText, chClickSend, chToMarkdown, chLog, chCopy, chSavings, chFmtTokens, CH_COST */

(() => {
  const A = CH_ADAPTERS.find((a) => a.match());
  if (!A) return;

  // If the extension is reloaded without refreshing the tab, the old copy keeps running.
  // The newest copy claims the page; older copies notice and go quiet.
  const INSTANCE = Math.random().toString(36).slice(2);
  document.documentElement.dataset.aiTokenSaver = INSTANCE;
  document.querySelectorAll("#chat-handoff-banner").forEach((n) => n.remove());
  const isLeader = () => document.documentElement.dataset.aiTokenSaver === INSTANCE;

  const DEFAULT_PROMPT = `I'm going to continue this conversation in a new chat because it has become long. Write a handoff summary that I will paste as the first message of the new chat. Address it to the assistant in the new chat so it can pick up exactly where we left off.

Include:
1. Goal: what we're working on and why.
2. Key decisions and conclusions, with the reasoning behind them.
3. Important facts, constraints, preferences, names, numbers and requirements I've given.
4. Current state: the latest version of anything we settled on (code, text, plans). Include code in full if it's under ~150 lines, otherwise the essential parts.
5. Open questions and the next steps.

Leave out small talk, dead ends and anything superseded. Be complete but compact. Output only the summary, no preamble.`;

  const DEFAULTS = {
    enabled: true,
    thresholdTokens: 20000,
    autoSend: true,
    summaryPrompt: DEFAULT_PROMPT,
  };
  const CHARS_PER_TOKEN = 4;
  const PENDING_MAX_AGE_MS = 5 * 60 * 1000;
  const REPLY_TIMEOUT_MS = 4 * 60 * 1000;

  let settings = { ...DEFAULTS };
  let busy = false;
  let lastConv = null;
  const snoozeUntilTokens = {}; // convId -> token count at which to ask again

  const safe = (fn) => (...args) => {
    try { return fn(...args); } catch (e) { /* extension reloaded: context invalidated */ }
  };

  const banner = new CHBanner({
    onAccept: () => handoff(),
    onLater: () => {
      const id = A.conversationId();
      snoozeUntilTokens[id] = estimateTokens() * 1.25;
      banner.hide();
    },
    onNever: safe(async () => {
      const id = A.conversationId();
      const { dismissed = {} } = await chrome.storage.local.get("dismissed");
      dismissed[id] = Date.now();
      const keys = Object.keys(dismissed);
      if (keys.length > 300) keys.sort((a, b) => dismissed[a] - dismissed[b]).slice(0, 100).forEach((k) => delete dismissed[k]);
      await chrome.storage.local.set({ dismissed });
      banner.hide();
    }),
  });

  // ---------- size estimate ----------
  function estimateTokens() {
    const nodes = [...A.userMessages(), ...A.assistantMessages()];
    let chars = 0;
    if (nodes.length) for (const n of nodes) chars += (n.textContent || "").length;
    else chars = (document.querySelector("main")?.textContent || "").length;
    return Math.round(chars / CHARS_PER_TOKEN);
  }

  // ---------- watcher ----------
  const tick = safe(async () => {
    if (!isLeader()) { banner.hide(); return; }
    const id = A.conversationId();
    if (id) await chSavings.track(A.id, id, A.userMessages().length);
    if (busy || !settings.enabled) return;
    if (id !== lastConv) {
      lastConv = id;
      banner.hide();
    }
    if (!id) return;
    const tokens = estimateTokens();
    if (tokens < settings.thresholdTokens || tokens < (snoozeUntilTokens[id] || 0) || A.isStreaming()) {
      if (banner.visible && tokens < settings.thresholdTokens) banner.hide();
      return;
    }
    const { dismissed = {} } = await chrome.storage.local.get("dismissed");
    if (dismissed[id]) return;
    banner.show(tokens);
  });

  // ---------- handoff ----------
  function lastAssistantText() {
    const msgs = A.assistantMessages();
    const last = msgs[msgs.length - 1];
    return last ? chToMarkdown(last) : "";
  }

  function lastAssistantEl() {
    const msgs = A.assistantMessages();
    return msgs[msgs.length - 1] || null;
  }

  // Wait for the reply to our summary request. Long chats can be virtualized (older
  // messages removed from the page), so counting messages isn't reliable. Instead we wait
  // until the newest reply's text differs from what it was before we sent the request,
  // then until it stops changing.
  async function waitForReply(beforeText) {
    const end = Date.now() + REPLY_TIMEOUT_MS;
    let prev = "", stable = 0, polls = 0;
    while (Date.now() < end) {
      await chSleep(700);
      const el = lastAssistantEl();
      const text = el ? chToMarkdown(el) : "";
      const streaming = A.isStreaming();
      const fresh = !!text && text !== beforeText;
      if (++polls % 7 === 0) chLog("waiting for reply:", { fresh, streaming, chars: text.length, stable });
      if (!fresh) continue;
      if (text === prev) stable++;
      else { stable = 0; prev = text; }
      if ((!streaming && stable >= 2) || stable >= 8) return text;
    }
    if (prev.length >= 40) return prev;
    throw new Error("Timed out waiting for the summary");
  }

  function buildHandoff(summary, fromUrl, draft) {
    return [
      "Continuing a previous conversation that got too long. Here is a summary of where we left off. Use it as context and continue from there.",
      "",
      `(Previous chat: ${fromUrl})`,
      "",
      "---",
      summary,
      "---",
      "",
      draft || "",
    ].join("\n").trimEnd() + "\n\n";
  }

  async function handoff() {
    if (busy) return;
    busy = true;
    try {
      const composer = A.composer();
      if (!composer) throw new Error("Couldn't find the message box on this page");
      if (A.isStreaming()) {
        banner.status("Waiting for the current reply to finish…");
        await chWaitFor(() => !A.isStreaming(), { timeout: REPLY_TIMEOUT_MS });
      }

      const tokensAtHandoff = estimateTokens();
      const draft = chComposerText(composer);
      if (draft) chClearComposer(composer);

      banner.status(`Asking ${A.name} for a summary…`);
      chLog("composer:", composer.tagName, composer.id, composer.className);
      const beforeEl = lastAssistantEl();
      const beforeText = beforeEl ? chToMarkdown(beforeEl) : "";
      const usersBefore = A.userMessages().length;
      chLog("before sending:", { lastReplyChars: beforeText.length, userMessages: usersBefore });
      if (!(await chInsertText(composer, settings.summaryPrompt)))
        throw new Error("Couldn't type into the message box");
      await chSleep(400);
      if (!(await chClickSend(A))) throw new Error("Couldn't send the summary request");

      const sent = await chWaitFor(
        () => A.isStreaming() || A.userMessages().length > usersBefore || !chComposerText(A.composer()),
        { timeout: 15000 });
      chLog("summary request sent:", !!sent);
      if (!sent) throw new Error("The summary request didn't send");

      const summary = await waitForReply(beforeText);
      chLog("summary received,", summary.length, "chars");
      if (summary.length < 40) throw new Error("The summary came back empty");

      banner.status("Opening a new chat…");
      const text = buildHandoff(summary, location.href, draft);
      const copied = await chCopy(text); // backup: the summary is on the clipboard if pasting fails
      chLog("copied to clipboard:", copied);
      const plan = await chSavings.planHandoff(A.conversationId(), tokensAtHandoff, Math.round(text.length / CHARS_PER_TOKEN));
      chLog("savings plan:", JSON.stringify(plan));
      await chrome.storage.local.set({ pendingHandoff: { platform: A.id, text, plan, ts: Date.now() } });
      chLog("saved handoff, opening", A.newChatUrl);
      await chSleep(200);
      location.assign(A.newChatUrl);
    } catch (e) {
      chLog("handoff failed:", e);
      busy = false;
      banner.status(`Handoff failed: ${e.message}. Try again from the toolbar icon.`, { error: true });
      setTimeout(() => banner.hide(), 8000);
    }
  }

  // ---------- receiving side (the new chat) ----------
  const receive = safe(async () => {
    const { pendingHandoff: p } = await chrome.storage.local.get("pendingHandoff");
    if (!p || p.platform !== A.id) return;
    chLog("pending handoff found on", location.pathname, "age", Math.round((Date.now() - p.ts) / 1000) + "s");
    if (Date.now() - p.ts > PENDING_MAX_AGE_MS) {
      await chrome.storage.local.remove("pendingHandoff");
      return;
    }
    if (!A.isNewChatPage()) return chLog("not a new-chat page, skipping");
    await chrome.storage.local.remove("pendingHandoff"); // consume once, even if pasting fails
    busy = true;

    const probe = p.text.slice(0, 40);
    const landed = () => chComposerText(A.composer()).includes(probe.trim().slice(0, 25));

    // The site's editor can mount late or be re-created while the page hydrates,
    // wiping what we typed. Insert, wait, check it's still there, and retry if not.
    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      const composer = await chWaitFor(() => A.composer(), { timeout: 20000 });
      if (!composer) break;
      await chSleep(attempt === 1 ? 1200 : 800);
      if (!landed()) {
        chClearComposer(composer);
        await chInsertText(composer, p.text);
      }
      await chSleep(1500);
      ok = landed();
      chLog("paste attempt", attempt, ok ? "stuck" : "was wiped");
    }

    if (p.plan) await chSavings.awaitLineage(A.id, p.plan);
    const stats = await chSavings.getStats();
    const cut = p.plan ? ` Each message now re-sends ~${chFmtTokens(p.plan.summaryTokens)} tokens instead of ${chFmtTokens(p.plan.hypothetical)}.` : "";
    const cost = await CH_COST.load();
    const money = stats.total > 0 ? ` (${CH_COST.valueOf(stats.bySite, stats.total, stats, cost)})` : "";
    const sub = stats.total > 0 ? `You've saved ${chFmtTokens(stats.total)} tokens${money} so far.` : "Savings start adding up from your next message.";
    if (!ok) {
      await chCopy(p.text);
      chToast({ title: "Couldn't paste automatically.", text: "The summary is on your clipboard: click the message box and press Cmd+V." }, 12000);
    } else if (settings.autoSend) {
      await chSleep(400);
      await chClickSend(A);
      chToast({ title: "Summary sent.", text: cut || " Continue the conversation here.", sub }, 8000);
    } else {
      chToast({ title: "Summary pasted.", text: " Add your next question at the end and send." + cut, sub }, 8000);
    }
    busy = false;
  });

  // ---------- popup messages ----------
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === "status") {
      reply({
        platform: A.name,
        site: A.id,
        inConversation: !!A.conversationId(),
        tokens: estimateTokens(),
        threshold: settings.thresholdTokens,
        busy,
      });
    } else if (msg?.type === "handoffNow") {
      if (!A.conversationId()) reply({ ok: false, error: "Open a conversation first" });
      else { handoff(); reply({ ok: true }); }
    }
  });

  // ---------- boot ----------
  // v0.4: auto-send became the default. Flip it once for settings saved by older versions,
  // before loading settings, so the very first handoff after upgrading already uses it.
  // v1.0: the default threshold moved from 30k to 20k (best trade-off in testing).
  // Anyone still on the old default is moved; a custom value is left alone.
  chrome.storage.sync.get({ defaultsVersion: 1, thresholdTokens: null }, async ({ defaultsVersion, thresholdTokens }) => {
    if (defaultsVersion < 2) await chrome.storage.sync.set({ autoSend: true, defaultsVersion: 2 });
    if (defaultsVersion < 3) {
      const patch = { defaultsVersion: 3 };
      if (thresholdTokens === 30000) patch.thresholdTokens = 20000;
      await chrome.storage.sync.set(patch);
    }
    chrome.storage.sync.get(DEFAULTS, (s) => {
      settings = { ...DEFAULTS, ...s, summaryPrompt: (s.summaryPrompt || "").trim() || DEFAULT_PROMPT };
      receive();
      setInterval(tick, 2000);
    });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
    if (!String(settings.summaryPrompt || "").trim()) settings.summaryPrompt = DEFAULT_PROMPT;
  });
})();
