const { chromium } = require('playwright');

(async () => {
  const context = await chromium.launchPersistentContext(
    '/Users/ian/Library/Application Support/Google/Chrome/Default',
    {
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
      timeout: 60000,
    }
  );

  const page = await context.newPage();

  async function readDocByClick(name) {
    console.log(`\n========== ${name} ==========`);

    await page.goto('https://alidocs.dingtalk.com/i/nodes/93NwLYZXWyxXroNzCk3jGYKr8kyEqBQm', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(6000);

    // Expand parent folders
    for (const folder of ['商品询盘', '订单询盘']) {
      try {
        await page.getByText(folder, { exact: true }).first().click({ timeout: 3000 });
        await page.waitForTimeout(2000);
      } catch {}
    }

    // Click the target
    try {
      await page.getByText(name, { exact: true }).first().click({ timeout: 5000 });
    } catch {
      console.log(`Could not find "${name}"`);
      return;
    }

    // Wait longer for iframe to fully render
    await page.waitForTimeout(12000);

    // Find the note/doc iframe and wait for article element
    for (const frame of page.frames()) {
      const url = frame.url();
      if (url.includes('note') && (url.includes('preview') || url.includes('edit'))) {
        // Wait for content to appear in iframe
        try {
          await frame.waitForSelector('article', { timeout: 15000 });
        } catch {
          // Try waiting for any content
          await frame.waitForSelector('.ne-doc-major-editor, .ne-viewer-body, .lake-content', { timeout: 10000 }).catch(() => {});
        }

        const content = await frame.evaluate(() => {
          const el = document.querySelector('article') ||
                     document.querySelector('.ne-doc-major-editor') ||
                     document.querySelector('.ne-viewer-body');
          if (el && el.innerText.trim().length > 50) return el.innerText.trim();
          return document.body.innerText.substring(0, 15000);
        }).catch(e => `Error: ${e.message}`);
        console.log(content);
        return;
      }
    }
    console.log('No iframe found');
  }

  const docs = [
    '商品id批量询盘',
    '商品链接询盘',
    '图片询盘',
    '创建订单批量询盘',
  ];

  for (const name of docs) {
    await readDocByClick(name);
  }

  console.log('\n=== ALL DONE ===');
  await context.close();
})();
