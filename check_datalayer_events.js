const puppeteer = require('puppeteer');
const config = require('./config.json');
const fs = require('fs');

(async () => {
  // Use robust launch flags and increase protocolTimeout for GitHub Actions/CI
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote'
    ],
    protocolTimeout: 120000 // 2 minutes
  });

  const results = [];

  for (const url of config.urls) {
    const page = await browser.newPage();
    let pageResult = {
      url,
      didomiConsent: false,
      didomiReady: false,
      error: null
    };

    try {
      await page.exposeFunction('eventDetected', (eventName) => {
        if (eventName === 'didomi-consent') pageResult.didomiConsent = true;
        if (eventName === 'didomi-ready') pageResult.didomiReady = true;
      });

      await page.evaluateOnNewDocument(() => {
        window.dataLayer = window.dataLayer || [];
        const originalPush = window.dataLayer.push;
        window.dataLayer.push = function () {
          for (const arg of arguments) {
            if (arg && arg.event) {
              if (typeof window.eventDetected === 'function') {
                window.eventDetected(arg.event);
              }
            }
          }
          return originalPush.apply(this, arguments);
        };
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(8000);

      const initialEvents = await page.evaluate(() => {
        const events = { didomiConsent: false, didomiReady: false };
        if (Array.isArray(window.dataLayer)) {
          for (const obj of window.dataLayer) {
            if (obj && obj.event === 'didomi-consent') events.didomiConsent = true;
            if (obj && obj.event === 'didomi-ready') events.didomiReady = true;
          }
        }
        return events;
      });

      if (initialEvents.didomiConsent) pageResult.didomiConsent = true;
      if (initialEvents.didomiReady) pageResult.didomiReady = true;

      console.log(
        `Checked: ${url} (didomi-consent=${pageResult.didomiConsent}, didomi-ready=${pageResult.didomiReady})`
      );
    } catch (e) {
      pageResult.error = e.message;
      console.log(`❌ Error: ${url} (${e.message})`);
    }
    results.push(pageResult);
    await page.close();
  }

  fs.writeFileSync('report_datalayer_homepages.json', JSON.stringify(results, null, 2));
  let md = `| URL | didomi-consent | didomi-ready | Error |\n| --- | -------------- | ------------ | ----- |\n`;
  for (const res of results) {
    md += `| [${res.url}](${res.url}) | ${res.didomiConsent ? '✅' : '❌'} | ${res.didomiReady ? '✅' : '❌'} | ${res.error ? res.error : ''} |\n`;
  }
  fs.writeFileSync('report_datalayer_homepages.md', md);

  console.log('==== Didomi DataLayer Event Results ====');
  console.log(md);

  await browser.close();
})();
