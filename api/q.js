export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // کد دقیقاً ۶ رقمی
    const code = String(
      Math.floor(100000 + Math.random() * 900000)
    );

    // ذخیره کد در Termux
    const saveResponse = await fetch(
      "https://c934de107f389f.lhr.life/save-code",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code
        })
      }
    );

    const saveText = await saveResponse.text();

    let saveData;

    try {
      saveData = JSON.parse(saveText);
    } catch {
      saveData = {
        raw: saveText
      };
    }

    if (!saveResponse.ok || !saveData.success) {
      return res.status(502).json({
        success: false,
        error: "Save-code Error",
        status: saveResponse.status,
        details: saveData
      });
    }

    // ارسال همان کد توسط Sendlib
    const sendResponse = await fetch(
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
          to: email.trim().toLowerCase(),
          subject: "MimChat Verification Code",
          html: `
            <div style="font-family:Arial,sans-serif">
              <h2>MimChat</h2>
              <p>YOur verification code is:</p>
              <h1>${code}</h1>
              <p>This code is valid for 5 minutes.</p>
            </div>
          `
        })
      }
    );

    const sendText = await sendResponse.text();

    let sendData;

    try {
      sendData = JSON.parse(sendText);
    } catch {
      sendData = {
        raw: sendText
      };
    }

    if (!sendResponse.ok) {
      return res.status(502).json({
        success: false,
        error: "Sendlib Error",
        status: sendResponse.status,
        details: sendData
      });
    }

    return res.status(200).json({
      success: true,
      message: "Verification email sent"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server Error",
      details: error.message
    });
  }
}
