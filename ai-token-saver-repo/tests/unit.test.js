// Unit test of savings.js with an in-memory chrome.storage
const store = {};
global.chrome = { storage: { local: {
  get: async k => typeof k === 'string' ? (k in store ? { [k]: JSON.parse(JSON.stringify(store[k])) } : {}) : {},
  set: async o => Object.assign(store, JSON.parse(JSON.stringify(o))), remove: async k => { delete store[k]; } } } };
eval(require('fs').readFileSync(require('path').join(__dirname,'../extension/src/')+'savings.js', 'utf8').replace('const chSavings', 'global.chSavings'));
const S = global.chSavings, ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  // Chat A: 30k, handed off with a 2k summary -> chat B
  let p = await S.planHandoff('A', 30000, 2000);
  ok(p.extra === 28000 && p.debt === 30000 + 170 + 4000, 'first handoff: extra 28k, debt 34.17k');
  await S.awaitLineage('chatgpt', p);
  await S.track('chatgpt', 'B', 1);                    // summary message lands, chat B gets an ID
  await S.track('chatgpt', 'B', 2);                    // 1st real message: 28k gain, all goes to debt
  ok((await S.getStats()).total === 0, 'first message pays back the handoff cost (total stays 0, never negative)');
  await S.track('chatgpt', 'B', 3);                    // 2nd: 28k gain, 6.17k debt left -> 21.83k net
  ok((await S.getStats()).total === 28000 * 2 - 34170, 'second message: net 21,830 saved');
  await S.track('chatgpt', 'B', 2);                    // old messages dropped off the page: ignored
  await S.track('chatgpt', 'B', 3);
  ok((await S.getStats()).total === 21830, 'count going down/up again is not double counted');
  // Chat B is now 20k on the page and gets handed off again with a 2k summary -> chat C
  p = await S.planHandoff('B', 20000, 2000);
  ok(p.hypothetical === 48000 && p.extra === 46000, 'second handoff carries the first chat forward (48k hypothetical)');
  await S.awaitLineage('chatgpt', p); await S.track('chatgpt', 'C', 1); await S.track('chatgpt', 'C', 3);
  ok((await S.getStats()).total === 21830 + 2 * 46000 - (20000 + 170 + 4000), 'chained savings add up');
  ok((await S.getStats()).handoffs === 2, 'two handoffs counted');
  // A pending handoff must not attach to an old, long chat opened by mistake
  await S.awaitLineage('chatgpt', await S.planHandoff('C', 10000, 1000));
  await S.track('chatgpt', 'OLD', 12);
  ok(!store.lineage.OLD, 'does not attach to an unrelated chat with many messages');
  await S.track('gemini', 'G1', 1);
  ok(!store.lineage.G1, 'does not attach on a different site');
  ok(store.stats.bySite.chatgpt === store.stats.total, 'savings recorded per site'); console.log('daily:', JSON.stringify(store.stats.daily));
})();
