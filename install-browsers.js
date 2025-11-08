// install-browsers.js - Helper script for browser installation
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Playwright Browser Installation Script');
console.log('=========================================');

try {
  console.log('📁 Current directory:', process.cwd());
  console.log('🔍 Checking Playwright installation...');
  
  // Check if Playwright is available
  try {
    const playwrightVersion = execSync('npx playwright --version', { encoding: 'utf8' }).trim();
    console.log('✅ Playwright version:', playwrightVersion);
  } catch (error) {
    console.log('❌ Playwright not available via npx');
  }
  
  // Install browsers
  console.log('⚡ Installing Chromium browser...');
  execSync('npx playwright install chromium', { 
    stdio: 'inherit',
    timeout: 120000 
  });
  
  console.log('✅ Browser installation completed!');
  
  // Verify installation
  console.log('🔍 Verifying browser installation...');
  try {
    const { chromium } = require('playwright');
    console.log('✅ Playwright module loaded successfully');
  } catch (error) {
    console.log('❌ Failed to load Playwright:', error.message);
  }
  
} catch (error) {
  console.error('❌ Browser installation failed:', error.message);
  process.exit(1);
}