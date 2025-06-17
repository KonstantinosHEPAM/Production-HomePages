const puppeteer = require('puppeteer');
const config = require('./config.json');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  for (const url of config.urls) {
    const page = await browser.newPage();
    let pageResult = { url, found: {}, missing: [] };
    try {
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
      await page.waitForTimeout(5000);

      const scripts = await page.$$eval('script', els =>
        els.map(e => e.src ? e.src : e.innerHTML)
      );
      for (const snippet of config.scripts) {
        const found = scripts.some(s => s && s.includes(snippet));
        pageResult.found[snippet] = found;
        if (!found) pageResult.missing.push(snippet);
      }
      results.push(pageResult);
      console.log(`✅ Checked: ${url}`);
    } catch (e) {
      pageResult.error = e.message;
      results.push(pageResult);
      console.log(`❌ Error: ${url} (${e.message})`);
    }
    await page.close();
  }

  fs.writeFileSync('report_scripts_fyc.json', JSON.stringify(results, null, 2));
  let md = `| URL | Missing Scripts | Error |\n| --- | --------------- | ----- |\n`;
  for (const res of results) {
    md += `| [${res.url}](${res.url}) | ${res.missing && res.missing.length ? res.missing.join(', ') : 'None'} | ${res.error ? res.error : ''} |\n`;
  }
  fs.writeFileSync('report_scripts_fyc.md', md);
  console.log('==== Script Check Results ====');
  console.log(md);
  await browser.close();
})();
