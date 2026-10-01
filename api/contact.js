/**
 * POST /api/contact — inquiries from the bbdig.com contact form.
 *
 * Sends the submission as email through Resend. Set in Vercel under
 * Settings -> Environment Variables:
 *
 *   RESEND_API_KEY   required. Without it the route answers 503
 *                    {error:"not_configured"} and the page shows the email
 *                    address and phone number instead.
 *   CONTACT_TO       optional. Defaults to info@bgrants.com
 *   CONTACT_FROM     optional. An address on a domain verified in Resend,
 *                    e.g. "BBDIG site <site@bbdig.com>".
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v, n = 2000) => String(v == null ? '' : v).slice(0, n).trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad_json' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad_request' });

  // Honeypot: real people never fill a field they cannot see.
  if (clip(body.website)) return res.status(200).json({ ok: true });

  const name = clip(body.name, 200);
  const email = clip(body.email, 320);
  if (!name || !email) return res.status(400).json({ error: 'missing_fields' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'bad_email' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured' });

  const city = clip(body.city, 200);
  const lines = [
    `Name:   ${name}`,
    `Email:  ${email}`,
    `City:   ${city || '(not provided)'}`,
    '',
    'Message:',
    clip(body.message) || '(not provided)',
    '',
    '---',
    `Submitted: ${new Date().toISOString()} via bbdig.com`,
  ];

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || 'BBDIG site <onboarding@resend.dev>',
        to: [process.env.CONTACT_TO || 'info@bgrants.com'],
        reply_to: email,
        subject: `BBDIG inquiry — ${city || name}`,
        text: lines.join('\n'),
      }),
    });
    if (!r.ok) {
      console.error('resend failed', r.status, await r.text().catch(() => ''));
      return res.status(502).json({ error: 'send_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact error', err);
    return res.status(502).json({ error: 'send_failed' });
  }
}
