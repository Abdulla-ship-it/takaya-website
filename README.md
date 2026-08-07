# Takaya — Institute for Learning & Development

Website for Takaya, a learning and development institute in Muscat, Sultanate of Oman.

Static site. No build step, no framework, no dependencies — just HTML, CSS and vanilla JavaScript.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Homepage — hero, approach, featured courses, coaching, testimonials |
| `courses.html` | Full course catalogue with category filtering + corporate training |
| `coaching.html` | One-to-one coaching: process, packages, FAQ |
| `about.html` | Story, values, faculty, FAQ |
| `contact.html` | Enquiry form and contact details |
| `404.html` | Custom not-found page |
| `assets/styles.css` | Design system and all styling |
| `assets/main.js` | Navigation, scroll reveal, accordions, filters, form handling |
| `functions/api/enquiry.js` | Server-side enquiry endpoint (Cloudflare Pages Function) |
| `_headers` | Security and caching headers |
| `robots.txt`, `sitemap.xml` | Search engine basics |

## Running locally

For the pages alone, open `index.html` in a browser. The enquiry form will show a
fallback message, because there is no server to receive it.

To run the site *with* the API working, install Wrangler and use the Pages dev server:

```bash
npm install -g wrangler
wrangler pages dev .
# then open the URL it prints, usually http://localhost:8788
```

## Deploying to Cloudflare Pages

Chosen over GitHub Pages because Pages Functions let the payment and WhatsApp
endpoints live on the same domain as the site.

1. Push this repository to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository.
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *leave empty*
   - **Build output directory:** `/`
5. **Save and Deploy.** The site publishes to `<project>.pages.dev` in about a minute.

Every push to `main` redeploys automatically. Pull requests get their own preview URL.

### Environment variables

Set these under **Settings → Environment variables** (add them to both Production
and Preview):

| Variable | Required | Purpose |
|---|---|---|
| `MAKE_WEBHOOK_URL` | Recommended | Make.com webhook. Routes enquiries to email, WhatsApp, Notion, or anywhere else. |
| `RESEND_API_KEY` | Optional | Sends the enquiry as an email via [Resend](https://resend.com). |
| `NOTIFY_TO` | Optional | Destination address. Defaults to `hello@takaya.om`. |
| `NOTIFY_FROM` | Optional | Verified Resend sender address. |

If none are set, the form still validates and accepts submissions — they are written
to the Function log rather than delivered, so nothing breaks before setup is finished.

### Connecting the custom domain later

1. Add the domain to Cloudflare (**Websites → Add a site**) and point the registrar
   at the Cloudflare nameservers it gives you.
2. In the Pages project: **Custom domains → Set up a domain** → enter `takaya.om`.
3. DNS and SSL are configured automatically. Then update the URLs in
   `robots.txt` and `sitemap.xml`.

## Adding payments and WhatsApp later

Both are new files under `functions/` — no change to the site structure:

```
functions/
  api/
    enquiry.js       ← already built
    checkout.js      ← create a payment session (Thawani / Stripe)
    webhook/
      payment.js     ← confirm payment, then enrol the participant
      whatsapp.js    ← inbound Green API messages
```

Each file automatically becomes a route: `functions/api/checkout.js` serves
`/api/checkout`. Keep every API key in Cloudflare environment variables — never
in the repository.

## Before going live

Search and replace these placeholders across all pages:

- [ ] `+968 0000 0000` — real phone / WhatsApp number
- [ ] `hello@takaya.om` — real email address
- [ ] `Add your street address here` — physical address (`contact.html`)
- [ ] Social media links in the footer (currently `#`)
- [ ] Faculty names and bios (`about.html`)
- [ ] Testimonial names and roles (`index.html`)
- [ ] Course titles, descriptions and prices (`courses.html`, `index.html`)
- [ ] Coaching package prices (`coaching.html`)
- [ ] Statistics in the hero and About page
- [ ] Map embed (`contact.html`) — replace the placeholder block with a Google Maps `<iframe>`

## How the enquiry form works

The form posts JSON to `/api/enquiry`, handled by `functions/api/enquiry.js`, which:

- rejects bots via a hidden honeypot field (`company_website` — do not remove it)
- validates and truncates every field
- adds timestamp, referring page and visitor country
- forwards to your webhook and/or sends an email
- returns field-level errors that the form highlights inline

If the request fails for any reason, the visitor is shown the email address and
WhatsApp link instead — a broken form never becomes a dead end.

## Arabic version

`assets/styles.css` already includes RTL rules under the `[dir="rtl"]` selector. To build the Arabic site, duplicate the pages, set `<html lang="ar" dir="rtl">`, translate the content, and add the `IBM Plex Sans Arabic` font link.

## Licence

© Takaya Institute. All rights reserved.
