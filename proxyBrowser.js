const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
chromium.use(stealth);

const server = 'http://unblock.oxylabs.io:60000'
const username = 'cartai_ZFLKe';
const password = 'HfHqBJ8Mwp+R6pQ';

function getRandomUserAgent() {
  const UserAgent = require('user-agents');
  return new UserAgent().toString();
}

const closePopups = async (page) => {
  const selectors = [
    '[aria-label="Close"]',
    '.popup-close',
    '.modal-close',
    '[data-close-modal]',
    '[id*="close"]',
    '.overlay-close',
    '.cookie-close',
    '[aria-label="dismiss"]'
  ];

  // First pass: Try to click all matched elements for each selector
  for (const selector of selectors) {
    const closeButtons = await page.$$(selector);
    for (const btn of closeButtons) {
      try {
        if (await btn.isVisible?.()) {
          await btn.click({
            force: true
          });
          console.log(`✅ Closed popup via selector: ${selector}`);
          await page.waitForTimeout(1000);
          break;
        }
      } catch (err) {
        console.warn(`⚠️ Failed to click popup with selector ${selector}:`, err.message);
      }
    }
  }

  // Fallback: Text-based close buttons
  const fallbackTexts = ['×', 'close', 'dismiss', 'got it', 'no thanks'];
  for (const text of fallbackTexts) {
    try {
      const textBtn = await page.locator(`button, div, span`, {
        hasText: new RegExp(`^\\s*${text}\\s*$`, 'i')
      }).first();
      if (await textBtn?.isVisible()) {
        await textBtn.click({
          force: true
        });
        console.log(`✅ Closed popup via text: "${text}"`);
        await page.waitForTimeout(1000);
        break;
      }
    } catch (err) {
      console.warn(`⚠️ Failed to click popup with text "${text}":`, err.message);
    }
  }

  try {
    const closeIcon = page.locator('#closeIconContainer');

    if (await closeIcon.count() && await closeIcon.isVisible()) {
      await closeIcon.click({ force: true, timeout: 1200 });
      console.log('✅ Closed via close icon');
      await page.waitForTimeout(500);
    }
    const acceptAllBtn = await page.locator('button:has-text("Accept All")');
    if (await acceptAllBtn?.isVisible()) {
      await acceptAllBtn.click({
        force: true
      });
      console.log('✅ Clicked Accept All');
      await page.waitForTimeout(1000);
    }
  } catch (err) {
    console.warn(err.message);
  }
};

async function closePopupsAll(page) {
  // Remove common popup, modal, and overlay elements
  await page.evaluate(() => {
    [
      '.modal', '.popup', '.overlay', '.cookie', '.consent', '.newsletter', '.lightbox',
      '[class*="modal"]', '[class*="popup"]', '[class*="overlay"]', '[class*="cookie"]',
      '[id*="modal"]', '[id*="popup"]', '[id*="overlay"]', '[id*="cookie"]',
      '[aria-modal="true"]'
    ].forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });
  });
}


function resolvePlaywrightProxy(useProxy) {
  if (!useProxy) return undefined;
  try {
    const u = new URL(url);
    return {
      server: server,
      username: decodeURIComponent(username || ''),
      password: decodeURIComponent(password || ''),
    };
  } catch {
    // fall through to OXY_* style
  }

  if (server && username && password) {
    return { server, username, password };
  }

  // No proxy configured
  return undefined;
}

async function detectBlock(page, navResponse) {
  // console.log("page", navResponse)
  const status = navResponse?.status?.() ?? navResponse?.status ?? 0;
  const headers = (() => {
    try { return Object.fromEntries(Object.entries(navResponse?.headers?.() || navResponse?.headers || {}).map(([k, v]) => [String(k).toLowerCase(), v])); }
    catch { return {}; }
  })();

  // 1) Obvious status codes
  if ([401, 403, 407, 429, 503].includes(status)) return true;

  // 2) Visible text (not raw HTML)
  const bodyText = await page.evaluate(() => document.body?.innerText || "");
  const title = (await page.title()) || "";
  // --- HARD signals → return true immediately ---
  const hardTextSignals = [
    /access\s*denied/i,
    /Access Has Been Denied/i,
    /you\s*don'?t\s*have\s*permission\s*to\s*access/i,
    /request\s*blocked/i,
    /reference\s*#\s*[0-9a-f-]{6,}/i, // Akamai/CloudFront reference id
    /attention\s*required/i,
    /unusual\s*traffic/i,
  ];
  if (hardTextSignals.some(rx => rx.test(bodyText))) return true;
  if (/access\s*denied|forbidden/i.test(title)) return true;

  // --- SOFT scoring for other hints ---
  let score = 0;

  // text hints
  if (/\bforbidden\b|not\s*authorized|captcha/i.test(bodyText)) score += 1;

  // header hints (WAF/CDN fingerprints)
  const headerHints =
    ('cf-ray' in headers) ||
    /cloudflare/i.test(headers['server'] || '') ||
    ('x-akamai-session-info' in headers) ||
    ('x-distil' in headers) ||
    ('x-perimeterx' in headers) ||
    ('x-datadome' in headers) ||
    ('x-sucuri-id' in headers) ||
    /error from cloudfront/i.test(headers['x-cache'] || '');
  if (headerHints) score += 1;

  // Reduce false positives if page clearly rendered content
  const hasRealContent = await page.evaluate(() => {
    const textLen = (document.body?.innerText || '').trim().length;
    const rich = document.querySelectorAll('img, video, canvas, svg').length;
    return textLen > 500 || rich >= 4;
  });
  if (hasRealContent) score = Math.max(0, score - 1);

  // Lower threshold so single soft hint can still trigger block
  return score >= 1;
}

async function createStealthBrowser(req, headless, useProxy, { sticky = true } = {}) {
  const proxy = resolvePlaywrightProxy(useProxy);

  const browser = await chromium.launch({
    headless: headless,
    proxy,
    args: ['--disable-gpu', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    deviceScaleFactor: 1,
    timezoneId: 'America/Chicago',
    locale: 'en-US',
  });

  return { browser, context };
}

/**
 * Add a minimal stealth script (you can extend freely without touching callers).
 */
async function addStealthScripts(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
}

async function openUrlWithPlaywright(
  req,
  url,
  useProxy,
  headLess,
  {
    timeoutMs = 60000,
    viewport = { width: 1200, height: 1200 },
    hooks = {},
    autoClickSize = true,   // auto-detect & click size before returning
  } = {}
) {
  const { browser, context } = await createStealthBrowser(req, headLess, useProxy, { sticky: true });
  const page = await context.newPage();

  // --- helpers (scoped) ---
  const isSelectSize = s => /^\s*(select|choose)\s*size(s)?\s*$/i.test(String(s).replace(/\u00a0/g, ' '));

  async function waitForAnyChange(beforeLen, ms = 3000) {
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: Math.min(ms, 4000) }).catch(() => { }),
      page.waitForFunction(prev => document.documentElement.outerHTML.length !== prev, beforeLen, { timeout: ms }).catch(() => { }),
      page.waitForSelector('[role="listbox"], .dropdown-menu, [aria-expanded="true"]', { state: 'visible', timeout: Math.min(ms, 2000) }).catch(() => { }),
    ]);
  }

  async function autoClickSizeIfNeeded() {
    // 1) Try native <select> first
    const selects = page.locator('select');
    const count = await selects.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);

      // Heuristics to decide if this select is for size
      const meta = await sel.evaluate(s => ({
        name: (s.getAttribute('name') || '').toLowerCase(),
        id: (s.id || '').toLowerCase(),
        aria: (s.getAttribute('aria-label') || '').toLowerCase(),
        selectedText: (() => {
          const opt = s.options[s.selectedIndex] || s.querySelector('option:checked');
          return (opt?.textContent || '').trim();
        })(),
        hasSelectSizeOption: !!s.querySelector('option, optgroup') && Array.from(s.options || []).some(o => /select\s*size|choose\s*size/i.test((o.textContent || '').trim())),
      })).catch(() => null);

      if (!meta) continue;

      const looksLikeSize =
        /size/.test(meta.name) || /size/.test(meta.id) || /size/.test(meta.aria) ||
        meta.hasSelectSizeOption || isSelectSize(meta.selectedText);

      if (!looksLikeSize) continue;

      const beforeLen = (await page.content()).length;

      // pick first available (not disabled / not OOS / not the placeholder)
      const picked = await sel.evaluate(s => {
        const bad = /(sold\s*out|not\s*available|unavailable|out\s*of\s*stock|temporarily\s*unavailable)/i;
        for (const o of Array.from(s.options)) {
          const txt = (o.textContent || '').trim();
          const aria = (o.getAttribute('aria-label') || '').trim();
          if (o.disabled) continue;
          if (bad.test(`${txt} ${aria}`)) continue;
          if (/select\s*size|choose\s*size/i.test(txt)) continue; // skip placeholder
          s.value = o.value;
          s.dispatchEvent(new Event('input', { bubbles: true }));
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return txt || o.value || true;
        }
        return null;
      }).catch(() => null);

      if (picked) {
        await waitForAnyChange(beforeLen, 4000);
        return true;
      }

      // If nothing to pick (all disabled), at least open it to trigger any UI
      await sel.click({ force: true }).catch(() => { });
      await waitForAnyChange(beforeLen, 2000);
      return true;
    }

    // 2) Custom controls: role/button/combobox or visible text
    let locator = page.getByRole('button', { name: /select\s*size|choose\s*size/i }).first();
    if (!(await locator.count().catch(() => 0))) {
      locator = page.getByRole('combobox', { name: /size/i }).first();
      if (!(await locator.count().catch(() => 0))) {
        locator = page.getByText(/^\s*(select|choose)\s*size(s)?\s*$/i).first();
      }
    }
    if (await locator.count().catch(() => 0)) {
      const beforeLen = (await page.content()).length;
      await locator.click({ force: true }).catch(() => { });
      await waitForAnyChange(beforeLen, 3000);
      return true;
    }

    // 3) Heuristic aria/data selectors
    const alt = page.locator('[aria-label*="size" i][aria-haspopup="listbox"], [data-testid*="size" i]').first();
    if (await alt.count().catch(() => 0)) {
      const beforeLen = (await page.content()).length;
      await alt.click({ force: true }).catch(() => { });
      await waitForAnyChange(beforeLen, 3000);
      return true;
    }

    return false;
  }

  // Hoist all visible overlays (listboxes/menus) before "Add to" so your cutoff includes them
  async function hoistAllOpenDropdownsBeforeAddTo() {
    await page.evaluate(() => {
      const isVisible = el => {
        const s = window.getComputedStyle(el);
        if (!s || s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity || '1') === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      // Try to find the Add-to button (various phrasings)
      const addTo = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
        .find(el => /add\s*to\s*(cart|bag|basket)?/i.test((el.textContent || el.value || '').toLowerCase()));
      if (!addTo) return 0;

      const overlaySel = [
        '[role="listbox"]',
        '[role="menu"]',
        '.dropdown-menu',
        '[data-dropdown]',
        '[data-radix-portal] *[role="listbox"]',
        '[id*="listbox"]',
        '[class*="listbox"]',
        '.ant-select-dropdown',          // Ant Design
        '.MuiPopover-root [role="listbox"]', // MUI
        '.chakra-portal [role="listbox"]',   // Chakra
        '.Select-menu',                  // react-select legacy
      ].join(',');

      const overlays = Array.from(document.querySelectorAll(overlaySel)).filter(isVisible);
      let injected = 0;

      for (const el of overlays) {
        const clone = el.cloneNode(true);
        // Avoid duplicate IDs inside cloned subtree
        clone.querySelectorAll('[id]').forEach((n, idx) => n.id = `${n.id}__cloned__${injected}_${idx}`);
        // Remove script tags (not needed for static serialization)
        clone.querySelectorAll('script').forEach(s => s.remove());
        clone.setAttribute('data-cloned', 'portal-hoist');
        addTo.parentNode.insertBefore(clone, addTo);
        injected++;
      }
      return injected;
    }).catch(() => { });
  }
  // --- end helpers ---

  try {
    await addStealthScripts(page);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
    });

    const navResponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: Math.min(10000, timeoutMs) }).catch(() => { });
    //await page.setViewportSize(viewport).catch(() => {});
    if (useProxy) {
      await page.waitForTimeout(50000);
    }
    await Promise.race([
      page.waitForURL(/edgesuite\.net|access/i, { timeout: 1500 }).catch(() => { }),
      page.waitForTimeout(1500),
    ]);
    await closePopups(page).catch(() => { });
    await closePopupsAll(page);
    await page.setViewportSize(viewport).catch(() => { });
    const status = navResponse?.status?.() ?? 0;

    // block detection (custom or default)

    const looksBlocked = await detectBlock(page, navResponse);
    console.log('🔍 Block detection:', looksBlocked);
    if (looksBlocked) {
      page.close();
      return;
    }
    // 1) Try auto size click BEFORE capturing html
    if (!looksBlocked && autoClickSize) {
      try { await autoClickSizeIfNeeded(); } catch { }
    }

    // 2) Hoist all open dropdown overlays before "Add to"
    try { await hoistAllOpenDropdownsBeforeAddTo(); } catch { }

    // 3) Capture the (possibly updated) HTML + assets
    const html = await page.content();

    let cssLinks = [], inlineStyles = [], screenshot = null;
    try {
      cssLinks = await page.$$eval('link[rel="stylesheet"]', links => links.map(l => l.href));
      inlineStyles = await page.$$eval('style', styles => styles.map(s => s.textContent || s.innerHTML || ''));
      screenshot = await page.screenshot({
        type: 'jpeg',
        quality: 80,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      }).catch(() => null);
    } catch { }

    return {
      engine: 'playwright',
      status,
      blocked: looksBlocked,
      html,          // includes hoisted dropdown HTML before Add-to
      screenshot,
      cssLinks,
      inlineStyles,
    };
  } finally {
    // no keep-open: always close

  }
}



/**
 * Fallback: Selenium WebDriver (Chromedriver) – returns full HTML + screenshot.
 */
async function openUrlInChromium(url) {
  const options = new chrome.Options().addArguments(
    '--disable-gpu',
    '--no-sandbox',
    '--disable-software-rasterizer',
    '--disable-dev-shm-usage'
    // '--headless=new',
  );

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  try {
    await driver.get(url);
    await driver.sleep(5000);
    const html = await driver.getPageSource();
    const screenshotB64 = await driver.takeScreenshot();
    return { html, screenshot: Buffer.from(screenshotB64, 'base64') };
  } finally {
    await driver.quit();
  }
}

/**
 * Smart wrapper: try direct, then proxy (both via Playwright).
 * Accepts same options as openUrlWithPlaywright, plus optional `hooks`.
 */
async function openUrlPlayWright(
  req,
  url,
  headLess,
  {
    timeoutMs = 60000,
    viewport = { width: 1200, height: 1200 },
    hooks = {},
  } = {}
) {
  try {
    const pw = await openUrlWithPlaywright(req, url, false, headLess, { timeoutMs, viewport, hooks });
    console.log(pw.blocked);
    console.log(pw.status);
    if ((!pw.blocked) && ![401, 403, 407, 429, 503].includes(pw.status || 0)) {
      return pw;
    }
    console.warn(`🔁 Playwright (no-proxy) undesirable status (${pw.status}). Retrying with proxy...`);
  } catch (e) {
    console.warn(`⚠️ Playwright (no-proxy) error: ${e.message}. Retrying with proxy...`);
  }

  // Retry WITH proxy, headless true for stability
  return openUrlWithPlaywright(req, url, true, headLess, { timeoutMs, viewport, hooks });
}

module.exports = {
  createStealthBrowser,
  addStealthScripts,
  openUrlWithPlaywright,
  openUrlPlayWright,
  openUrlInChromium,
};
