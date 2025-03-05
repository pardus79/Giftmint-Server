# Giftmint Server Deployment Guide

This document outlines the steps to deploy the Giftmint Server in different environments.

## Prerequisites

- Node.js v18.0.0 or later
- npm v8.0.0 or later
- SQLite3
- A server or hosting environment (Linux recommended)

## Local Development Deployment

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/giftmint-server.git
   cd giftmint-server
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create environment file**

   Copy the example environment file and modify it:

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file to set appropriate values for your development environment.

4. **Run the server**

   ```bash
   npm run dev
   ```

   The server will start at http://localhost:3000 (or the port specified in your `.env` file).

## Production Deployment

### Standard Server Deployment

1. **Set up the server**

   Make sure your server has Node.js and npm installed:

   ```bash
   # For Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone or upload the application**

   ```bash
   git clone https://github.com/yourusername/giftmint-server.git
   cd giftmint-server
   ```

3. **Install dependencies**

   ```bash
   npm ci
   ```

4. **Create environment file**

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file with production values:
   
   ```
   NODE_ENV=production
   PORT=3000
   
   # Use strong API keys in production
   API_KEYS=your-production-api-key-1,your-production-api-key-2
   
   # Set your domain for CORS
   CORS_ORIGINS=https://yourdomain.com
   
   # Key storage should be in a secured directory
   KEY_STORAGE_PATH=/var/lib/giftmint/keys
   
   # Database path
   DB_PATH=/var/lib/giftmint/giftmint.sqlite
   ```

5. **Create the key and database directories**

   ```bash
   sudo mkdir -p /var/lib/giftmint/keys
   sudo chown -R nodejs:nodejs /var/lib/giftmint
   ```

6. **Set up the service**

   Create a systemd service file:

   ```bash
   sudo nano /etc/systemd/system/giftmint.service
   ```

   Add the following content:

   ```
   [Unit]
   Description=Giftmint Server
   After=network.target
   
   [Service]
   Type=simple
   User=nodejs
   WorkingDirectory=/path/to/giftmint-server
   ExecStart=/usr/bin/node /path/to/giftmint-server/server.js
   Restart=on-failure
   Environment=NODE_ENV=production
   
   [Install]
   WantedBy=multi-user.target
   ```

   Replace `/path/to/giftmint-server` with the actual path.

7. **Start the service**

   ```bash
   sudo systemctl enable giftmint
   sudo systemctl start giftmint
   ```

8. **Set up a reverse proxy (optional but recommended)**

   Using Nginx:

   ```bash
   sudo apt install nginx
   sudo nano /etc/nginx/sites-available/giftmint
   ```

   Add the following configuration:

   ```
   server {
       listen 80;
       server_name api.yourdomain.com;
   
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Enable the site:

   ```bash
   sudo ln -s /etc/nginx/sites-available/giftmint /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

9. **Set up SSL with Let's Encrypt**

   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d api.yourdomain.com
   ```

### Docker Deployment

You can also deploy using Docker:

1. **Create a Dockerfile**

   ```
   FROM node:18-alpine
   
   WORKDIR /app
   
   COPY package*.json ./
   
   RUN npm ci --only=production
   
   COPY . .
   
   # Create directories for persistent data
   RUN mkdir -p /data/keys
   
   ENV NODE_ENV=production
   ENV KEY_STORAGE_PATH=/data/keys
   ENV DB_PATH=/data/giftmint.sqlite
   
   EXPOSE 3000
   
   CMD ["node", "server.js"]
   ```

2. **Build the Docker image**

   ```bash
   docker build -t giftmint-server .
   ```

3. **Run the container**

   ```bash
   docker run -d \
     -p 3000:3000 \
     -v giftmint-data:/data \
     --name giftmint \
     --restart unless-stopped \
     -e NODE_ENV=production \
     -e PORT=3000 \
     -e API_KEYS=your-api-key-1,your-api-key-2 \
     -e CORS_ORIGINS=https://yourdomain.com \
     giftmint-server
   ```

## Security Considerations

1. **API Keys**
   - Use strong, randomly generated API keys
   - Rotate keys periodically
   - Use different keys for different clients
   
2. **HTTPS**
   - Always use HTTPS in production
   - Set proper SSL protocols and ciphers
   
3. **File Permissions**
   - Secure the key storage directory
   - Set tight permissions on the database file
   
4. **Network Security**
   - Use a firewall to restrict access
   - Consider IP allowlisting for admin endpoints
   
5. **Rate Limiting**
   - Adjust rate limiting settings based on expected traffic

## Backup and Recovery

1. **Database Backup**
   
   Set up automatic backups of the SQLite database:

   ```bash
   # Example backup script
   mkdir -p /var/backups/giftmint
   cp /var/lib/giftmint/giftmint.sqlite /var/backups/giftmint/giftmint_$(date +%Y%m%d).sqlite
   ```

2. **Key Backup**
   
   Backup the key files:

   ```bash
   # Example backup script
   tar -czf /var/backups/giftmint/keys_$(date +%Y%m%d).tar.gz /var/lib/giftmint/keys
   ```

3. **Set up a cron job for automated backups**

   ```bash
   crontab -e
   ```

   Add:

   ```
   0 1 * * * /path/to/backup/script.sh
   ```

## Monitoring

1. **Log Monitoring**
   
   Use a tool like PM2 for basic monitoring:

   ```bash
   npm install -g pm2
   pm2 start server.js --name giftmint
   ```

2. **Performance Monitoring**
   
   Set up an APM tool like New Relic or Datadog.

3. **Health Checks**
   
   The API has a health endpoint that you can use for monitoring:

   ```
   GET /api/v1/health
   ```

   This endpoint does not require authentication.

## Updating the Server

1. **Pull the latest code**

   ```bash
   cd /path/to/giftmint-server
   git pull
   ```

2. **Install any new dependencies**

   ```bash
   npm ci
   ```

3. **Restart the service**

   ```bash
   sudo systemctl restart giftmint
   ```

## Troubleshooting

### Common Issues

1. **Server won't start**
   - Check the logs: `journalctl -u giftmint.service`
   - Verify the .env file exists and has correct values
   
2. **Database errors**
   - Check file permissions on the database file
   - Ensure the directory exists and is writable
   
3. **Key generation failures**
   - Check permissions on the key storage directory
   - Ensure the directory exists and is writable
   
4. **API key issues**
   - Verify the API keys in the .env file
   - Check that the client is passing the key correctly in the X-API-Key header

### Getting Help

If you encounter problems that aren't covered here, please:

1. Check the GitHub repository issues section
2. Create a new issue with detailed information about your problem
3. Include logs and error messages (with sensitive information redacted)