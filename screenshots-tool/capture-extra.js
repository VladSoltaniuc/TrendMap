const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:5080/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[type=text]");
  await page.type("input[type=text]", "chatgpt");
  const selects = await page.$$("select");
  await selects[0].select("");
  await selects[1].select("today 5-y");
  await page.click("button[type=submit]");
  await page.waitForSelector(".chart-wrap path.recharts-curve", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  const out = path.resolve(__dirname, "..", "docs", "screenshots", "05-chatgpt-5year.png");
  await page.screenshot({ path: out });
  console.log("saved", out);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
