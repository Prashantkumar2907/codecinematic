import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const url = process.argv[2] || 'http://localhost:4321/?demo=1';
  const outPath = process.argv[3] || 'screenshot.png';
  
  console.log(`Connecting to ${url}...`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Devstudio might need a specific viewport for vertical video
  await page.setViewportSize({ width: 1080, height: 1920 });
  
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    // wait a bit for canvas animations to run
    await page.waitForTimeout(2000); 
    await page.screenshot({ path: outPath });
    console.log(`Screenshot saved to ${outPath}`);
  } catch (e) {
    console.error("Failed to take screenshot", e);
  } finally {
    await browser.close();
  }
}

run();