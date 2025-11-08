// === Required Modules ===
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');
const { Document, Paragraph, ImageRun, HeadingLevel, AlignmentType } = require("docx");
const fs1 = require('fs');
const { promisify } = require('util');
const { exec } = require('child_process');
const nodemailer = require('nodemailer');
const EmailService = require('./emailService');

// === Enhanced Configuration ===
const CONFIG = {
  PORT: process.env.PORT || 3001,
  SCREENSHOT_DIR: 'screenshots',
  WAIT_TIMES: {
    PAGE_LOAD: 3500,
    AFTER_CLICK: 3500,
    EXTENDED_WAIT: 19500,
    BETWEEN_URLS: 2000,
    FORM_SUBMIT: 5000
  },
  BROWSER: {
    HEADLESS: true,
    ARGS: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  URLS: [
    {
      name: 'business-tax',
      url: (businessName) => `https://county-taxes.net/fl-miamidade/business-tax?search_query=${encodeURIComponent(businessName)}`,
      screenshot: 'businessTax.png'
    },
    {
      name: 'property-search',
      url: (businessName) => `https://county-taxes.net/fl-miamidade/property-tax?search_query=${encodeURIComponent(businessName)}`,
      screenshot: 'propertySearch.png'
    }
  ],
  SUNBIZ: {
    byName: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    byFei: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByFeiNumber'
  },
  SuspendedList: {
    fspContractor: 'https://www.dms.myflorida.com/business_operations/state_purchasing/state_agency_resources/vendor_registration_and_vendor_lists/suspended_vendor_list',
    convictedVendorList: 'https://www.dms.myflorida.com/business_operations/state_purchasing/state_agency_resources/vendor_registration_and_vendor_lists/convicted_vendor_list',
    discreminatedVendorList: 'https://www.dms.myflorida.com/business_operations/state_purchasing/state_agency_resources/vendor_registration_and_vendor_lists/discriminatory_vendor_list',
    antitrustVendorList: 'https://www.dms.myflorida.com/business_operations/state_purchasing/state_agency_resources/vendor_registration_and_vendor_lists/antitrust_violator_vendor_list',
    forcedLaborList: 'https://www.dms.myflorida.com/business_operations/state_purchasing/state_agency_resources/vendor_registration_and_vendor_lists/forced_labor_vendor_list'
  },
  SBA: {
    governanceMandates: 'https://www.sbafla.com/governance/global-governance-mandates/'
  },
  osha: {
    oshaLink: 'https://www.osha.gov/ords/imis/establishment.html'
  }
};
// === Ensure required folders exist ===
(async () => {
  try {
    await fs.mkdir(CONFIG.SCREENSHOT_DIR, { recursive: true });
    await fs.mkdir('./output', { recursive: true });
    console.log(`✅ Folders ready: ${CONFIG.SCREENSHOT_DIR}, ./output`);
  } catch (err) {
    console.error('Error creating folders:', err);
  }
})();
// === Setup ===
chromium.use(stealth);
const app = express();

// Middleware
app.use(cors());
app.use(express.json());


// === Enhanced Utility Functions ===
class BrowserUtils {
  static getRandomUserAgent() {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0"
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.warn(`Could not create directory ${dirPath}:`, error.message);
    }
  }

  static async waitForSelector(page, selector, options = {}) {
    const { timeoutMs = 10000 } = options;
    try {
      await page.waitForSelector(selector, { timeout: timeoutMs });
      return true;
    } catch (error) {
      console.warn(`Selector ${selector} not found within ${timeoutMs}ms`);
      return false;
    }
  }
}

// === Browser Management ===
class BrowserManager {
  static async createStealthBrowser() {
    const browser = await chromium.launch({
      headless: CONFIG.BROWSER.HEADLESS,
      args: CONFIG.BROWSER.ARGS
    });

    const context = await browser.newContext({
      userAgent: BrowserUtils.getRandomUserAgent(),
      viewport: { width: 1280, height: 720 }
    });

    return { browser, context };
  }

  static async addStealthScripts(page) {
    await page.addInitScript(() => {
      // Mask webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Mask automation properties
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });
  }
}

// === Enhanced Page Interaction Helpers ===
class PageInteractions {
  static async removePopups(page) {
    try {
      await page.evaluate(() => {
        try {
          // Remove overlays with high z-index
          const overlays = Array.from(document.querySelectorAll('div, section, aside, dialog'))
            .filter(el => {
              try {
                const style = window.getComputedStyle(el);
                const isOverlay = (style.position === 'fixed' || style.position === 'absolute') &&
                  (parseInt(style.zIndex || '0') > 1000);
                const isPopup = el.getAttribute('role') === 'dialog' ||
                  el.getAttribute('aria-modal') === 'true';
                return isOverlay || isPopup;
              } catch {
                return false;
              }
            });
          overlays.forEach(el => el.remove());

          // Remove common popup classes
          const popupSelectors = [
            '.modal', '.popup', '.overlay', '.banner',
            '.lightbox', '.cookie', '#popup', '#modal'
          ];

          popupSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => el.remove());
          });

        } catch (error) {
          console.warn('Popup removal failed in browser context');
        }
      });
    } catch (error) {
      console.warn('removePopups failed:', error.message);
    }
  }

  static async clickViewByText(page, searchText) {
    try {
      console.log(`🔍 Searching for: "${searchText}"`);

      // Method 1: Direct search in business/property tax rows
      const taxRows = await page.$$('.property-tax.row, .business-tax.row');

      for (const row of taxRows) {
        const rowText = await row.evaluate(el => el.textContent?.toLowerCase());

        if (rowText && rowText.includes(searchText.toLowerCase())) {
          console.log('✅ Found matching row');

          const viewBtn = await row.$('button[data-test="view"]');
          if (viewBtn) {
            await viewBtn.scrollIntoViewIfNeeded();
            await BrowserUtils.sleep(500);
            await viewBtn.click();
            console.log('▶️ Clicked View button!');
            return true;
          }
        }
      }

      // Method 2: Search in specific business name elements
      const businessNameElements = await page.$$('.font-size-h3 .ais-Highlight');

      for (const element of businessNameElements) {
        const businessName = await element.evaluate(el => el.textContent?.toLowerCase());

        if (businessName && businessName.includes(searchText.toLowerCase())) {
          console.log('✅ Found business name match');

          const row = await element.evaluateHandle(el =>
            el.closest('.property-tax, .business-tax')
          );

          if (row) {
            const viewBtn = await row.$('button[data-test="view"]');
            if (viewBtn) {
              await viewBtn.scrollIntoViewIfNeeded();
              await BrowserUtils.sleep(500);
              await viewBtn.click();
              console.log('▶️ Clicked View button for business!');
              return true;
            }
          }
        }
      }

      console.log(`❌ No match found for "${searchText}"`);
      return false;

    } catch (error) {
      console.error('Error in clickViewByText:', error.message);
      return false;
    }
  }

  static async fillAndSubmitForm(page, options) {
    const {
      selector,
      value,
      submitSelector,
      ensureSelectorAfterSubmit,
      timeoutMs = 8000
    } = options;

    try {
      console.log(`📝 Filling form: ${selector} with value: ${value}`);

      // Wait for input field
      const inputExists = await BrowserUtils.waitForSelector(page, selector, { timeoutMs });
      if (!inputExists) {
        throw new Error(`Input field ${selector} not found`);
      }

      // Fill the input field
      await page.fill(selector, value);
      await BrowserUtils.sleep(1000);

      // Submit the form
      const submitExists = await BrowserUtils.waitForSelector(page, submitSelector, { timeoutMs });
      if (!submitExists) {
        throw new Error(`Submit button ${submitSelector} not found`);
      }

      await page.click(submitSelector);
      console.log('✅ Form submitted');

      // Wait for results if specified
      if (ensureSelectorAfterSubmit) {
        await BrowserUtils.sleep(2000);
        const resultsExist = await BrowserUtils.waitForSelector(page, ensureSelectorAfterSubmit, { timeoutMs });
        if (!resultsExist) {
          console.warn(`Expected results element ${ensureSelectorAfterSubmit} not found after submission`);
        }
      }

      return true;
    } catch (error) {
      console.error('Error in fillAndSubmitForm:', error.message);
      throw error;
    }
  }

  static async saveScreenshot(page, folder, filename, fullPage = true) {
    try {
      const folderPath = path.resolve(folder);
      await BrowserUtils.ensureDirectoryExists(folderPath);

      const filePath = path.join(folderPath, filename);
      await page.screenshot({ path: filePath, fullPage });

      console.log(`📸 Screenshot saved at ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to save screenshot:', error.message);
      throw error;
    }
  }

  static async saveScreenshotWithMinWidth(page, folder, filename, minWidth = 800) {
    try {
      const folderPath = path.resolve(folder);
      await BrowserUtils.ensureDirectoryExists(folderPath);

      const filePath = path.join(folderPath, filename);

      // Get current viewport size
      const viewport = page.viewportSize();

      if (viewport && viewport.width < minWidth) {
        // Set minimum width for screenshot
        await page.setViewportSize({ width: minWidth, height: viewport.height });
        await BrowserUtils.sleep(1000);
      }

      await page.screenshot({ path: filePath, fullPage: true });

      console.log(`📸 Screenshot saved at ${filePath} (min width: ${minWidth}px)`);
      return filePath;
    } catch (error) {
      console.error('Failed to save screenshot with min width:', error.message);
      throw error;
    }
  }

  static async processSingleUrl(page, urlConfig, businessName) {
    const results = {
      url: urlConfig.url(businessName),
      name: urlConfig.name,
      success: false,
      businessFound: false,
      screenshotPath: null,
      htmlLength: 0,
      error: null
    };

    try {
      console.log(`\n🌐 Processing ${urlConfig.name}...`);
      console.log(`📝 Navigating to: ${results.url}`);

      await page.goto(results.url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      const rawHTML = await page.content();
      results.htmlLength = rawHTML.length;

      await BrowserUtils.sleep(CONFIG.WAIT_TIMES.PAGE_LOAD);
      await PageInteractions.removePopups(page);

      results.businessFound = await PageInteractions.clickViewByText(page, businessName);

      if (results.businessFound) {
        await BrowserUtils.sleep(CONFIG.WAIT_TIMES.AFTER_CLICK);
        await BrowserUtils.sleep(CONFIG.WAIT_TIMES.EXTENDED_WAIT);

        results.screenshotPath = await PageInteractions.saveScreenshot(
          page,
          CONFIG.SCREENSHOT_DIR,
          urlConfig.screenshot
        );
      }

      results.success = true;
      console.log(`✅ Successfully processed ${urlConfig.name}`);

    } catch (error) {
      results.success = false;
      results.error = error.message;
      console.error(`❌ Error processing ${urlConfig.name}:`, error.message);
    }

    await BrowserUtils.sleep(CONFIG.WAIT_TIMES.BETWEEN_URLS);
    return results;
  }

  // === Enhanced Sunbiz Search Methods ===
  static async processSunbizByName(page, businessName) {
    const results = {
      name: 'sunbiz-by-name',
      url: CONFIG.SUNBIZ.byName,
      success: false,
      screenshotPath: null,
      error: null
    };

    try {
      console.log(`\n🌐 Processing Sunbiz Search By Name...`);
      console.log(`📝 Navigating to: ${results.url}`);

      // Navigate to Sunbiz by name search
      await page.goto(results.url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await BrowserUtils.sleep(CONFIG.WAIT_TIMES.PAGE_LOAD);
      await PageInteractions.removePopups(page);

      // Wait for the search input
      await BrowserUtils.waitForSelector(page, 'input#SearchTerm', { timeoutMs: 10000 });

      // Fill the search term
      await page.fill('input#SearchTerm', businessName);
      await BrowserUtils.sleep(1000);

      // Try multiple possible submit button selectors
      const submitSelectors = [
        'input[type="submit"][value="Search"]',
        'input[type="submit"]',
        'button[type="submit"]',
        '.btn-primary',
        '.btn-search',
        'button:has-text("Search")',
        'input[value*="Search"]',
        'button:has-text("Submit")',
        '#search-button',
        '.search-button'
      ];

      let submitClicked = false;

      for (const selector of submitSelectors) {
        try {
          const submitButton = await page.$(selector);
          if (submitButton) {
            console.log(`🔍 Found submit button with selector: ${selector}`);
            await submitButton.scrollIntoViewIfNeeded();
            await BrowserUtils.sleep(500);
            await submitButton.click();
            console.log('✅ Search form submitted');
            submitClicked = true;
            break;
          }
        } catch (error) {
          console.log(`❌ Failed with selector ${selector}:`, error.message);
          continue;
        }
      }

      // If no specific button found, try pressing Enter
      if (!submitClicked) {
        console.log('🔍 No specific submit button found, trying Enter key...');
        await page.press('input#SearchTerm', 'Enter');
        console.log('✅ Submitted with Enter key');
        submitClicked = true;
      }

      if (!submitClicked) {
        throw new Error('Could not find or click any submit button');
      }

      // Wait for results
      await BrowserUtils.sleep(3000);

      // Wait for any table or results container
      const resultSelectors = [
        'table',
        '.search-results',
        '#search-results',
        '.results',
        '.data-table',
        'tbody'
      ];

      let resultsFound = false;
      for (const selector of resultSelectors) {
        const exists = await BrowserUtils.waitForSelector(page, selector, { timeoutMs: 5000 });
        if (exists) {
          console.log(`✅ Results loaded with selector: ${selector}`);
          resultsFound = true;
          break;
        }
      }

      if (!resultsFound) {
        console.warn('⚠️ No results table found, but continuing...');
      }

      await PageInteractions.removePopups(page);

      // Save screenshot
      results.screenshotPath = await PageInteractions.saveScreenshot(
        page,
        CONFIG.SCREENSHOT_DIR,
        'SunbizByNameResults.png'
      );

      results.success = true;
      console.log('✅ Successfully processed Sunbiz By Name search');

    } catch (error) {
      results.success = false;
      results.error = error.message;
      console.error('❌ Error processing Sunbiz By Name:', error.message);

      // Save error screenshot for debugging
      try {
        results.screenshotPath = await PageInteractions.saveScreenshot(
          page,
          CONFIG.SCREENSHOT_DIR,
          'SunbizByName_ERROR.png'
        );
      } catch (screenshotError) {
        console.error('Failed to save error screenshot:', screenshotError.message);
      }
    }

    return results;
  }

  static async processSunbizByFei(page, feiNumber) {
    const results = {
      name: 'sunbiz-by-fei',
      url: CONFIG.SUNBIZ.byFei,
      success: false,
      screenshotPath: null,
      error: null
    };

    try {
      console.log(`\n🌐 Processing Sunbiz Search By FEI Number...`);
      console.log(`📝 Navigating to: ${results.url}`);

      // Navigate to Sunbiz by FEI search
      await page.goto(results.url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await BrowserUtils.sleep(CONFIG.WAIT_TIMES.PAGE_LOAD);
      await PageInteractions.removePopups(page);

      // Wait for the search input
      await BrowserUtils.waitForSelector(page, 'input#SearchTerm', { timeoutMs: 10000 });

      // Fill the FEI number
      await page.fill('input#SearchTerm', feiNumber);
      await BrowserUtils.sleep(1000);

      // Try multiple possible submit button selectors
      const submitSelectors = [
        'input[type="submit"][value="Search"]',
        'input[type="submit"]',
        'button[type="submit"]',
        '.btn-primary',
        '.btn-search',
        'button:has-text("Search")',
        'input[value*="Search"]',
        'button:has-text("Submit")',
        '#search-button',
        '.search-button',
        'input[value="Search Now"]',
        'button:has-text("Search Now")'
      ];

      let submitClicked = false;

      for (const selector of submitSelectors) {
        try {
          const submitButton = await page.$(selector);
          if (submitButton) {
            console.log(`🔍 Found submit button with selector: ${selector}`);
            await submitButton.scrollIntoViewIfNeeded();
            await BrowserUtils.sleep(500);
            await submitButton.click();
            console.log('✅ Search form submitted');
            submitClicked = true;
            break;
          }
        } catch (error) {
          console.log(`❌ Failed with selector ${selector}:`, error.message);
          continue;
        }
      }

      // If no specific button found, try pressing Enter
      if (!submitClicked) {
        console.log('🔍 No specific submit button found, trying Enter key...');
        await page.press('input#SearchTerm', 'Enter');
        console.log('✅ Submitted with Enter key');
        submitClicked = true;
      }

      if (!submitClicked) {
        throw new Error('Could not find or click any submit button');
      }

      // Wait for results
      await BrowserUtils.sleep(3000);

      // Wait for any table or results container
      const resultSelectors = [
        'table',
        '.search-results',
        '#search-results',
        '.results',
        '.data-table',
        'tbody',
        '.corporation-search-results'
      ];

      let resultsFound = false;
      for (const selector of resultSelectors) {
        const exists = await BrowserUtils.waitForSelector(page, selector, { timeoutMs: 5000 });
        if (exists) {
          console.log(`✅ Results loaded with selector: ${selector}`);
          resultsFound = true;
          break;
        }
      }

      if (!resultsFound) {
        console.warn('⚠️ No results table found, but continuing...');
      }

      await PageInteractions.removePopups(page);

      // Save screenshot
      results.screenshotPath = await PageInteractions.saveScreenshot(
        page,
        CONFIG.SCREENSHOT_DIR,
        'SunbizByFeiResults.png'
      );

      results.success = true;
      console.log('✅ Successfully processed Sunbiz By FEI search');

    } catch (error) {
      results.success = false;
      results.error = error.message;
      console.error('❌ Error processing Sunbiz By FEI:', error.message);

      // Save error screenshot for debugging
      try {
        results.screenshotPath = await PageInteractions.saveScreenshot(
          page,
          CONFIG.SCREENSHOT_DIR,
          'SunbizByFei_ERROR.png'
        );
      } catch (screenshotError) {
        console.error('Failed to save error screenshot:', screenshotError.message);
      }
    }

    return results;
  }

  // === NEW: Suspended List Processing Methods ===
  static async processSuspendedVendorList(page, url, fileName, businessName = '') {
    const results = {
      name: 'suspended-vendor-list',
      // url: CONFIG.SuspendedList.fspContractor,
      url: url,
      success: false,
      screenshotPath: null,
      businessFound: false,
      searchPerformed: false,
      error: null
    };

    try {
      console.log(`\n🌐 Processing Suspended Vendor List...`);
      console.log(`📝 Navigating to: ${results.url}`);

      // Navigate to suspended vendor list
      await page.goto(results.url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await BrowserUtils.sleep(CONFIG.WAIT_TIMES.PAGE_LOAD);
      await PageInteractions.removePopups(page);

      // Save initial page screenshot
      results.screenshotPath = await PageInteractions.saveScreenshot(
        page,
        CONFIG.SCREENSHOT_DIR,
        'SuspendedVendorList.png'
      );

      // If business name provided, try to search within the page
      if (businessName) {
        console.log(`🔍 Searching for business in suspended list: "${businessName}"`);

        // Method 1: Check if business name appears in page content
        const pageContent = await page.content();
        const businessFound = pageContent.toLowerCase().includes(businessName.toLowerCase());

        if (businessFound) {
          console.log(`⚠️ Business "${businessName}" found in suspended vendor list!`);
          results.businessFound = true;
        } else {
          console.log(`✅ Business "${businessName}" not found in suspended vendor list`);
        }

        // Method 2: Try to use browser search (Ctrl+F)
        await page.keyboard.press('Control+F');
        await BrowserUtils.sleep(1000);
        await page.keyboard.type(businessName);
        await BrowserUtils.sleep(2000);

        // Take screenshot with search highlighted
        results.screenshotPath = await PageInteractions.saveScreenshot(
          page,
          CONFIG.SCREENSHOT_DIR,
          fileName
        );

        // Close search
        await page.keyboard.press('Escape');

        results.searchPerformed = true;
      }

      results.success = true;
      console.log('✅ Successfully processed Suspended Vendor List');

    } catch (error) {
      results.success = false;
      results.error = error.message;
      console.error('❌ Error processing Suspended Vendor List:', error.message);

      // Save error screenshot for debugging
      try {
        results.screenshotPath = await PageInteractions.saveScreenshot(
          page,
          CONFIG.SCREENSHOT_DIR,
          'SuspendedVendorList_ERROR.png'
        );
      } catch (screenshotError) {
        console.error('Failed to save error screenshot:', screenshotError.message);
      }
    }

    return results;
  }

  // Process all suspended lists
  static async processAllSuspendedLists(page, businessName = '') {
    const results = [];

    // Process FSP Contractor suspended list
    const fspResult = await this.processSuspendedVendorList(page, CONFIG.SuspendedList.fspContractor, 'SuspendedVendorList_Search.png', businessName);
    results.push(fspResult);
    const convictedVendorList = await this.processSuspendedVendorList(page, CONFIG.SuspendedList.convictedVendorList, 'ConvictedVendorList_Search.png', businessName);
    results.push(convictedVendorList);

    const discreminatedVendorList = await this.processSuspendedVendorList(page, CONFIG.SuspendedList.discreminatedVendorList, 'DiscriminationVendorList_Search.png', businessName);
    results.push(discreminatedVendorList);

    const antitrustVendorList = await this.processSuspendedVendorList(page, CONFIG.SuspendedList.antitrustVendorList, 'AntitrustVendorList_Search.png', businessName);
    results.push(antitrustVendorList);

    const forced_laborVendorList = await this.processSuspendedVendorList(page, CONFIG.SuspendedList.forcedLaborList, 'ForcedLaborVendorList_Search.png', businessName);
    results.push(forced_laborVendorList);


    // Add more suspended lists here as needed
    // const anotherResult = await this.processAnotherSuspendedList(page, businessName);
    // results.push(anotherResult);

    return results;
  }

  // === Enhanced SBA Governance Mandates Processing ===
  static async processSBAGoveranceMandates(page, businessName = '') {
    const results = {
      name: 'sba-governance-mandates',
      url: CONFIG.SBA.governanceMandates,
      success: false,
      screenshotPath: null,
      textFound: false,
      linkClicked: false,
      businessSearched: false,
      error: null,
      details: {}
    };

    try {
      console.log(`\n🌐 Processing SBA Governance Mandates...`);
      console.log(`📝 Navigating to: ${results.url}`);

      // Navigate to SBA governance mandates page
      await page.goto(results.url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await BrowserUtils.sleep(CONFIG.WAIT_TIMES.PAGE_LOAD);
      await PageInteractions.removePopups(page);

      // Save initial page screenshot with minimum width
      results.screenshotPath = await PageInteractions.saveScreenshotWithMinWidth(
        page,
        CONFIG.SCREENSHOT_DIR,
        'SBAGovernanceMandates_Initial.png',
        1200
      );

      // Search for the EXACT text in <a> tags
      const exactSearchText = "Scrutinized Companies that Boycott Israel Statute";
      console.log(`🔍 Searching for EXACT text in <a> tags: "${exactSearchText}"`);

      let foundLink = null;
      let foundLinkHref = '';
      let foundLinkText = '';

      // Method 1: Direct search for <a> tags with exact text
      const exactLink = await page.evaluate((searchText) => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent && link.textContent.trim() === searchText) {
            return {
              href: link.href,
              text: link.textContent.trim(),
              outerHTML: link.outerHTML
            };
          }
        }
        return null;
      }, exactSearchText);

      if (exactLink) {
        console.log(`✅ Found exact text in <a> tag: "${exactSearchText}"`);
        console.log(`📎 Link URL: ${exactLink.href}`);
        console.log(`🔗 Link HTML: ${exactLink.outerHTML}`);

        foundLinkText = exactLink.text;
        foundLinkHref = exactLink.href;

        // Find the link element to click
        foundLink = await page.$(`a[href="${exactLink.href}"]`);
      }

      // Method 2: If exact not found, search for partial matches in <a> tags
      if (!foundLink) {
        console.log('🔄 Searching for partial matches in <a> tags...');

        const partialMatches = await page.evaluate((searchText) => {
          const links = document.querySelectorAll('a');
          const matches = [];

          for (const link of links) {
            if (link.textContent && link.textContent.trim()) {
              const linkText = link.textContent.trim();
              // Check if link text contains major parts of the search text
              if (linkText.includes('Scrutinized Companies') &&
                linkText.includes('Boycott Israel')) {
                matches.push({
                  href: link.href,
                  text: linkText,
                  outerHTML: link.outerHTML,
                  matchScore: linkText === searchText ? 100 :
                    linkText.includes(searchText) ? 90 :
                      (linkText.includes('Scrutinized Companies') && linkText.includes('Boycott Israel')) ? 80 : 0
                });
              }
            }
          }

          // Sort by match score (highest first)
          matches.sort((a, b) => b.matchScore - a.matchScore);
          return matches.slice(0, 3); // Return top 3 matches
        }, exactSearchText);

        if (partialMatches.length > 0) {
          console.log(`✅ Found ${partialMatches.length} partial matches:`);
          partialMatches.forEach((match, index) => {
            console.log(`   ${index + 1}. "${match.text}" (score: ${match.matchScore})`);
            console.log(`      URL: ${match.href}`);
          });

          // Use the best match
          const bestMatch = partialMatches[0];
          foundLinkText = bestMatch.text;
          foundLinkHref = bestMatch.href;
          foundLink = await page.$(`a[href="${bestMatch.href}"]`);
        }
      }

      // Method 3: Search for all <a> tags and filter by text content
      if (!foundLink) {
        console.log('🔄 Searching all <a> tags for relevant content...');

        const allLinks = await page.$$eval('a', (links) => {
          return links
            .filter(link => link.href && link.textContent && link.textContent.trim())
            .map(link => ({
              href: link.href,
              text: link.textContent.trim(),
              isVisible: link.offsetParent !== null, // Basic visibility check
              hasScrutinized: link.textContent.includes('Scrutinized'),
              hasIsrael: link.textContent.includes('Israel'),
              hasBoycott: link.textContent.includes('Boycott'),
              hasStatute: link.textContent.includes('Statute'),
              score: (link.textContent.includes('Scrutinized') ? 25 : 0) +
                (link.textContent.includes('Israel') ? 25 : 0) +
                (link.textContent.includes('Boycott') ? 25 : 0) +
                (link.textContent.includes('Statute') ? 25 : 0)
            }))
            .filter(link => link.score >= 50) // Only links with at least 2 keywords
            .sort((a, b) => b.score - a.score);
        });

        if (allLinks.length > 0) {
          console.log(`✅ Found ${allLinks.length} relevant <a> tags:`);
          allLinks.forEach((link, index) => {
            console.log(`   ${index + 1}. "${link.text}" (score: ${link.score})`);
            console.log(`      URL: ${link.href}`);
            console.log(`      Visible: ${link.isVisible}`);
          });

          // Use the highest scoring visible link
          const bestLink = allLinks.find(link => link.isVisible) || allLinks[0];
          foundLinkText = bestLink.text;
          foundLinkHref = bestLink.href;
          foundLink = await page.$(`a[href="${bestLink.href}"]`);
        }
      }

      // Method 4: Search in specific containers for <a> tags
      if (!foundLink) {
        console.log('🔄 Searching in specific containers for <a> tags...');

        // Look for links in common containers that might contain our target
        const containerSelectors = [
          '.mb-2 a',
          'div a',
          'p a',
          'u a',
          '[class*="link"] a',
          '[class*="content"] a'
        ];

        for (const selector of containerSelectors) {
          try {
            const links = await page.$$(selector);
            for (const link of links) {
              try {
                const linkText = await link.textContent();
                if (linkText && linkText.trim()) {
                  const text = linkText.trim();
                  if (text === exactSearchText ||
                    (text.includes('Scrutinized Companies') && text.includes('Boycott Israel'))) {

                    const isVisible = await link.isVisible();
                    if (isVisible) {
                      console.log(`✅ Found link in container "${selector}": "${text}"`);
                      foundLinkText = text;
                      foundLinkHref = await link.evaluate(el => el.href);
                      foundLink = link;
                      break;
                    }
                  }
                }
              } catch (error) {
                continue;
              }
            }
            if (foundLink) break;
          } catch (error) {
            continue;
          }
        }
      }

      if (foundLink) {
        results.textFound = true;
        results.details.foundText = foundLinkText;
        results.details.linkText = foundLinkText;
        results.details.linkHref = foundLinkHref;

        console.log(`🎯 Found target link: "${foundLinkText}"`);
        console.log(`📎 Target URL: ${foundLinkHref}`);

        // Verify the link is clickable
        try {
          const isVisible = await foundLink.isVisible();
          const isEnabled = await foundLink.isEnabled();
          console.log(`👀 Link visibility: ${isVisible}, Enabled: ${isEnabled}`);

          if (!isVisible) {
            console.log('🔄 Scrolling link into view...');
            await foundLink.scrollIntoViewIfNeeded();
            await BrowserUtils.sleep(1000);
          }
        } catch (visibilityError) {
          console.log('⚠️ Could not check link visibility:', visibilityError.message);
        }

        // Click the link
        try {
          // Save pre-click screenshot
          await PageInteractions.saveScreenshotWithMinWidth(
            page,
            CONFIG.SCREENSHOT_DIR,
            'SBAGovernanceMandates_PreClick.png',
            1200
          );

          console.log('🖱️ Clicking the link...');

          // Multiple click strategies
          let clickSuccess = false;

          // Strategy 1: Direct click with navigation wait
          try {
            const [response] = await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null),
              foundLink.click()
            ]);

            if (response) {
              console.log('✅ Direct click with navigation successful');
              clickSuccess = true;
            }
          } catch (clickError) {
            console.log('❌ Direct click failed:', clickError.message);
          }

          // Strategy 2: JavaScript click
          if (!clickSuccess) {
            try {
              await foundLink.evaluate(node => node.click());
              await BrowserUtils.sleep(CONFIG.WAIT_TIMES.PAGE_LOAD);
              console.log('✅ JavaScript click successful');
              clickSuccess = true;
            } catch (jsError) {
              console.log('❌ JavaScript click failed:', jsError.message);
            }
          }

          // Strategy 3: Navigate directly to href
          if (!clickSuccess) {
            try {
              await page.goto(foundLinkHref, { waitUntil: 'domcontentloaded', timeout: 15000 });
              console.log('✅ Direct navigation successful');
              clickSuccess = true;
            } catch (navError) {
              console.log('❌ Direct navigation failed:', navError.message);
            }
          }

          if (clickSuccess) {
            results.linkClicked = true;

            // Wait for page to settle
            await BrowserUtils.sleep(2000);

            // Get current URL after navigation
            const currentUrl = page.url();
            console.log(`📍 Current URL after click: ${currentUrl}`);
            results.details.finalUrl = currentUrl;

            // Save post-click screenshot
            await PageInteractions.saveScreenshotWithMinWidth(
              page,
              CONFIG.SCREENSHOT_DIR,
              'SBAGovernanceMandates_PostClick.png',
              1200
            );

            // Perform business search if applicable
            if (businessName && businessName.length >= 2) {
              await this.performBusinessSearch(page, businessName, results);
            }

            // Save final screenshot
            results.screenshotPath = await PageInteractions.saveScreenshotWithMinWidth(
              page,
              CONFIG.SCREENSHOT_DIR,
              'SBAGovernanceMandates_Final.png',
              1200
            );
          } else {
            throw new Error('All click strategies failed');
          }

        } catch (clickError) {
          console.error('❌ Error clicking link:', clickError.message);
          results.details.clickError = clickError.message;
        }
      } else {
        console.log(`❌ Could not find <a> tag with text: "${exactSearchText}"`);
        results.details.exactTextNotFound = true;

        // Debug: Log all links on the page for analysis
        const allLinks = await page.$$eval('a', (links) => {
          return links
            .filter(link => link.textContent && link.textContent.trim())
            .map(link => ({
              text: link.textContent.trim(),
              href: link.href,
              visible: link.offsetParent !== null
            }))
            .slice(0, 20); // First 20 links
        });

        console.log('📋 First 20 links on page:');
        allLinks.forEach((link, index) => {
          console.log(`   ${index + 1}. "${link.text}" -> ${link.href} (visible: ${link.visible})`);
        });
        results.details.allLinksSample = allLinks;
      }

      results.success = true;
      console.log('✅ Successfully processed SBA Governance Mandates');

    } catch (error) {
      results.success = false;
      results.error = error.message;
      console.error('❌ Error processing SBA Governance Mandates:', error.message);

      // Save error screenshot for debugging
      try {
        results.screenshotPath = await PageInteractions.saveScreenshotWithMinWidth(
          page,
          CONFIG.SCREENSHOT_DIR,
          'SBAGovernanceMandates_ERROR.png',
          1200
        );
      } catch (screenshotError) {
        console.error('Failed to save error screenshot:', screenshotError.message);
      }
    }

    return results;
  }

  // Helper method for business search
  static async performBusinessSearch(page, businessName, results) {
    const firstTwoChars = businessName.substring(0, 2).toUpperCase();
    console.log(`🔍 Searching for business name starting with: "${firstTwoChars}"`);

    let searchSuccess = false;

    // Method 1: Browser search (Ctrl+F)
    try {
      await page.keyboard.press('Control+F');
      await BrowserUtils.sleep(1000);
      await page.keyboard.type(firstTwoChars);
      await BrowserUtils.sleep(2000);

      // Check if search found anything
      const hasSearchResults = await page.evaluate(() => {
        return window.find && window.find(getSelection().toString());
      });

      if (hasSearchResults) {
        console.log(`✅ Browser search found "${firstTwoChars}"`);
        searchSuccess = true;
      }

      // Close search
      await page.keyboard.press('Escape');

    } catch (searchError) {
      console.log('❌ Browser search failed:', searchError.message);
    }

    // Method 2: Content search
    if (!searchSuccess) {
      const pageContent = await page.content();
      if (pageContent.toUpperCase().includes(firstTwoChars)) {
        console.log(`✅ Found "${firstTwoChars}" in page content`);
        searchSuccess = true;
      }
    }

    results.businessSearched = searchSuccess;
    results.details.businessSearchPerformed = true;
    results.details.businessSearchQuery = firstTwoChars;
    results.details.businessSearchSuccess = searchSuccess;
  }
  // Process SBA mandates
  static async processAllSBAMandates(page, businessName = '') {
    const results = [];

    // Process SBA governance mandates
    const sbaResult = await this.processSBAGoveranceMandates(page, businessName);
    results.push(sbaResult);

    return results;
  }

  // Process Osha mandates
  static async processOshaByName(page, businessName) {
    const results = {
      name: 'osha-by-name',
      url: CONFIG.osha.oshaLink,
      success: false,
      screenshotPath: null,
      error: null
    };

    try {
      console.log(`\n🌐 Processing OSHA Search By Name...`);
      console.log(`📝 Navigating to: ${results.url}`);

      // Navigate to OSHA search
      await page.goto(results.url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await BrowserUtils.sleep(CONFIG.WAIT_TIMES.PAGE_LOAD);
      await PageInteractions.removePopups(page);

      // Wait for the establishment input field
      const establishmentInputFound = await BrowserUtils.waitForSelector(page, 'input#establishment', { timeoutMs: 15000 });

      if (!establishmentInputFound) {
        // Try alternative selectors for the establishment field
        const alternativeSelectors = [
          'input[name="establishment"]',
          'input[type="text"][maxlength="60"]',
          '.control-group input[type="text"]',
          'input.input-xlarge'
        ];

        let inputFound = false;
        for (const selector of alternativeSelectors) {
          const found = await BrowserUtils.waitForSelector(page, selector, { timeoutMs: 5000 });
          if (found) {
            console.log(`✅ Found establishment input with alternative selector: ${selector}`);
            inputFound = true;
            break;
          }
        }

        if (!inputFound) {
          throw new Error('Could not find OSHA establishment search input');
        }
      }

      // Fill the establishment search term
      console.log(`🔍 Searching for establishment: "${businessName}"`);
      await page.fill('input#establishment', businessName);
      await BrowserUtils.sleep(1000);

      // Find and click the submit button using the specific structure from HTML
      const submitSelectors = [
        'button[type="submit"][value="Submit"]',
        'button.usa-button.usa-button-sm.usa-button-primary',
        'button[title="Search"]',
        'button:has-text("Search")',
        'button[type="submit"]',
        '.usa-button-primary',
        'input[type="submit"][value="Search"]',
        'input[type="submit"]'
      ];

      let submitClicked = false;

      for (const selector of submitSelectors) {
        try {
          const submitButton = await page.$(selector);
          if (submitButton) {
            console.log(`🔍 Found submit button with selector: ${selector}`);

            // Check if button is visible and enabled
            const isVisible = await submitButton.isVisible();
            const isEnabled = await submitButton.isEnabled();

            if (!isVisible) {
              console.log('🔄 Submit button not visible, scrolling into view...');
              await submitButton.scrollIntoViewIfNeeded();
              await BrowserUtils.sleep(500);
            }

            if (isEnabled) {
              await submitButton.click();
              console.log('✅ OSHA search form submitted');
              submitClicked = true;
              break;
            } else {
              console.log(`⚠️ Submit button found but disabled: ${selector}`);
            }
          }
        } catch (error) {
          console.log(`❌ Failed with selector ${selector}:`, error.message);
          continue;
        }
      }

      // If no specific button found, try pressing Enter
      if (!submitClicked) {
        console.log('🔍 No specific submit button found, trying Enter key...');
        await page.press('input#establishment', 'Enter');
        console.log('✅ Submitted with Enter key');
        submitClicked = true;
      }

      if (!submitClicked) {
        throw new Error('Could not find or click any submit button on OSHA page');
      }

      // Wait for results to load
      await BrowserUtils.sleep(CONFIG.WAIT_TIMES.FORM_SUBMIT);

      // Check for search results using OSHA-specific selectors
      const resultSelectors = [
        'table',
        '.search-results',
        '#search-results',
        '.results',
        '.data-table',
        'tbody',
        '.usa-table',
        '[role="table"]',
        '.establishment-results'
      ];

      let resultsFound = false;
      for (const selector of resultSelectors) {
        const exists = await BrowserUtils.waitForSelector(page, selector, { timeoutMs: 10000 });
        if (exists) {
          console.log(`✅ OSHA results loaded with selector: ${selector}`);
          resultsFound = true;
          break;
        }
      }

      // Also check for "no results" message
      if (!resultsFound) {
        const noResultsCheck = await page.evaluate(() => {
          const bodyText = document.body.textContent;
          return bodyText.includes('no results') ||
            bodyText.includes('No records found') ||
            bodyText.includes('0 results');
        });

        if (noResultsCheck) {
          console.log('ℹ️ OSHA search returned no results for the establishment');
          resultsFound = true; // Still consider this successful
        } else {
          console.warn('⚠️ No results table found, but continuing...');
        }
      }

      // Additional wait for any dynamic content
      await BrowserUtils.sleep(2000);

      // Remove any popups that might interfere with screenshot
      await PageInteractions.removePopups(page);

      // Save screenshot
      results.screenshotPath = await PageInteractions.saveScreenshot(
        page,
        CONFIG.SCREENSHOT_DIR,
        'osha_search_results.png'
      );

      results.success = true;
      results.resultsFound = resultsFound;
      console.log('✅ Successfully processed OSHA search by name');

    } catch (error) {
      results.success = false;
      results.error = error.message;
      console.error('❌ Error processing OSHA search:', error.message);

      // Save error screenshot for debugging
      try {
        results.screenshotPath = await PageInteractions.saveScreenshot(
          page,
          CONFIG.SCREENSHOT_DIR,
          'osha_search_error.png'
        );
      } catch (screenshotError) {
        console.error('Failed to save error screenshot:', screenshotError.message);
      }
    }

    return results;
  }
}

class Conversion {

  static async createPDFWithImages() {
    const screenshotsFolder = './screenshots'; // Source folder
    const outputFolder = './output'; // Destination folder
    const outputFile = path.join(outputFolder, `screenshots-document_${Date.now()}.pdf`);

    // Create output folder if it doesn't exist
    if (!fs1.existsSync(outputFolder)) {
      fs1.mkdirSync(outputFolder, { recursive: true });
    }

    // Get all image files from screenshots folder
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
    const files = fs1.readdirSync(screenshotsFolder)
      .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
      .sort(); // Sort alphabetically

    if (files.length === 0) {
      console.log('No image files found in the screenshots folder');
      return;
    }

    // Create a new PDF document
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs1.createWriteStream(outputFile);
    doc.pipe(stream);

    // Add each image to the PDF
    for (const file of files) {
      const imagePath = path.join(screenshotsFolder, file);

      try {
        // Add a new page for each image
        doc.addPage({
          margin: 50,
          size: 'A4'
        });

        // Add filename as caption
        doc.fontSize(12)
          .text(`Screenshot: ${file}`, 50, 50);

        // Add the image (fit to page with margins)
        const imageWidth = doc.page.width - 100; // 50px margin on each side
        const imageHeight = doc.page.height - 150; // Leave space for caption and bottom margin

        doc.image(imagePath, 50, 80, {
          width: imageWidth,
          height: imageHeight,
          fit: [imageWidth, imageHeight],
          align: 'center',
          valign: 'center'
        });

        console.log(`Added ${file} to PDF`);
      } catch (error) {
        console.error(`Error adding ${file}:`, error.message);
      }
    }

    // Finalize PDF
    doc.end();

    stream.on('finish', () => {
      console.log(`PDF created successfully: ${outputFile}`);
      console.log(`Total images added: ${files.length}`);
    });

    stream.on('error', (error) => {
      console.error('Error creating PDF:', error);
    });
  }

  static async createWordDocumentWithImages() {
    const screenshotsFolder = './screenshots';
    const outputFolder = './output';
    const outputFile = path.join(outputFolder, `screenshots-document_${Date.now()}.docx`);

    // Create output folder if it doesn't exist
    if (!fs1.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    // Check if source folder exists
    if (!fs1.existsSync(screenshotsFolder)) {
      console.error(`Screenshots folder not found: ${screenshotsFolder}`);
      return;
    }

    // Get all image files from screenshots folder
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
    const files = fs1.readdirSync(screenshotsFolder)
      .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
      .sort();

    if (files.length === 0) {
      console.log('No image files found in the screenshots folder');
      return;
    }

    console.log(`Found ${files.length} image files`);

    // Create document content
    const children = [
      new Paragraph({
        text: "Screenshots Document",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: `Generated on: ${new Date().toLocaleString()}`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: `Total screenshots: ${files.length}`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: "" }), // Empty line for spacing
    ];

    // Add each image to the document
    for (const [index, file] of files.entries()) {
      const imagePath = path.join(screenshotsFolder, file);

      try {
        // Add section break before each image (except first)
        if (index > 0) {
          children.push(new Paragraph({ text: "" }));
        }

        // Add image title
        children.push(
          new Paragraph({
            text: `Screenshot ${index + 1}: ${file}`,
            heading: HeadingLevel.HEADING_2,
          })
        );

        // Add the image
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: fs1.readFileSync(imagePath),
                transformation: {
                  width: 500,
                  height: 300,
                },
              }),
            ],
            alignment: AlignmentType.CENTER,
          })
        );

        console.log(`Added ${file} to document`);

      } catch (error) {
        console.error(`Error adding ${file}:`, error.message);
      }
    }

    // Create the document
    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });

    // Save the document - CORRECT WAY
    try {
      // Import Packer separately or use the correct method
      const { Packer } = require('docx');
      const buffer = await Packer.toBuffer(doc);
      fs1.writeFileSync(outputFile, buffer);
      console.log(`Word document created successfully: ${outputFile}`);
      console.log(`Total images added: ${files.length}`);
    } catch (error) {
      console.error('Error saving document:', error);
    }
  }

}

async function clearFolder(folderPath) {
  try {
    // Check if folder exists
    try {
      await fs.access(folderPath);
    } catch {
      console.log('Folder does not exist');
      return;
    }

    // Read all items in the folder
    const items = await fs.readdir(folderPath);

    // Delete each item
    for (const item of items) {
      const itemPath = path.join(folderPath, item);
      const stat = await fs.stat(itemPath);

      if (stat.isDirectory()) {
        // Recursively delete subdirectories
        await clearFolder(itemPath);
        await fs.rmdir(itemPath);
      } else {
        // Delete files
        await fs.unlink(itemPath);
      }
    }

    console.log(`Folder ${folderPath} cleared successfully`);
  } catch (error) {
    console.error('Error clearing folder:', error);
  }
}
// === Enhanced Main Service ===
class TaxFormService {
  static async processAllUrls(businessName = 'AC Trench Corp', feiNumber = '', options = {}) {
    let browser = null;
    const {
      includeSunbiz = false,
      includeSuspendedLists = false,
      includeSBAMandates = true,
      specificUrls = null
    } = options;

    const allResults = {
      businessName,
      feiNumber,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      results: []
    };

    try {
      console.log(`\n🚀 Starting multi-URL process for: ${businessName}`);
      if (feiNumber) console.log(`🔢 FEI Number: ${feiNumber}`);

      const { browser: b, context } = await BrowserManager.createStealthBrowser();
      browser = b;
      const page = await context.newPage();

      await BrowserManager.addStealthScripts(page);

      // Process County Tax URLs
      const urlsToProcess = specificUrls
        ? CONFIG.URLS.filter(url => specificUrls.includes(url.name))
        : CONFIG.URLS;

      console.log(`📋 Processing ${urlsToProcess.length} County URL(s)`);

      for (const urlConfig of urlsToProcess) {
        const result = await PageInteractions.processSingleUrl(page, urlConfig, businessName);
        allResults.results.push(result);
        allResults.totalProcessed++;

        if (result.success) {
          allResults.successful++;
        } else {
          allResults.failed++;
        }
      }

      // Process Sunbiz URLs if requested
      if (includeSunbiz) {
        console.log(`\n🏢 Processing Sunbiz searches...`);

        // Sunbiz by Name
        const sunbizByNameResult = await PageInteractions.processSunbizByName(page, businessName);
        allResults.results.push(sunbizByNameResult);
        allResults.totalProcessed++;
        sunbizByNameResult.success ? allResults.successful++ : allResults.failed++;

        // Sunbiz by FEI (only if FEI number provided)
        if (feiNumber) {
          const sunbizByFeiResult = await PageInteractions.processSunbizByFei(page, feiNumber);
          allResults.results.push(sunbizByFeiResult);
          allResults.totalProcessed++;
          sunbizByFeiResult.success ? allResults.successful++ : allResults.failed++;
        } else {
          console.log('ℹ️ Skipping Sunbiz FEI search - no FEI number provided');
        }
      }

      // Process Suspended Lists if requested
      if (includeSuspendedLists) {
        console.log(`\n🚫 Processing Suspended Vendor Lists...`);

        const suspendedListResults = await PageInteractions.processAllSuspendedLists(page, businessName);

        suspendedListResults.forEach(result => {
          allResults.results.push(result);
          allResults.totalProcessed++;
          result.success ? allResults.successful++ : allResults.failed++;
        });
      }

      // Process SBA Mandates if requested
      if (includeSBAMandates) {
        console.log(`\n🏛️ Processing SBA Governance Mandates...`);

        const sbaResults = await PageInteractions.processAllSBAMandates(page, businessName);

        sbaResults.forEach(result => {
          allResults.results.push(result);
          allResults.totalProcessed++;
          result.success ? allResults.successful++ : allResults.failed++;
        });
      }

      if (includeSunbiz) {
        console.log(`\n🏢 Processing Sunbiz searches...`);

        // Sunbiz by Name
        const sunbizByNameResult = await PageInteractions.processOshaByName(page, businessName);
        allResults.results.push(sunbizByNameResult);
        allResults.totalProcessed++;
        sunbizByNameResult.success ? allResults.successful++ : allResults.failed++;
      }

      console.log(`\n🎉 Completed processing all URLs`);
      console.log(`✅ Successful: ${allResults.successful}`);
      console.log(`❌ Failed: ${allResults.failed}`);
      console.log(`📊 Total: ${allResults.totalProcessed}`);

      return allResults;

    } catch (error) {
      console.error('❌ Error in TaxFormService:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
        console.log('🔚 Browser closed');
      }
    }
  }

  static async processSingleUrlByName(businessName, urlName, feiNumber = '') {
    const urlConfig = CONFIG.URLS.find(url => url.name === urlName);
    if (!urlConfig) {
      throw new Error(`URL configuration not found for: ${urlName}`);
    }

    const results = await this.processAllUrls(businessName, feiNumber, {
      specificUrls: [urlName],
      includeSunbiz: false,
      includeSuspendedLists: false
    });
    return results.results[0];
  }

  // Process only Sunbiz searches
  static async processSunbizOnly(businessName, feiNumber = '') {
    return await this.processAllUrls(businessName, feiNumber, {
      specificUrls: [],
      includeSunbiz: true,
      includeSuspendedLists: false
    });
  }

  // NEW: Process only Suspended Lists
  static async processSuspendedListsOnly(businessName = '') {
    return await this.processAllUrls(businessName, '', {
      specificUrls: [],
      includeSunbiz: false,
      includeSuspendedLists: true
    });
  }

  // NEW: Process only SBA Mandates
  static async processSBAMandatesOnly(businessName = '') {
    return await this.processAllUrls(businessName, '', {
      specificUrls: [],
      includeSunbiz: false,
      includeSuspendedLists: false,
      includeSBAMandates: true
    });
  }
}

app.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'API is running!',
    timestamp: new Date().toISOString()
  });
});
// === Enhanced Routes ===
app.get('/fill-form', async (req, res) => {
  try {
    const businessName = req.query.businessName || 'AC Trench Corp';
    const feiNumber = req.query.feiNumber || '';
    const specificUrl = req.query.url;
    const includeSunbiz = req.query.sunbiz !== 'false'; // Default true
    const includeSuspendedLists = req.query.suspended !== 'false'; // Default true
    const includeSBAMandates = req.query.sba !== 'false'; // Default true


    let result;

    if (specificUrl) {
      result = await TaxFormService.processSingleUrlByName(businessName, specificUrl, feiNumber);
    } else {
      result = await TaxFormService.processAllUrls(businessName, feiNumber, {
        includeSunbiz,
        includeSuspendedLists,
        includeSBAMandates
      });
    }

    await Conversion.createPDFWithImages();
    await Conversion.createWordDocumentWithImages();
    const emailService = new EmailService();
    const subject = "Reports for: " + businessName + " - " + feiNumber;
    // 1. Send all files (with automatic size checking)
    await emailService.sendFolderContents('auppal80@gmail.com', subject, './output');
    await clearFolder('./output');
    res.json({
      success: true,
      businessName,
      feiNumber
    });

  } catch (error) {
    console.error('Route error:', error.message);
    res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
});

// Start server
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${CONFIG.PORT}`);
  console.log(`📋 Available URLs: ${CONFIG.URLS.map(url => url.name).join(', ')}`);
  console.log(`🏢 Sunbiz Endpoints: by-name, by-fei`);
  console.log(`🚫 Suspended List Endpoints: suspended-vendor-list`);
  console.log(`💾 Screenshots will be saved to: ${CONFIG.SCREENSHOT_DIR}`);
});

module.exports = {
  app,
  BrowserUtils,
  PageInteractions,
  TaxFormService,
  Conversion,
  CONFIG
};