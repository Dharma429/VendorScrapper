# Use official Playwright image with Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY install-browsers.js ./

# Install Node.js dependencies
RUN npm ci --only=production

# Verify Playwright installation
RUN npx playwright install-deps
RUN npx playwright install chromium

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p screenshots output && \
    chmod -R 755 screenshots output

# Create a non-root user for security
RUN useradd -m -u 1001 playwrightuser && \
    chown -R playwrightuser:playwrightuser /app

# Switch to non-root user
USER playwrightuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start application
CMD ["node", "index.js"]