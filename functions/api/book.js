/**
 * POST /api/book
 * Cloudflare Pages Function — creates a real booking on Cal.com so the
 * CALCOM_API_KEY never reaches the browser. Cal.com sends its own
 * confirmation emails to the attendee and the calendar owner.
 *
 * Requires the CALCOM_API_KEY environment variable (Cloudflare Pages →
 * Settings → Environment variables → Secret).
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

  const errors = {};
  if (!/^\d+$/.test(eventTypeId)) errors.eventTypeId = 'Missing programme or space.';
  if (!start || Number.isNaN(Date.parse(start))) errors.start = 'Missing or invalid time.';
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!validEmail(email)) errors.email = 'Please enter a valid email address.';

  if (Object.keys(errors).length) {
    return json({ ok: false, errors }, 422);
  }

  const payload = {
    eventTypeId: Number(eventTypeId),
    start,
    attendee: { name, email, timeZone },
  };
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

  return json({ ok: true, uid: body.data && body.data.uid ? body.data.uid : null });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Send bookings with POST.' }, 405);
}
