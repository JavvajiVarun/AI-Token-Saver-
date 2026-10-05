global.chrome = { storage: { sync: { get: (d, cb) => cb({ ...d, ...(global.SYNC || {}) }) } } };
eval(require('fs').readFileSync(require('path').join(__dirname,'../extension/src/')+'cost.js', 'utf8').replace('const CH_COST', 'global.CH_COST'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  let c = await CH_COST.load();
  const u = CH_COST.usd({ claude: 1240000 }, c);
  ok(Math.abs(u - 2.48) < 1e-9 && CH_COST.format(u, c) === '$2.48', '1.24M Claude tokens = $2.48 at $2/M → ' + CH_COST.format(u, c));
  ok(CH_COST.format(CH_COST.usd({ perplexity: 1e6, gemini: 5e5 }, c), c) === '$2.00', 'mixed sites: 1M Perplexity ($1) + 0.5M Gemini ($1) = $2.00');
  ok(CH_COST.format(CH_COST.usd({ chatgpt: 1000 }, c), c) === '<$0.01', 'tiny amounts show <$0.01');
  ok(CH_COST.format(CH_COST.usd({ chatgpt: 1e8 }, c), c) === '$200', 'large amounts drop cents → $200');
  global.SYNC = { currency: 'INR' }; c = await CH_COST.load();
  ok(CH_COST.format(u, c) === '₹238', 'INR at 95.87: $2.48 → ' + CH_COST.format(u, c));
  ok(CH_COST.format(CH_COST.usd({ claude: 44000 }, c), c) === '₹8.4', 'one 44k message in INR → ' + CH_COST.format(CH_COST.usd({ claude: 44000 }, c), c));
  ok(CH_COST.format(CH_COST.usd({ claude: 1e9 }, c), c) === '₹1,91,740', 'Indian digit grouping → ' + CH_COST.format(CH_COST.usd({ claude: 1e9 }, c), c));
  global.SYNC = { prices: { claude: 4 } }; c = await CH_COST.load();
  ok(c.prices.claude === 4 && c.prices.gemini === 2 && CH_COST.format(CH_COST.usd({ claude: 1e6 }, c), c) === '$4.00', 'custom price for one site keeps defaults for others');
})();
