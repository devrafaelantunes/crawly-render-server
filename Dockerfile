FROM node:18-alpine

# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Install dependencies for Chrome and Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set the working directory in the container
WORKDIR /app

# Copy package.json first for better caching
COPY package.json ./

# Install dependencies with optimizations
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy the rest of the application code to the container
COPY . .

# Expose the port that your application will run on
EXPOSE 3000

# Set environment variables
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Command to start your application
CMD ["node", "cluster.js"]