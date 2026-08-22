# Vasooli — Production Deployment Guide

This guide covers deployment strategies for the **Vasooli Autonomous Revenue Recovery Control Plane**:
1. [Prerequisites & Environment Variables](#prerequisites--environment-variables)
2. [Option 1: 1-Click Docker & Docker Compose (Recommended)](#option-1-1-click-docker--docker-compose-recommended)
3. [Option 2: Cloud PaaS (Vercel + Railway / Render)](#option-2-cloud-paas-vercel--railway--render)
4. [Option 3: Bare VM / VPS Deployment (Ubuntu / PM2 / Nginx)](#option-3-bare-vm--vps-deployment-ubuntu--pm2--nginx)
5. [Post-Deployment Verification & Health Checks](#post-deployment-verification--health-checks)

---

## Architecture Context

Vasooli consists of two main deployable units:
- **`apps/engine` (Fastify Server):** High-throughput backend listening on port `4000`. Handles REST API, Server-Sent Events (`/api/events`), in-memory state engine, bandit planning, policy gate, and ledger operations.
- **`apps/web` (Next.js 15 App):** Frontend dashboard running on port `3000`. Connects to `apps/engine` via HTTP and SSE.

---

## Prerequisites & Environment Variables

| Variable | Target Service | Purpose / Value |
|---|---|---|
| `PORT` | `apps/engine` | Port for the backend daemon (Default: `4000`) |
| `NEXT_PUBLIC_ENGINE_URL` | `apps/web` | Public URL of the backend engine (e.g. `https://api.yourdomain.com` or `http://localhost:4000`) |
| `GROQ_API_KEY` | `apps/engine` | *(Optional)* Enables live Groq LLM inference for fast diagnosis |
| `OPENAI_API_KEY` | `apps/engine` | *(Optional)* Enables OpenAI GPT-4o for complex reasoning & TTS |
| `RAZORPAY_KEY_ID` | `apps/engine` | *(Optional)* Enables live Razorpay test-mode API integration |
| `RAZORPAY_KEY_SECRET` | `apps/engine` | *(Optional)* Secret key for Razorpay API calls |

> **Note:** If no API keys are provided, Vasooli automatically defaults to its deterministic, offline-safe mock providers with zero degradation of core functionality.

---

## Option 1: 1-Click Docker & Docker Compose (Recommended)

The easiest way to run the entire stack (both engine and frontend dashboard) is using Docker Compose.

### Step 1: Clone and Configure Environment
```bash
git clone https://github.com/rohanjain1648/Vasooli-Autonomous-Revenue-Recovery-Control-Plane.git
cd Vasooli-Autonomous-Revenue-Recovery-Control-Plane

# Create .env from template (optional for live keys)
cp .env.example .env
```

### Step 2: Build and Run with Docker Compose
```bash
docker compose up -d --build
```

### Step 3: Check Logs and Status
```bash
# View all container logs
docker compose logs -f

# Check container health
docker compose ps
```

- **Frontend Dashboard:** `http://<your-ip-or-domain>:3000`
- **Backend API & SSE:** `http://<your-ip-or-domain>:4000`

---

## Option 2: Render Blueprint (1-Click render.yaml)

You can deploy both services simultaneously onto Render using the included `render.yaml` Blueprint:

1. Push this repository to GitHub.
2. Go to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your GitHub repository (`rohanjain1648/Vasooli-Autonomous-Revenue-Recovery-Control-Plane`).
5. Render will automatically detect `render.yaml` and provision:
   - `vasooli-engine` (Fastify Web Service on port 4000)
   - `vasooli-web` (Next.js 15 Web Service on port 3000 linked to `vasooli-engine`)
6. *(Optional)* Add your live API keys (`GROQ_API_KEY`, `RAZORPAY_KEY_ID`, etc.) in the Render dashboard if running in live mode.
7. Click **Apply**.

---

## Option 3: Cloud PaaS (Vercel + Railway / Render Manual)

For manual multi-cloud hosting:

### A. Deploy Backend (`apps/engine`) on Railway or Render
1. Create a new **Web Service** pointing to your GitHub repository.
2. Configure build & run settings:
   - **Root Directory:** `./`
   - **Build Command:** `corepack enable && pnpm install --frozen-lockfile && pnpm -r --if-present run build`
   - **Start Command:** `pnpm --filter @vasooli/engine start`
   - **Environment Variables:**
     - `PORT` = `4000` (or leave default assigned by platform)
     - `GROQ_API_KEY`, `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (if using live providers)
3. Copy the assigned backend public URL (e.g. `https://vasooli-engine.onrender.com`).

### B. Deploy Frontend (`apps/web`) on Vercel
1. In Vercel, import your repository.
2. Set **Root Directory** to `apps/web`.
3. Set **Framework Preset** to `Next.js`.
4. Configure **Environment Variables**:
   - `NEXT_PUBLIC_ENGINE_URL` = `https://vasooli-engine.onrender.com` (your backend URL from Step A).
5. Click **Deploy**.

---

## Option 3: Bare VM / VPS Deployment (Ubuntu / PM2 / Nginx)

For deployment on an AWS EC2, DigitalOcean Droplet, Hetzner, or generic Ubuntu 22.04+ server:

### Step 1: Install Node.js 20 & pnpm
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo npm install -g pnpm pm2
```

### Step 2: Clone and Build
```bash
git clone https://github.com/rohanjain1648/Vasooli-Autonomous-Revenue-Recovery-Control-Plane.git /var/www/vasooli
cd /var/www/vasooli

pnpm install --frozen-lockfile
pnpm build
```

### Step 3: Run with PM2 Process Manager
```bash
# Start Engine Daemon
pm2 start "pnpm --filter @vasooli/engine start" --name vasooli-engine

# Start Web Dashboard
pm2 start "pnpm --filter @vasooli/web start" --name vasooli-web

# Save PM2 startup script
pm2 save
pm2 startup
```

### Step 4: Configure Nginx Reverse Proxy
Create `/etc/nginx/sites-available/vasooli`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend (Next.js Dashboard)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API & SSE Stream
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/vasooli /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

*(Optional)* Enable free SSL with Let's Encrypt:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Post-Deployment Verification & Health Checks

Once deployed, run these verification checks:

1. **Verify Backend Health & Metrics:**
   ```bash
   curl http://localhost:4000/api/metrics
   ```
   Should return JSON with gross recovered, incremental uplift, and active case counts.

2. **Verify Server-Sent Events (SSE) Stream:**
   ```bash
   curl -N http://localhost:4000/api/events
   ```
   Should stream live events (`connected`, `case:created`, `case:transition`, etc.).

3. **Verify Cryptographic Audit Ledger:**
   ```bash
   curl http://localhost:4000/api/audit
   ```
   Should return the full hash-chained entry array.

4. **Verify Client-Side Hash Verification:**
   Open the `/audit` page on the web dashboard and ensure the green *"Hash chain verified in-browser"* badge is active.
