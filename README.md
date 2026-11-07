# eComCRM Leads

Lead capture and follow-up pipeline for eComCRM by Cube Tech Enterprises.

- **`/`** is the prospect form. A prospect fills it in and the lead is saved straight into your pipeline. No WhatsApp copy-and-paste step.
- **`/pipeline`** is your private pipeline, behind a password. It shows who to follow up today, with one-tap WhatsApp messages, stages, notes, an activity log and CSV export.

It is a static site plus four small serverless API routes, with Neon Postgres for storage. There is no server to run.

## Deploy (about 10 minutes)

1. **Put the code on GitHub.** Create a new private repository and push this folder to it. (Or skip GitHub and run `npx vercel` from this folder.)
2. **Import it in Vercel.** Vercel dashboard, Add New, Project, pick the repository. Leave the framework as "Other". No build command is needed. Deploy.
3. **Add the database.** In the Vercel project open Storage, then Create, then Neon (Postgres). Connect it to this project. Vercel adds `DATABASE_URL` for you. The `leads` table is created automatically the first time the site is used.
4. **Add two environment variables** (Project, Settings, Environment Variables):
   - `OWNER_PASSWORD`: the password you will type on `/pipeline`. Make it long.
   - `SESSION_SECRET`: a random string. Generate one with `openssl rand -base64 32`.
5. **Redeploy** (Deployments, the three dots on the latest one, Redeploy) so the new variables apply.
6. Open `https://your-project.vercel.app/pipeline`, log in, then open `/` in a private window and submit a test lead. It should appear in the pipeline within seconds. Delete the test lead afterwards.

To use your own address, add a domain in Project, Settings, Domains (for example `leads.cubetech.com.ng`).

## Instant alert for each new lead (optional)

Set `NOTIFY_WEBHOOK_URL` to a webhook from n8n, Make or Zapier. Every new lead from the form is posted to it as JSON:

```json
{ "event": "lead.created", "text": "New eComCRM lead\nAda Obi (Ada Beauty Hub)\nWhatsApp: 0803...", "lead": { "name": "...", "phone": "...", "...": "..." } }
```

Use the `text` field as the body of a WhatsApp or email message to yourself. If the webhook is down, the lead is still saved.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon Postgres connection string. Set by the Neon integration. |
| `OWNER_PASSWORD` | yes | Password for `/pipeline`. |
| `SESSION_SECRET` | yes | Signs the login cookie. 16+ random characters. |
| `NOTIFY_WEBHOOK_URL` | no | Webhook that receives each new form lead. |
| `APP_TIMEZONE` | no | Timezone for "today". Defaults to `Africa/Lagos`. |

See `.env.example`.

## Before you share the form link

- Your WhatsApp number for the "Message us on WhatsApp now" button is set at the top of `public/common.js` (`EC.WA_NUMBER`).
- The follow-up message templates are in `public/pipeline.js` (`TEMPLATES`). Edit the wording to suit you. The proposal template quotes the ₦135,000 monthly retainer, so change it if your pricing changes.
- Follow-up gaps per stage (New 1 day, Contacted 2, Demo booked 1, Proposal sent 3) are the `days` values in `public/common.js` (`EC.STAGES`).

## How it is protected

- Only `POST /api/submit` is public. Every other route needs the login cookie (HTTP-only, Secure, SameSite=Lax, 30 days).
- The form has a hidden bot trap, a per-IP limit, input length limits, and treats the same phone number twice in one day as one lead (0803... and +234 803... count as the same number).
- Login attempts are limited, and the password is compared in constant time.
- The form tells prospects their details are used only to contact them about eComCRM. Leads are personal data, so keep the repository private and share the password with no one.

## Run it on your computer

```
npm install
node test/dev.js     # http://localhost:3000, password: preview-password, data is in memory only
npm test             # API tests against an in-memory Postgres
node test/browser.js # browser test of the whole flow (needs dev.js running and Playwright)
```

## Project layout

```
public/index.html     prospect form
public/pipeline.html  owner pipeline page
public/pipeline.js    pipeline logic
public/common.js      shared form, helpers and settings
public/styles.css     brand styling (light and dark)
api/submit.js         public: save a form lead
api/login.js          owner login
api/logout.js         owner logout
api/leads.js          owner: list and add leads
api/leads/[id].js     owner: update and delete a lead
api/_lib/             database, login and validation helpers
vercel.json           clean URLs and security headers
```
