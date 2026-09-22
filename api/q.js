export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // فقط POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const { email } = req.body || {};

    // بررسی ایمیل
    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // ساخت کد 6 رقمی
    const code = String(
      Math.floor(100000 + Math.random() * 900000)
    );

    // -----------------------------
    // مرحله 1: ذخیره کد در Node.js
    // -----------------------------

    let saveResponse;

    try {
      saveResponse = await fetch(
        "https://c934de107f389f.lhr.life/save-code",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: cleanEmail,
            code: code
          })
        }
      );
    } catch (error) {
      return res.status(502).json({
        success: false,
        stage: "save-code",
        error: "Could not connect to verification server",
        details: error.message
      });
    }

    const saveText = await saveResponse.text();

    if (!saveResponse.ok) {
      return res.status(502).json({
        success: false,
        stage: "save-code",
        error: "Save-code Error",
        status: saveResponse.status,
        details: saveText
      });
    }

    // -----------------------------
    // مرحله 2: ارسال ایمیل با Sendlib
    // -----------------------------

    const sendlibKey = process.env.SENDLIB_API_KEY;

    if (!sendlibKey) {
      return res.status(500).json({
        success: false,
        stage: "sendlib",
        error: "SENDLIB_API_KEY is not configured on Vercel"
      });
    }

    let sendResponse;

    try {
      sendResponse = await fetch(
        "https://sendlib.samueltuoyo.com/api/send",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendlibKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "abclhmeme@gmail.com",
            to: cleanEmail,
            subject: "MimChat Verification Code",
            html: `
              <div style="font-family:Arial,sans-serif">
                <h2>MimChat</h2>

                <p>Your verification code is:</p>

                <h1 style="letter-spacing:6px">
                  ${code}
                </h1>

                <p>This code is valid for 5 minutes.</p>
              </div>
            `
          })
        }
      );
    } catch (error) {
      return res.status(502).json({
        success: false,
        stage: "sendlib",
        error: "Could not connect to Sendlib",
        details: error.message
      });
    }

    const sendText = await sendResponse.text();

    if (!sendResponse.ok) {
      return res.status(502).json({
        success: false,
        stage: "sendlib",
        error: "Sendlib Error",
        status: sendResponse.status,
        details: sendText
      });
    }

    // -----------------------------
    // موفق
    // -----------------------------

    return res.status(200).json({
      success: true,
      message: "Verification email sent"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      stage: "unknown",
      error: "Server Error",
      details: error.message
    });
  }
}
