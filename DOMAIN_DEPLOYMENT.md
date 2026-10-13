# Hosting the Fellowship Platform on `sankaraeye.com`

You own the domain `sankaraeye.com`. Here are two practical paths to put this app on it. Pick **Option A** for the fastest path; pick **Option B** if you want everything on infrastructure you control.

Recommended subdomain: **`fellowship.sankaraeye.com`** (so it doesn't interfere with your main website).

---

## Option A — Deploy on Replit, point a subdomain to it (easiest)

This uses Replit's built-in deployment, which gives you HTTPS, auto-restarts, and zero server maintenance.

### Step 1 · Publish the app from inside Replit
1. In the Replit workspace, click **Publish**.
2. Choose **Autoscale** (or **Reserved VM** for steady traffic).
3. After publishing, you'll get a URL like `your-app.replit.app`. Confirm the app loads there.

### Step 2 · Link your custom domain
1. In the Replit deployment dashboard, open **Settings → Custom Domain**.
2. Enter `fellowship.sankaraeye.com` and click **Add**.
3. Replit will show you **two DNS records** to create:
   - An **A record** for `fellowship` pointing to a Replit IP, **or**
   - A **CNAME record** for `fellowship` pointing to a Replit hostname, **plus**
   - A **TXT record** to prove you own the domain.

### Step 3 · Add the DNS records at your domain registrar
Log in wherever `sankaraeye.com` is registered (likely GoDaddy, BigRock, Namecheap, or your hosting provider). Open **DNS Management** for `sankaraeye.com` and add:

| Type | Name (Host) | Value | TTL |
|------|-------------|-------|-----|
| CNAME | `fellowship` | (the value Replit gives you) | 3600 |
| TXT | `_replit-verify.fellowship` | (the verification token Replit gives you) | 3600 |

> The Name field is just `fellowship`, not `fellowship.sankaraeye.com` — the registrar appends the rest automatically.

### Step 4 · Wait for verification
DNS changes propagate in 5 minutes to 24 hours (usually under 30 min). Replit will show **Verified** when the records are detected, and HTTPS will be issued automatically.

### Step 5 · Visit `https://fellowship.sankaraeye.com` 🎉

---

## Option B — Self-host on your own server / VPS

Use this if you want everything in your own data centre or on your own cloud account (AWS EC2, DigitalOcean, Hetzner, etc.).

### What you need
- A Linux server (Ubuntu 22.04 LTS recommended) reachable on the public internet
- The server's public IP address
- Root or `sudo` access

### Step 1 · Prepare the server
SSH into your server, then:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt install -y nodejs postgresql nginx git
sudo npm install -g pnpm pm2
```

### Step 2 · Set up the database (same as local)
```bash
sudo -u postgres psql -c "CREATE DATABASE sankara_fellowship;"
sudo -u postgres psql -c "CREATE USER sankara WITH PASSWORD 'a-strong-password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sankara_fellowship TO sankara;"
```

### Step 3 · Deploy the code
```bash
cd /var/www
sudo git clone <your-repo-url> fellowship   # or upload the zip
cd fellowship
sudo chown -R $USER:$USER .
pnpm install
```

Create `.env` (use **production** secrets, not the dev ones):
```bash
DATABASE_URL=postgresql://sankara:a-strong-password@localhost:5432/sankara_fellowship
SESSION_SECRET=<long random string>
JWT_SECRET=<long random string>
NODE_ENV=production
PORT=8080
```

### Step 4 · Build and migrate
```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/fellowship run build
```

### Step 5 · Run the API server with PM2 (auto-restart)
```bash
cd artifacts/api-server
pm2 start "node ./dist/index.mjs" --name fellowship-api
pm2 save
pm2 startup    # follow the printed command
```

### Step 6 · Serve the web frontend with Nginx
The built web app is in `artifacts/fellowship/dist`.

Create `/etc/nginx/sites-available/fellowship.conf`:
```nginx
server {
    listen 80;
    server_name fellowship.sankaraeye.com;

    # Web frontend (static files)
    root /var/www/fellowship/artifacts/fellowship/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and reload:
```bash
sudo ln -s /etc/nginx/sites-available/fellowship.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7 · Add HTTPS with Let's Encrypt (free)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d fellowship.sankaraeye.com
```
Certbot edits the Nginx config and sets up automatic renewal.

### Step 8 · Point DNS at your server
At your domain registrar, add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `fellowship` | `<your-server-public-ip>` | 3600 |

Wait 5–30 minutes, then visit **https://fellowship.sankaraeye.com**.

---

## Replacing the root site (`sankaraeye.com`) instead of a subdomain

Only do this if you want this app to be your **main** website. Use `@` instead of `fellowship` in DNS records, and use `server_name sankaraeye.com www.sankaraeye.com;` in the Nginx config. This will replace whatever currently lives at sankaraeye.com — make sure that's intentional.

---

## After it's live

- **Email-from address**: configure SMTP (e.g. `noreply@sankaraeye.com`) in a future iteration to send allocation letters automatically.
- **Backups**: schedule nightly `pg_dump` of the database.
- **Updates**: when you push new code, run `pnpm install && pnpm --filter @workspace/db run push && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/fellowship run build && pm2 restart fellowship-api`.

---

## Need help with the DNS step?

Tell us **who your domain registrar is** (e.g. GoDaddy, BigRock, Namecheap, etc.) and we can give you screenshot-level instructions for that exact provider's DNS panel.
