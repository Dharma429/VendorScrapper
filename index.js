// === Required Modules ===
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// === Configuration ===
const CONFIG = {
  PORT: process.env.PORT || 8080,
  SCREENSHOT_DIR: '/app/screenshots',
  OUTPUT_DIR: '/app/output'
};

console.log('🚀 Starting Vendor Check API in Docker...');

const app = express();
app.use(cors());
app.use(express.json());

// === Browser Management ===
class BrowserManager {
  static async createBrowser() {
    try {
      console.log('🔄 Launching browser...');
      
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
      });

      console.log('✅ Browser launched successfully');
      return { browser, context };
      
    } catch (error) {
      console.error('❌ Browser launch failed:', error.message);
      throw error;
    }
  }

  static async testBrowser() {
    let browser = null;
    try {
      const { browser: b, context } = await this.createBrowser();
      browser = b;
      const page = await context.newPage();
      
      await page.goto('https://example.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      const title = await page.title();
      console.log(`✅ Browser test successful: ${title}`);
      
      return { success: true, title };
    } catch (error) {
      console.error('❌ Browser test failed:', error.message);
      return { success: false, error: error.message };
    } finally {
      if (browser) await browser.close();
    }
  }
}

// === Initialize Directories ===
async function initializeDirectories() {
  try {
    await fs.mkdir(CONFIG.SCREENSHOT_DIR, { recursive: true });
    await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
    console.log('✅ Directories initialized');
  } catch (error) {
    console.error('❌ Directory initialization failed:', error.message);
  }
}

// === Routes ===
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Vendor Check API 1.9 is running in Docker!',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', async (req, res) => {
  try {
    const browserTest = await BrowserManager.testBrowser();
    
    res.json({ 
      status: 'healthy',
      browser: 'available',
      timestamp: new Date().toISOString(),
      test: browserTest
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy', 
      browser: 'unavailable',
      error: error.message
    });
  }
});

app.get('/fill-form', async (req, res) => {
  let browser = null;
  try {
    const businessName = req.query.businessName || 'AC Trench Corp';
    console.log(`📋 Processing: ${businessName}`);
    
    const { browser: b, context } = await BrowserManager.createBrowser();
    browser = b;
    const page = await context.newPage();
    
    await page.goto('https://example.com', { timeout: 30000 });
    const title = await page.title();
    
    const screenshotPath = path.join(CONFIG.SCREENSHOT_DIR, `test-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    
    res.json({
      success: true,
      businessName,
      result: {
        title,
        screenshot: path.basename(screenshotPath),
        message: 'Processing completed'
      }
    });

  } catch (error) {
    console.error('Route error:', error.message);
    res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

// Initialize and start
initializeDirectories().then(() => {
  app.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`🎉 Server running on http://0.0.0.0:${CONFIG.PORT}`);
  });
});