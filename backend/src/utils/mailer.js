const nodemailer = require('nodemailer');

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
};

const parsePort = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const getConfig = () => {
  const host = String(process.env.MAIL_HOST || '').trim();
  const port = parsePort(process.env.MAIL_PORT, 587);
  const user = String(process.env.MAIL_USER || '').trim();
  const pass = String(process.env.MAIL_PASS || '').trim();
  const secure = parseBoolean(process.env.MAIL_SECURE, false);
  const from = String(process.env.MAIL_FROM || user || 'no-reply@ngo-connect.local').trim();
  const enabled = Boolean(host && port && user && pass);
  return {
    enabled,
    host,
    port,
    user,
    pass,
    secure,
    from
  };
};

const transporterCache = {
  key: '',
  transporter: null
};

const getTransporter = () => {
  const cfg = getConfig();
  if (!cfg.enabled) return null;

  const cacheKey = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure ? 'secure' : 'insecure'}`;
  if (transporterCache.transporter && transporterCache.key === cacheKey) {
    return transporterCache.transporter;
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  });

  transporterCache.key = cacheKey;
  transporterCache.transporter = transporter;
  return transporter;
};

const isMailConfigured = () => getConfig().enabled;

const sendEmail = async ({ to, subject, text, html, from }) => {
  const recipient = String(to || '').trim();
  if (!recipient) {
    return {
      attempted: false,
      sent: false,
      provider: 'smtp',
      reason: 'NO_RECIPIENT'
    };
  }

  const cfg = getConfig();
  if (!cfg.enabled) {
    return {
      attempted: false,
      sent: false,
      provider: 'disabled',
      reason: 'MAIL_NOT_CONFIGURED'
    };
  }

  const transporter = getTransporter();
  if (!transporter) {
    return {
      attempted: false,
      sent: false,
      provider: 'disabled',
      reason: 'MAIL_NOT_CONFIGURED'
    };
  }

  try {
    const info = await transporter.sendMail({
      from: String(from || cfg.from).trim(),
      to: recipient,
      subject: String(subject || '').trim() || 'NGO-Connect Notification',
      text: String(text || '').trim(),
      html: String(html || '').trim() || undefined
    });

    return {
      attempted: true,
      sent: true,
      provider: 'smtp',
      messageId: info?.messageId || null
    };
  } catch (err) {
    return {
      attempted: true,
      sent: false,
      provider: 'smtp',
      reason: err?.message || 'SMTP_SEND_FAILED'
    };
  }
};

module.exports = {
  isMailConfigured,
  sendEmail
};
