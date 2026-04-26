// Drives a real Chrome via CDP to: load app, type keyword, click search, wait for chart, screenshot.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL || "http://localhost:5080/";
const KEYWORD = process.env.KEYWORD || "bitcoin";
const GEO = process.env.GEO || "US";
const TIMEFRAME = process.env.TIMEFRAME || "today 12-m";
const OUT_DIR = path.resolve(__dirname, "..", "docs", "screenshots");

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    page.on("console", (m) => console.log("[browser]", m.type(), m.text()));
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));

    console.log("→ Loading", URL);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Empty-state screenshot
    await page.waitForSelector("input[type=text]");
    await new Promise((r) => setTimeout(r, 400));
    const empty = path.join(OUT_DIR, "01-empty-state.png");
    await page.screenshot({ path: empty, fullPage: false });
    console.log("✓ saved", empty);

    // Fill the form
    await page.type("input[type=text]", KEYWORD, { delay: 30 });
    const selects = await page.$$("select");
    if (selects.length >= 2) {
      await selects[0].select(GEO);
      await selects[1].select(TIMEFRAME);
    }

    // Filled-but-not-submitted screenshot
    const filled = path.join(OUT_DIR, "02-search-filled.png");
    await page.screenshot({ path: filled, fullPage: false });
    console.log("✓ saved", filled);

    // Submit
    await page.click("button[type=submit]");
    console.log("→ Submitted, waiting for chart…");

    // Wait for the chart wrapper to render (rechart paths)
    await page.waitForSelector(".chart-wrap path.recharts-curve", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 800)); // allow tooltip/legend layout

    const chart = path.join(OUT_DIR, "03-chart-result.png");
    await page.screenshot({ path: chart, fullPage: false });
    console.log("✓ saved", chart);

    // Full page screenshot
    const full = path.join(OUT_DIR, "04-chart-fullpage.png");
    await page.screenshot({ path: full, fullPage: true });
    console.log("✓ saved", full);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
