/* global CH_COST */
const DEFAULTS = { enabled: true, thresholdTokens: 20000, autoSend: true, summaryPrompt: "" };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get({ defaultsVersion: 1, thresholdTokens: null }, async ({ defaultsVersion, thresholdTokens }) => {
  if (defaultsVersion < 2) await chrome.storage.sync.set({ autoSend: true, defaultsVersion: 2 });
  if (defaultsVersion < 3) {
    const patch = { defaultsVersion: 3 };
    if (thresholdTokens === 30000) patch.thresholdTokens = 20000;
    await chrome.storage.sync.set(patch);
  }
  load();
});

function load() { chrome.storage.sync.get(DEFAULTS, (s) => {
  $("enabled").checked = s.enabled;
  $("thresholdTokens").value = s.thresholdTokens;
  $("autoSend").checked = s.autoSend;
  $("summaryPrompt").value = s.summaryPrompt;
  $("summaryPrompt").placeholder = "(default handoff prompt)";
});
CH_COST.load().then((c) => {
  (c.billing === "api" ? $("billApi") : $("billPlan")).checked = true;
  $("currency").value = c.currency;
  $("inrRate").value = c.inrRate;
  renderPrices(c.prices);
  syncCostUi();
}); }

function renderPrices(prices) {
  const body = $("prices"); body.replaceChildren();
  for (const site of Object.keys(CH_COST.DEFAULT_PRICES)) {
    const tr = document.createElement("tr");
    const name = document.createElement("td"); name.textContent = CH_COST.SITE_NAMES[site];
    const cell = document.createElement("td");
    const pfx = document.createElement("span"); pfx.className = "pfx"; pfx.textContent = "$";
    const inp = document.createElement("input"); inp.type = "number"; inp.min = "0"; inp.step = "0.01"; inp.className = "price";
    inp.id = "price-" + site; inp.value = prices[site]; inp.setAttribute("aria-label", CH_COST.SITE_NAMES[site] + " price per 1M input tokens");
    cell.append(pfx, inp);
    const basis = document.createElement("td"); basis.className = "basis"; basis.textContent = CH_COST.PRICE_BASIS[site];
    tr.append(name, cell, basis); body.appendChild(tr);
  }
}
function syncCostUi() {
  $("rateWrap").hidden = $("currency").value !== "INR";
  $("costFields").hidden = !$("billApi").checked;
}
$("currency").onchange = syncCostUi;
$("billPlan").onchange = syncCostUi;
$("billApi").onchange = syncCostUi;
$("resetPrices").onclick = () => renderPrices(CH_COST.DEFAULT_PRICES);

$("save").onclick = () => {
  const thresholdTokens = Math.max(2000, parseInt($("thresholdTokens").value, 10) || DEFAULTS.thresholdTokens);
  chrome.storage.sync.set({
    enabled: $("enabled").checked,
    thresholdTokens,
    autoSend: $("autoSend").checked,
    summaryPrompt: $("summaryPrompt").value.trim(),
    billing: $("billApi").checked ? "api" : "plan",
    currency: $("currency").value,
    inrRate: Math.max(1, parseFloat($("inrRate").value) || CH_COST.DEFAULTS.inrRate),
    prices: Object.fromEntries(Object.keys(CH_COST.DEFAULT_PRICES).map((k) => [k, Math.max(0, parseFloat($("price-" + k).value) || 0)])),
  }, () => { $("thresholdTokens").value = thresholdTokens; $("saved").textContent = "Saved"; setTimeout(() => ($("saved").textContent = ""), 1500); });
};
$("reset").onclick = () => { $("summaryPrompt").value = ""; };
