const { query } = require('../db/postgres');

const uniqueStrings = (items = []) =>
  [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];

const hasText = (value, min = 1) => String(value || '').trim().length >= min;
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const safeArray = (value) => (Array.isArray(value) ? value : []);
const toLower = (value) => String(value || '').trim().toLowerCase();

const gradeForScore = (score) => {
  if (score >= 85) return 'platinum';
  if (score >= 70) return 'gold';
  if (score >= 55) return 'silver';
  if (score >= 40) return 'bronze';
  return 'developing';
};

const pickRegistrationScore = (doc = {}) => {
  const registration = doc.registration && typeof doc.registration === 'object' ? doc.registration : {};
  const checks = [registration.pan, registration.regNo, registration.g80, registration.a12, registration.fcra];
  const present = checks.filter((entry) => hasText(entry, 2)).length;
  return clamp((present / checks.length) * 8, 0, 8);
};

const pickProfileCompletenessScore = (doc = {}) => {
  let score = 0;
  if (hasText(doc.mission, 20)) score += 4;
  if (hasText(doc.vision, 20)) score += 2;
  if (hasText(doc.description, 40)) score += 4;
  if (hasText(doc.about, 40)) score += 3;
  if (hasText(doc.website, 8)) score += 2;
  if (hasText(doc.helplineNumber, 8)) score += 2;
  if (hasText(doc.address, 8) || (doc.location && typeof doc.location === 'object')) score += 2;
  if (safeArray(doc.categories).length > 0 || hasText(doc.category, 3)) score += 2;
  if (safeArray(doc.programs).length > 0) score += 2;
  if (safeArray(doc.impactMetrics).length > 0) score += 2;
  if (safeArray(doc.leadership).length > 0) score += 2;
  return clamp(score, 0, 25);
};

const pickComplianceScore = (doc = {}) => {
  const registrationScore = pickRegistrationScore(doc);
  const badges = safeArray(doc.badges).length;
  const certifications = safeArray(doc.certifications).length;
  const verificationDocs = safeArray(doc.verificationDocs).length;

  const badgeScore = clamp((badges + certifications) * 0.8, 0, 4);
  const docsScore = verificationDocs > 0 ? 3 : 0;
  return clamp(registrationScore + badgeScore + docsScore, 0, 15);
};

const toTimestamp = (value) => {
  const parsed = Date.parse(String(value || '').trim());
  if (Number.isNaN(parsed)) return 0;
  return parsed;
};

const calculateTransparencyScoresForNgoExternalIds = async (ngoExternalIds = []) => {
  const ids = uniqueStrings(ngoExternalIds);
  if (ids.length === 0) return {};

  const ngoRes = await query(
    `
    SELECT id, external_id, source_doc, created_at
    FROM ngos_rel
    WHERE external_id = ANY($1::text[])
    `,
    [ids]
  );

  if (ngoRes.rows.length === 0) return {};

  const ngos = ngoRes.rows.map((row) => ({
    id: Number(row.id),
    externalId: String(row.external_id || ''),
    doc: row.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {},
    createdAt: row.created_at
  }));
  const dbIds = ngos.map((entry) => entry.id);
  const idByExternal = new Map(ngos.map((entry) => [entry.externalId, entry.id]));
  const now = Date.now();
  const recentWindowMs = 90 * 24 * 60 * 60 * 1000;
  const recentThreshold = now - recentWindowMs;

  const [impactRes, campaignRes, notificationsRes, incomingMessagesRes, outgoingMessagesRes] = await Promise.all([
    query(
      `
      SELECT
        ngo_id,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::int AS recent_count,
        MAX(created_at) AS last_update_at
      FROM impact_updates_rel
      WHERE ngo_id = ANY($1::bigint[])
      GROUP BY ngo_id
      `,
      [dbIds]
    ),
    query(
      `
      SELECT ngo_id, source_doc, created_at
      FROM campaigns_rel
      WHERE ngo_id = ANY($1::bigint[])
      `,
      [dbIds]
    ),
    query(
      `
      SELECT
        source_doc->>'ngoId' AS ngo_external_id,
        COUNT(*) FILTER (
          WHERE COALESCE(source_doc->>'notificationType', '') = 'campaign_update'
        )::int AS sent_count,
        COUNT(*) FILTER (
          WHERE COALESCE(source_doc->>'notificationType', '') = 'campaign_update'
            AND COALESCE(source_doc->>'openedAt', '') <> ''
        )::int AS opened_count,
        COUNT(*) FILTER (
          WHERE COALESCE(source_doc->>'notificationType', '') = 'campaign_update'
            AND COALESCE(source_doc->>'clickedAt', '') <> ''
        )::int AS clicked_count
      FROM notifications_rel
      WHERE source_doc->>'ngoId' = ANY($1::text[])
      GROUP BY source_doc->>'ngoId'
      `,
      [ids]
    ),
    query(
      `
      SELECT to_ngo_id AS ngo_id, COUNT(*)::int AS incoming_count
      FROM messages_rel
      WHERE to_ngo_id = ANY($1::bigint[])
      GROUP BY to_ngo_id
      `,
      [dbIds]
    ),
    query(
      `
      SELECT source_doc->>'fromNGO' AS ngo_external_id, COUNT(*)::int AS outgoing_count
      FROM messages_rel
      WHERE source_doc->>'fromNGO' = ANY($1::text[])
      GROUP BY source_doc->>'fromNGO'
      `,
      [ids]
    )
  ]);

  const impactMap = new Map(
    impactRes.rows.map((row) => [
      Number(row.ngo_id),
      {
        total: Number(row.total_count || 0),
        recent: Number(row.recent_count || 0),
        lastUpdateAt: row.last_update_at || null
      }
    ])
  );

  const campaignMap = new Map();
  for (const row of campaignRes.rows) {
    const ngoId = Number(row.ngo_id);
    const doc = row.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {};
    const updates = safeArray(doc.updates);
    if (!campaignMap.has(ngoId)) {
      campaignMap.set(ngoId, {
        campaignsCount: 0,
        updateCount: 0,
        recentUpdateCount: 0,
        lastUpdateAt: 0
      });
    }
    const agg = campaignMap.get(ngoId);
    agg.campaignsCount += 1;
    agg.updateCount += updates.length;

    if (updates.length === 0 && row.created_at) {
      agg.lastUpdateAt = Math.max(agg.lastUpdateAt, Date.parse(row.created_at) || 0);
    }

    for (const update of updates) {
      const ts = toTimestamp(update?.createdAt || row.created_at);
      if (ts > 0) {
        if (ts >= recentThreshold) agg.recentUpdateCount += 1;
        agg.lastUpdateAt = Math.max(agg.lastUpdateAt, ts);
      }
    }
  }

  const notificationMap = new Map();
  for (const row of notificationsRes.rows) {
    const externalId = String(row.ngo_external_id || '').trim();
    const dbId = idByExternal.get(externalId);
    if (!dbId) continue;
    notificationMap.set(dbId, {
      sent: Number(row.sent_count || 0),
      opened: Number(row.opened_count || 0),
      clicked: Number(row.clicked_count || 0)
    });
  }
  const incomingMap = new Map(
    incomingMessagesRes.rows.map((row) => [Number(row.ngo_id), Number(row.incoming_count || 0)])
  );
  const outgoingMap = new Map(
    outgoingMessagesRes.rows.map((row) => [String(row.ngo_external_id || ''), Number(row.outgoing_count || 0)])
  );

  const scoreMap = {};
  for (const ngo of ngos) {
    const verificationScore = toLower(ngo.doc.verified) === 'true' || ngo.doc.verified === true ? 20 : 0;
    const profileScore = pickProfileCompletenessScore(ngo.doc);
    const complianceScore = pickComplianceScore(ngo.doc);

    const impact = impactMap.get(ngo.id) || { total: 0, recent: 0, lastUpdateAt: null };
    const campaign = campaignMap.get(ngo.id) || {
      campaignsCount: 0,
      updateCount: 0,
      recentUpdateCount: 0,
      lastUpdateAt: 0
    };
    const totalUpdates = impact.total + campaign.updateCount;
    const recentUpdates = impact.recent + campaign.recentUpdateCount;
    const cadenceScore = clamp((totalUpdates / 12) * 10, 0, 10);
    const recencyScore = clamp((recentUpdates / 4) * 10, 0, 10);
    const mixedUpdateBonus = impact.total > 0 && campaign.updateCount > 0 ? 5 : totalUpdates > 0 ? 2 : 0;
    const reportingScore = clamp(cadenceScore + recencyScore + mixedUpdateBonus, 0, 25);

    const notifications = notificationMap.get(ngo.id) || { sent: 0, opened: 0, clicked: 0 };
    const sent = Number(notifications.sent || 0);
    const opened = Number(notifications.opened || 0);
    const clicked = Number(notifications.clicked || 0);
    const openRate = sent > 0 ? opened / sent : 0;
    const clickRate = sent > 0 ? clicked / sent : 0;
    const engagementRateScore = clamp((openRate * 0.6 + clickRate * 1.1) * 10, 0, 10);

    const incomingMessages = Number(incomingMap.get(ngo.id) || 0);
    const outgoingMessages = Number(outgoingMap.get(ngo.externalId) || 0);
    const responseRatio =
      incomingMessages > 0 ? clamp(outgoingMessages / incomingMessages, 0, 1) : outgoingMessages > 0 ? 1 : 0;
    const responsivenessScore = responseRatio * 5;
    const engagementScore = clamp(engagementRateScore + responsivenessScore, 0, 15);

    const totalScore = Math.round(
      clamp(verificationScore + profileScore + complianceScore + reportingScore + engagementScore, 0, 100)
    );

    const lastActivityAt = Math.max(
      toTimestamp(impact.lastUpdateAt),
      toTimestamp(campaign.lastUpdateAt),
      toTimestamp(ngo.createdAt)
    );

    scoreMap[ngo.externalId] = {
      score: totalScore,
      grade: gradeForScore(totalScore),
      components: {
        verification: Number(verificationScore.toFixed(1)),
        profileCompleteness: Number(profileScore.toFixed(1)),
        compliance: Number(complianceScore.toFixed(1)),
        reporting: Number(reportingScore.toFixed(1)),
        engagement: Number(engagementScore.toFixed(1))
      },
      metrics: {
        campaignsCount: Number(campaign.campaignsCount || 0),
        campaignUpdatesTotal: Number(campaign.updateCount || 0),
        campaignUpdatesRecent90d: Number(campaign.recentUpdateCount || 0),
        impactUpdatesTotal: Number(impact.total || 0),
        impactUpdatesRecent90d: Number(impact.recent || 0),
        notificationsSent: sent,
        notificationOpenRate: Number((openRate * 100).toFixed(1)),
        notificationClickRate: Number((clickRate * 100).toFixed(1)),
        incomingMessages,
        outgoingMessages,
        responseRatio: Number((responseRatio * 100).toFixed(1)),
        totalUpdates
      },
      updatedAt: new Date().toISOString(),
      lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null
    };
  }

  return scoreMap;
};

const calculateTransparencyScoreForNgo = async (ngoExternalId) => {
  const scores = await calculateTransparencyScoresForNgoExternalIds([ngoExternalId]);
  return scores[String(ngoExternalId || '').trim()] || null;
};

module.exports = {
  calculateTransparencyScoreForNgo,
  calculateTransparencyScoresForNgoExternalIds
};
