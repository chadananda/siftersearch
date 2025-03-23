FROM node:18-alpine

WORKDIR /app

# Install cron and zip
RUN apk add --no-cache cron zip curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY scripts/storage-management.js ./scripts/
COPY .env ./

# Create cron job
RUN echo "0 2 * * * cd /app && node scripts/storage-management.js >> /var/log/cron.log 2>&1" > /etc/crontabs/root

# Create log file
RUN touch /var/log/cron.log

# Start cron in foreground
CMD crond -f -l 2 && tail -f /var/log/cron.log
