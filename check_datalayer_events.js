const puppeteer = require('puppeteer');
const config = require('./config.json');
const fs = require('fs');

// Global timeout - if script runs longer than this, force exit
const SCRIPT_TIMEOUT = 12 * 60 * 1000; // 12 minutes
const timeoutHandle = setTimeout(() => {
  console.error('❌ TIMEOUT: Script exceeded 12 minutes - forcing exit');
  process.exit(1);
}, SCRIPT_TIMEOUT);

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 30000
    });
    
    const results = [];

    for (const url of config.urls) {
      let page;
      try {
        page = await browser.newPage();
        page.setDefaultTimeout(25000);
        page.setDefaultNavigationTimeout(25000);
        
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

          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForTimeout(3000);

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

          console.log(`✅ Checked: ${url} (didomi-consent=${pageResult.didomiConsent}, didomi-ready=${pageResult.didomiReady})`);
        } catch (e) {
          pageResult.error = e.message;
          console.log(`❌ Error on ${url}: ${e.message}`);
        }

        results.push(pageResult);
        
      } catch (pageError) {
        console.log(`❌ Failed to process ${url}: ${pageError.message}`);
        results.push({ 
          url, 
          didomiConsent: false, 
          didomiReady: false,
          error: pageError.message 
        });
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (e) {
            console.warn(`Warning: Could not close page: ${e.message}`);
          }
        }
      }
    }

    fs.writeFileSync('report_datalayer_homepages.json', JSON.stringify(results, null, 2));
    let md = `| URL | didomi-consent | didomi-ready | Error |\n| --- | -------------- | ------------ | ----- |\n`;
    for (const res of results) {
      md += `| [${res.url}](${res.url}) | ${res.didomiConsent ? '✅' : '❌'} | ${res.didomiReady ? '✅' : '❌'} | ${res.error ? res.error : ''} |\n`;
    }
    fs.writeFileSync('report_datalayer_homepages.md', md);
    console.log('==== Didomi DataLayer Event Results ====');
    console.log(md);

  } catch (e) {
    console.error('❌ Fatal error:', e.message);
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Warning: Could not close browser:', e.message);
      }
    }
    clearTimeout(timeoutHandle);
  }
})();
