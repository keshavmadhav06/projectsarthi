const nodemailer = require('nodemailer');

let transporter = null;
let etherealAccount = null;

async function getTransporter() {
  if (transporter) return transporter;

  // If standard SMTP environment variables exist, use them
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    return transporter;
  }

  // Graceful fallback to Ethereal / simulated test transport for development
  try {
    etherealAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: etherealAccount.user,
        pass: etherealAccount.pass
      }
    });
    console.log('[Mailer] Initialized development Ethereal SMTP transporter.');
  } catch (err) {
    console.warn('[Mailer] Could not create Ethereal account, using console logger fallback:', err.message);
    transporter = {
      sendMail: async (options) => {
        console.log(`[Simulated Email Sent] To: ${options.to} | Subject: ${options.subject}`);
        return { messageId: 'sim-' + Date.now() };
      }
    };
  }

  return transporter;
}

async function sendAlertEmail({ to, subject, notification, project }) {
  try {
    const mailer = await getTransporter();
    const recipient = to || process.env.ALERT_EMAIL_RECIPIENT || 'admin@dosje.gov.in';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #dbe6ea; border-radius: 8px; overflow: hidden;">
        <div style="background: #093b2f; color: #fff; padding: 20px;">
          <h2 style="margin: 0; font-size: 20px;">SAARTHI MONITORING ALERT</h2>
          <p style="margin: 5px 0 0; color: #7cb9a2; font-size: 13px;">Department of Social Justice & Empowerment</p>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 15px; color: #173b5e;">An anomaly has been flagged for <b>${project?.name || notification.projectName || 'Project'}</b>.</p>
          <div style="background: #fff8f0; border-left: 4px solid #e87826; padding: 15px; margin: 18px 0; border-radius: 4px;">
            <b style="color: #b8312f; font-size: 14px;">[${(notification.severity || 'WARNING').toUpperCase()}] ${notification.ruleTriggered}</b>
            <p style="margin: 6px 0 0; color: #344d5c; font-size: 13px;">${notification.message}</p>
          </div>
          <p style="font-size: 12px; color: #6b7774;">Action required: Please inspect the project compliance details on the Saarthi official portal.</p>
        </div>
        <div style="background: #f0f7f3; padding: 12px 20px; font-size: 11px; color: #557068;">
          Sent automatically by Saarthi Anomaly Detection System (SIH26095)
        </div>
      </div>
    `;

    const info = await mailer.sendMail({
      from: '"Saarthi Monitoring Alert" <alerts@dosje.gov.in>',
      to: recipient,
      subject: `[${(notification.severity || 'ALERT').toUpperCase()}] ${subject}`,
      html
    });

    if (etherealAccount && nodemailer.getTestMessageUrl) {
      console.log('[Mailer] Email preview URL:', nodemailer.getTestMessageUrl(info));
    }
    return info;
  } catch (err) {
    console.warn('[Mailer Error]', err.message);
    return null;
  }
}

module.exports = {
  sendAlertEmail
};
