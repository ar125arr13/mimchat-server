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

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // ذخیره همان کدی که قرار است ایمیل شود در Termux
    const saveResponse = await fetch(
      "https://19d7ba91de2d8f.lhr.life/save-code",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          code
        })
      }
    );

    if (!saveResponse.ok) {
      return res.status(500).json({
        success: false,
        error: "Could not save verification code"
      });
    }

    // ارسال همان کد به ایمیل
    const response = await fetch(
      "https://sendlib.samueltuoyo.com/api/send",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.SENDLIB_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "abclhmeme@gmail.com",
          to: email,
          subject: "MimChat Verification Code",
          html: `
            <div style="font-family:Arial">
              <h2>MimChat</h2>
              <p>Your verification code is:</p>
              <h1>${code}</h1>
            </div>
          `
        })
      }
    );

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        error: "Sendlib Error",
        status: response.status,
        details: data
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
