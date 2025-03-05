# Deployment Guide

## Automated Startup with systemd

The repository includes a systemd service file (`giftmint.service`) to automatically start the server on system boot.

### Installation

1. Copy the service file to systemd directory:
```bash
sudo cp /home/ubuntu/Giftmint-Server/giftmint.service /etc/systemd/system/
```

2. Reload systemd to recognize the new service:
```bash
sudo systemctl daemon-reload
```

3. Enable the service to start on boot:
```bash
sudo systemctl enable giftmint.service
```

4. Start the service:
```bash
sudo systemctl start giftmint.service
```

5. Check the status:
```bash
sudo systemctl status giftmint.service
```

### Troubleshooting

#### Node.js Path Issues

If you see an error like:
```
Failed to locate executable /usr/bin/node: No such file or directory
Failed at step EXEC spawning /usr/bin/node: No such file or directory
```

This means the Node.js executable is not where the service file expects it. Common locations include:

1. NVM installations: `/home/username/.nvm/versions/node/vX.X.X/bin/node`
2. System-wide: `/usr/bin/node` or `/usr/local/bin/node`
3. Node.js binaries: `/opt/nodejs/bin/node`

To fix this:

1. Find your Node.js location:
```bash
which node
```

2. Edit the service file:
```bash
sudo nano /etc/systemd/system/giftmint.service
```

3. Update the `ExecStart` line with your Node.js path:
```
ExecStart=/path/to/your/node /home/ubuntu/Giftmint-Server/server.js
```

4. Reload and restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart giftmint.service
```

#### Database Connection Issues

If the server starts but fails with database errors:

1. Check logs:
```bash
sudo journalctl -u giftmint.service
```

2. Verify database configurations in `.env` or config files
3. Ensure database service is running
4. Check connection pool settings in `db/database.js`

#### Environment Variables

The systemd service uses `NODE_ENV=production` by default. If you need additional environment variables:

1. Edit the service file and add under the `[Service]` section:
```
Environment=NODE_ENV=production
Environment=DB_TYPE=sqlite
Environment=PORT=3500
# Add more as needed
```

2. Alternatively, create a separate environment file:
```
EnvironmentFile=/home/ubuntu/Giftmint-Server/.env
```

3. Reload and restart after changes:
```bash
sudo systemctl daemon-reload
sudo systemctl restart giftmint.service
```