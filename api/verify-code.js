const crypto = require("crypto");

const TABLE = "email_verification_codes";
const MAX_ATTEMPTS = 5;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function getConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pepper = process.env.VERIFICATION_CODE_PEPPER;
  if (!supabaseUrl || !supabaseKey || !pepper) throw new Error("Missing server environment variables");
  return { supabaseUrl, supabaseKey, pepper };
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

function hashCode(email, code, pepper) {
  return crypto.createHash("sha256").update(`${pepper}:${email}:${code}`, "utf8").digest("hex");
}

function emailFilter(email) {
  return encodeURIComponent(`eq.${email}`);
}

function constantTimeEqualHex(a, b) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  const body = parseBody(req);
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, verified: false, error: "ایمیل یا کد معتبر نیست" });
  }

  let config;
  try {
    config = getConfig();
    const rows = await supabaseRequest(
      config,
      `${TABLE}?email=${emailFilter(email)}&select=email,code_hash,attempts,expires_at,consumed_at&limit=1`,
      { method: "GET" }
    );
    const record = Array.isArray(rows) ? rows[0] : null;

    if (!record || !record.code_hash) {
      return res.status(400).json({ success: false, verified: false, error: "کد پیدا نشد؛ ابتدا کد جدید درخواست کنید" });
    }
    if (record.consumed_at) {
      return res.status(400).json({ success: false, verified: false, error: "این کد قبلاً استفاده شده است" });
    }
    if (Number(record.attempts || 0) >= MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, verified: false, error: "تعداد تلاش‌ها تمام شده؛ کد جدید درخواست کنید" });
    }
    if (!record.expires_at || Date.now() >= Date.parse(record.expires_at)) {
      await supabaseRequest(
        config,
        `${TABLE}?email=${emailFilter(email)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ code_hash: null, updated_at: new Date().toISOString() }) }
      );
      return res.status(400).json({ success: false, verified: false, error: "کد منقضی شده است؛ کد جدید درخواست کنید" });
    }

    const expected = hashCode(email, code, config.pepper);
    if (!constantTimeEqualHex(expected, record.code_hash)) {
      const attempts = Number(record.attempts || 0) + 1;
      await supabaseRequest(
        config,
        `${TABLE}?email=${emailFilter(email)}&consumed_at=is.null`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ attempts, updated_at: new Date().toISOString() })
        }
      );
      return res.status(400).json({
        success: false,
        verified: false,
        error: attempts >= MAX_ATTEMPTS ? "تعداد تلاش‌ها تمام شد؛ کد جدید درخواست کنید" : "کد اشتباه است"
      });
    }

    const verifiedAt = new Date().toISOString();
    // شرط code_hash و consumed_at باعث می‌شود دو درخواست هم‌زمان نتوانند یک کد را دوبار مصرف کنند.
    const updated = await supabaseRequest(
      config,
      `${TABLE}?email=${emailFilter(email)}&code_hash=eq.${encodeURIComponent(expected)}&consumed_at=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          code_hash: null,
          attempts: Number(record.attempts || 0),
          consumed_at: verifiedAt,
          verified_at: verifiedAt,
          updated_at: verifiedAt
        })
      }
    );
    if (!Array.isArray(updated) || updated.length === 0) {
      return res.status(400).json({ success: false, verified: false, error: "این کد قبلاً استفاده شده است" });
    }

    return res.status(200).json({ success: true, verified: true, email });
  } catch (error) {
    console.error("[verify-code]", error && error.message ? error.message : "unknown error");
    return res.status(500).json({ success: false, verified: false, error: "خطای داخلی سرور؛ دوباره تلاش کنید" });
  }
};
