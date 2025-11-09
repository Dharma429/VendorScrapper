# Use specific Playwright version
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install Playwright browsers
RUN npx playwright install chromium

# Copy app source
COPY . .

# Create app directories
RUN mkdir -p screenshots output

# Expose the port
EXPOSE 8080

# Start the app
CMD ["node", "index.js"]