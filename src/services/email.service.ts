import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

type SendEmailParams = {
  to: { email: string; name: string };
  subject: string;
  htmlContent: string;
};

export async function sendEmail({ to, subject, htmlContent }: SendEmailParams) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
      to: [to],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    let exactError = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      exactError = parsed.message || parsed.error || errorBody;
    } catch {
      // use raw text
    }

    throw new AppError(`Email delivery failed: ${exactError}`, 500);
  }
}

function otpTemplate(name: string, otp: string, purpose: 'verification' | 'reset') {
  const title = purpose === 'verification' ? 'Verify your PrepNest Account' : 'Reset Your PrepNest Password';
  const message = purpose === 'verification'
    ? 'Your verification code is:'
    : 'Your password reset code is:';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; padding: 40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px;">
        <tr><td align="center" style="padding-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">PrepNest</h1>
        </td></tr>
        <tr><td style="padding-bottom: 8px;">
          <p style="font-size: 16px; color: #0f172a; margin: 0;">Hello <strong>${name}</strong>,</p>
        </td></tr>
        <tr><td style="padding-bottom: 24px;">
          <p style="font-size: 15px; color: #475569; margin: 0; line-height: 1.6;">${message}</p>
        </td></tr>
        <tr><td align="center" style="padding-bottom: 24px;">
          <div style="display: inline-block; background: #f1f5f9; border-radius: 12px; padding: 16px 40px; letter-spacing: 12px; font-size: 36px; font-weight: 700; color: #6366f1;">${otp}</div>
        </td></tr>
        <tr><td style="padding-bottom: 24px;">
          <p style="font-size: 13px; color: #94a3b8; margin: 0;">This OTP expires in <strong>5 minutes</strong>. If you did not request this, please ignore this email.</p>
        </td></tr>
        <tr><td style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
          <p style="font-size: 13px; color: #94a3b8; margin: 0;">Regards,<br><strong style="color: #0f172a;">PrepNest Team</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function sendVerificationOtp(name: string, email: string, otp: string) {
  return sendEmail({
    to: { email, name },
    subject: 'Verify your PrepNest Account',
    htmlContent: otpTemplate(name, otp, 'verification'),
  });
}

export function sendResetOtp(name: string, email: string, otp: string) {
  return sendEmail({
    to: { email, name },
    subject: 'Reset Your PrepNest Password',
    htmlContent: otpTemplate(name, otp, 'reset'),
  });
}
