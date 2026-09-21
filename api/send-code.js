export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "MimChat <onboarding@resend.dev>",
      to: [email],
      subject: "کد تأیید MimChat",
      html: `
        <h2>کد تأیید MimChat</h2>
        <h1>${code}</h1>
        <p>این کد تا ۵ دقیقه معتبر است.</p>
      `
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return res.status(500).json({
      success: false,
      error: data
    });
  }

  return res.status(200).json({
    success: true
  });
}
