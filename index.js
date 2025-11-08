// === Required Modules ===
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// === Configuration ===
const CONFIG = {
  PORT: process.env.PORT || 8080,
  SCREENSHOT_DIR: 'screenshots',
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

const app = express();
app.use(cors());
app.use(express.json());

// === Browser Management ===
class BrowserManager {
  static async createBrowser() {
    try {
      console.log('🔄 Launching browser...');
      
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
      throw new Error(`Browser launch failed: ${error.message}`);
    }
  }
}

// === Tax Form Service ===
class TaxFormService {
  static async processAllUrls(businessName = 'AC Trench Corp') {
    let browser = null;
    
    try {
      console.log(`🚀 Starting process for: ${businessName}`);
      
      const { browser: b, context } = await BrowserManager.createBrowser();
      browser = b;
      const page = await context.newPage();
      
      // Example: Navigate to a test page
      console.log('📝 Navigating to example.com...');
      await page.goto('https://example.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Take a screenshot to verify it works
      await fs.mkdir(CONFIG.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ 
        path: path.join(CONFIG.SCREENSHOT_DIR, 'test.png'),
        fullPage: true 
      });
      
      console.log('✅ Processing completed successfully');
      return { 
        success: true, 
        message: 'Processing completed',
        screenshot: 'test.png'
      };
      
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
    message: 'API is V5.0 running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', async (req, res) => {
  try {
    // Test browser availability
    const browser = await chromium.launch({ 
      headless: true,
      args: CONFIG.BROWSER.ARGS 
    });
    await browser.close();
    
    res.json({ 
      status: 'healthy',
      browser: 'available',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      browser: 'unavailable',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/fill-form', async (req, res) => {
  try {
    const businessName = req.query.businessName || 'AC Trench Corp';
    console.log(`📋 Processing request for: ${businessName}`);
    
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

// Test browser endpoint
app.get('/test-browser', async (req, res) => {
  let browser = null;
  try {
    console.log('🧪 Testing browser functionality...');
    
    const { browser: b, context } = await BrowserManager.createBrowser();
    browser = b;
    const page = await context.newPage();
    
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    
    await page.screenshot({ path: '/tmp/test-browser.png' });
    
    res.json({
      success: true,
      message: 'Browser test successful',
      title: title,
      screenshot: 'test-browser.png'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Initialize
(async () => {
  try {
    await fs.mkdir(CONFIG.SCREENSHOT_DIR, { recursive: true });
    await fs.mkdir('output', { recursive: true });
    console.log('✅ Directories initialized');
  } catch (error) {
    console.error('❌ Directory initialization failed:', error);
  }
})();

// Start server
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${CONFIG.PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app };