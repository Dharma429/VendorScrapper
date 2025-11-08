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
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  }
};

// === Browser Installation Check ===
class BrowserInstaller {
  static async ensureBrowserInstalled() {
    try {
      console.log('🔍 Checking if Playwright browser is available...');
      
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
      return await this.installBrowser();
    }
  }

  static async installBrowser() {
    try {
      console.log('⚡ Installing Playwright browser...');
      
      // Set the browser path to a location we control
      process.env.PLAYWRIGHT_BROWSERS_PATH = './node_modules/playwright/.local-browsers';
      
      // Install chromium browser
      execSync('npx playwright install chromium', { 
        stdio: 'inherit',
        timeout: 120000
      });
      
      console.log('✅ Playwright browser installed successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to install browser:', error.message);
      return false;
    }
  }
}

// Initialize browser check on startup
(async () => {
  await BrowserInstaller.ensureBrowserInstalled();
})();

const app = express();
app.use(cors());
app.use(express.json());

// === Enhanced Browser Management ===
class BrowserManager {
  static async createBrowser() {
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Attempting to launch browser (attempt ${retryCount + 1})...`);
        
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
        retryCount++;
        console.error(`❌ Browser launch failed (attempt ${retryCount}):`, error.message);
        
        if (error.message.includes('Executable doesn\'t exist') && retryCount < maxRetries) {
          console.log('🔄 Browser missing, attempting installation...');
          await BrowserInstaller.installBrowser();
          continue;
        }
        
        throw error;
      }
    }
  }
}

// === Your Existing Service Class ===
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
    message: 'API is V3.o running!',
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
      details: error.message
    });
  }
});

// Health check with browser verification
app.get('/health', async (req, res) => {
  try {
    const browserAvailable = await BrowserInstaller.ensureBrowserInstalled();
    
    res.json({ 
      status: 'healthy', 
      browserAvailable,
      timestamp: new Date().toISOString(),
      version: '2.0'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      browserAvailable: false,
      error: error.message
    });
  }
});

// Start server
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${CONFIG.PORT}`);
});

module.exports = { app };