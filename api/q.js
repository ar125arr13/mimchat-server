export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed",
      step: "method-check"
    });
  }

  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
        step: "input"
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ساخت کد
    const code = String(
      Math.floor(100000 + Math.random() * 900000)
    );

    // مرحله 1: ذخیره کد در Termux
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
        error: "Save-code Connection Error",
        step: "save-code",
        details: error.message
      });
    }

    const saveText = await saveResponse.text();

    if (!saveResponse.ok) {
      return res.status(502).json({
        success: false,
        error: "Save-code Error",
        step: "save-code",
        status: saveResponse.status,
        details: saveText
      });
    }

    // مرحله 2: ارسال ایمیل با Sendlib
    let sendResponse;

    try {
      sendResponse = await fetch(
        "https://sendlib.samueltuoyo.com/api/send",
        {
          method: "POST",
          headers: {
            "Authorization":
              `Bearer ${process.env.SENDLIB_API_KEY}`,
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
                <h1>${code}</h1>
                <p>This code is valid for 5 minutes.</p>
              </div>
            `
          })
        }
      );
    } catch (error) {
      return res.status(502).json({
        success: false,
        error: "Sendlib Connection Error",
        step: "sendlib",
        details: error.message
      });
    }

    const sendText = await sendResponse.text();

    if (!sendResponse.ok) {
      return res.status(502).json({
        success: false,
        error: "Sendlib Error",
        step: "sendlib",
        status: sendResponse.status,
        details: sendText
      });
    }

    return res.status(200).json({
      success: true,
      message: "Verification email sent",
      step: "complete"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server Error",
      step: "unknown",
      details: error.message
    });
  }
}
