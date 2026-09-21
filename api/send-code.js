const crypto = require("crypto");

const TABLE = "email_verification_codes";
const SENDLIB_URL = "https://api.sendlib.com/v1/transmissions";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function getConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sendlibKey = process.env.SENDLIB_API_KEY;
  const pepper = process.env.VERIFICATION_CODE_PEPPER;

  if (!supabaseUrl || !supabaseKey || !sendlibKey || !pepper) {
    throw new Error("Missing server environment variables");
  }

  return { supabaseUrl, supabaseKey, sendlibKey, pepper };
}

function supabaseHeaders(key, extra) {
  return Object.assign({
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  }, extra || {});
}

async function supabaseRequest(config, path, options) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, Object.assign({}, options || {}, {
    headers: supabaseHeaders(config.supabaseKey, options && options.headers)
  }));
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = raw; }
  if (!response.ok) {
    const message = body && (body.message || body.error || body.hint) ? (body.message || body.error || body.hint) : `Supabase returned ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (_) { return {}; }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashCode(email, code, pepper) {
  return crypto.createHash("sha256").update(`${pepper}:${email}:${code}`, "utf8").digest("hex");
}

function emailFilter(email) {
  return encodeURIComponent(`eq.${email}`);
}

function safeSendlibError(status) {
  if (status === 401 || status === 403) return "سرویس ارسال ایمیل احراز هویت نشد";
  if (status === 429) return "محدودیت ارسال ایمیل فعال است؛ کمی بعد دوباره تلاش کنید";
  return "ارسال ایمیل انجام نشد؛ دوباره تلاش کنید";
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  const { email: rawEmail } = parseBody(req);
  const email = normalizeEmail(rawEmail);
  if (!validEmail(email)) {
    return res.status(400).json({ success: false, error: "ایمیل معتبر نیست" });
  }

  let config;
  try {
    config = getConfig();

    const existing = await supabaseRequest(
      config,
      `${TABLE}?email=${emailFilter(email)}&select=email,updated_at,expires_at,consumed_at&limit=1`,
      { method: "GET" }
    );
    const previous = Array.isArray(existing) ? existing[0] : null;
    if (previous && previous.updated_at) {
      const elapsed = Date.now() - Date.parse(previous.updated_at);
      if (Number.isFinite(elapsed) && elapsed < RESEND_COOLDOWN_MS) {
        return res.status(429).json({
          success: false,
          error: `لطفاً ${Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)} ثانیه صبر کنید`,
          retryAfter: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
        });
      }
    }

    const code = generateCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    const codeHash = hashCode(email, code, config.pepper);

    // فقط هش کد روی سرور ذخیره می‌شود؛ کد خام هرگز در دیتابیس یا پاسخ API برنمی‌گردد.
    await supabaseRequest(
      config,
      `${TABLE}?on_conflict=email`,
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          email,
          code_hash: codeHash,
          attempts: 0,
          expires_at: expiresAt.toISOString(),
          consumed_at: null,
          verified_at: null,
          updated_at: now.toISOString()
        })
      }
    );

    const sendlibResponse = await fetch(SENDLIB_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.sendlibKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "abclhmeme@gmail.com",
        to: [email],
        subject: "کد تأیید MimChat",
        text: `کد تأیید ایمیل MimChat: ${code}\nاین کد تا ۱۰ دقیقه معتبر است. اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>MimChat</h2><p>کد تأیید ایمیل شما:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px;direction:ltr">${code}</p><p>این کد تا ۱۰ دقیقه معتبر است.</p><p>اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.</p></div>`,
        stream: "transactional"
      })
    });

    if (!sendlibResponse.ok) {
      // در صورت شکست ارسال، رکورد همین کد پاک می‌شود تا کد ارسال‌نشده قابل استفاده نباشد.
      try {
        await supabaseRequest(
          config,
          `${TABLE}?email=${emailFilter(email)}&code_hash=eq.${encodeURIComponent(codeHash)}`,
          { method: "DELETE" }
        );
      } catch (_) {}
      return res.status(502).json({ success: false, error: safeSendlibError(sendlibResponse.status) });
    }

    return res.status(200).json({
      success: true,
      expiresIn: CODE_TTL_MS / 1000,
      resendAfter: RESEND_COOLDOWN_MS / 1000
    });
  } catch (error) {
    console.error("[send-code]", error && error.message ? error.message : "unknown error");
    return res.status(500).json({ success: false, error: "خطای داخلی سرور؛ دوباره تلاش کنید" });
  }
};
