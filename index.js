// === Required Modules ===
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

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
    ARGS: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  }
};

// === Browser Installation Check ===
class BrowserInstaller {
  static async ensureBrowserInstalled() {
    try {
      console.log('🔍 Checking if Playwright browser is available...');
      
      // Set the browser path explicitly
      process.env.PLAYWRIGHT_BROWSERS_PATH = './node_modules/playwright/.local-browsers';
      
      // Try to launch browser to verify installation
      const browser = await chromium.launch({ 
        headless: true,
        args: CONFIG.BROWSER.ARGS 
      });
      await browser.close();
      console.log('✅ Playwright browser is available');
      return true;
    } catch (error) {
      console.log('❌ Browser not available:', error.message);
      console.log('💡 Run: node install-browsers.js to install browsers');
      return false;
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// === Enhanced Browser Management ===
class BrowserManager {
  static async createBrowser() {
    try {
      console.log('🔄 Attempting to launch browser...');
      
      // Set explicit browser path
      process.env.PLAYWRIGHT_BROWSERS_PATH = './node_modules/playwright/.local-browsers';
      
      const browser = await chromium.launch({
        headless: CONFIG.BROWSER.HEADLESS,
        args: CONFIG.BROWSER.ARGS
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true
      });

      console.log('✅ Browser launched successfully');
      return { browser, context };
      
    } catch (error) {
      console.error('❌ Browser launch failed:', error.message);
      throw new Error(`Browser not available. Please ensure browsers are installed: ${error.message}`);
    }
  }
}

// === Your Service Class ===
class TaxFormService {
  static async processAllUrls(businessName = 'AC Trench Corp') {
    let browser = null;
    
    try {
      console.log(`🚀 Starting process for: ${businessName}`);
      
      const { browser: b, context } = await BrowserManager.createBrowser();
      browser = b;
      const page = await context.newPage();
      
      // Your existing processing logic here
      console.log('📝 Processing business...');
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
      
      return { success: true, message: 'Processing completed' };
      
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
}

// === Routes ===
app.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'API is V4.0 running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/fill-form', async (req, res) => {
  try {
    const businessName = req.query.businessName || 'AC Trench Corp';
    const result = await TaxFormService.processAllUrls(businessName);
    
    res.json({
      success: true,
      businessName,
      result
    });

  } catch (error) {
    console.error('Route error:', error.message);
    res.status(500).json({
      error: 'Failed to process request',
      details: error.message,
      solution: 'Browsers may not be installed. Check deployment logs.'
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const browserAvailable = await BrowserInstaller.ensureBrowserInstalled();
    
    res.json({ 
      status: browserAvailable ? 'healthy' : 'degraded',
      browserAvailable,
      timestamp: new Date().toISOString(),
      message: browserAvailable ? 'Ready' : 'Browsers not installed'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      browserAvailable: false,
      error: error.message
    });
  }
});

// Install browsers endpoint (for manual installation)
app.post('/install-browsers', async (req, res) => {
  try {
    console.log('Manual browser installation requested...');
    const { execSync } = require('child_process');
    execSync('node install-browsers.js', { stdio: 'inherit' });
    res.json({ success: true, message: 'Browsers installed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize browser check on startup
BrowserInstaller.ensureBrowserInstalled().then(success => {
  if (!success) {
    console.log('⚠️  Browsers not available. Some functionality will be limited.');
  }
});

// Start server
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${CONFIG.PORT}`);
});

module.exports = { app };