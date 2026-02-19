const crypto = require('crypto');
const { recordWebhookDeliveryAttempt } = require('./webhookDeliveryStore');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 1;
const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const getWebhookConfig = () => {
  const url = String(process.env.WEBHOOK_URL || '').trim();
  const secret = String(process.env.WEBHOOK_SECRET || '').trim();
  const enabled = parseBoolean(process.env.WEBHOOK_ENABLED, true) && Boolean(url);
  const timeoutMs = parsePositiveInt(process.env.WEBHOOK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const retries = parsePositiveInt(process.env.WEBHOOK_RETRIES, DEFAULT_RETRIES);
  const allowedEventsRaw = String(process.env.WEBHOOK_EVENTS || '').trim();
  const allowedEvents = allowedEventsRaw
    ? allowedEventsRaw.split(',').map((entry) => entry.trim()).filter(Boolean)
    : [];

  return {
    url,
    secret,
    enabled,
    timeoutMs,
    retries,
    allowedEvents
  };
};

const shouldDispatchEvent = (event, cfg) => {
  if (!cfg.enabled) return false;
  if (!cfg.allowedEvents || cfg.allowedEvents.length === 0) return true;
  return cfg.allowedEvents.includes(event);
};

const makeSignature = (secret, timestamp, body) => {
  if (!secret) return '';
  const payload = `${timestamp}.${body}`;
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
};

const verifyWebhookSignature = (secret, timestamp, rawBody, receivedSignature) => {
  const normalized = String(receivedSignature || '').trim();
  if (!secret || !timestamp || !normalized.startsWith('sha256=')) return false;
  const expected = makeSignature(secret, String(timestamp), String(rawBody || ''));
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(normalized);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
};

const isTimestampFresh = (timestamp, maxAgeSeconds = DEFAULT_REPLAY_WINDOW_SECONDS) => {
  const ts = Number(timestamp);
  const maxAge = Number(maxAgeSeconds);
  if (!Number.isFinite(ts) || !Number.isFinite(maxAge) || maxAge <= 0) return false;
  const ageMs = Math.abs(Date.now() - ts);
  return ageMs <= maxAge * 1000;
};

const generateDeliveryId = () =>
  `wh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withDeliveryLog = async ({
  eventName,
  cfg,
  envelope,
  headers,
  result,
  maxAttempts,
  options = {}
}) => {
  try {
    const writeResult = await recordWebhookDeliveryAttempt({
      event: eventName,
      targetUrl: cfg.url,
      deliveryId: result?.deliveryId || envelope?.id || '',
      envelope,
      requestHeaders: headers,
      responseStatus: result?.statusCode,
      attempts: result?.attempts,
      attempted: result?.attempted,
      sent: result?.sent,
      reason: result?.reason,
      maxAttempts,
      parentDeliveryExternalId: options.parentDeliveryExternalId || null,
      isManualRetry: Boolean(options.isManualRetry)
    });
    if (writeResult?.saved && writeResult?.externalId) {
      return {
        ...result,
        logId: writeResult.externalId
      };
    }
    return result;
  } catch (err) {
    return result;
  }
};

const dispatchWebhook = async (event, data = {}, options = {}) => {
  const cfg = getWebhookConfig();
  const eventName = String(event || '').trim();
  if (!eventName) {
    return withDeliveryLog({
      eventName,
      cfg,
      envelope: { id: '', event: eventName, sentAt: new Date().toISOString(), data },
      headers: {},
      result: {
        attempted: false,
        sent: false,
        reason: 'EVENT_REQUIRED'
      },
      maxAttempts: 0,
      options
    });
  }

  const deliveryId = generateDeliveryId();
  const sentAt = new Date().toISOString();
  const envelope = {
    id: deliveryId,
    event: eventName,
    sentAt,
    data: data && typeof data === 'object' ? data : { value: data }
  };

  if (!shouldDispatchEvent(eventName, cfg)) {
    return withDeliveryLog({
      eventName,
      cfg,
      envelope,
      headers: {},
      result: {
        attempted: false,
        sent: false,
        deliveryId,
        attempts: 0,
        statusCode: null,
        reason: cfg.enabled ? 'EVENT_FILTERED' : 'WEBHOOK_DISABLED'
      },
      maxAttempts: 0,
      options
    });
  }

  const body = JSON.stringify(envelope);
  const timestamp = String(Date.now());
  const signature = makeSignature(cfg.secret, timestamp, body);
  const requestHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'NGO-Connect-Webhook/1.0',
    'X-NgoConnect-Event': eventName,
    'X-NgoConnect-Delivery-Id': deliveryId,
    'X-NgoConnect-Timestamp': timestamp,
    ...(signature ? { 'X-NgoConnect-Signature': signature } : {})
  };

  if (typeof fetch !== 'function') {
    return withDeliveryLog({
      eventName,
      cfg,
      envelope,
      headers: requestHeaders,
      result: {
        attempted: false,
        sent: false,
        deliveryId,
        attempts: 0,
        statusCode: null,
        reason: 'FETCH_NOT_AVAILABLE'
      },
      maxAttempts: 0,
      options
    });
  }

  const maxAttempts = Math.max(parsePositiveInt(options.retries, cfg.retries), 1);
  let finalResult = {
    attempted: true,
    sent: false,
    deliveryId,
    attempts: 0,
    statusCode: null,
    reason: ''
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
    finalResult.attempts = attempt;

    try {
      const response = await fetch(cfg.url, {
        method: 'POST',
        headers: requestHeaders,
        body,
        signal: controller.signal
      });

      clearTimeout(timeout);
      finalResult.statusCode = response.status;

      if (response.ok) {
        return withDeliveryLog({
          eventName,
          cfg,
          envelope,
          headers: requestHeaders,
          result: {
            ...finalResult,
            attempted: true,
            sent: true,
            reason: 'DELIVERED'
          },
          maxAttempts,
          options
        });
      }

      finalResult.reason = `HTTP_${response.status}`;
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err?.name === 'AbortError';
      finalResult.reason = isAbort ? 'TIMEOUT' : (err?.message || 'REQUEST_FAILED');
    }

    if (attempt < maxAttempts) {
      await sleep(Math.min(200 * attempt, 800));
    }
  }

  return withDeliveryLog({
    eventName,
    cfg,
    envelope,
    headers: requestHeaders,
    result: finalResult,
    maxAttempts,
    options
  });
};

module.exports = {
  dispatchWebhook,
  makeSignature,
  verifyWebhookSignature,
  isTimestampFresh
};
