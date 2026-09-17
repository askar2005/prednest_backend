import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

type SendEmailParams = {
  to: { email: string; name: string };
  subject: string;
  htmlContent: string;
};

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export async function sendEmail({ to, subject, htmlContent }: SendEmailParams): Promise<{ messageId: string }> {
  if (!env.BREVO_API_KEY) {
    console.error('[OTP] Brevo send failed: BREVO_API_KEY environment variable is missing');
    throw new AppError('Email delivery service is currently unavailable. Please try again later.', 500);
  }

  const masked = maskEmail(to.email);
  console.log(`[OTP] Request received. Recipient: ${masked}`);
  console.log(`[OTP] Brevo request sent to ${masked}`);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
        to: [{ name: to.name, email: to.email }],
        subject,
        htmlContent,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      let exactError = responseText;
      try {
        const parsed = JSON.parse(responseText);
        exactError = parsed.message || parsed.error || responseText;
      } catch {
        // use raw text
      }
      console.error(`[OTP] Brevo send failed for ${masked}. Status: ${response.status}. Error: ${exactError}`);
      throw new AppError('Unable to send verification email. Please check your email address or try again later.', 500);
    }

    let messageId = 'accepted';
    try {
      const parsed = JSON.parse(responseText);
      messageId = parsed.messageId || 'accepted';
    } catch {
      // ignore
    }

    console.log(`[OTP] Brevo message accepted for ${masked}. MessageId: ${messageId}`);
    return { messageId };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    console.error(`[OTP] Brevo send error for ${masked}:`, err?.message || err);
    throw new AppError(`Failed to send verification email to ${masked}. Please try again later.`, 500);
  }
}

function otpTemplate(name: string, otp: string, purpose: 'verification' | 'reset') {
  const title = purpose === 'verification' ? 'Verify your Kathir Academy Account' : 'Reset Your Kathir Academy Password';
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
          <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">${title}</h1>
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
          <p style="font-size: 13px; color: #94a3b8; margin: 0;">This OTP expires in <strong>15 minutes</strong>. If you did not request this, please ignore this email.</p>
        </td></tr>
        <tr><td style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
          <p style="font-size: 13px; color: #94a3b8; margin: 0;">Regards,<br><strong style="color: #0f172a;">Kathir Academy Team</strong></p>
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
    subject: 'Verify your Kathir Academy Account',
    htmlContent: otpTemplate(name, otp, 'verification'),
  });
}

export function sendResetOtp(name: string, email: string, otp: string) {
  return sendEmail({
    to: { email, name },
    subject: 'Reset Your Kathir Academy Password',
    htmlContent: otpTemplate(name, otp, 'reset'),
  });
}

export function sendAccountDeletionOtp(name: string, email: string, otp: string) {
  return sendEmail({
    to: { email, name },
    subject: 'Account Deletion Request Code - Kathir Academy',
    htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; padding: 40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px;">
        <tr><td align="center" style="padding-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #dc2626; margin: 0;">Account Deletion Request</h1>
        </td></tr>
        <tr><td style="padding-bottom: 8px;">
          <p style="font-size: 16px; color: #0f172a; margin: 0;">Hello <strong>${name}</strong>,</p>
        </td></tr>
        <tr><td style="padding-bottom: 24px;">
          <p style="font-size: 15px; color: #475569; margin: 0; line-height: 1.6;">You have requested to permanently delete your Kathir Academy account and all associated personal data. Use the verification code below to confirm this request:</p>
        </td></tr>
        <tr><td align="center" style="padding-bottom: 24px;">
          <div style="display: inline-block; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px 40px; letter-spacing: 12px; font-size: 36px; font-weight: 700; color: #dc2626;">${otp}</div>
        </td></tr>
        <tr><td style="padding-bottom: 24px;">
          <p style="font-size: 13px; color: #94a3b8; margin: 0;">This code expires in <strong>15 minutes</strong>. If you did not request account deletion, please secure your account immediately and ignore this email.</p>
        </td></tr>
        <tr><td style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
          <p style="font-size: 13px; color: #94a3b8; margin: 0;">Regards,<br><strong style="color: #0f172a;">Kathir Academy Team</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

