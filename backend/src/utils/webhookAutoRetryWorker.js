const { dispatchWebhook } = require('./webhookDispatcher');
const { sendEmail } = require('./mailer');
const {
  ensureTableAvailable,
  listRetryableDeadLetters,
  updateWebhookDeliveryAfterRetry,
  getDeadLetterBacklog
} = require('./webhookDeliveryStore');

const DEFAULT_INTERVAL_MS = 60000;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_REPLAY_ATTEMPTS = 1;
const DEFAULT_BACKOFF_BASE_MS = 60000;
const DEFAULT_BACKOFF_MAX_MS = 30 * 60 * 1000;
const DEFAULT_ALERT_THRESHOLD = 5;
const DEFAULT_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_ALERT_SAMPLE_SIZE = 5;

const WORKER_ID = 'system:auto-retry';
let workerTimer = null;
let workerRunning = false;
const runtimeState = {
  active: false,
  startedAt: null,
  lastTickAt: null,
  lastResult: null,
  lastError: null,
  tickCount: 0
};
const alertState = {
  lastSentAt: 0,
  lastBacklogCount: 0
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
};

const parsePositiveInt = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(Math.floor(parsed), max);
};

const parseEmailList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const getWorkerConfig = () => ({
  enabled: parseBoolean(process.env.WEBHOOK_AUTO_RETRY_ENABLED, false),
  intervalMs: parsePositiveInt(process.env.WEBHOOK_AUTO_RETRY_INTERVAL_MS, DEFAULT_INTERVAL_MS, { min: 5000, max: 3600000 }),
  batchSize: parsePositiveInt(process.env.WEBHOOK_AUTO_RETRY_BATCH_SIZE, DEFAULT_BATCH_SIZE, { min: 1, max: 100 }),
  replayAttempts: parsePositiveInt(process.env.WEBHOOK_AUTO_RETRY_ATTEMPTS, DEFAULT_REPLAY_ATTEMPTS, { min: 1, max: 5 }),
  backoffBaseMs: parsePositiveInt(process.env.WEBHOOK_AUTO_RETRY_BACKOFF_BASE_MS, DEFAULT_BACKOFF_BASE_MS, { min: 1000, max: 3600000 }),
  backoffMaxMs: parsePositiveInt(process.env.WEBHOOK_AUTO_RETRY_BACKOFF_MAX_MS, DEFAULT_BACKOFF_MAX_MS, { min: 10000, max: 86400000 }),
  alertEnabled: parseBoolean(process.env.WEBHOOK_DEAD_LETTER_ALERT_ENABLED, false),
  alertThreshold: parsePositiveInt(process.env.WEBHOOK_DEAD_LETTER_ALERT_THRESHOLD, DEFAULT_ALERT_THRESHOLD, { min: 1, max: 100000 }),
  alertCooldownMs: parsePositiveInt(process.env.WEBHOOK_DEAD_LETTER_ALERT_COOLDOWN_MS, DEFAULT_ALERT_COOLDOWN_MS, { min: 10000, max: 86400000 }),
  alertSampleSize: parsePositiveInt(process.env.WEBHOOK_DEAD_LETTER_ALERT_SAMPLE_SIZE, DEFAULT_ALERT_SAMPLE_SIZE, { min: 1, max: 20 }),
  alertEmailTo: parseEmailList(process.env.WEBHOOK_ALERT_EMAIL_TO),
  alertSlackUrl: String(process.env.WEBHOOK_ALERT_SLACK_URL || '').trim()
});

const computeBackoffMs = (failureCount, cfg) => {
  const failures = Math.max(Number(failureCount || 1), 1);
  const backoff = cfg.backoffBaseMs * (2 ** (failures - 1));
  return Math.min(backoff, cfg.backoffMaxMs);
};

const toIsoAfterMs = (ms) => new Date(Date.now() + ms).toISOString();

const renderBacklogSummary = (backlog) => {
  const rows = Array.isArray(backlog?.rows) ? backlog.rows : [];
  if (rows.length === 0) return 'No backlog samples available.';
  return rows
    .map((row, index) => {
      const reason = String(row.failureReason || row?.replay?.reason || '').trim() || 'N/A';
      return `${index + 1}. id=${row.id} event=${row.event} attempts=${row.attempts || 0} reason=${reason}`;
    })
    .join('\n');
};

const sendSlackAlert = async (url, text) => {
  if (!url) {
    return { attempted: false, sent: false, provider: 'slack', reason: 'NO_SLACK_URL' };
  }
  if (typeof fetch !== 'function') {
    return { attempted: false, sent: false, provider: 'slack', reason: 'FETCH_NOT_AVAILABLE' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return {
      attempted: true,
      sent: response.ok,
      provider: 'slack',
      statusCode: response.status,
      reason: response.ok ? 'DELIVERED' : `HTTP_${response.status}`
    };
  } catch (err) {
    return {
      attempted: true,
      sent: false,
      provider: 'slack',
      reason: err?.message || 'SLACK_SEND_FAILED'
    };
  }
};

const maybeSendDeadLetterAlert = async (cfg, backlog) => {
  const count = Number(backlog?.count || 0);
  if (!cfg.alertEnabled) return { attempted: false, sent: false, reason: 'ALERTS_DISABLED' };
  if (count < cfg.alertThreshold) return { attempted: false, sent: false, reason: 'THRESHOLD_NOT_MET' };

  const now = Date.now();
  const cooldownActive = now - alertState.lastSentAt < cfg.alertCooldownMs;
  if (cooldownActive && count <= alertState.lastBacklogCount) {
    return { attempted: false, sent: false, reason: 'COOLDOWN_ACTIVE' };
  }

  const subject = `[NGO-Connect] Webhook dead-letter backlog alert (${count})`;
  const summary = renderBacklogSummary(backlog);
  const text = [
    'Webhook dead-letter backlog exceeded the configured threshold.',
    '',
    `Backlog count: ${count}`,
    `Threshold: ${cfg.alertThreshold}`,
    `Generated at: ${new Date().toISOString()}`,
    '',
    'Sample records:',
    summary
  ].join('\n');

  const emailResults = await Promise.all(
    cfg.alertEmailTo.map((recipient) =>
      sendEmail({
        to: recipient,
        subject,
        text
      })
    )
  );
  const slackResult = await sendSlackAlert(cfg.alertSlackUrl, `${subject}\n${summary}`);

  const sentEmailCount = emailResults.filter((result) => Boolean(result?.sent)).length;
  const sent = sentEmailCount > 0 || Boolean(slackResult?.sent);
  if (sent) {
    alertState.lastSentAt = now;
    alertState.lastBacklogCount = count;
  }

  return {
    attempted: true,
    sent,
    sentEmailCount,
    slackSent: Boolean(slackResult?.sent),
    reason: sent ? 'ALERT_SENT' : 'ALERT_FAILED'
  };
};

const replayDeadLetterRecord = async (row, cfg) => {
  const eventName = String(row?.event || '').trim();
  const payloadData = row?.request?.body?.data;
  const currentFailureCount = Number(row?.retryFailureCount || 0);

  if (!eventName || payloadData === undefined) {
    const nextRetryAt = toIsoAfterMs(computeBackoffMs(currentFailureCount + 1, cfg));
    await updateWebhookDeliveryAfterRetry(row.id, {
      replayStatus: 'replayed_failed',
      replayedBy: WORKER_ID,
      replayResult: {
        sent: false,
        attempted: false,
        reason: 'MISSING_STORED_PAYLOAD',
        statusCode: null,
        attempts: 0,
        auto: true
      },
      nextRetryAt,
      incrementRetryFailure: true
    });
    return {
      id: row.id,
      sent: false,
      reason: 'MISSING_STORED_PAYLOAD',
      status: 'replayed_failed'
    };
  }

  const replayResult = await dispatchWebhook(eventName, payloadData, {
    retries: cfg.replayAttempts,
    isManualRetry: true,
    parentDeliveryExternalId: row.id
  });

  if (replayResult?.sent) {
    await updateWebhookDeliveryAfterRetry(row.id, {
      replayStatus: 'replayed_success',
      replayedBy: WORKER_ID,
      replayResult: {
        ...replayResult,
        auto: true
      },
      nextRetryAt: null,
      incrementRetryFailure: false
    });
    return {
      id: row.id,
      sent: true,
      reason: 'DELIVERED',
      status: 'replayed_success'
    };
  }

  const nextRetryAt = toIsoAfterMs(computeBackoffMs(currentFailureCount + 1, cfg));
  await updateWebhookDeliveryAfterRetry(row.id, {
    replayStatus: 'replayed_failed',
    replayedBy: WORKER_ID,
    replayResult: {
      ...replayResult,
      auto: true
    },
    nextRetryAt,
    incrementRetryFailure: true
  });
  return {
    id: row.id,
    sent: false,
    reason: String(replayResult?.reason || 'REPLAY_FAILED'),
    status: 'replayed_failed'
  };
};

const runWebhookAutoRetryTick = async (cfg = getWorkerConfig()) => {
  const tableAvailable = await ensureTableAvailable();
  if (!tableAvailable) {
    return {
      tableAvailable: false,
      processed: 0,
      succeeded: 0,
      failed: 0,
      alert: { attempted: false, sent: false, reason: 'TABLE_UNAVAILABLE' }
    };
  }

  const candidates = await listRetryableDeadLetters({ limit: cfg.batchSize });
  let succeeded = 0;
  let failed = 0;

  for (const row of candidates) {
    try {
      const result = await replayDeadLetterRecord(row, cfg);
      if (result.sent) succeeded += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
    }
  }

  const backlog = await getDeadLetterBacklog({ limit: cfg.alertSampleSize });
  const alert = await maybeSendDeadLetterAlert(cfg, backlog);
  return {
    tableAvailable: true,
    processed: candidates.length,
    succeeded,
    failed,
    backlogCount: Number(backlog?.count || 0),
    alert
  };
};

const getWorkerRuntimeStatus = () => ({
  active: Boolean(runtimeState.active),
  startedAt: runtimeState.startedAt || null,
  lastTickAt: runtimeState.lastTickAt || null,
  lastResult: runtimeState.lastResult || null,
  lastError: runtimeState.lastError || null,
  tickCount: Number(runtimeState.tickCount || 0),
  isRunning: Boolean(workerRunning)
});

const startWebhookAutoRetryWorker = () => {
  const cfg = getWorkerConfig();
  if (!cfg.enabled) {
    runtimeState.active = false;
    runtimeState.startedAt = null;
    console.log('[webhook-worker] auto retry disabled');
    return () => {};
  }

  runtimeState.active = true;
  runtimeState.startedAt = new Date().toISOString();
  runtimeState.lastError = null;
  runtimeState.lastResult = null;
  runtimeState.lastTickAt = null;
  runtimeState.tickCount = 0;

  const tick = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      const result = await runWebhookAutoRetryTick(cfg);
      runtimeState.lastTickAt = new Date().toISOString();
      runtimeState.lastResult = result;
      runtimeState.lastError = null;
      runtimeState.tickCount += 1;
      if (result.processed > 0 || result.alert?.sent) {
        console.log(
          `[webhook-worker] processed=${result.processed} success=${result.succeeded} failed=${result.failed} backlog=${result.backlogCount || 0}`
        );
      }
    } catch (err) {
      runtimeState.lastTickAt = new Date().toISOString();
      runtimeState.lastError = err?.message || String(err || 'unknown error');
      runtimeState.tickCount += 1;
      console.error('[webhook-worker] tick error:', err?.message || err);
    } finally {
      workerRunning = false;
    }
  };

  tick();
  workerTimer = setInterval(tick, cfg.intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  console.log(
    `[webhook-worker] started intervalMs=${cfg.intervalMs} batchSize=${cfg.batchSize} replayAttempts=${cfg.replayAttempts}`
  );

  return () => {
    if (workerTimer) {
      clearInterval(workerTimer);
      workerTimer = null;
    }
    runtimeState.active = false;
    console.log('[webhook-worker] stopped');
  };
};

module.exports = {
  startWebhookAutoRetryWorker,
  runWebhookAutoRetryTick,
  getWorkerConfig,
  getWorkerRuntimeStatus
};
