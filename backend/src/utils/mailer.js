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

const getProviderPreference = () => {
  const explicit = String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'smtp' || explicit === 'resend') return explicit;
  if (String(process.env.RESEND_API_KEY || '').trim()) return 'resend';
  return 'smtp';
};

const getSmtpConfig = () => {
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

const getResendConfig = () => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const baseUrl = String(process.env.RESEND_API_URL || 'https://api.resend.com').trim().replace(/\/+$/, '');
  const from = String(process.env.RESEND_FROM || process.env.MAIL_FROM || '').trim();
  const replyTo = String(process.env.RESEND_REPLY_TO || '').trim();
  const timeoutMs = parsePort(process.env.RESEND_TIMEOUT_MS, 10000);
  const enabled = Boolean(apiKey && from && baseUrl);
  return {
    enabled,
    apiKey,
    baseUrl,
    from,
    replyTo,
    timeoutMs
  };
};

const getConfig = () => {
  const provider = getProviderPreference();
  const smtp = getSmtpConfig();
  const resend = getResendConfig();
  const enabled = smtp.enabled || resend.enabled;
  return {
    provider,
    enabled,
    smtp,
    resend
  };
};

const transporterCache = {
  key: '',
  transporter: null
};

const getTransporter = (smtpCfg) => {
  const cfg = smtpCfg || getSmtpConfig();
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

const sendViaSmtp = async ({ recipient, subject, textBody, htmlBody, fromAddress, smtpCfg }) => {
  const transporter = getTransporter(smtpCfg);
  if (!transporter) {
    return {
      attempted: false,
      sent: false,
      provider: 'smtp',
      reason: 'MAIL_NOT_CONFIGURED'
    };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipient,
      subject,
      text: textBody,
      html: htmlBody || undefined
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

const sendViaResend = async ({ recipient, subject, textBody, htmlBody, fromAddress, resendCfg }) => {
  const payload = {
    from: fromAddress,
    to: [recipient],
    subject
  };
  if (textBody) payload.text = textBody;
  if (htmlBody) payload.html = htmlBody;
  if (!payload.text && !payload.html) payload.text = 'Notification';
  if (resendCfg.replyTo) payload.reply_to = resendCfg.replyTo;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resendCfg.timeoutMs);
    let response = null;
    try {
      response = await fetch(`${resendCfg.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendCfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const responseText = await response.text();
    let responseData = null;
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch (err) {
      responseData = null;
    }

    if (!response.ok) {
      const message = responseData?.message || responseData?.error || `RESEND_HTTP_${response.status}`;
      return {
        attempted: true,
        sent: false,
        provider: 'resend',
        reason: String(message)
      };
    }

    return {
      attempted: true,
      sent: true,
      provider: 'resend',
      messageId: responseData?.id || null
    };
  } catch (err) {
    return {
      attempted: true,
      sent: false,
      provider: 'resend',
      reason: err?.name === 'AbortError' ? 'RESEND_TIMEOUT' : (err?.message || 'RESEND_SEND_FAILED')
    };
  }
};

const sendEmail = async ({ to, subject, text, html, from }) => {
  const recipient = String(to || '').trim();
  if (!recipient) {
    return {
      attempted: false,
      sent: false,
      provider: 'disabled',
      reason: 'NO_RECIPIENT'
    };
  }

  const cfg = getConfig();
  if (!cfg.enabled || (!cfg.smtp.enabled && !cfg.resend.enabled)) {
    return {
      attempted: false,
      sent: false,
      provider: 'disabled',
      reason: 'MAIL_NOT_CONFIGURED'
    };
  }

  const preferredProvider = cfg.provider;
  const selectedProvider = (
    (preferredProvider === 'resend' && cfg.resend.enabled) ? 'resend'
      : (preferredProvider === 'smtp' && cfg.smtp.enabled) ? 'smtp'
        : cfg.resend.enabled ? 'resend'
          : 'smtp'
  );
  const normalizedSubject = String(subject || '').trim() || 'NGO-Connect Notification';
  const textBody = String(text || '').trim();
  const htmlBody = String(html || '').trim();
  if (selectedProvider === 'resend') {
    const fromAddress = String(from || cfg.resend.from).trim();
    return sendViaResend({
      recipient,
      subject: normalizedSubject,
      textBody,
      htmlBody,
      fromAddress,
      resendCfg: cfg.resend
    });
  }

  const fromAddress = String(from || cfg.smtp.from).trim();
  return sendViaSmtp({
    recipient,
    subject: normalizedSubject,
    textBody,
    htmlBody,
    fromAddress,
    smtpCfg: cfg.smtp
  });
};

module.exports = {
  isMailConfigured,
  sendEmail
};
