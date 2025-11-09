const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Vendor Check API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test route without browser first
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API test successful',
    timestamp: new Date().toISOString()
  });
});

// Browser test route
app.get('/browser-test', async (req, res) => {
  let browser;
  try {
    console.log('Starting browser test...');
    
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    
    const title = await page.title();
    
    res.json({
      success: true,
      message: 'Browser test successful',
      title: title,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Browser test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Browser test failed',
      message: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Main endpoint
app.get('/fill-form', async (req, res) => {
  let browser;
  try {
    const businessName = req.query.businessName || 'Test Business';
    console.log(`Processing business: ${businessName}`);
    
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to example page
    await page.goto('https://example.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    const title = await page.title();
    
    // Take screenshot
    const screenshotPath = path.join('/app/screenshots', `test-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    
    res.json({
      success: true,
      businessName: businessName,
      result: {
        title: title,
        screenshot: path.basename(screenshotPath),
        message: 'Processing completed successfully'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in fill-form:', error);
    res.status(500).json({
      success: false,
      error: 'Processing failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Vendor Check API started on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;