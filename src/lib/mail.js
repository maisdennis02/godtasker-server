import { Resend } from 'resend';

import logger from './logger';

const { RESEND_API_KEY, MAIL_FROM } = process.env;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

if (!resend) {
  logger.warn('RESEND_API_KEY not set — outbound email is disabled.');
}

export default async function sendMail({ to, subject, text, html }) {
  if (!resend) {
    // No Resend key (local dev): log the message so the flow stays testable.
    logger.info({ to, subject, text }, 'sendMail skipped — email disabled');
    return false;
  }
  const { error } = await resend.emails.send({
    // resend.dev sender only delivers to the account owner's email — fine
    // as a fallback for testing, set MAIL_FROM to a verified domain in prod.
    from: MAIL_FROM || 'GodTasker <onboarding@resend.dev>',
    to,
    subject,
    text,
    html,
  });
  if (error) {
    throw new Error(`Resend: ${error.message}`);
  }
  return true;
}
