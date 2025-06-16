const puppeteer = require('puppeteer');
const config = require('./config.json');
const fs = require('fs');

(async () => {
  // Use robust launch flags for GitHub Actions/CI
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote'
    ]
  });

  const results = [];
  for (const url of config.urls) {
    const page = await browser.newPage();
    let pageResult = { url, requiredScripts: [], missingScripts: [], error: null };

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(8000);

      const foundScripts = await page.evaluate(() => {
        return Array.from(document.scripts).map(s => s.src || s.innerText || "");
      });

      for (const scriptPattern of config.requiredScripts) {
        const found = foundScripts.some(scriptSrc =>
          scriptSrc.includes(scriptPattern)
        );
        if (found) {
          pageResult.requiredScripts.push(scriptPattern);
        } else {
          pageResult.missingScripts.push(scriptPattern);
        }
      }

      console.log(
        `Checked: ${url} | Found: ${pageResult.requiredScripts.join(', ')} | Missing: ${pageResult.missingScripts.join(', ')}`
      );
    } catch (e) {
      pageResult.error = e.message;
      console.log(`❌ Error: ${url} (${e.message})`);
    }
    results.push(pageResult);
    await page.close();
  }

  fs.writeFileSync('report_scripts_homepages.json', JSON.stringify(results, null, 2));

  let md = `| URL | Found Scripts | Missing Scripts | Error |\n| --- | ------------- | -------------- | ----- |\n`;
  for (const res of results) {
    md += `| [${res.url}](${res.url}) | ${res.requiredScripts.join(', ') || '-'} | ${res.missingScripts.join(', ') || '-'} | ${res.error ? res.error : ''} |\n`;
  }
  fs.writeFileSync('report_scripts_homepages.md', md);

  console.log('==== Scripts Check Results ====');
  console.log(md);

  await browser.close();
})();
