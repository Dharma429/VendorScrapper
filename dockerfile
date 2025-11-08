# Use official Playwright image with all browsers pre-installed
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Verify and ensure browsers are properly installed
RUN npx playwright install

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p screenshots output && \
    chmod -R 755 screenshots output

# Switch to the playwright user that comes with the image
USER playwright

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start application
CMD ["node", "index.js"]