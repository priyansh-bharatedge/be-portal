import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { toEmail, empName, otpCode } = req.body || {};

  if (!toEmail || !otpCode) {
    return res.status(400).json({ success: false, error: 'Missing required parameters: toEmail, otpCode' });
  }

  // Load SMTP config from environment variables (with testerbemain@gmail.com defaults)
  const host = process.env.SMTP_HOST || process.env.VITE_SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || process.env.VITE_SMTP_PORT || '465', 10);
  const secure = port === 465 || process.env.SMTP_SECURE === 'true' || process.env.VITE_SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || process.env.VITE_SMTP_USER || 'testerbemain@gmail.com';
  const pass = process.env.SMTP_PASS || process.env.VITE_SMTP_PASS || 'qyquibvuwwefczsy';
  const from = process.env.SMTP_FROM || process.env.VITE_SMTP_FROM || `"BharatEdge Support" <${user}>`;

  if (!pass) {
    return res.status(200).json({
      success: false,
      warning: 'SMTP_PASS is not configured in environment variables. Email simulation active.',
      deliveredLocally: true
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px; color: #1e293b; }
            .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
            .header { background: linear-gradient(135deg, #ea580c, #f97316); padding: 30px; text-align: center; color: #ffffff; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
            .content { padding: 35px 30px; }
            .greeting { font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #0f172a; }
            .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 25px; }
            .otp-box { background: #fff7ed; border: 2px dashed #ea580c; border-radius: 16px; padding: 20px; text-align: center; margin: 25px 0; }
            .otp-label { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #ea580c; letter-spacing: 1px; margin-bottom: 6px; }
            .otp-code { font-family: 'Courier New', monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #ea580c; }
            .expiry-note { font-size: 12px; color: #64748b; text-align: center; margin-top: 15px; }
            .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>BharatEdge Portal</h1>
            </div>
            <div class="content">
              <div class="greeting">Hello ${empName || 'Team Member'},</div>
              <div class="message">
                You have requested a verification code to activate your account or set your password on the BharatEdge Portal.
              </div>
              <div class="otp-box">
                <div class="otp-label">Your 6-Digit Verification Code</div>
                <div class="otp-code">${otpCode}</div>
              </div>
              <div class="expiry-note">
                ⏱️ This code is valid for <strong>5 minutes</strong>. Do not share this OTP with anyone.
              </div>
            </div>
            <div class="footer">
              Sent automatically from <strong>support@bharat-edge.com</strong><br/>
              © ${new Date().getFullYear()} Bharat Services Private Limited. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: `Your BharatEdge Portal Verification Code: ${otpCode}`,
      text: `Hello ${empName || 'Team Member'},\n\nYour 6-digit verification code is: ${otpCode}\n\nThis code is valid for 5 minutes.\n\nBharatEdge Support`,
      html: htmlContent
    });

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      recipient: toEmail
    });
  } catch (error: any) {
    console.error('Nodemailer send error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email via SMTP'
    });
  }
}
