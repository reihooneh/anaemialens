// AnaemiaLens behaviour, robustness and security tests, run in a real browser.
//   npm install && npx playwright install chromium && npm test
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = "file://" + path.join(here, "..", "index.html");
const LIGHTS = ["day", "warm", "cool", "dim"];

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log((ok ? "PASS " : "FAIL ") + name + (ok || !detail ? "" : "\n   " + detail));
}

const browser = await chromium.launch();

async function open(width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(PAGE);
  return { page, errors, requests };
}

async function setup(page, { sample, light, correct = true, shaky = false }) {
  await page.click(sample === "healthy" ? "#sA" : "#sB");
  await page.selectOption("#cond", light);
  if ((await page.isChecked("#corr")) !== correct) await page.click("#corr");
  if ((await page.isChecked("#shake")) !== shaky) await page.click("#shake");
  return page.evaluate(() => ({
    verdict: document.getElementById("vTitle").textContent,
    flip: !document.getElementById("flip").hidden,
  }));
}

// 1. The screening result.
{
  const { page, errors } = await open();
  const wrong = [];
  for (const light of LIGHTS) {
    if ((await setup(page, { sample: "healthy", light })).verdict !== "No obvious pallor") wrong.push(`healthy in ${light}`);
    if ((await setup(page, { sample: "pale", light })).verdict !== "Looks pale") wrong.push(`pale in ${light}`);
  }
  check("with lighting correction, both samples are read correctly under all four room lights", wrong.length === 0, wrong.join(", "));

  const uncorrected = await setup(page, { sample: "pale", light: "warm", correct: false });
  check("without correction, a warm bulb hides the pallor (the problem the app solves)", uncorrected.verdict === "No obvious pallor");
  check("the app points out when room light changed the answer", uncorrected.flip);

  const blurred = [];
  for (const light of LIGHTS)
    for (const sample of ["healthy", "pale"])
      if ((await setup(page, { sample, light, shaky: true })).verdict !== "Retake the photo") blurred.push(`${sample} in ${light}`);
  check("a blurred photo always gets 'Retake', never a guess", blurred.length === 0, blurred.join(", "));
  check("no script errors", errors.length === 0, errors.join("; "));
  await page.close();
}

/** Make an image in the browser and upload it, then tap the middle to mark the eyelid. */
async function upload(page, { width, height, colour, name = "photo.png", bytes = null, tap = true }) {
  const buffer = bytes ?? Buffer.from(
    await page.evaluate(({ width, height, colour }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const x = c.getContext("2d");
      x.fillStyle = colour;
      x.fillRect(0, 0, width, height);
      return c.toDataURL("image/png").split(",")[1];
    }, { width, height, colour }),
    "base64",
  );
  await page.setInputFiles("#file", { name, mimeType: name.endsWith(".png") ? "image/png" : "image/jpeg", buffer });
  await page.waitForTimeout(300);
  if (tap) {
    const box = await page.locator("#ov").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  return page.evaluate(() => ({
    verdict: document.getElementById("vTitle").textContent,
    width: document.getElementById("img").width,
    checks: document.getElementById("checks").innerText,
  }));
}

// 2. Uploaded photos.
{
  const { page, errors } = await open();
  const dark = await upload(page, { width: 800, height: 600, colour: "rgb(10,8,8)" });
  check("a photo that is too dark gets 'Retake'", dark.verdict === "Retake the photo" && /Too dark/.test(dark.checks));
  const huge = await upload(page, { width: 6000, height: 4000, colour: "rgb(200,120,120)" });
  check("a very large photo is scaled down to at most 1000 pixels before analysis", huge.width === 1000);
  const fake = await upload(page, { name: "not-a-photo.jpg", bytes: Buffer.from("<script>window.__pwned=1</script>"), tap: false });
  check("a file that is not really an image is rejected cleanly", fake.verdict === "Could not open that photo");
  check("nothing in an uploaded file runs as code", !(await page.evaluate(() => window.__pwned === 1)) && errors.length === 0, errors.join("; "));
  await page.close();
}

// 3. Privacy and security.
{
  const { page, requests } = await open();
  await setup(page, { sample: "pale", light: "warm" });
  await upload(page, { width: 400, height: 300, colour: "rgb(200,120,120)" });
  const offsite = requests.filter((u) => /^https?:/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u));
  check("photos never leave the device: no network requests except the web fonts", offsite.length === 0, offsite.join(", "));
  const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.content);
  check("the Content-Security-Policy forbids all network connections from scripts", /connect-src 'none'/.test(csp));
  check("the Content-Security-Policy blocks plug-ins, base tags and form posts", /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp));
  await page.close();
}

// 4. Phone, tablet and laptop widths.
for (const width of [360, 768, 1280]) {
  const { page } = await open(width);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no sideways scrolling at ${width}px wide`, overflow <= 0, `${overflow}px too wide`);
  await page.close();
}

await browser.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
