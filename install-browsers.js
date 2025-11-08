// install-browsers.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Starting Playwright browser installation...');

try {
  // Set environment variable to control browser installation path
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, 'node_modules', 'playwright', '.local-browsers');
  
  console.log('📁 Browser installation path:', process.env.PLAYWRIGHT_BROWSERS_PATH);
  
  // Create the directory if it doesn't exist
  if (!fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)) {
    fs.mkdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });
  }
  
  // Install chromium browser
  console.log('⚡ Installing Chromium browser...');
  execSync('npx playwright install chromium', { 
    stdio: 'inherit',
    timeout: 120000 
  });
  
  console.log('✅ Playwright browsers installed successfully!');
  
  // Verify installation
  console.log('🔍 Verifying installation...');
  const browsersDir = path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium*');
  const files = fs.readdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH);
  console.log('📁 Browser files:', files);
  
} catch (error) {
  console.error('❌ Failed to install browsers:', error.message);
  process.exit(1);
}