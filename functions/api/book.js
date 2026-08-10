/**
 * POST /api/book
 * Cloudflare Pages Function — creates a real booking on Cal.com so the
 * CALCOM_API_KEY never reaches the browser. Cal.com sends its own
 * confirmation emails to the attendee and the calendar owner.
 *
 * Requires the CALCOM_API_KEY environment variable (Cloudflare Pages →
 * Settings → Environment variables → Secret).
 *
 * The booker must also attach a payment slip (image or PDF, ≤4MB), sent as
 * base64 in the request body. Once the Cal.com booking succeeds, the slip is
 * emailed as an attachment — same delivery config as /api/enquiry.
 *
 * Optional `lengthInMinutes` lets the booker pick a duration for event types
 * that have Cal.com's "allow booker to select from multiple durations"
 * enabled (used for the training hall — 60/120/180 min). It must match one
 * of the durations configured on that event type in Cal.com, or the booking
 * request will be rejected upstream.
 *
 *   RESEND_API_KEY     Send the slip + booking summary as an email via Resend.
 *   NOTIFY_TO          Email address to notify   (default hello@takaya.om)
 *   NOTIFY_FROM        Verified Resend sender    (default enquiries@takaya.om)
 *
 * If RESEND_API_KEY isn't set the booking still succeeds (Cal.com is the
 * source of truth) — the response just comes back with slipDelivered:false
 * so the front end can tell the booker to send the slip another way.
 */

const CAL_BASE = 'https://api.cal.com/v2';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
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

const MAX_SLIP_BYTES = 4 * 1024 * 1024;
const SLIP_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

function validateSlip(slip) {
  if (!slip || typeof slip !== 'object') return 'Please attach your payment slip.';
  const filename = clean(slip.filename, 200);
  const type = clean(slip.type, 100);
  const dataBase64 = typeof slip.dataBase64 === 'string' ? slip.dataBase64 : '';
  if (!filename || !dataBase64) return 'Please attach your payment slip.';
  if (SLIP_TYPES.indexOf(type) === -1) return 'Slip must be an image (PNG/JPEG/WEBP) or PDF.';
  // base64 -> byte size, without decoding the whole thing.
  const approxBytes = Math.floor(dataBase64.length * 0.75);
  if (approxBytes > MAX_SLIP_BYTES) return 'Slip file is too large (max 4MB).';
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env.CALCOM_API_KEY) {
    return json({ ok: false, error: 'Booking calendar is not connected yet.' }, 503);
  }

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Could not read the booking.' }, 400);
  }

  // Spam trap — mirrors /api/enquiry.
  if (clean(raw.company_website, 200)) {
    return json({ ok: true });
  }

  const eventTypeId = clean(String(raw.eventTypeId || ''), 20);
  const start = clean(String(raw.start || ''), 40);
  const name = clean(raw.name, 120);
  const email = clean(raw.email, 200);
  const phone = clean(raw.phone, 40);
  const timeZone = clean(raw.timeZone, 60) || 'Asia/Muscat';
  const slip = raw.slip;

  // Optional — only meaningful for event types with "allow booker to select
  // from multiple durations" enabled in Cal.com (e.g. the training hall).
  // Must match one of the durations configured on that event type, or
  // Cal.com will reject the booking.
  let lengthInMinutes = null;
  if (raw.lengthInMinutes !== undefined && raw.lengthInMinutes !== null && raw.lengthInMinutes !== '') {
    const n = Number(raw.lengthInMinutes);
    if (!Number.isInteger(n) || n < 15 || n > 480) {
      lengthInMinutes = NaN; // flagged below
    } else {
      lengthInMinutes = n;
    }
  }

  const errors = {};
  if (!/^\d+$/.test(eventTypeId)) errors.eventTypeId = 'Missing programme or space.';
  if (!start || Number.isNaN(Date.parse(start))) errors.start = 'Missing or invalid time.';
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!validEmail(email)) errors.email = 'Please enter a valid email address.';
  if (!phone) errors.phone = 'Please enter your phone number.';
  if (Number.isNaN(lengthInMinutes)) errors.lengthInMinutes = 'Invalid booking duration.';
  const slipError = validateSlip(slip);
  if (slipError) errors.slip = slipError;

  if (Object.keys(errors).length) {
    return json({ ok: false, errors }, 422);
  }

  const payload = {
    eventTypeId: Number(eventTypeId),
    start,
    attendee: { name, email, timeZone },
  };
  if (lengthInMinutes) {
    payload.lengthInMinutes = lengthInMinutes;
  }
  if (phone) {
    // Kept out of the core attendee object (Cal.com's schema doesn't
    // guarantee a phone field per event type) — surfaced as a note instead.
    payload.metadata = { phone };
  }

  let res;
  try {
    res = await fetch(CAL_BASE + '/bookings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CALCOM_API_KEY}`,
        'Content-Type': 'application/json',
        'cal-api-version': '2024-08-13',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ ok: false, error: 'Could not reach the calendar.' }, 502);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok || !body || body.status === 'error') {
    console.error('Cal.com booking error:', res.status, JSON.stringify(body));
    const msg =
      (body && body.error && (body.error.message || body.error)) ||
      'That time may no longer be available. Please pick another slot.';
    return json({ ok: false, error: typeof msg === 'string' ? msg : String(msg) }, res.status >= 400 ? res.status : 502);
  }

  // Booking is confirmed on Cal.com at this point — everything below is
  // best-effort delivery of the payment slip and must never turn a
  // successful booking into an error response.
  let slipDelivered = false;
  if (env.RESEND_API_KEY) {
    const to = env.NOTIFY_TO || 'hello@takaya.om';
    const from = env.NOTIFY_FROM || 'Takaya Website <enquiries@takaya.om>';
    const rows = [
      ['Name', name],
      ['Email', email],
      ['Phone', phone],
      ['Start', start],
      ['Time zone', timeZone],
      ['Booking UID', body.data && body.data.uid ? body.data.uid : ''],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#3E5372">${k}</td><td style="padding:4px 0"><strong>${escapeHtml(String(v))}</strong></td></tr>`)
      .join('');

    try {
      const res2 = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: email,
          subject: `New booking — ${name}`,
          html: `
            <div style="font-family:system-ui,-apple-system,sans-serif;color:#3E5372;max-width:560px">
              <h2 style="margin:0 0 18px;font-weight:500">New booking, with payment slip attached</h2>
              <table style="font-size:14px;border-collapse:collapse">${rows}</table>
            </div>`,
          attachments: [
            {
              filename: clean(slip.filename, 200) || 'slip',
              content: slip.dataBase64,
            },
          ],
        }),
      });
      slipDelivered = res2.ok;
      if (!res2.ok) console.error('Slip email delivery failed:', res2.status, await res2.text().catch(() => ''));
    } catch (err) {
      console.error('Slip email delivery error:', err && err.message);
    }
  } else {
    console.log('Booking confirmed but RESEND_API_KEY is not set — slip not delivered for', email);
  }

  return json({ ok: true, uid: body.data && body.data.uid ? body.data.uid : null, slipDelivered });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Send bookings with POST.' }, 405);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
