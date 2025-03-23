FROM node:20-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Use BuildKit cache mount for faster npm installs
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy the rest of the application
COPY . .

# Build the application
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Build if production, otherwise skip
RUN if [ "$NODE_ENV" = "production" ]; then npm run build; fi

# Expose the port
EXPOSE 3000
EXPOSE 5173

# Start the application
CMD ["sh", "-c", "npm run ${NODE_ENV:-production}:run"]
