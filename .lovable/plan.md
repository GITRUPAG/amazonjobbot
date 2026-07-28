# Amazon Warehouse Jobs — Telegram Bot & Admin Dashboard

## Scope

- Regions: **US** and **UK** (hiring.amazon.com + hiring.amazon.co.uk)
- Delivery: **both** a public Telegram channel (all jobs) **and** a bot with per-user filters (personalized DMs)
- Admin dashboard: manage keywords, locations, subscribers; view analytics
- You start as admin; hand off to client on delivery

## What gets built

### 1. Job scraper (server, runs every 10 min)

- Public server route `/api/public/cron/scrape` protected by a shared `CRON_SECRET`
- Polls Amazon's public jobs JSON (US + UK) with configurable keywords/locations
- Dedupes by Amazon `jobId`; only new rows trigger notifications
- Triggered by pg_cron every 10 minutes

### 2. Telegram integration

- One Telegram bot (client creates via @BotFather, we connect via Telegram connector)
- **Public channel**: bot posts every new job (formatted: title, location, type, pay, apply link with tracked redirect)
- **Bot DMs**: `/start` registers user, `/filter` sets country/city/warehouse/job-type preferences, `/pause` `/resume` `/stop`
- Webhook route `/api/public/telegram/webhook` handles commands and inline-button filter setup
- On each new job, matching subscribers get a DM

### 3. Click tracking

- Apply links go through `/r/:jobId?u=:userId` → logs click, 302 to Amazon
- Powers the analytics dashboard

### 4. Admin dashboard (authenticated web app)

- Google + email sign-in, role-based (admin only)
- Pages:
  - **Jobs**: recent scraped jobs, manual re-broadcast
  - **Keywords & Locations**: add/edit search queries per region
  - **Subscribers**: list, filters, pause/ban, message counts
  - **Analytics**: jobs posted/day, subscriber growth, top clicked jobs, DMs sent, click-through rate
  - **Settings**: channel ID, scrape interval, bot commands

### 5. Handoff

- Client added as admin (email invite → admin role)
- Docs page in dashboard covering: rotating bot token, changing channel, adjusting keywords

## Technical details

**Stack**: TanStack Start + Lovable Cloud (Postgres, Auth, pg_cron) + Telegram connector

**Database tables**

- `jobs` (job_id PK, region, title, city, warehouse, job_type, pay, url, posted_at, scraped_at, broadcast_at)
- `subscribers` (telegram_user_id PK, username, status, joined_at)
- `subscriber_filters` (subscriber_id, regions[], cities[], warehouses[], job_types[], keywords[])
- `deliveries` (job_id, subscriber_id, channel|dm, sent_at, message_id) — dedupe guard
- `clicks` (id, job_id, subscriber_id nullable, clicked_at, user_agent)
- `search_queries` (region, keyword, city, active) — admin-editable scrape targets
- `settings` (key/value: channel_id, scrape_interval_min, etc.)
- `user_roles` (user_id, role) — standard admin pattern

**Secrets**: `CRON_SECRET` (generated), `TELEGRAM_API_KEY` (from connector), `LOVABLE_API_KEY` (auto)

**Scheduling**: pg_cron → HTTPS POST to `/api/public/cron/scrape` with bearer secret

**Rate limits & etiquette**: Amazon endpoint polled at 10-min intervals with a single request per region-keyword pair; exponential backoff on 429/5xx; scraper stops on repeated 4xx.

## Legal note

Amazon's ToS generally disallows scraping. The reference channel (@amazonukjobsalert) does it anyway. Confirm your client accepts this operational risk before we ship. If they want a safer path, we can switch to only surfacing links posted on Amazon's official RSS/careers pages where available.

## Build order

1. Enable Lovable Cloud, schema + RLS + admin role
2. Auth (Google + email), admin dashboard shell
3. Scraper server function + pg_cron
4. Connect Telegram, channel broadcast
5. Bot webhook: /start, /filter, /stop, DM delivery
6. Click tracking + analytics pages
7. Keywords/subscribers management UI
8. Handoff docs, add client as admin

## Open questions before I start

1. Do you want **Google sign-in** on the admin dashboard, or email/password only?  for now email / password
2. For each new admin subscriber joining the bot, do you want a **welcome message with quick-pick filter buttons**, or just a plain `/help` reply? add welcom msg 
3. Any specific Amazon job categories to prioritize (Warehouse Associate, Sortation, Delivery Station, etc.), or capture everything under "warehouse"?  capture under warehouse