const { query } = require('../db/postgres');
const { generateId } = require('../db/id');

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const uniqueStrings = (items = []) => [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];

const parseUserBadges = (sourceDoc = {}) => {
  const badges = Array.isArray(sourceDoc.badges) ? sourceDoc.badges : [];
  return uniqueStrings(badges);
};

const inferAutoBadges = ({ totalPoints = 0, badges = [] } = {}) => {
  const set = new Set(parseUserBadges({ badges }));
  if (totalPoints >= 50) set.add('bronze_impact');
  if (totalPoints >= 150) set.add('silver_impact');
  if (totalPoints >= 300) set.add('gold_impact');
  return Array.from(set);
};

const awardPoints = async (
  userExternalId,
  {
    points = 0,
    eventType = 'activity',
    badgeKey = '',
    reason = '',
    referenceType = '',
    referenceId = ''
  } = {}
) => {
  const safeUserId = String(userExternalId || '').trim();
  const safePoints = toPositiveInt(points, 0);
  if (!safeUserId || safePoints <= 0) {
    return {
      awarded: false,
      reason: 'INVALID_INPUT',
      totalPoints: 0,
      badges: []
    };
  }

  const {
    rows: [userRow]
  } = await query(
    `
    SELECT id, external_id, source_doc
    FROM users_rel
    WHERE external_id = $1
    LIMIT 1
    `,
    [safeUserId]
  );

  if (!userRow) {
    return {
      awarded: false,
      reason: 'USER_NOT_FOUND',
      totalPoints: 0,
      badges: []
    };
  }

  const sourceDoc = userRow.source_doc && typeof userRow.source_doc === 'object' ? { ...userRow.source_doc } : {};
  const currentPoints = toPositiveInt(sourceDoc.points, 0);

  const safeEventType = String(eventType || 'activity').trim() || 'activity';
  const safeReferenceType = String(referenceType || '').trim() || null;
  const safeReferenceId = String(referenceId || '').trim() || null;
  const safeBadgeKey = String(badgeKey || '').trim() || null;
  const safeReason = String(reason || '').trim() || null;

  if (safeReferenceType && safeReferenceId) {
    const { rows: existingRows } = await query(
      `
      SELECT source_doc
      FROM user_rewards_rel
      WHERE user_id = $1
        AND event_type = $2
        AND reference_type = $3
        AND reference_id = $4
      LIMIT 1
      `,
      [userRow.id, safeEventType, safeReferenceType, safeReferenceId]
    );
    const existing = existingRows[0];
    if (existing) {
      const badges = parseUserBadges(sourceDoc);
      return {
        awarded: false,
        alreadyAwarded: true,
        totalPoints: currentPoints,
        badges,
        reward: existing.source_doc && typeof existing.source_doc === 'object' ? existing.source_doc : null
      };
    }
  }

  const updatedPoints = currentPoints + safePoints;

  const currentBadges = parseUserBadges(sourceDoc);
  const mergedBadges = uniqueStrings([
    ...currentBadges,
    safeBadgeKey || '',
    ...inferAutoBadges({ totalPoints: updatedPoints, badges: currentBadges })
  ]);

  const updatedDoc = {
    ...sourceDoc,
    points: updatedPoints,
    badges: mergedBadges,
    updatedAt: new Date().toISOString()
  };

  await query(
    `
    UPDATE users_rel
    SET source_doc = $2::jsonb,
        updated_at = NOW()
    WHERE external_id = $1
    `,
    [safeUserId, JSON.stringify(updatedDoc)]
  );

  const rewardDoc = {
    id: generateId(),
    userId: safeUserId,
    eventType: safeEventType,
    badgeKey: safeBadgeKey,
    pointsAwarded: safePoints,
    reason: safeReason,
    referenceType: safeReferenceType,
    referenceId: safeReferenceId,
    createdAt: new Date().toISOString()
  };

  await query(
    `
    INSERT INTO user_rewards_rel (
      external_id,
      user_id,
      event_type,
      badge_key,
      points_awarded,
      reason,
      reference_type,
      reference_id,
      source_doc
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
    )
    `,
    [
      rewardDoc.id,
      userRow.id,
      rewardDoc.eventType,
      rewardDoc.badgeKey,
      rewardDoc.pointsAwarded,
      rewardDoc.reason,
      rewardDoc.referenceType,
      rewardDoc.referenceId,
      JSON.stringify(rewardDoc)
    ]
  );

  return {
    awarded: true,
    totalPoints: updatedPoints,
    badges: mergedBadges,
    reward: rewardDoc
  };
};

const getUserGamificationSummary = async (userExternalId) => {
  const safeUserId = String(userExternalId || '').trim();
  if (!safeUserId) {
    return {
      userId: '',
      points: 0,
      badges: [],
      recentRewards: []
    };
  }

  const {
    rows: [userRow]
  } = await query(
    `
    SELECT id, external_id, source_doc
    FROM users_rel
    WHERE external_id = $1
    LIMIT 1
    `,
    [safeUserId]
  );

  if (!userRow) {
    return {
      userId: safeUserId,
      points: 0,
      badges: [],
      recentRewards: []
    };
  }

  const sourceDoc = userRow.source_doc && typeof userRow.source_doc === 'object' ? userRow.source_doc : {};
  const points = toPositiveInt(sourceDoc.points, 0);
  const badges = parseUserBadges(sourceDoc);

  const { rows } = await query(
    `
    SELECT source_doc
    FROM user_rewards_rel
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 25
    `,
    [userRow.id]
  );

  return {
    userId: safeUserId,
    points,
    badges,
    recentRewards: rows.map((row) => (row.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {}))
  };
};

const getLeaderboard = async (limit = 20) => {
  const safeLimit = Math.min(Math.max(toPositiveInt(limit, 20), 1), 100);
  const { rows } = await query(
    `
    SELECT external_id, source_doc
    FROM users_rel
    WHERE COALESCE(NULLIF(source_doc->>'role', ''), 'user') = 'user'
    ORDER BY COALESCE(safe_int(source_doc->>'points'), 0) DESC, created_at ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return rows.map((row, index) => {
    const doc = row.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {};
    return {
      rank: index + 1,
      userId: row.external_id,
      name: doc.name || 'User',
      points: toPositiveInt(doc.points, 0),
      badges: parseUserBadges(doc)
    };
  });
};

module.exports = {
  awardPoints,
  getUserGamificationSummary,
  getLeaderboard
};
