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
        
        let pageResult = { url, found: {}, missing: [], error: null };
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForTimeout(2000);

          const scripts = await page.$$eval('script', els =>
            els.map(e => e.src ? e.src : e.innerHTML)
          );
          
          for (const snippet of config.scripts) {
            const found = scripts.some(s => s && s.includes(snippet));
            pageResult.found[snippet] = found;
            if (!found) pageResult.missing.push(snippet);
          }
          
          console.log(`✅ Checked: ${url}`);
        } catch (e) {
          pageResult.error = e.message;
          console.log(`❌ Error on ${url}: ${e.message}`);
        }
        
        results.push(pageResult);
        
      } catch (pageError) {
        console.log(`❌ Failed to process ${url}: ${pageError.message}`);
        results.push({ 
          url, 
          found: {}, 
          missing: [], 
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

    fs.writeFileSync('report_scripts_homepages.json', JSON.stringify(results, null, 2));
    let md = `| URL | Missing Scripts | Error |\n| --- | --------------- | ----- |\n`;
    for (const res of results) {
      md += `| [${res.url}](${res.url}) | ${res.missing && res.missing.length ? res.missing.join(', ') : 'None'} | ${res.error ? res.error : ''} |\n`;
    }
    fs.writeFileSync('report_scripts_homepages.md', md);
    console.log('==== Script Check Results ====');
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
