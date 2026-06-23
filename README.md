# HonestPerks — Complete Affiliate Funnel_

Apple-clean opt-in → animated bridge page → no-code admin. Your own database. Connects to any ESP. One-click Coolify deploy.

---

## What you get

| Page | URL | What it does |
|---|---|---|
| Landing | `/` | Clean opt-in. **1-click when email is in the URL**, single email field otherwise. |
| Processing | `/thankyou` | Light confirmation animation → sends to bridge |
| Bridge | `/bridge` | Animated offer cards, loaded live from your database |
| Admin | `/admin` | No-code control: offers, leads, ESP, AI writer |

---

## The two opt-in modes (your "single click" answer)

**True 1-click** — for traffic from your own email list. Put this link in your emails:
```
https://yourdomain.com/?e={{contact.EMAIL}}
```
The page reads the email from the URL, shows a single "Unlock My Rewards" button, no typing. One click subscribes and sends them to your offers.

**Single-field** — for cold ad traffic (Meta/Google) where you don't have their email yet. Shows one email box with browser autofill. As light as it can legally be.

The page auto-switches between the two — you don't configure anything.

---

## Deploy to Coolify in 5 steps

1. **Push to GitHub**
   ```bash
   git init && git add . && git commit -m "DoggSpace"
   git branch -M main
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

2. **Coolify** → New Project → New Resource → **Docker Compose** → pick your repo

3. **Set environment variables** (Coolify UI) — at minimum:
   ```
   ADMIN_USER=youradminname
   ADMIN_PASS=a_strong_password
   ALLOWED_ORIGIN=https://yourdomain.com
   ```

4. **Add your domain** → toggle HTTPS on (Coolify auto-issues SSL)

5. **Deploy.** Done. Visit your domain.

Auto-deploy on every push: Coolify → app → Webhooks → copy URL → GitHub → Settings → Secrets → add `COOLIFY_WEBHOOK_URL`.

---

## Add your affiliate links (no code)

1. Go to `https://yourdomain.com/admin` (log in with ADMIN_USER / ADMIN_PASS)
2. **Offers** tab → **Edit** any offer
3. Paste your MaxBounty link → **Save**. Live instantly.

MaxBounty link format: `https://www.maxbounty.com/mbs.php?id=YOUR_ID&cid=OFFER_ID`

10 offers are pre-loaded. Add/edit/pause/delete any of them.

---

## Connect your email platform (any ESP/CRM)

Admin → **Settings** → paste a webhook URL. When someone subscribes, we save them to your database AND fire every connected webhook at once.

**Brevo (free, recommended):** Contacts → Forms → enable Double Opt-In → set confirmation redirect to `https://yourdomain.com/bridge?confirmed=1` → copy the form's webhook → paste in admin.

Works the same with ActiveCampaign, ConvertKit, or a free Google Sheets webhook (script in the admin hint).

---

## Optional AI auto-writer

Admin → Settings → paste an Anthropic API key (~$5 credit at console.anthropic.com). Then when you add an offer, click **✨ AI fill** — it reads the offer name + link and writes the card description, badge, icon, and a ready-to-send email. Without a key, you fill fields manually. Either way: no code.

---

## Your database

SQLite, stored in the Docker volume `doggspace_data` at `/app/data/doggspace.db` — survives restarts and redeploys. View and export all leads from Admin → Leads → Export CSV. Your data stays on your Contabo server, fully yours.

---

## Top 10 offers (pre-loaded, from your MaxBounty list)

Tier 1 (real products): Daily Goodie Box, Maybelline Test & Keep, Dubai Pistachio Chocolate, Healthy Snack Boxes, TryProducts Panel.
Tier 2 (sweepstakes): Amazon $2,000, Walmart $2,000, Tide $1,000, Pampers $1,000, Bose QuietComfort.

Never added: TopSweepsCasino — MaxBounty bans email traffic for casino offers (account-ban risk).
