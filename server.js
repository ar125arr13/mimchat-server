const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();

app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);

// کدهای تأیید موقت
const verificationCodes = new Map();

app.get("/", (req, res) => {
  res.send("MimChat Mail Server is Online!");
});

// ارسال کد
app.post("/send-code", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // کد بعد از 5 دقیقه منقضی می‌شود
  verificationCodes.set(email, {
    code,
    expires: Date.now() + 5 * 60 * 1000
  });

  try {
    await resend.emails.send({
      from: "MimChat <onboarding@resend.dev>",
      to: email,
      subject: "کد تأیید MimChat",
      html: `
        <h2>کد تأیید MimChat</h2>
        <p>کد شما:</p>
        <h1>${code}</h1>
        <p>این کد تا ۵ دقیقه معتبر است.</p>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    verificationCodes.delete(email);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// بررسی کد
app.post("/verify-code", (req, res) => {
  const { email, code } = req.body;

  const saved = verificationCodes.get(email);

  if (!saved) {
    return res.status(400).json({
      success: false,
      error: "code_not_found"
    });
  }

  if (Date.now() > saved.expires) {
    verificationCodes.delete(email);

    return res.status(400).json({
      success: false,
      error: "code_expired"
    });
  }

  if (saved.code !== String(code)) {
    return res.status(400).json({
      success: false,
      error: "wrong_code"
    });
  }

  verificationCodes.delete(email);

  res.json({
    success: true,
    verified: true
  });
});

app.listen(8080, "0.0.0.0", () => {
  console.log("MimChat Mail Server running on port 8080");
});
