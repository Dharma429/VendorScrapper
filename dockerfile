FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY install-browsers.js ./

# Install dependencies
RUN npm ci

# Install Playwright browsers
RUN npx playwright install chromium

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p screenshots output

# Expose port
EXPOSE 8080

# Start application
CMD ["node", "index.js"]