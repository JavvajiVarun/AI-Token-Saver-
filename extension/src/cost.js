// Cost estimate for saved tokens. Saved tokens are chat history that didn't have to be re-sent,
// i.e. input tokens, so they're priced at each site's API input price (per 1M tokens, in USD).
// Defaults are each site's mid-range model as of September 2026; users can edit them in Settings.

/* exported CH_COST */

const CH_COST = (() => {
  const DEFAULT_PRICES = { claude: 2, chatgpt: 2, gemini: 2, perplexity: 1 };
  const PRICE_BASIS = { claude: "Claude Sonnet 5", chatgpt: "GPT-6 Sol", gemini: "Gemini 3.1 Pro", perplexity: "Sonar" };
  const SITE_NAMES = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity" };
  // billing: "plan" (monthly subscription, the default) shows savings as extra messages of usage;
  // "api" (pay per token) shows what the saved tokens would cost.
  const DEFAULTS = { billing: "plan", currency: "USD", inrRate: 95.87, prices: {} };

  function load() {
    return new Promise((resolve) =>
      chrome.storage.sync.get(DEFAULTS, (s) => resolve({ ...DEFAULTS, ...s, prices: { ...DEFAULT_PRICES, ...(s.prices || {}) } })));
  }

  // tokensBySite: { claude: 12000, gemini: 300 } -> cost in USD
  function usd(tokensBySite, cfg) {
    let total = 0;
    for (const [site, n] of Object.entries(tokensBySite || {})) {
      const price = cfg.prices[site] ?? DEFAULT_PRICES[site] ?? 2;
      total += (n / 1e6) * price;
    }
    return total;
  }

  function format(amountUsd, cfg) {
    if (cfg.currency === "INR") {
      const v = amountUsd * (Number(cfg.inrRate) || DEFAULTS.inrRate);
      if (v > 0 && v < 0.1) return "<₹0.1";
      if (v < 10) return "₹" + v.toFixed(1).replace(/\.0$/, "");
      return "₹" + Math.round(v).toLocaleString("en-IN");
    }
    if (amountUsd > 0 && amountUsd < 0.01) return "<$0.01";
    if (amountUsd < 100) return "$" + amountUsd.toFixed(2);
    return "$" + Math.round(amountUsd).toLocaleString("en-US");
  }

  // Typical chat size at handoff and typical summary size, from the user's own handoffs.
  const avgChat = (stats, fallback = 20000) => (stats.handoffs > 0 && stats.sizeSum ? stats.sizeSum / stats.handoffs : fallback);
  const avgSummary = (stats) => (stats.handoffs > 0 && stats.summarySum ? stats.summarySum / stats.handoffs : 3000);

  // Saved tokens expressed as messages at the user's typical chat size: "≈ 28 extra messages".
  function extraMessages(savedTokens, stats) {
    const n = savedTokens / avgChat(stats);
    if (savedTokens > 0 && n < 1) return "under 1 extra message";
    const r = Math.round(n);
    return `≈ ${r.toLocaleString()} extra message${r === 1 ? "" : "s"}`;
  }

  // What the saved tokens mean for this user: "≈ 28 extra messages" (plan) or "≈ $2.48" (API).
  function valueOf(savedTokensBySite, savedTotal, stats, cfg) {
    return cfg.billing === "api" ? "≈ " + format(usd(savedTokensBySite, cfg), cfg) : extraMessages(savedTotal, stats);
  }

  return { DEFAULT_PRICES, PRICE_BASIS, SITE_NAMES, DEFAULTS, load, usd, format, avgChat, avgSummary, extraMessages, valueOf };
})();
