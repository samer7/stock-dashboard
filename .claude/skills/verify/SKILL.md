---
name: verify
description: Verify a frontend change by driving index.html in headless Chrome against the live or local backend
---

# Verifying frontend changes end-to-end

Proven recipe for confirming a change to `index.html` actually works in a real browser, with real backend data — not just by reading the code.

## 1. Know the pieces

- **Frontend:** `/Users/samer/stock-dashboard/index.html` — single file, no build step. Load it directly via a `file://` URL.
- **Backend:** Node/Express in `/Users/samer/stock-dashboard/server` (`cd server && npm start`, port 3000). Live deployment: `https://samer7-stock-api.onrender.com`.
- The `BACKEND_URL` constant in `index.html` selects which backend the frontend talks to. Check which one it points at before verifying; point it at `http://localhost:3000` (with the local server running) if you need to test unreleased backend changes.

## 2. Set up puppeteer-core in a scratch directory

Headless Chrome lives at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Drive it with puppeteer-core from a scratch directory (never install it into the repo):

```bash
mkdir -p <scratch-dir> && cd <scratch-dir>
npm install puppeteer-core --cache ./npm-cache
```

The `--cache ./npm-cache` flag is REQUIRED — the sandbox cannot write to `~/.npm`.

## 3. Write and run a verification script

Launch puppeteer-core with `executablePath` set to the Chrome binary, load the frontend via `file://`, wait for cards to hydrate (loading placeholders → real prices), then assert and screenshot the specific behavior under test. Always capture browser console errors.

Copy-pasteable starting point (`verify.js` in the scratch dir):

```js
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();

  // Collect console errors — a clean verify has none.
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('file:///Users/samer/stock-dashboard/index.html', {
    waitUntil: 'networkidle0',
    timeout: 90000, // generous: Render free tier cold-starts ~30s
  });

  // Wait for hydration: a card shows a real price like $123.45
  await page.waitForFunction(
    () => /\$\d/.test(document.body.innerText),
    { timeout: 90000 }
  );

  // ...assert the specific behavior under test here...

  await page.screenshot({ path: 'verify.png', fullPage: true });
  console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
  process.exit(consoleErrors.length ? 1 : 0);
})();
```

Run it with `node verify.js`, then Read the screenshot to inspect visually.

## 4. Checklist for every frontend verify

- Initial loading state renders (grey badge, "Loading live quote…").
- Cards hydrate with real prices (placeholders replaced).
- An invalid ticker shows the error state — never fake/mock data.
- The congress feed panel loads.
- No browser console errors.

## 5. Gotchas

- **Stale backend cache after a deploy:** the live `/api/history` can serve a stale response shape with `cached: true` for hours — the 6h in-memory cache survives until the process restarts. `cached: false` in the JSON confirms fresh computation; don't trust a verify of a new response shape until you see it.
- **Render cold start:** the free tier sleeps after inactivity and takes ~30s to wake. Use generous timeouts (60–90s) on the first request, and expect the loading state to persist that long.
