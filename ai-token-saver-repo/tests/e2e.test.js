const { chromium } = require('playwright');
const mock = require('./mock-sites');
const EXT = process.env.EXT || require('path').resolve(__dirname, '../extension');
const CASES = [['claude','claude.ai','/chat/abc'],['chatgpt','chatgpt.com','/c/xyz'],['gemini','gemini.google.com','/app/f00d'],['perplexity','www.perplexity.ai','/search/how-to-partition-abc']];
(async () => {
  let allOk = true;
  for (const [site, host, convPath] of CASES) {
    const ctx = await chromium.launchPersistentContext(require('path').join(require('os').tmpdir(), 'ats-e2e-' + site + Date.now()), { executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chromium', headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
    await ctx.route(`https://${host}/**`, r => r.fulfill({ contentType: 'text/html', body: mock(site, new URL(r.request().url()).pathname) }));
    await new Promise(r => setTimeout(r, 1200));
    const w = ctx.pages().find(p => p.url().includes('welcome.html')); const id = new URL(w.url()).host;
    const page = await ctx.newPage(); let plan = null;
    page.on('console', m => { const t = m.text(); const i = t.indexOf('savings plan: '); if (i >= 0) plan = JSON.parse(t.slice(i + 14)); if (m.type() === 'error') console.log('  [err]', t); });
    await page.goto(`https://${host}${convPath}`);
    const btn = page.locator('#chat-handoff-banner >> text=Summarize & continue');
    await btn.waitFor({ timeout: 10000 });
    const comp = page.locator('#ask-input, [contenteditable="true"]').first();
    await comp.click(); await page.keyboard.type('My next question: add tests?');
    await btn.click();
    const S = mock.SITES[site];
    await page.waitForURL(u => u.pathname === S.newPath || (S.conv.test(u.pathname) && u.pathname !== convPath), { timeout: 40000 });
    await page.waitForFunction(() => (window.sent || []).some(t => t.includes('BigQuery')), null, { timeout: 30000 });
    const sentText = await page.evaluate(() => window.sent.find(t => t.includes('BigQuery')));
    const newUrl = page.url();
    await page.waitForTimeout(3500); // let the extension attach the new chat
    for (let q = 1; q <= 3; q++) {
      const c = page.locator('#ask-input, [contenteditable="true"]').first(); await c.click(); await page.keyboard.type('follow-up ' + q);
      await page.locator('form button').first().click(); await page.waitForTimeout(1800);
    }
    await page.waitForTimeout(3000);
    const ext = await ctx.newPage(); await ext.goto(`chrome-extension://${id}/popup/popup.html`);
    const st = await ext.evaluate(() => chrome.storage.local.get(['stats', 'lineage']));
    const expected = plan ? Math.max(0, 3 * plan.extra - plan.debt) : NaN;
    const checks = { summary: sentText.includes('**BigQuery**') && sentText.includes('```python'), draft: sentText.includes('My next question'),
      newChat: newUrl !== `https://${host}${convPath}`, handoffCounted: st.stats?.handoffs === 1, savedMatches: st.stats?.total === expected, perSite: st.stats?.bySite?.[site] === expected, sizeKept: st.stats?.sizeSum === plan?.hypothetical };
    console.log(site.padEnd(11), 'plan', JSON.stringify(plan), '| saved', st.stats?.total, 'expected', expected, '|', JSON.stringify(checks));
    allOk = allOk && Object.values(checks).every(Boolean);
    await ctx.close();
  }
  console.log(allOk ? 'ALL PASS' : 'FAIL');
})().catch(e => { console.error(e); process.exit(1); });
