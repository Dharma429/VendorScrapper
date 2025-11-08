// === Required Modules ===
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// === Configuration ===
const CONFIG = {
  PORT: process.env.PORT || 8080,
  SCREENSHOT_DIR: process.env.SCREENSHOT_DIR || '/app/screenshots',
  OUTPUT_DIR: process.env.OUTPUT_DIR || '/app/output',
  NODE_ENV: process.env.NODE_ENV || 'development',
  BROWSER: {
    HEADLESS: true,
    // Use the exact executable path from the Playwright Docker image
    EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/ms-playwright/chromium-*/chrome-linux/chrome',
    ARGS: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  }
};

console.log('🚀 Starting Vendor Check API...');
console.log(`📁 Screenshot directory: ${CONFIG.SCREENSHOT_DIR}`);
console.log(`📁 Output directory: ${CONFIG.OUTPUT_DIR}`);
console.log(`🌍 Environment: ${CONFIG.NODE_ENV}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Browser Management ===
class BrowserManager {
  static async findChromiumPath() {
    try {
      // Try to find Chromium in the Docker image location
      const possiblePaths = [
        '/ms-playwright/chromium-*/chrome-linux/chrome',
        '/ms-playwright/chromium-*/chrome-linux/chromium',
        '/ms-playwright/chromium-*/chrome-linux/headless_shell',
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ];

      for (const pattern of possiblePaths) {
        try {
          const { execSync } = require('child_process');
          const result = execSync(`ls -la ${pattern} 2>/dev/null | head -1`, { encoding: 'utf8' }).trim();
          if (result && !result.includes('No such file')) {
            const actualPath = pattern.replace('*', result.split('/')[2]); // Extract version
            console.log(`✅ Found Chromium at: ${actualPath}`);
            return actualPath;
          }
        } catch (e) {
          // Continue to next pattern
        }
      }

      console.log('⚠️ Could not find Chromium path, using default');
      return null;
    } catch (error) {
      console.log('⚠️ Error finding Chromium path:', error.message);
      return null;
    }
  }

  static async createBrowser() {
    try {
      console.log('🔄 Launching Chromium browser...');
      
      // Find the correct Chromium path
      const executablePath = await this.findChromiumPath();
      
      const launchOptions = {
        headless: CONFIG.BROWSER.HEADLESS,
        args: CONFIG.BROWSER.ARGS,
        timeout: 30000
      };

      // Only set executablePath if we found it
      if (executablePath) {
        launchOptions.executablePath = executablePath;
        console.log(`🔧 Using Chromium from: ${executablePath}`);
      }

      const browser = await chromium.launch(launchOptions);

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      console.log('✅ Browser launched successfully');
      return { browser, context };
      
    } catch (error) {
      console.error('❌ Browser launch failed:', error.message);
      
      // Try fallback method without executablePath
      if (error.message.includes('Executable doesn\'t exist')) {
        console.log('🔄 Trying fallback browser launch...');
        try {
          const browser = await chromium.launch({
            headless: CONFIG.BROWSER.HEADLESS,
            args: CONFIG.BROWSER.ARGS,
            timeout: 30000
          });

          const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            ignoreHTTPSErrors: true
          });

          console.log('✅ Fallback browser launch successful');
          return { browser, context };
        } catch (fallbackError) {
          console.error('❌ Fallback browser launch also failed:', fallbackError.message);
        }
      }
      
      throw new Error(`Browser launch failed: ${error.message}`);
    }
  }

  static async testBrowser() {
    let browser = null;
    try {
      console.log('🧪 Testing browser functionality...');
      const { browser: b, context } = await this.createBrowser();
      browser = b;
      const page = await context.newPage();
      
      await page.goto('https://example.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      const title = await page.title();
      console.log(`✅ Browser test successful - Page title: ${title}`);
      
      // Take a screenshot to verify it works
      await page.screenshot({ path: '/tmp/browser-test.png' });
      
      return { success: true, title };
    } catch (error) {
      console.error('❌ Browser test failed:', error.message);
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        await browser.close();
        console.log('🔚 Test browser closed');
      }
    }
  }
}

// === Tax Form Service ===
class TaxFormService {
  static async processBusiness(businessName = 'AC Trench Corp') {
    let browser = null;
    
    try {
      console.log(`🚀 Starting process for: ${businessName}`);
      
      const { browser: b, context } = await BrowserManager.createBrowser();
      browser = b;
      const page = await context.newPage();
      
      // Example processing - navigate to a test page
      console.log('📝 Navigating to example.com...');
      await page.goto('https://example.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Take screenshot as proof of functionality
      const screenshotPath = path.join(CONFIG.SCREENSHOT_DIR, `test-${Date.now()}.png`);
      await page.screenshot({ 
        path: screenshotPath,
        fullPage: true 
      });
      
      const title = await page.title();
      
      console.log('✅ Processing completed successfully');
      return { 
        success: true, 
        message: 'Processing completed',
        businessName,
        title,
        screenshot: path.basename(screenshotPath)
      };
      
    } catch (error) {
      console.error('❌ Error processing business:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
        console.log('🔚 Browser closed');
      }
    }
  }
}

// === Initialize Directories ===
async function initializeDirectories() {
  try {
    await fs.mkdir(CONFIG.SCREENSHOT_DIR, { recursive: true });
    await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
    console.log('✅ Directories initialized successfully');
  } catch (error) {
    console.error('❌ Directory initialization failed:', error.message);
  }
}

// === Routes ===
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Vendor Check API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: CONFIG.NODE_ENV
  });
});

app.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'API is 0.1 running!',
    timestamp: new Date().toISOString(),
    environment: CONFIG.NODE_ENV
  });
});

app.get('/health', async (req, res) => {
  try {
    const browserTest = await BrowserManager.testBrowser();
    
    res.json({ 
      status: browserTest.success ? 'healthy' : 'degraded',
      browser: browserTest.success ? 'available' : 'unavailable',
      timestamp: new Date().toISOString(),
      environment: CONFIG.NODE_ENV,
      details: {
        screenshotDir: CONFIG.SCREENSHOT_DIR,
        outputDir: CONFIG.OUTPUT_DIR,
        browserTest: browserTest
      }
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
    
    const result = await TaxFormService.processBusiness(businessName);
    
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
      solution: 'Browser may not be properly installed in the container'
    });
  }
});

app.get('/test-browser', async (req, res) => {
  try {
    const result = await BrowserManager.testBrowser();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Browser test successful',
        title: result.title,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Browser test failed',
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Browser test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /status', 
      'GET /health',
      'GET /fill-form',
      'GET /test-browser'
    ]
  });
});

// === Startup ===
async function startServer() {
  try {
    // Initialize directories
    await initializeDirectories();
    
    // Test browser on startup
    console.log('🔧 Testing browser on startup...');
    const browserTest = await BrowserManager.testBrowser();
    if (!browserTest.success) {
      console.warn('⚠️ Browser test failed on startup. Some functionality may be limited.');
    }
    
    // Start server
    app.listen(CONFIG.PORT, '0.0.0.0', () => {
      console.log(`🎉 Server running on http://0.0.0.0:${CONFIG.PORT}`);
      console.log(`📊 Health check: http://0.0.0.0:${CONFIG.PORT}/health`);
      console.log(`🩺 Browser test: http://0.0.0.0:${CONFIG.PORT}/test-browser`);
      console.log(`🐛 Debug info: http://0.0.0.0:${CONFIG.PORT}/debug-browsers`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startServer();

module.exports = { app, BrowserManager, TaxFormService };