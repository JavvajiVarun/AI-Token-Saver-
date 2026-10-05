global.chrome = { storage: { sync: { get: (d, cb) => cb({ ...d, ...(global.SYNC || {}) }) } } };
eval(require('fs').readFileSync(require('path').join(__dirname,'../extension/src/')+'cost.js', 'utf8').replace('const CH_COST', 'global.CH_COST'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  let c = await CH_COST.load();
  ok(c.billing === 'plan', 'default is monthly plan (usage)');
  const stats = { total: 1240000, handoffs: 18, sizeSum: 18 * 44000, summarySum: 18 * 3000, bySite: { claude: 1240000 } };
  ok(CH_COST.valueOf(stats.bySite, stats.total, stats, c) === '≈ 28 extra messages', 'plan: 1.24M saved at 44k typical chat → ' + CH_COST.valueOf(stats.bySite, stats.total, stats, c));
  ok(CH_COST.extraMessages(44000, stats) === '≈ 1 extra message', 'singular → ' + CH_COST.extraMessages(44000, stats));
  ok(CH_COST.extraMessages(5000, stats) === 'under 1 extra message', 'small → ' + CH_COST.extraMessages(5000, stats));
  ok(CH_COST.extraMessages(40000, { handoffs: 0 }) === '≈ 2 extra messages', 'no handoffs yet: uses 20k default size → ' + CH_COST.extraMessages(40000, { handoffs: 0 }));
  ok(Math.round(44200 / CH_COST.avgSummary(stats)) === 15, 'current chat 44k ÷ 3k summary → ~15 fresh-chat messages');
  global.SYNC = { billing: 'api' }; c = await CH_COST.load();
  ok(CH_COST.valueOf(stats.bySite, stats.total, stats, c) === '≈ $2.48', 'api mode: → ' + CH_COST.valueOf(stats.bySite, stats.total, stats, c));
  global.SYNC = { billing: 'api', currency: 'INR' }; c = await CH_COST.load();
  ok(CH_COST.valueOf(stats.bySite, stats.total, stats, c) === '≈ ₹238', 'api mode in rupees → ' + CH_COST.valueOf(stats.bySite, stats.total, stats, c));
})();
