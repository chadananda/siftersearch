# 7. Container Configuration

## 1. Overview

SifterSearch uses Docker containers for both development and production environments. The containerization strategy ensures consistent deployment across different environments and simplifies the setup process.

The application consists of two main containers:

1. **App Container**: Runs the SvelteKit application
2. **Manticore Container**: Runs the Manticore Search engine

## 2. Container Architecture

SifterSearch uses Docker containers for both development and production environments, providing consistency and isolation for all components.

## Container Architecture Overview

The SifterSearch application uses a multi-container architecture with Docker Compose:

1. **App Container**: SvelteKit application running with Node.js
2. **Manticore Container**: Manticore Search engine for full-text and vector search

This separation allows each component to be scaled and managed independently while maintaining clear boundaries between services.

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Environment                     │
│                                                         │
│  ┌─────────────────┐          ┌─────────────────────┐  │
│  │                 │          │                     │  │
│  │  Manticore      │          │  SvelteKit App      │  │
│  │  Search Engine  │          │  (UI + API)         │  │
│  │                 │          │                     │  │
│  └─────────┬───────┘          └─────────────────────┘  │
│            │                            ▲               │
│            │                            │               │
└────────────┼────────────────────────────┼───────────────┘
             │                            │
             ▼                            ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                  External Services                      │
│                                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐    │
│  │                     │    │                     │    │
│  │  LibSQL/Turso       │    │  S3 Storage         │    │
│  │  (Content Store)    │    │  (File Storage)     │    │
│  │                     │    │                     │    │
│  └─────────────────────┘    └─────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 3. App Container

The App Container runs the SvelteKit application, which serves both the frontend UI and the API endpoints.

### Configuration

- **Base Image**: Node.js Alpine
- **Exposed Ports**:
  - `3000`: API server
  - `5173`: Development server (Vite)
- **Volumes**:
  - `./:/app`: Project files (development)
  - `app-data:/app/data`: App data (production)
- **Environment Variables**:
  - `NODE_ENV`: Environment mode (development/production)
  - `API_PORT`: API server port
  - `MANTICORE_HOST`: Manticore host
  - `MANTICORE_PORT`: Manticore port
  - Various storage and database credentials

## 4. Manticore Container

The Manticore Container runs the Manticore Search engine, which provides powerful search capabilities for the application.

### Configuration

- **Base Image**: `manticoresearch/manticore:6.0.4`
- **Exposed Ports**:
  - `9308`: Manticore MySQL protocol port
- **Volumes**:
  - `./docker/manticore/manticore.conf:/etc/manticoresearch/manticore.conf`: Configuration file
  - `manticore-data:/var/lib/manticore`: Data directory (production)
  - `./data/manticore:/var/lib/manticore`: Local data directory (development)

## 5. Docker Compose Configuration

SifterSearch uses a simplified Docker Compose approach with a base configuration file for production and an override file for development.

### Base Configuration (docker-compose.yml)

The base `docker-compose.yml` contains the production configuration:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: docker/app/Dockerfile
    container_name: "siftersearch-app"
    environment:
      NODE_ENV: "${NODE_ENV:-production}"
      API_PORT: "${API_PORT:-3000}"
      MANTICORE_HOST: manticore
      MANTICORE_PORT: 9308
      # Database and storage credentials
    ports:
      - "${API_PORT:-3000}:3000"
    volumes:
      - app-data:/app/data
    depends_on:
      - manticore
    restart: unless-stopped
    networks:
      - siftersearch-network
    command: npm run start

  manticore:
    image: manticoresearch/manticore:6.0.4
    container_name: "siftersearch-manticore"
    environment:
      - EXTRA=1
    volumes:
      - ./docker/manticore/manticore.conf:/etc/manticoresearch/manticore.conf
      - manticore-data:/var/lib/manticore
    ports:
      - "127.0.0.1:9308:9308"
    restart: unless-stopped
    networks:
      - siftersearch-network

networks:
  siftersearch-network:
    driver: bridge

volumes:
  app-data:
  manticore-data:
```

### Development Override (docker-compose.dev.yml)

The development override file `docker-compose.dev.yml` contains only the development-specific configurations:

```yaml
version: '3.8'

services:
  app:
    container_name: "siftersearch-app-dev"
    environment:
      NODE_ENV: "development"
    volumes:
      - ./:/app
    ports:
      - "${API_PORT:-3000}:3000"
      - "${APP_PORT:-5173}:5173"
    command: npm run dev:sveltekit
    
  manticore:
    container_name: "siftersearch-manticore-dev"
    ports:
      - "9308:9308"  # Expose Manticore port for direct access in development
    volumes:
      - ./docker/manticore/manticore.conf:/etc/manticoresearch/manticore.conf
      - ./data/manticore:/var/lib/manticore  # Use local directory for development data
```

## 6. Running Containers

### Development Environment

To run the development environment:

```bash
# Start development environment
npm run dev
```

This command:
1. Runs system checks
2. Stops any running Docker containers
3. Initializes storage and database
4. Starts Docker with both the base and dev override configurations

### Production Environment

To run the production environment:

```bash
# Start production environment
npm run start
```

This command starts the Docker containers with the production configuration.

## 7. Additional Commands

### Utility Commands

```bash
# Kill all Docker containers
npm run kill

# Clean Docker resources (containers, networks, volumes)
npm run clean

# Run system checks
npm run system:check
```

## 8. Hosting and Deployment Strategy

SifterSearch is designed with a vendor-agnostic hosting approach that avoids lock-in to any specific cloud provider. This gives you maximum flexibility to deploy on any infrastructure that supports Docker.

### Hosting Requirements

The minimal hosting requirements for SifterSearch are:

1. **Docker and Docker Compose**: To run the containerized application
2. **Persistent Storage**: For the local database copy and Manticore search data
3. **Network Connectivity**: For connecting to external services

### External Services

SifterSearch uses external services for most of its data storage needs, which means the application itself remains lightweight and portable:

1. **LibSQL/Turso**: For the primary database (with a local read-only copy)
2. **S3-Compatible Storage**: For document storage (Backblaze B2 for primary, Scaleway for archives)
3. **Authentication**: External authentication provider
4. **Email**: External email service

This architecture means you only need to back up the Manticore search data periodically to your archive storage, as all other data is already stored in external services.

### Deployment Options

SifterSearch can be deployed on:

1. **VPS Providers**: Any virtual private server that supports Docker (Vultr, DigitalOcean, Linode, etc.)
2. **Self-Hosted Servers**: On-premises servers or home servers
3. **Container Platforms**: Kubernetes, Docker Swarm, or other container orchestration platforms

### Data Persistence

The Docker Compose configuration uses named volumes to ensure data persistence:

1. **app-data**: Stores the local copy of the database and application state
2. **manticore-data**: Stores the Manticore search index and data

In production, these volumes are managed by Docker. For additional data safety, you can:

1. Configure periodic backups of the Manticore data to your archive storage
2. Mount the volumes to specific host directories for easier backup management

### Backup Strategy

Since most data is stored in external services, the backup strategy is simplified:

1. **Manticore Data**: Periodic backups to archive storage (Scaleway)
2. **Local Database**: Automatically synced with the remote Turso database
3. **Documents and Files**: Already stored in S3-compatible storage with their own redundancy

This approach minimizes the data that needs to be backed up from the host server itself, making the application more portable and easier to migrate between hosting providers.

## 9. Scaling Considerations

SifterSearch is designed to scale horizontally by adding more containers as needed. This can be achieved through container orchestration platforms like Kubernetes or Docker Swarm.

### Scaling the App Container

To scale the App Container, you can add more instances of the container and use a load balancer to distribute traffic.

### Scaling the Manticore Container

To scale the Manticore Container, you can add more instances of the container and use a load balancer to distribute traffic. Additionally, you can configure Manticore to use a distributed index to improve search performance.

### Monitoring and Logging

To monitor and log the containers, you can use tools like Prometheus and Grafana for monitoring, and ELK Stack (Elasticsearch, Logstash, Kibana) for logging.

### Security Considerations

To ensure the security of the containers, you can use tools like Docker Security Scanning and Clair to scan for vulnerabilities. Additionally, you can configure the containers to use secure protocols like HTTPS and SSH.

### Troubleshooting

### Common Issues

1. **Container Startup Failures**:
   ```bash
   # Check container logs
   docker logs siftersearch-app-dev
   docker logs siftersearch-manticore-dev
   ```

2. **Port Conflicts**:
   If you encounter port conflicts, check if other services are using the same ports:
   ```bash
   # Check ports in use
   lsof -i :3000
   lsof -i :5173
   lsof -i :9308
   ```

3. **Container Logs**:
   ```bash
   # View app container logs
   docker logs siftersearch-app-dev
   
   # View manticore container logs
   docker logs siftersearch-manticore-dev
   ```

4. **Restart Containers**:
   ```bash
   # Restart all containers
   npm run kill
   npm run dev
   ```
