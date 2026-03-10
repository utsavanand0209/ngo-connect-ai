const FRAUD_THRESHOLD = 50;
const HIGH_GOAL_AMOUNT = 100000;
const NEW_ACCOUNT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUSPICIOUS_DESCRIPTION_PATTERN = /\b(?:urgent|donate now|click here)\b/i;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const hasVerificationDocs = (verificationDocs) =>
  Array.isArray(verificationDocs) && verificationDocs.length > 0;

const isNewOrUnknownAccount = (createdAt, nowMs) => {
  const createdAtMs = Date.parse(createdAt || '');
  if (Number.isNaN(createdAtMs)) return true;
  const ageDays = (nowMs - createdAtMs) / DAY_MS;
  return ageDays < NEW_ACCOUNT_DAYS;
};

const hasSuspiciousDescription = (description) =>
  SUSPICIOUS_DESCRIPTION_PATTERN.test(String(description || '').toLowerCase());

const hasUnrealisticGoal = (campaigns = []) =>
  (Array.isArray(campaigns) ? campaigns : []).some((campaign) =>
    toNumber(campaign?.goalAmount, 0) >= HIGH_GOAL_AMOUNT
  );

const computeFraudScore = ({ ngo = {}, campaigns = [], now = Date.now() } = {}) => {
  let score = 0;
  const checks = {
    missingVerificationDocs: false,
    newOrUnknownAccount: false,
    suspiciousKeywords: false,
    unrealisticGoal: false
  };

  if (!hasVerificationDocs(ngo.verificationDocs)) {
    checks.missingVerificationDocs = true;
    score += 40;
  }

  if (isNewOrUnknownAccount(ngo.createdAt, now)) {
    checks.newOrUnknownAccount = true;
    score += 20;
  }

  if (hasSuspiciousDescription(ngo.description)) {
    checks.suspiciousKeywords = true;
    score += 30;
  }

  if (hasUnrealisticGoal(campaigns)) {
    checks.unrealisticGoal = true;
    score += 20;
  }

  return {
    score,
    flagged: score >= FRAUD_THRESHOLD,
    checks
  };
};

module.exports = {
  computeFraudScore,
  FRAUD_THRESHOLD,
  HIGH_GOAL_AMOUNT,
  NEW_ACCOUNT_DAYS,
  SUSPICIOUS_DESCRIPTION_PATTERN
};
