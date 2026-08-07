/**
 * POST /api/enquiry
 * Cloudflare Pages Function — handles website enquiries.
 *
 * Configure in Cloudflare → Pages → Settings → Environment variables:
 *
 *   MAKE_WEBHOOK_URL   (optional) Make.com / Zapier webhook. Route the enquiry
 *                      to email, WhatsApp via Green API, Notion, a CRM — whatever
 *                      you want. This is the recommended option.
 *
 *   RESEND_API_KEY     (optional) Send the enquiry as an email via Resend.
 *   NOTIFY_TO          Email address to notify   (default hello@takaya.om)
 *   NOTIFY_FROM        Verified Resend sender    (default enquiries@takaya.om)
 *
 * If neither is set the endpoint still accepts and validates submissions,
 * so the form works from day one — it simply has nowhere to deliver them yet.
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const MAX_LEN = {
  name: 120,
  email: 200,
  phone: 40,
  organisation: 160,
  interest: 160,
  language: 40,
  format: 60,
  message: 4000,
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Accepts JSON or classic form encoding, so the form degrades gracefully. */
async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return await request.json();
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

export async function onRequestPost({ request, env }) {
  let raw;
  try {
    raw = await readBody(request);
  } catch {
    return json({ ok: false, error: 'Could not read the submission.' }, 400);
  }

  // --- Spam trap -----------------------------------------------------------
  // A hidden field no human ever sees. Bots fill it in. Return success so the
  // bot believes it worked and does not retry.
  if (clean(raw.company_website, 200)) {
    return json({ ok: true });
  }

  // --- Normalise -----------------------------------------------------------
  const data = {};
  for (const [field, max] of Object.entries(MAX_LEN)) {
    data[field] = clean(raw[field], max);
  }

  // --- Validate ------------------------------------------------------------
  const errors = {};
  if (data.name.length < 2) errors.name = 'Please enter your name.';
  if (!validEmail(data.email)) errors.email = 'Please enter a valid email address.';
  if (data.message.length > 0 && data.message.length < 3) {
    errors.message = 'Please add a little more detail.';
  }

  if (Object.keys(errors).length) {
    return json({ ok: false, errors }, 422);
  }

  // --- Enrich --------------------------------------------------------------
  const enquiry = {
    ...data,
    submitted_at: new Date().toISOString(),
    source: request.headers.get('referer') || 'takaya website',
    country: request.headers.get('cf-ipcountry') || '',
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
  };

  // --- Deliver -------------------------------------------------------------
  const delivered = [];
  const failures = [];

  if (env.MAKE_WEBHOOK_URL) {
    try {
      const res = await fetch(env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enquiry),
      });
      res.ok ? delivered.push('webhook') : failures.push(`webhook ${res.status}`);
    } catch (err) {
      failures.push(`webhook ${err.message}`);
    }
  }

  if (env.RESEND_API_KEY) {
    const to = env.NOTIFY_TO || 'hello@takaya.om';
    const from = env.NOTIFY_FROM || 'Takaya Website <enquiries@takaya.om>';
    const rows = [
      ['Name', enquiry.name],
      ['Email', enquiry.email],
      ['Phone', enquiry.phone],
      ['Organisation', enquiry.organisation],
      ['Interested in', enquiry.interest],
      ['Language', enquiry.language],
      ['Format', enquiry.format],
      ['Country', enquiry.country],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#6E7A72">${k}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`)
      .join('');

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: enquiry.email,
          subject: `New enquiry — ${enquiry.interest || 'General'} — ${enquiry.name}`,
          html: `
            <div style="font-family:system-ui,-apple-system,sans-serif;color:#17201B;max-width:560px">
              <h2 style="margin:0 0 18px;font-weight:500">New website enquiry</h2>
              <table style="font-size:14px;border-collapse:collapse">${rows}</table>
              ${enquiry.message ? `<p style="margin:22px 0 6px;color:#6E7A72;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Message</p><p style="font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(enquiry.message)}</p>` : ''}
              <p style="margin-top:26px;font-size:12px;color:#9AA5A0">Received ${enquiry.submitted_at}</p>
            </div>`,
        }),
      });
      res.ok ? delivered.push('email') : failures.push(`email ${res.status}`);
    } catch (err) {
      failures.push(`email ${err.message}`);
    }
  }

  if (!delivered.length && failures.length) {
    console.error('Enquiry delivery failed:', failures.join(' | '), enquiry);
    return json(
      { ok: false, error: 'We could not deliver your enquiry. Please email hello@takaya.om directly.' },
      502
    );
  }

  if (!delivered.length) {
    // No delivery target configured yet — log it so nothing is silently lost.
    console.log('Enquiry received (no delivery target configured):', JSON.stringify(enquiry));
    return json({ ok: true, pending_setup: true });
  }

  return json({ ok: true });
}

/** Anything other than POST gets a clear 405 rather than a stack trace. */
export async function onRequestGet() {
  return json({ ok: false, error: 'Send enquiries with POST.' }, 405);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
