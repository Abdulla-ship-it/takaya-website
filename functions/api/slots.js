/**
 * GET /api/slots?eventTypeId=123&timeZone=Asia/Muscat&duration=120
 * Cloudflare Pages Function — proxies Cal.com's v2 slots endpoint so the
 * CALCOM_API_KEY never reaches the browser.
 *
 * `duration` (minutes) is optional and only matters for event types with
 * "allow booker to select from multiple durations" enabled in Cal.com —
 * without it Cal.com falls back to the event type's default length.
 *
 * Requires the CALCOM_API_KEY environment variable (Cloudflare Pages →
 * Settings → Environment variables → Secret).
 */

const CAL_BASE = 'https://api.cal.com/v2';
const WINDOW_DAYS = 14;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function onRequestGet({ request, env }) {
  if (!env.CALCOM_API_KEY) {
    return json({ ok: false, error: 'Booking calendar is not connected yet.' }, 503);
  }

  const url = new URL(request.url);
  const eventTypeId = url.searchParams.get('eventTypeId');
  if (!eventTypeId || !/^\d+$/.test(eventTypeId)) {
    return json({ ok: false, error: 'Missing or invalid eventTypeId.' }, 400);
  }

  const timeZone = url.searchParams.get('timeZone') || 'Asia/Muscat';
  const now = new Date();
  const start = now.toISOString();
  const end = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Optional — only meaningful for event types with "allow booker to select
  // from multiple durations" enabled in Cal.com (e.g. the training hall).
  const duration = url.searchParams.get('duration');

  const calUrl = new URL(CAL_BASE + '/slots');
  calUrl.searchParams.set('eventTypeId', eventTypeId);
  calUrl.searchParams.set('start', start);
  calUrl.searchParams.set('end', end);
  calUrl.searchParams.set('timeZone', timeZone);
  if (duration && /^\d+$/.test(duration)) {
    calUrl.searchParams.set('duration', duration);
  }

  let res;
  try {
    res = await fetch(calUrl.toString(), {
      headers: {
        Authorization: `Bearer ${env.CALCOM_API_KEY}`,
        'cal-api-version': '2024-09-04',
      },
    });
  } catch {
    return json({ ok: false, error: 'Could not reach the calendar.' }, 502);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    console.error('Cal.com slots error:', res.status, JSON.stringify(body));
    return json({ ok: false, error: 'Could not load availability.' }, 502);
  }

  return json({ ok: true, slots: body.data || {} });
}

export async function onRequestPost() {
  return json({ ok: false, error: 'Use GET to read availability.' }, 405);
}
