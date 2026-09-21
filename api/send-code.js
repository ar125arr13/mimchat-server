export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const response = await fetch("https://sendlib.samueltuoyo.com/api/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SENDLIB_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "abclhmeme@gmail.com",
        to: email,
        subject: "MimChat Verification Code",
        html: `<h2>MimChat</h2><p>Your verification code is:</p><h1>${code}</h1>`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "Verification email sent"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
