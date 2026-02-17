import nodemailer from 'nodemailer';
import { env } from '../config';

type Recipient = { email: string; name?: string };

const smtpEnabled = Boolean(env.SMTP_HOST && env.SMTP_PORT);

const transporter = smtpEnabled
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    })
  : null;

const sendOrLog = async (to: string, subject: string, text: string, attachments?: nodemailer.SendMailOptions['attachments']) => {
  if (!transporter) {
    console.log('[DEV MAIL MODE]');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    attachments
  });
};

export const sendSigningLinkEmail = async (recipient: Recipient, contractId: string, token: string) => {
  const signingLink = `${env.PUBLIC_WEB_BASE_URL}/sign/${contractId}/${token}`;
  await sendOrLog(
    recipient.email,
    `Signature request: contract ${contractId}`,
    `Hello ${recipient.name ?? ''},\n\nPlease sign the contract using this link:\n${signingLink}\n\nIf you did not expect this email, ignore it.`
  );
};

export const sendFinalContractEmail = async (
  recipients: Recipient[],
  contractTitle: string,
  pdfBase64: string,
  contractId: string
) => {
  const uniqueRecipients = [...new Set(recipients.map((r) => r.email))];
  for (const email of uniqueRecipients) {
    await sendOrLog(
      email,
      `Completed contract: ${contractTitle}`,
      `The contract has been fully signed. Contract ID: ${contractId}`,
      [
        {
          filename: `${contractTitle.replace(/[^a-zA-Z0-9-_]/g, '_') || 'contract'}.pdf`,
          content: pdfBase64,
          encoding: 'base64'
        }
      ]
    );
  }
};
