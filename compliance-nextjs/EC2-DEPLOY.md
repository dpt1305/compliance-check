# EC2 Deployment Guide — PM2 + Nginx + Custom Domain

Deploy the compliance app on an AWS EC2 t2.micro instance using PM2 (process manager) and Nginx (reverse proxy), accessible via your own domain with HTTPS.

---

## Overview

```
Internet → Domain (DNS A record → EC2 IP)
         → Nginx :80 / :443 (SSL termination)
         → PM2 → Next.js :3000
         → S3 (image storage)
         → /home/ubuntu/compliance-app/data/ (JSON + tracking.xlsx)
```

---

## Part 1 — AWS Setup

### Step 1 — Launch EC2 t2.micro

1. Go to **EC2 → Launch Instance**
2. **Name**: `compliance-app`
3. **AMI**: Ubuntu 24.04 LTS (free tier eligible)
4. **Instance type**: `t2.micro`
5. **Key pair**: create a new key pair → download the `.pem` file, keep it safe
6. **Security Group** — add these inbound rules:

   | Type | Port | Source | Purpose |
   |---|---|---|---|
   | SSH | 22 | Your IP only (`x.x.x.x/32`) | Server access |
   | HTTP | 80 | 0.0.0.0/0, ::/0 | Web traffic + SSL cert verification |
   | HTTPS | 443 | 0.0.0.0/0, ::/0 | Secure web traffic |

7. **Storage**: 20 GB gp3 (increase from default 8 GB — build artifacts take space)
8. **Advanced → IAM Instance Profile**: select `ComplianceEC2Role`
   *(See S3 setup in [S3 section](#optional-s3-for-image-storage) if you need this)*
9. Click **Launch Instance**

### Step 2 — Allocate an Elastic IP

Without this, your EC2 public IP changes every reboot.

1. **EC2 → Elastic IPs → Allocate Elastic IP address** → Allocate
2. Select the new IP → **Actions → Associate Elastic IP address** → select your instance → Associate

### Step 3 — Point your domain (or subdomain) to EC2

In your domain registrar / DNS provider, add an **A record**.

**Option A — root domain** (`https://your-domain.com`)
```
Type:  A
Name:  @
Value: <your-elastic-ip>
TTL:   300
```

**Option B — subdomain** (`https://compliance.your-domain.com`)
```
Type:  A
Name:  compliance        ← just the subdomain part, not the full domain
Value: <your-elastic-ip>
TTL:   300
```

You only need **one** A record — for whichever address you want the app on.  
DNS propagation takes 1–30 minutes. Verify with:
```bash
nslookup compliance.your-domain.com
# should return your Elastic IP
```

---

## Part 2 — S3 Setup (for image storage)

Skip this section if you want images stored on disk instead. Set `AWS_S3_BUCKET=` empty in your `.env` to use local storage.

### Step 4 — Create S3 bucket

1. **S3 → Create bucket**
2. **Name**: e.g. `my-compliance-images` (globally unique)
3. **Region**: same as your EC2 (e.g. `ap-southeast-1`)
4. **Block all public access**: ✅ keep ON (images serve via presigned URLs)
5. Create bucket

### Step 5 — Create IAM policy

1. **IAM → Policies → Create policy → JSON tab**, paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::my-compliance-images",
        "arn:aws:s3:::my-compliance-images/*"
      ]
    }
  ]
}
```

2. Name it `ComplianceS3Policy` → Create

### Step 6 — Create IAM Role for EC2

1. **IAM → Roles → Create role**
2. Trusted entity: **AWS service → EC2**
3. Attach `ComplianceS3Policy`
4. Name it `ComplianceEC2Role` → Create

5. Attach the role to your running instance:
   **EC2 → Instances → select your instance → Actions → Security → Modify IAM role → ComplianceEC2Role → Update**

> With an IAM Role, the server gets S3 credentials automatically. You do **not** need `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in your `.env` file.

---

## Part 3 — Server Setup

### Step 7 — Connect to EC2

```bash
# On your local machine
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<your-elastic-ip>
```

### Step 8 — Install Node.js 24

```bash
# Add NodeSource repo for Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # should print v24.x.x
npm --version
```

### Step 9 — Install PM2

```bash
sudo npm install -g pm2

# Verify
pm2 --version
```

### Step 10 — Install Nginx

```bash
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Part 4 — Deploy the App

### Step 11 — Get the code on EC2

**Option A — Git (recommended)**

```bash
cd /home/ubuntu
git clone https://github.com/your-username/your-repo.git compliance-app
cd compliance-app/compliance-nextjs
```

**Option B — Upload from local machine** (run this on your local machine)

```bash
scp -i your-key.pem -r ./compliance-nextjs ubuntu@<your-elastic-ip>:/home/ubuntu/compliance-app/
```

### Step 12 — Install dependencies

```bash
cd /home/ubuntu/compliance-app/compliance-nextjs
npm ci
```

### Step 13 — Create environment file

```bash
# Use the production-specific template (no AWS credentials — IAM Role handles that)
cp .env.production.example .env.production
nano .env.production
```

Fill in the required values:

| Variable | What to put |
|---|---|
| `MONGODB_URI` | MongoDB connection string — **required** for runtime storage |
| `STORAGE_IMAGE_BASE_URL` | `https://your-domain.com/api/images/` |
| `AWS_S3_BUCKET` | Your S3 bucket name, e.g. `my-compliance-images` |
| `JWT_SECRET` | Output of `openssl rand -hex 32` |
| `GEMINI_API_KEY` | Your AI API key |
| `CHATGPT_API_KEY` | Your AI API key |

> **`MONGODB_URI` is required.**  
> SQLite runtime storage has been removed from this app, so production must point at a MongoDB instance or cluster:
> ```env
> MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/compliance
> MONGODB_DB_NAME=compliance
> ```

> **AWS credentials — do not add them.**  
> `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are intentionally absent from `.env.production`.  
> The IAM Role attached to the EC2 instance (Step 6) provides credentials automatically.  
> The AWS SDK checks the EC2 instance metadata service (IMDS) as a fallback when no keys are present.

Generate a secure JWT secret:
```bash
openssl rand -hex 32
```

### Step 14 — Build the app

```bash
cd /home/ubuntu/compliance-app/compliance-nextjs

# Load production env for the build
export $(grep -v '^#' .env.production | xargs)

npm run build
```

> Build takes 1–3 minutes on t2.micro. If it runs out of memory, add swap:
> ```bash
> sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```
> Then run `npm run build` again.

### Step 15 — Create data directory

```bash
mkdir -p /home/ubuntu/compliance-app/compliance-nextjs/data/images
```

### Step 16 — Start with PM2

```bash
cd /home/ubuntu/compliance-app/compliance-nextjs

pm2 start npm \
  --name "compliance-app" \
  --env production \
  -- run start

# Check it started successfully
pm2 status
pm2 logs compliance-app --lines 30
```

You should see:
```
▶ compliance-app  online  ...
```

And in the logs:
```
▶ Ready on http://0.0.0.0:3000
```

### Step 17 — Make PM2 survive reboots

```bash
# Save current process list
pm2 save

# Generate and run the startup command (copy-paste the output command)
pm2 startup

# The output will be something like:
# sudo env PATH=... pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run that command exactly as printed
```

---

## Part 5 — Nginx Setup with Domain

### Step 18 — Create Nginx config

```bash
sudo nano /etc/nginx/sites-available/compliance
```

Choose the config that matches your DNS setup from Step 3:

---

**Option A — root domain** (`your-domain.com`)

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade          $http_upgrade;
        proxy_set_header   Connection       'upgrade';
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

---

**Option B — subdomain** (`compliance.your-domain.com`)

```nginx
server {
    listen 80;
    server_name compliance.your-domain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade          $http_upgrade;
        proxy_set_header   Connection       'upgrade';
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

> The only difference between A and B is the `server_name` line.  
> If you want **both** `www` and the subdomain to work, list them space-separated:  
> `server_name compliance.your-domain.com www.compliance.your-domain.com;`  
> (and add a matching CNAME `www.compliance → compliance.your-domain.com` in DNS)

---

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/compliance /etc/nginx/sites-enabled/

# Remove the default Nginx placeholder page
sudo rm -f /etc/nginx/sites-enabled/default

# Test config syntax and reload
sudo nginx -t
sudo systemctl reload nginx
```

Test HTTP works before moving to SSL:
```bash
curl -I http://compliance.your-domain.com
# Should return: HTTP/1.1 200 OK
```

---

## Part 6 — HTTPS with Let's Encrypt (Free SSL)

### Step 19 — Install Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### Step 20 — Get SSL certificate

Run the command that matches your Nginx `server_name`:

**Root domain:**
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

**Subdomain:**
```bash
sudo certbot --nginx -d compliance.your-domain.com
```

Follow the prompts:
- Enter your email address
- Agree to terms of service
- **Choose option 2 (Redirect)** — redirects all HTTP traffic to HTTPS automatically

Certbot rewrites your Nginx config to add the SSL block. Verify:
```bash
curl -I https://compliance.your-domain.com
# Should return: HTTP/2 200
```

### Step 21 — Test auto-renewal

```bash
sudo certbot renew --dry-run
```

Certbot installs a cron job / systemd timer automatically. Certificates renew every 90 days.

### Step 22 — Update env with HTTPS URL

```bash
nano /home/ubuntu/compliance-app/compliance-nextjs/.env.production
```

Update to your actual address (root domain or subdomain):
```env
# Root domain:
STORAGE_IMAGE_BASE_URL=https://your-domain.com/api/images/

# OR subdomain:
STORAGE_IMAGE_BASE_URL=https://compliance.your-domain.com/api/images/
```

Rebuild and restart:
```bash
cd /home/ubuntu/compliance-app/compliance-nextjs
npm run build
pm2 restart compliance-app
```

---

## Part 7 — Useful Commands

### PM2

```bash
pm2 status                        # Show all processes
pm2 logs compliance-app           # Tail live logs
pm2 logs compliance-app --lines 100  # Last 100 lines
pm2 restart compliance-app        # Restart app
pm2 stop compliance-app           # Stop app
pm2 delete compliance-app         # Remove from PM2
```

### Update the app

```bash
cd /home/ubuntu/compliance-app/compliance-nextjs

# Pull latest code
git pull

# Install any new dependencies
npm ci

# Rebuild
npm run build

# Restart (zero-downtime reload)
pm2 restart compliance-app
```

### Nginx

```bash
sudo nginx -t                     # Test config syntax
sudo systemctl reload nginx       # Reload config (no downtime)
sudo systemctl status nginx       # Check Nginx status
sudo tail -f /var/log/nginx/error.log   # Error logs
```

### Check what's running on port 3000

```bash
ss -tlnp | grep 3000
```

---

## Troubleshooting

**App not starting** — check logs:
```bash
pm2 logs compliance-app --lines 50
```

**502 Bad Gateway in Nginx** — app isn't running on :3000:
```bash
pm2 status
pm2 restart compliance-app
```

**Build fails with "JavaScript heap out of memory"** — add swap (see Step 14) and set:
```bash
export NODE_OPTIONS="--max-old-space-size=512"
npm run build
```

**Images not loading from S3** — verify IAM role is attached:
```bash
# On EC2, test S3 access
aws s3 ls s3://my-compliance-images/ --region ap-southeast-1
```
If this fails, the IAM role isn't attached correctly (Step 6).

**SSL certificate fails** — ensure port 80 is open in Security Group and DNS A record is pointing to your Elastic IP.

---

## Default Admin Credentials

| Field | Value |
|---|---|
| Login URL | `https://your-domain.com/admin/login` |
| Username | `admin` |


**Change the password immediately after first login.**

---

## Data Location on EC2

| Data | Path |
|---|---|
| **MongoDB** | Database referenced by `MONGODB_URI` / `MONGODB_DB_NAME` |
| Submissions JSON (legacy) | `/home/ubuntu/compliance-app/compliance-nextjs/data/submissions.json` |
| Admin credentials (legacy) | `/home/ubuntu/compliance-app/compliance-nextjs/data/admins.json` |
| Tracking Excel | `/home/ubuntu/compliance-app/compliance-nextjs/data/tracking.xlsx` |
| Images | S3 bucket `my-compliance-images/images/` |
| PM2 logs | `~/.pm2/logs/` |

Back up the `data/` directory regularly:
```bash
# Quick backup to S3
aws s3 cp --recursive \
  /home/ubuntu/compliance-app/compliance-nextjs/data/ \
  s3://my-compliance-images/backups/data-$(date +%Y%m%d)/
```
