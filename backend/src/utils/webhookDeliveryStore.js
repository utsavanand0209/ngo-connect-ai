const { query } = require('../db/postgres');
const { generateId } = require('../db/id');

const WEBHOOK_TABLE = 'webhook_deliveries_rel';
let tableAvailabilityChecked = false;
let tableAvailable = false;
let lastTableCheckAt = 0;
const TABLE_CHECK_TTL_MS = 30000;

const isMissingTableError = (err) => String(err?.code || '') === '42P01';

const nowIso = () => new Date().toISOString();

const parsePositiveInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const normalizeLimit = (value, fallback = 20, max = 100) => {
  const parsed = parsePositiveInt(value, fallback);
  if (parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const normalizeHours = (value, fallback = 24, max = 24 * 30) => {
  const parsed = parsePositiveInt(value, fallback);
  if (parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const ensureTableAvailable = async () => {
  if (tableAvailabilityChecked && tableAvailable) return true;
  if (tableAvailabilityChecked && !tableAvailable && Date.now() - lastTableCheckAt < TABLE_CHECK_TTL_MS) {
    return false;
  }
  try {
    const { rows } = await query(`SELECT to_regclass('public.${WEBHOOK_TABLE}') AS table_name`);
    tableAvailable = Boolean(rows?.[0]?.table_name);
  } catch (err) {
    tableAvailable = false;
  } finally {
    tableAvailabilityChecked = true;
    lastTableCheckAt = Date.now();
  }
  return tableAvailable;
};

const mapRowDoc = (row) => {
  const doc = row?.source_doc && typeof row.source_doc === 'object' ? { ...row.source_doc } : {};
  if (!doc.id) doc.id = row?.external_id;
  if (!doc.event) doc.event = row?.event_name || '';
  if (!doc.status) doc.status = row?.status || '';
  if (!doc.deliveryId) doc.deliveryId = row?.delivery_id || '';
  if (!doc.attempts) doc.attempts = Number(row?.attempts || 0);
  if (doc.responseStatus === undefined || doc.responseStatus === null) doc.responseStatus = row?.response_status || null;
  if (!doc.failureReason) doc.failureReason = row?.failure_reason || '';
  if (!doc.targetUrl) doc.targetUrl = row?.target_url || '';
  if (!doc.lastAttemptAt) doc.lastAttemptAt = row?.last_attempt_at || null;
  if (!doc.deliveredAt) doc.deliveredAt = row?.delivered_at || null;
  if (!doc.nextRetryAt) doc.nextRetryAt = row?.next_retry_at || null;
  if (!doc.resolvedAt) doc.resolvedAt = row?.resolved_at || null;
  if (!doc.createdAt) doc.createdAt = row?.created_at || null;
  return doc;
};

const computeStatus = ({ attempted, sent }) => {
  if (!attempted) return 'skipped';
  if (sent) return 'delivered';
  return 'dead_letter';
};

const recordWebhookDeliveryAttempt = async ({
  event,
  targetUrl,
  deliveryId,
  envelope,
  requestHeaders,
  responseStatus,
  attempts,
  attempted,
  sent,
  reason,
  maxAttempts,
  parentDeliveryExternalId = null,
  isManualRetry = false
} = {}) => {
  const shouldWrite = await ensureTableAvailable();
  if (!shouldWrite) {
    return {
      saved: false,
      reason: 'TABLE_UNAVAILABLE',
      externalId: null
    };
  }

  const createdAt = nowIso();
  const status = computeStatus({ attempted, sent });
  const externalId = generateId();
  const safeAttempts = parsePositiveInt(attempts, 0);
  const safeMaxAttempts = parsePositiveInt(maxAttempts, 1) || 1;
  const normalizedReason = String(reason || '').trim();
  const normalizedResponseStatus = Number.isFinite(Number(responseStatus)) ? Number(responseStatus) : null;

  const sourceDoc = {
    id: externalId,
    event: String(event || '').trim(),
    status,
    deliveryId: String(deliveryId || '').trim(),
    targetUrl: String(targetUrl || '').trim(),
    request: {
      headers: requestHeaders && typeof requestHeaders === 'object' ? { ...requestHeaders } : {},
      body: envelope && typeof envelope === 'object' ? { ...envelope } : {}
    },
    responseStatus: normalizedResponseStatus,
    attempts: safeAttempts,
    maxAttempts: safeMaxAttempts,
    attempted: Boolean(attempted),
    sent: Boolean(sent),
    failureReason: normalizedReason,
    nextRetryAt: null,
    parentDeliveryExternalId: parentDeliveryExternalId ? String(parentDeliveryExternalId).trim() : null,
    isManualRetry: Boolean(isManualRetry),
    createdAt,
    updatedAt: createdAt,
    lastAttemptAt: createdAt,
    deliveredAt: sent ? createdAt : null,
    resolvedAt: null
  };

  try {
    await query(
      `
      INSERT INTO webhook_deliveries_rel (
        external_id,
        event_name,
        status,
        target_url,
        delivery_id,
        attempts,
        response_status,
        failure_reason,
        next_retry_at,
        last_attempt_at,
        delivered_at,
        first_seen_at,
        resolved_at,
        source_doc
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, $11, NULL, $12::jsonb
      )
      `,
      [
        externalId,
        sourceDoc.event,
        status,
        sourceDoc.targetUrl || null,
        sourceDoc.deliveryId || null,
        safeAttempts,
        normalizedResponseStatus,
        normalizedReason || null,
        createdAt,
        sourceDoc.deliveredAt,
        createdAt,
        JSON.stringify(sourceDoc)
      ]
    );
    return {
      saved: true,
      externalId,
      status
    };
  } catch (err) {
    if (isMissingTableError(err)) {
      tableAvailable = false;
      return {
        saved: false,
        reason: 'TABLE_MISSING',
        externalId: null
      };
    }
    return {
      saved: false,
      reason: err?.message || 'WRITE_FAILED',
      externalId: null
    };
  }
};

const listWebhookDeliveries = async ({ status = '', event = '', limit = 25 } = {}) => {
  const shouldRead = await ensureTableAvailable();
  if (!shouldRead) return [];

  const filters = [];
  const params = [];

  if (status) {
    params.push(String(status).trim().toLowerCase());
    filters.push(`LOWER(status) = $${params.length}`);
  }

  if (event) {
    params.push(String(event).trim());
    filters.push(`event_name = $${params.length}`);
  }

  params.push(normalizeLimit(limit, 25, 200));
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows } = await query(
    `
    SELECT
      external_id,
      event_name,
      status,
      target_url,
      delivery_id,
      attempts,
      response_status,
      failure_reason,
      next_retry_at,
      last_attempt_at,
      delivered_at,
      resolved_at,
      source_doc,
      created_at
    FROM webhook_deliveries_rel
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params
  );

  return rows.map((row) => mapRowDoc(row));
};

const getWebhookDeliveryByExternalId = async (externalId) => {
  const shouldRead = await ensureTableAvailable();
  if (!shouldRead) return null;

  const deliveryId = String(externalId || '').trim();
  if (!deliveryId) return null;

  const {
    rows: [row]
  } = await query(
    `
    SELECT
      external_id,
      event_name,
      status,
      target_url,
      delivery_id,
      attempts,
      response_status,
      failure_reason,
      next_retry_at,
      last_attempt_at,
      delivered_at,
      resolved_at,
      source_doc
    FROM webhook_deliveries_rel
    WHERE external_id = $1
    LIMIT 1
    `,
    [deliveryId]
  );

  return row ? mapRowDoc(row) : null;
};

const updateWebhookDeliveryAfterRetry = async (
  externalId,
  {
    replayStatus,
    replayResult,
    replayedBy,
    nextRetryAt = null,
    incrementRetryFailure = false
  } = {}
) => {
  const shouldWrite = await ensureTableAvailable();
  if (!shouldWrite) return null;

  const deliveryId = String(externalId || '').trim();
  if (!deliveryId) return null;

  const existing = await getWebhookDeliveryByExternalId(deliveryId);
  if (!existing) return null;

  const updatedAt = nowIso();
  const currentFailureCount = Number(existing.retryFailureCount || 0);
  const retryFailureCount = incrementRetryFailure
    ? currentFailureCount + 1
    : (String(replayStatus || '').trim() === 'replayed_success' ? 0 : currentFailureCount);
  const merged = {
    ...existing,
    status: String(replayStatus || existing.status || 'dead_letter').trim(),
    nextRetryAt: nextRetryAt || null,
    retryFailureCount,
    replay: {
      attemptedAt: updatedAt,
      replayedBy: replayedBy || null,
      ...(replayResult && typeof replayResult === 'object' ? replayResult : {})
    },
    resolvedAt: updatedAt,
    updatedAt
  };

  await query(
    `
    UPDATE webhook_deliveries_rel
    SET
      status = $2,
      response_status = $3,
      failure_reason = $4,
      delivered_at = COALESCE($5, delivered_at),
      resolved_at = $6,
      next_retry_at = $7,
      updated_at = NOW(),
      source_doc = $8::jsonb
    WHERE external_id = $1
    `,
    [
      deliveryId,
      merged.status,
      Number.isFinite(Number(merged?.replay?.statusCode)) ? Number(merged.replay.statusCode) : null,
      String(merged?.replay?.reason || '').trim() || null,
      merged?.replay?.sent ? updatedAt : null,
      updatedAt,
      merged.nextRetryAt || null,
      JSON.stringify(merged)
    ]
  );

  return merged;
};

const getWebhookDashboardSnapshot = async ({ deadLetterLimit = 10 } = {}) => {
  const shouldRead = await ensureTableAvailable();
  if (!shouldRead) {
    return {
      tableAvailable: false,
      summary: {
        total: 0,
        delivered: 0,
        deadLetter: 0,
        skipped: 0,
        replayedSuccess: 0,
        replayedFailed: 0
      },
      deadLetters: []
    };
  }

  const [{ rows: summaryRows }, deadLetterRowsRes] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter,
        COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
        COUNT(*) FILTER (WHERE status = 'replayed_success')::int AS replayed_success,
        COUNT(*) FILTER (WHERE status = 'replayed_failed')::int AS replayed_failed
      FROM webhook_deliveries_rel
      `
    ),
    query(
      `
      SELECT
        external_id,
        event_name,
        status,
        target_url,
        delivery_id,
        attempts,
        response_status,
        failure_reason,
        next_retry_at,
        last_attempt_at,
        delivered_at,
        resolved_at,
        source_doc
      FROM webhook_deliveries_rel
      WHERE status IN ('dead_letter', 'replayed_failed')
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [normalizeLimit(deadLetterLimit, 10, 50)]
    )
  ]);

  const summary = summaryRows?.[0] || {};
  return {
    tableAvailable: true,
    summary: {
      total: Number(summary.total || 0),
      delivered: Number(summary.delivered || 0),
      deadLetter: Number(summary.dead_letter || 0),
      skipped: Number(summary.skipped || 0),
      replayedSuccess: Number(summary.replayed_success || 0),
      replayedFailed: Number(summary.replayed_failed || 0)
    },
    deadLetters: (deadLetterRowsRes?.rows || []).map((row) => mapRowDoc(row))
  };
};

const listRetryableDeadLetters = async ({ limit = 10 } = {}) => {
  const shouldRead = await ensureTableAvailable();
  if (!shouldRead) return [];

  const { rows } = await query(
    `
    SELECT
      external_id,
      event_name,
      status,
      target_url,
      delivery_id,
      attempts,
      response_status,
      failure_reason,
      next_retry_at,
      last_attempt_at,
      delivered_at,
      resolved_at,
      source_doc,
      created_at
    FROM webhook_deliveries_rel
    WHERE status IN ('dead_letter', 'replayed_failed')
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY COALESCE(next_retry_at, created_at) ASC, created_at ASC
    LIMIT $1
    `,
    [normalizeLimit(limit, 10, 200)]
  );

  return rows.map((row) => mapRowDoc(row));
};

const getDeadLetterBacklog = async ({ limit = 10 } = {}) => {
  const shouldRead = await ensureTableAvailable();
  if (!shouldRead) {
    return {
      tableAvailable: false,
      count: 0,
      rows: []
    };
  }

  const [
    {
      rows: [countRow = {}]
    },
    { rows: sampleRows = [] }
  ] = await Promise.all([
    query(
      `
      SELECT COUNT(*)::int AS backlog_count
      FROM webhook_deliveries_rel
      WHERE status IN ('dead_letter', 'replayed_failed')
      `
    ),
    query(
      `
      SELECT
        external_id,
        event_name,
        status,
        target_url,
        delivery_id,
        attempts,
        response_status,
        failure_reason,
        next_retry_at,
        last_attempt_at,
        delivered_at,
        resolved_at,
        source_doc,
        created_at
      FROM webhook_deliveries_rel
      WHERE status IN ('dead_letter', 'replayed_failed')
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [normalizeLimit(limit, 10, 100)]
    )
  ]);

  return {
    tableAvailable: true,
    count: Number(countRow.backlog_count || 0),
    rows: sampleRows.map((row) => mapRowDoc(row))
  };
};

const buildMetricsWhere = ({ hours = 24, event = '', status = '' } = {}) => {
  const params = [normalizeHours(hours, 24, 24 * 30)];
  const filters = [`created_at >= NOW() - make_interval(hours => $1::int)`];

  if (event) {
    params.push(String(event).trim());
    filters.push(`event_name = $${params.length}`);
  }
  if (status) {
    params.push(String(status).trim().toLowerCase());
    filters.push(`LOWER(status) = $${params.length}`);
  }

  return {
    whereClause: `WHERE ${filters.join(' AND ')}`,
    params
  };
};

const getWebhookMetrics = async ({ hours = 24, event = '' } = {}) => {
  const shouldRead = await ensureTableAvailable();
  if (!shouldRead) {
    return {
      tableAvailable: false,
      windowHours: normalizeHours(hours, 24, 24 * 30),
      summary: {
        total: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        successRate: 0,
        avgAttempts: 0
      },
      byEvent: [],
      trend: []
    };
  }

  const normalizedHours = normalizeHours(hours, 24, 24 * 30);
  const eventFilter = String(event || '').trim();
  const { whereClause, params } = buildMetricsWhere({ hours: normalizedHours, event: eventFilter });

  const [{ rows: summaryRows }, { rows: byEventRows }, { rows: trendRows }] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('delivered', 'replayed_success'))::int AS successful,
        COUNT(*) FILTER (WHERE status IN ('dead_letter', 'replayed_failed'))::int AS failed,
        COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
        COALESCE(AVG(attempts), 0)::numeric(10,2) AS avg_attempts
      FROM webhook_deliveries_rel
      ${whereClause}
      `,
      params
    ),
    query(
      `
      SELECT
        event_name,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('delivered', 'replayed_success'))::int AS successful,
        COUNT(*) FILTER (WHERE status IN ('dead_letter', 'replayed_failed'))::int AS failed
      FROM webhook_deliveries_rel
      ${whereClause}
      GROUP BY event_name
      ORDER BY total DESC, event_name ASC
      LIMIT 20
      `,
      params
    ),
    query(
      `
      SELECT
        date_trunc('hour', created_at) AS bucket,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('delivered', 'replayed_success'))::int AS successful,
        COUNT(*) FILTER (WHERE status IN ('dead_letter', 'replayed_failed'))::int AS failed
      FROM webhook_deliveries_rel
      ${whereClause}
      GROUP BY date_trunc('hour', created_at)
      ORDER BY date_trunc('hour', created_at) ASC
      `,
      params
    )
  ]);

  const summary = summaryRows?.[0] || {};
  const total = Number(summary.total || 0);
  const successful = Number(summary.successful || 0);
  const failed = Number(summary.failed || 0);
  const skipped = Number(summary.skipped || 0);
  const avgAttempts = Number(summary.avg_attempts || 0);
  const successRate = total > 0 ? Number(((successful / total) * 100).toFixed(1)) : 0;

  return {
    tableAvailable: true,
    windowHours: normalizedHours,
    event: eventFilter || null,
    summary: {
      total,
      successful,
      failed,
      skipped,
      successRate,
      avgAttempts
    },
    byEvent: (byEventRows || []).map((row) => ({
      event: row.event_name || '',
      total: Number(row.total || 0),
      successful: Number(row.successful || 0),
      failed: Number(row.failed || 0),
      successRate: Number(row.total || 0) > 0
        ? Number(((Number(row.successful || 0) / Number(row.total || 0)) * 100).toFixed(1))
        : 0
    })),
    trend: (trendRows || []).map((row) => ({
      bucket: row.bucket instanceof Date ? row.bucket.toISOString() : String(row.bucket || ''),
      total: Number(row.total || 0),
      successful: Number(row.successful || 0),
      failed: Number(row.failed || 0)
    }))
  };
};

const listWebhookDeliveriesForExport = async ({
  status = '',
  event = '',
  from = '',
  to = '',
  limit = 1000
} = {}) => {
  const shouldRead = await ensureTableAvailable();
  if (!shouldRead) return [];

  const filters = [];
  const params = [];

  if (status) {
    params.push(String(status).trim().toLowerCase());
    filters.push(`LOWER(status) = $${params.length}`);
  }
  if (event) {
    params.push(String(event).trim());
    filters.push(`event_name = $${params.length}`);
  }
  if (from) {
    params.push(String(from).trim());
    filters.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(String(to).trim());
    filters.push(`created_at <= $${params.length}::timestamptz`);
  }

  params.push(normalizeLimit(limit, 1000, 5000));
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows } = await query(
    `
    SELECT
      external_id,
      event_name,
      status,
      target_url,
      delivery_id,
      attempts,
      response_status,
      failure_reason,
      next_retry_at,
      last_attempt_at,
      delivered_at,
      resolved_at,
      created_at,
      source_doc
    FROM webhook_deliveries_rel
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params
  );

  return rows.map((row) => mapRowDoc(row));
};

const cleanupWebhookDeliveries = async ({
  olderThanDays = 30,
  statuses = ['delivered', 'skipped', 'replayed_success'],
  limit = 2000,
  dryRun = false
} = {}) => {
  const shouldWrite = await ensureTableAvailable();
  if (!shouldWrite) {
    return {
      tableAvailable: false,
      dryRun: Boolean(dryRun),
      matched: 0,
      deleted: 0
    };
  }

  const ageDays = normalizeLimit(olderThanDays, 30, 3650);
  const statusList = Array.isArray(statuses)
    ? [...new Set(statuses.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))]
    : [];
  const safeStatuses = statusList.length > 0 ? statusList : ['delivered', 'skipped', 'replayed_success'];
  const cappedLimit = normalizeLimit(limit, 2000, 10000);

  const {
    rows: [matchRow = {}]
  } = await query(
    `
    SELECT COUNT(*)::int AS matched
    FROM webhook_deliveries_rel
    WHERE LOWER(status) = ANY($1::text[])
      AND created_at < NOW() - make_interval(days => $2::int)
    `,
    [safeStatuses, ageDays]
  );

  const matched = Number(matchRow.matched || 0);
  if (dryRun || matched === 0) {
    return {
      tableAvailable: true,
      dryRun: Boolean(dryRun),
      statuses: safeStatuses,
      olderThanDays: ageDays,
      matched,
      deleted: 0
    };
  }

  const deleteResult = await query(
    `
    WITH candidates AS (
      SELECT external_id
      FROM webhook_deliveries_rel
      WHERE LOWER(status) = ANY($1::text[])
        AND created_at < NOW() - make_interval(days => $2::int)
      ORDER BY created_at ASC
      LIMIT $3
    )
    DELETE FROM webhook_deliveries_rel w
    USING candidates c
    WHERE w.external_id = c.external_id
    RETURNING 1
    `,
    [safeStatuses, ageDays, cappedLimit]
  );

  return {
    tableAvailable: true,
    dryRun: false,
    statuses: safeStatuses,
    olderThanDays: ageDays,
    matched,
    deleted: Number(deleteResult?.rowCount || 0)
  };
};

module.exports = {
  recordWebhookDeliveryAttempt,
  listWebhookDeliveries,
  getWebhookDeliveryByExternalId,
  updateWebhookDeliveryAfterRetry,
  getWebhookDashboardSnapshot,
  listRetryableDeadLetters,
  getDeadLetterBacklog,
  getWebhookMetrics,
  listWebhookDeliveriesForExport,
  cleanupWebhookDeliveries,
  ensureTableAvailable
};
