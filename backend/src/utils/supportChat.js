const { SUPPORT_KB } = require('./platformSupportKb');

const MAX_SAFE_TEXT = 4000;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could', 'did', 'do',
  'does', 'for', 'from', 'get', 'got', 'had', 'has', 'have', 'help', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'just', 'know', 'like', 'me', 'my', 'need', 'of', 'on', 'or', 'our', 'please', 'show', 'so', 'tell',
  'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this', 'to', 'us', 'want', 'was', 'we', 'what',
  'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your'
]);

const FOLLOW_UP_TERMS = new Set([
  'also', 'and', 'another', 'anyway', 'certificate', 'details', 'how', 'it', 'more', 'same', 'status', 'that',
  'this', 'what'
]);

const DISCOVERY_TERMS = new Set([
  'best', 'browse', 'discover', 'find', 'list', 'recommend', 'search', 'show', 'suggest', 'top'
]);

const STATS_TERMS = new Set([
  'count', 'counts', 'number', 'stat', 'stats', 'summary', 'total', 'totals'
]);

const SENSITIVE_TERMS = ['password', 'otp', 'credential', 'secret', 'login detail', 'pin'];
const INVALID_HINT_TERMS = new Set([
  'app',
  'this app',
  'platform',
  'chat',
  'inbox',
  'dashboard',
  'page'
]);

const INTENT_KEYWORDS = {
  account: ['account', 'login', 'register', 'role', 'profile'],
  admin: ['admin', 'moderation', 'verify', 'verification', 'webhook'],
  campaign: ['campaign', 'fundraiser', 'goal', 'update'],
  certificate: ['certificate', 'certification', 'cert'],
  donation: ['donate', 'donation', 'funding', 'payment', 'receipt'],
  innovation: ['innovation', 'circle', 'emergency', 'endorsement', 'gamification', 'leaderboard', 'wishlist'],
  messaging: ['chat', 'inbox', 'message'],
  ngo: ['ngo', 'charity', 'organization', 'organisation'],
  requests: ['beneficiary', 'help', 'request', 'support'],
  volunteering: ['activity', 'hours', 'opportunity', 'shift', 'volunteer']
};

const STATS_TARGETS = [
  { id: 'ngos', tokens: ['ngo', 'charity', 'organisation', 'organization'] },
  { id: 'campaigns', tokens: ['campaign', 'fundraiser', 'initiative'] },
  { id: 'users', tokens: ['user', 'users', 'member', 'members', 'donor', 'donors'] },
  { id: 'admins', tokens: ['admin', 'admins'] },
  { id: 'donations', tokens: ['donate', 'donation', 'payment', 'receipt'] },
  { id: 'volunteer_opportunities', tokens: ['opportunity', 'opportunities'] },
  { id: 'volunteer_applications', tokens: ['application', 'applications'] },
  { id: 'volunteering', tokens: ['volunteer', 'volunteering', 'hours', 'shift'] },
  { id: 'help_requests', tokens: ['request', 'support', 'beneficiary', 'help'] },
  { id: 'certificates', tokens: ['certificate', 'cert'] },
  { id: 'categories', tokens: ['category', 'categories', 'cause', 'sector'] },
  { id: 'messages', tokens: ['message', 'messages', 'inbox', 'chat'] },
  { id: 'flag_requests', tokens: ['flag', 'flagged', 'moderation', 'report'] }
];

const ROLE_FOLLOW_UPS = {
  guest: [
    'What can I do on this platform before login?',
    'How do I register as User or NGO?',
    'Where can I browse NGOs and campaigns?'
  ],
  user: [
    'How do I donate and get a receipt?',
    'How do I volunteer and get a certificate?',
    'How can I message an NGO?'
  ],
  ngo: [
    'How do I manage NGO profile and campaigns?',
    'How do I approve donation/volunteer certificates?',
    'Where can I view support requests?'
  ],
  admin: [
    'How do admin verifications work?',
    'How do I resolve flag requests?',
    'Where can I monitor webhook health?'
  ]
};

const INTENT_FOLLOW_UPS = {
  account: [
    'How do role-based dashboards differ?',
    'What to do if login fails?'
  ],
  admin: [
    'How do I open Admin verifications page?',
    'How can admin review flagged content quickly?'
  ],
  campaign: [
    'How do campaign updates and analytics work?',
    'How can I find campaigns by location?'
  ],
  certificate: [
    'What do certificate statuses mean?',
    'How long does NGO approval usually take?'
  ],
  donation: [
    'Where can I download donation receipts?',
    'How to check completed vs pending donations?'
  ],
  innovation: [
    'How does giving circle contribution flow work?',
    'What can I do in Innovation Center?'
  ],
  messaging: [
    'How can I message a specific NGO?',
    'How do I troubleshoot missing inbox messages?'
  ],
  ngo: [
    'Show NGOs in Mumbai',
    'Show education NGOs near Bengaluru'
  ],
  requests: [
    'How do support request statuses change?',
    'Where does NGO process beneficiary requests?'
  ],
  volunteering: [
    'Difference between opportunities and campaign volunteering?',
    'How are volunteer hours recorded?'
  ]
};

const TYPO_NORMALIZATION = {
  donashun: 'donation',
  donashion: 'donation',
  recipt: 'receipt',
  reciept: 'receipt',
  volunter: 'volunteer',
  voluntering: 'volunteering',
  oppurtunity: 'opportunity',
  oppurtunities: 'opportunities',
  msg: 'message',
  ngoo: 'ngo'
};

const CANONICAL_SYNONYMS = {
  account: ['account', 'accounts', 'signin', 'sign-in', 'sign', 'login', 'logins'],
  admin: ['admin', 'moderation', 'moderator'],
  analytics: ['analytics', 'metrics', 'insights', 'analysis'],
  campaign: ['campaign', 'campaigns', 'fundraiser', 'fundraisers', 'initiative', 'initiatives'],
  certificate: ['certificate', 'certificates', 'certification', 'certifications', 'cert'],
  circle: ['circle', 'circles', 'cohort'],
  dashboard: ['dashboard', 'dashboards', 'panel', 'panels'],
  donate: ['donate', 'donates', 'donating', 'donation', 'donations', 'contribute', 'contribution', 'funding'],
  emergency: ['emergency', 'urgent', 'relief'],
  endorsement: ['endorsement', 'endorsements'],
  gamification: ['gamification', 'points', 'badges', 'streak', 'xp'],
  help: ['help', 'assist', 'assistance', 'support'],
  innovation: ['innovation', 'innovations', 'experimental'],
  leaderboard: ['leaderboard', 'rank', 'ranking'],
  message: ['message', 'messages', 'messaging', 'chat', 'inbox', 'dm'],
  ngo: ['ngo', 'ngos', 'charity', 'charities', 'organization', 'organisation', 'org'],
  payment: ['payment', 'payments', 'pay', 'paid', 'upi', 'card', 'netbanking', 'wallet'],
  receipt: ['receipt', 'receipts', 'invoice'],
  request: ['request', 'requests', 'asking'],
  status: ['status', 'state', 'progress'],
  verify: ['verify', 'verified', 'verification', 'approve', 'approved', 'approval', 'review', 'reviewed'],
  volunteer: ['volunteer', 'volunteers', 'volunteering', 'opportunity', 'opportunities', 'hours', 'shift', 'shifts'],
  webhook: ['webhook', 'webhooks', 'delivery', 'deliveries', 'deadletter', 'dead-letter'],
  wishlist: ['wishlist', 'wishlists', 'pledge', 'pledges']
};

const TOKEN_ALIAS = Object.entries(CANONICAL_SYNONYMS).reduce((acc, [canonical, aliases]) => {
  for (const value of aliases) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) acc[normalized] = canonical;
  }
  acc[canonical] = canonical;
  return acc;
}, {});

const toUnique = (items = []) => [...new Set(items.filter(Boolean))];

const safeText = (value, maxLength = MAX_SAFE_TEXT) => String(value || '').slice(0, maxLength);

const normalizeTextForSearch = (value) =>
  safeText(value)
    .toLowerCase()
    .replace(/[_/\\]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeRole = (value) => {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'user' || role === 'ngo' || role === 'admin') return role;
  return 'guest';
};

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stemToken = (token) => {
  let out = String(token || '').trim().toLowerCase();
  if (!out) return '';
  out = TYPO_NORMALIZATION[out] || out;
  if (out.length > 5 && out.endsWith('ies')) out = `${out.slice(0, -3)}y`;
  else if (out.length > 5 && out.endsWith('ing')) out = out.slice(0, -3);
  else if (out.length > 4 && out.endsWith('ed')) out = out.slice(0, -2);
  else if (out.length > 4 && out.endsWith('es')) out = out.slice(0, -2);
  else if (out.length > 3 && out.endsWith('s')) out = out.slice(0, -1);
  return TOKEN_ALIAS[out] || out;
};

const tokenize = (value) => {
  const normalized = normalizeTextForSearch(value);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((token) => stemToken(token))
    .filter(Boolean);
};

const toBigrams = (tokens = []) => {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    out.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
};

const normalizeHistory = (history = []) => {
  if (!Array.isArray(history)) return [];
  const normalized = [];
  for (const item of history.slice(-14)) {
    if (!item) continue;
    const role = String(item.role || item.from || '').toLowerCase();
    const mappedRole = role === 'assistant' || role === 'bot' ? 'assistant' : 'user';
    const content = safeText(item.content || item.text || item.message || '');
    if (!content.trim()) continue;
    normalized.push({ role: mappedRole, content });
  }
  return normalized;
};

const isLikelyFollowUp = (tokens = []) => {
  if (tokens.length === 0) return false;
  if (tokens.length <= 4) return true;
  const matches = tokens.filter((token) => FOLLOW_UP_TERMS.has(token)).length;
  return matches >= 2;
};

const buildEffectiveQueryText = ({ message, history }) => {
  const base = safeText(message);
  const normalizedHistory = normalizeHistory(history);
  if (!base.trim() || normalizedHistory.length === 0) return base;

  const tokens = tokenize(base);
  if (!isLikelyFollowUp(tokens)) return base;

  const previousUserTurns = normalizedHistory
    .filter((item) => item.role === 'user')
    .map((item) => item.content);

  const prior = previousUserTurns[previousUserTurns.length - 1] || '';
  if (!prior.trim()) return base;
  return `${prior}\n${base}`;
};

const levenshteinDistance = (a, b) => {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  if (Math.abs(left.length - right.length) > 2) return 99;

  const row = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) row[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    let prev = i;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + cost
      );
      prev = temp;
    }
  }
  return row[right.length];
};

const fuzzyTokenEquals = (left, right) => {
  if (!left || !right) return false;
  if (left === right) return true;
  const minLength = Math.min(left.length, right.length);
  if (minLength <= 3) return false;
  const maxDistance = minLength >= 8 ? 2 : 1;
  return levenshteinDistance(left, right) <= maxDistance;
};

const extractIntentHints = (tokens = []) => {
  const tokenSet = new Set(tokens);
  return Object.entries(INTENT_KEYWORDS)
    .filter(([, keywords]) => keywords.some((kw) => tokenSet.has(stemToken(kw))))
    .map(([intent]) => intent);
};

const truncateHintAtMarkers = (value, markers = []) => {
  if (!markers.length) return value;
  const source = String(value || '');
  let cutAt = source.length;
  for (const marker of markers) {
    const idx = source.toLowerCase().indexOf(marker.toLowerCase());
    if (idx > 0 && idx < cutAt) cutAt = idx;
  }
  return source.slice(0, cutAt);
};

const trimHint = (value, fallbackLimit = 64, markers = []) => {
  const trimmedByMarkers = truncateHintAtMarkers(value, markers);
  const text = safeText(trimmedByMarkers, fallbackLimit)
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/\b(please|pls|plz|thanks|thank you)\b/gi, ' ')
    .replace(/\b(and|or|with|where|which|that|who|show|find|list|recommend|suggest|also|then)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || STOP_WORDS.has(text) || INVALID_HINT_TERMS.has(text)) return '';
  return text;
};

const collectPatternHints = (text, patterns, options = {}) => {
  const max = Number(options.max) > 0 ? Number(options.max) : 4;
  const markers = Array.isArray(options.stopMarkers) ? options.stopMarkers : [];
  const fallbackLimit = Number(options.maxHintLength) > 0 ? Number(options.maxHintLength) : 64;
  const hints = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'gi');
    let match = regex.exec(text);
    while (match) {
      const hint = trimHint(match[1] || '', fallbackLimit, markers);
      if (hint) hints.push(hint);
      if (hints.length >= max) break;
      match = regex.exec(text);
    }
    if (hints.length >= max) break;
  }
  return toUnique(hints).slice(0, max);
};

const extractQuotedHints = (text) => {
  const out = [];
  const regex = /["']([^"']{2,64})["']/g;
  let match = regex.exec(text);
  while (match) {
    const value = trimHint(match[1] || '', 80);
    if (value) out.push(value);
    match = regex.exec(text);
  }
  return toUnique(out).slice(0, 4);
};

const extractQuerySignals = ({ message, history = [] }) => {
  const effectiveMessage = buildEffectiveQueryText({ message, history });
  const normalizedText = normalizeTextForSearch(effectiveMessage);
  const tokens = tokenize(effectiveMessage);
  const tokenSet = new Set(tokens);

  const locationHints = collectPatternHints(
    normalizedText,
    [
      '\\b(?:in|near|around|at|from)\\s+([a-z][a-z0-9\\s-]{2,64})',
      '\\b(?:location|city|area)\\s*(?:is|=)?\\s*([a-z][a-z0-9\\s-]{2,64})'
    ],
    {
      stopMarkers: [' for ', ' about ', ' related ', ' category ', ' sector ', ' also ', ' and ', ' with ', '?']
    }
  );

  const categoryHints = collectPatternHints(
    normalizedText,
    [
      '\\b(?:for|about|on|regarding|related to|cause|category|sector)\\s+([a-z][a-z0-9\\s-]{2,64})'
    ],
    {
      stopMarkers: [' in ', ' near ', ' around ', ' at ', ' from ', ' also ', ' and ', ' with ', '?']
    }
  );

  const namedEntityHints = toUnique([
    ...extractQuotedHints(effectiveMessage),
    ...collectPatternHints(
      normalizedText,
      [
        '\\b(?:ngo|organization|organisation|charity)\\s+(?:named|called)?\\s*([a-z0-9][a-z0-9\\s-]{2,64})',
        '\\b(?:campaign|fundraiser|initiative)\\s+(?:named|called)?\\s*([a-z0-9][a-z0-9\\s-]{2,64})'
      ],
      {
        stopMarkers: [' in ', ' near ', ' around ', ' at ', ' from ', ' for ', ' about ', ' also ', '?']
      }
    )
  ]).slice(0, 5);

  const wantsDirectoryResults = tokens.some((token) => DISCOVERY_TERMS.has(token));
  const asksForCampaigns = tokenSet.has('campaign') || tokenSet.has('donate');
  const asksForNgos = tokenSet.has('ngo');
  const intentHints = extractIntentHints(tokens);

  return {
    effectiveMessage,
    normalizedText,
    tokens,
    tokenSet,
    bigrams: toBigrams(tokens),
    intentHints,
    locationHints,
    categoryHints,
    namedEntityHints,
    wantsDirectoryResults,
    asksForCampaigns,
    asksForNgos
  };
};

const buildKbIndex = () => {
  return SUPPORT_KB.map((entry) => {
    const titleTokens = tokenize(entry.title || '');
    const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
    const keywordRows = keywords
      .map((keyword) => {
        const normalized = normalizeTextForSearch(keyword);
        const tokens = tokenize(keyword);
        return {
          raw: String(keyword || ''),
          normalized,
          tokens,
          bigrams: toBigrams(tokens)
        };
      })
      .filter((row) => row.normalized);
    const allTokens = toUnique([
      ...titleTokens,
      ...keywordRows.flatMap((row) => row.tokens)
    ]);

    return {
      entry,
      titleNormalized: normalizeTextForSearch(entry.title || ''),
      titleTokens,
      keywordRows,
      allTokens
    };
  });
};

const KB_INDEX = buildKbIndex();

const computeKeywordScore = (query, keywordRow) => {
  if (!query || !keywordRow || !keywordRow.tokens.length) return 0;
  if (query.normalizedText.includes(keywordRow.normalized)) {
    return 5 + Math.min(2, keywordRow.tokens.length * 0.6);
  }

  let exactMatches = 0;
  let fuzzyMatches = 0;
  for (const kwToken of keywordRow.tokens) {
    if (query.tokenSet.has(kwToken)) {
      exactMatches += 1;
      continue;
    }
    const foundFuzzy = query.tokens.some((token) => fuzzyTokenEquals(token, kwToken));
    if (foundFuzzy) fuzzyMatches += 1;
  }

  let score = exactMatches * 1.4 + fuzzyMatches * 0.7;
  if (exactMatches > 0 && exactMatches === keywordRow.tokens.length) score += 1.6;

  const keywordBigramSet = new Set(keywordRow.bigrams);
  const bigramMatches = query.bigrams.filter((bigram) => keywordBigramSet.has(bigram)).length;
  if (bigramMatches > 0) score += bigramMatches * 1.1;
  return score;
};

const scoreEntry = (indexedEntry, query) => {
  if (!indexedEntry || !query) return 0;
  let score = 0;

  if (indexedEntry.titleNormalized && query.normalizedText.includes(indexedEntry.titleNormalized)) {
    score += 6;
  }

  for (const token of indexedEntry.titleTokens) {
    if (query.tokenSet.has(token)) score += 1.5;
  }

  for (const keywordRow of indexedEntry.keywordRows) {
    score += computeKeywordScore(query, keywordRow);
  }

  const overlap = indexedEntry.allTokens.filter((token) => query.tokenSet.has(token)).length;
  if (overlap >= 2) score += overlap * 0.4;

  return score;
};

const rankKbEntries = ({ message, history = [] }) => {
  const query = extractQuerySignals({ message, history });
  const ranked = KB_INDEX
    .map((row) => ({ entry: row.entry, score: scoreEntry(row, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return { query, ranked };
};

const selectKbEntries = (message, limit = 4, options = {}) => {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 4, 8));
  const { ranked } = rankKbEntries({
    message,
    history: options.history || []
  });
  const scored = ranked.slice(0, normalizedLimit).map((row) => row.entry);
  if (scored.length > 0) return scored;

  const baseline = SUPPORT_KB.filter((entry) => entry.id === 'overview' || entry.id === 'troubleshooting');
  return baseline.length > 0 ? baseline : SUPPORT_KB.slice(0, 2);
};

const roleHelpBlurb = (role) => {
  if (role === 'admin') {
    return 'The user is an admin. Prefer admin workflows (verification, moderation, analytics, webhook operations).';
  }
  if (role === 'ngo') {
    return 'The user is an NGO. Prefer NGO workflows (profile updates, campaign operations, approvals, innovation modules).';
  }
  if (role === 'user') {
    return 'The user is a regular user. Prefer user workflows (discover, donate, volunteer, certificates, support requests, messaging).';
  }
  return 'The user may be logged out. Provide guest-safe guidance and suggest login only when role-specific actions are needed.';
};

const buildSystemPrompt = ({ role }) => {
  return [
    'You are "NGO Connect Bot", a support assistant for the NGO Connect platform.',
    '',
    'Core goals:',
    '- Answer project questions about platform features, workflows, statuses, and troubleshooting.',
    '- Handle flexible user wording and map it to the correct feature/module.',
    '- Give step-by-step guidance tailored to the user role.',
    '- Ask at most 1 clarifying question only when key information is missing.',
    '- Use page names exactly when guiding navigation: Dashboard, NGOs, Campaigns, Volunteer Opportunities, Messages, Innovation Center, Admin Dashboard.',
    '',
    'Safety and privacy:',
    '- Never provide or request passwords, OTPs, or private credentials.',
    '- Do not claim actions were performed on behalf of the user.',
    '- Do not invent NGO/campaign data that is not present in provided context.',
    '',
    `Role context: ${roleHelpBlurb(role)}`
  ].join('\n');
};

const summarizeSignalsForPrompt = (signals = {}) => {
  const lines = [];
  if (Array.isArray(signals.intentHints) && signals.intentHints.length) {
    lines.push(`Intent hints: ${signals.intentHints.join(', ')}`);
  }
  if (Array.isArray(signals.locationHints) && signals.locationHints.length) {
    lines.push(`Location hints: ${signals.locationHints.join(', ')}`);
  }
  if (Array.isArray(signals.categoryHints) && signals.categoryHints.length) {
    lines.push(`Category hints: ${signals.categoryHints.join(', ')}`);
  }
  if (Array.isArray(signals.namedEntityHints) && signals.namedEntityHints.length) {
    lines.push(`Entity hints: ${signals.namedEntityHints.join(', ')}`);
  }
  return lines.join('\n');
};

const buildPrompt = ({ message, role, kbEntries, dbContext, history, clientContext, querySignals }) => {
  const kbText = (kbEntries || [])
    .map((entry) => `### ${entry.title}\n${entry.content}`)
    .join('\n\n');

  const historyLines = (history || [])
    .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .join('\n');

  const ctxLines = [];
  if (clientContext && typeof clientContext === 'object') {
    if (clientContext.path) ctxLines.push(`Current page: ${safeText(clientContext.path)}`);
  }

  const signalSummary = summarizeSignalsForPrompt(querySignals);

  return [
    buildSystemPrompt({ role }),
    '',
    ctxLines.length ? `Client context:\n${ctxLines.join('\n')}` : '',
    signalSummary ? `Interpreted NLP signals:\n${signalSummary}` : '',
    dbContext ? `Database context:\n${dbContext}` : '',
    kbText ? `Platform knowledge:\n${kbText}` : '',
    historyLines ? `Conversation so far:\n${historyLines}` : '',
    `User question: ${safeText(message)}`,
    '',
    'Write a helpful response in concise paragraphs or bullets.'
  ]
    .filter(Boolean)
    .join('\n\n');
};

const containsSensitiveRequest = (message) => {
  const text = normalizeTextForSearch(message);
  return SENSITIVE_TERMS.some((term) => text.includes(term));
};

const hasAnyStatsTerm = (tokens = [], normalizedText = '') => {
  if (!tokens.length && !normalizedText) return false;
  if (tokens.some((token) => STATS_TERMS.has(token))) return true;
  return /\b(how many|number of|count of|count|total|stats?|summary)\b/.test(normalizedText);
};

const getStatsTargets = (tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const tokenSet = new Set(tokens);
  return STATS_TARGETS
    .filter((target) => target.tokens.some((token) => tokenSet.has(stemToken(token))))
    .map((target) => target.id);
};

const analyzeStatsQuery = ({ message, history = [], querySignals = null }) => {
  const signals = querySignals || extractQuerySignals({ message, history });
  const normalizedText = signals.normalizedText || normalizeTextForSearch(message);
  const tokens = signals.tokens || tokenize(message);
  const targets = getStatsTargets(tokens);
  const hasStatsWord = hasAnyStatsTerm(tokens, normalizedText);

  const wantsVerified = /\b(verified|approved)\b/.test(normalizedText);
  const wantsPending = /\b(pending|awaiting)\b/.test(normalizedText);
  const wantsCompleted = /\b(completed|complete|done|successful)\b/.test(normalizedText);

  return {
    isStatsQuery: hasStatsWord && (targets.length > 0 || /\b(how many|number of|count|total)\b/.test(normalizedText)),
    targets: toUnique(targets),
    wantsVerified,
    wantsPending,
    wantsCompleted
  };
};

const uniqueStrings = (items = []) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const text = String(item || '').trim();
    if (!text) continue;
    const key = normalizeTextForSearch(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

const buildStatsFollowUps = ({ statsAnalysis = {}, snapshot = null }) => {
  if (!statsAnalysis?.isStatsQuery) return [];
  const targets = Array.isArray(statsAnalysis.targets) ? statsAnalysis.targets : [];
  const hasTarget = (id) => targets.includes(id);
  const out = [];

  if (hasTarget('ngos') || targets.length === 0) {
    out.push('How many verified NGOs are there?');
    out.push('How many NGOs are pending verification?');
  }
  if (hasTarget('donations')) {
    out.push('Show total vs completed donations');
  }
  if (hasTarget('volunteering') || hasTarget('volunteer_applications')) {
    out.push('How many volunteer applications are there?');
  }
  if (snapshot && Number(snapshot.campaignsTotal || 0) > 0) {
    out.push('How many campaigns are active right now?');
  }
  return out;
};

const buildDiscoveryFollowUps = (signals = {}) => {
  const out = [];
  const locations = Array.isArray(signals.locationHints) ? signals.locationHints : [];
  const categories = Array.isArray(signals.categoryHints) ? signals.categoryHints : [];
  const asksNgos = Boolean(signals.asksForNgos);
  const asksCampaigns = Boolean(signals.asksForCampaigns);
  const isDiscovery = Boolean(signals.wantsDirectoryResults || asksNgos || asksCampaigns);
  if (!isDiscovery) return out;

  if (!locations.length) {
    out.push(asksCampaigns ? 'Show campaigns in Mumbai' : 'Show NGOs in Mumbai');
  } else {
    out.push(`Show more options in ${locations[0]}`);
  }

  if (!categories.length) {
    out.push(asksCampaigns ? 'Show education campaigns' : 'Show education NGOs');
  } else {
    out.push(`Show more in ${categories[0]} category`);
  }

  out.push('Recommend top options with quick reasons');
  return out;
};

const buildFollowUpSuggestions = ({
  role = 'guest',
  message = '',
  querySignals = null,
  statsAnalysis = null,
  platformSnapshot = null
}) => {
  const normalizedRole = normalizeRole(role);
  const signals = querySignals || extractQuerySignals({ message, history: [] });
  const computedStats = statsAnalysis || analyzeStatsQuery({ message, history: [], querySignals: signals });
  const intents = Array.isArray(signals.intentHints) ? signals.intentHints : [];

  const intentSuggestions = intents.flatMap((intent) => INTENT_FOLLOW_UPS[intent] || []);
  const statsSuggestions = buildStatsFollowUps({ statsAnalysis: computedStats, snapshot: platformSnapshot });
  const discoverySuggestions = buildDiscoveryFollowUps(signals);
  const roleSuggestions = ROLE_FOLLOW_UPS[normalizedRole] || ROLE_FOLLOW_UPS.guest;

  const all = uniqueStrings([
    ...intentSuggestions,
    ...statsSuggestions,
    ...discoverySuggestions,
    ...roleSuggestions
  ]);

  const normalizedCurrent = normalizeTextForSearch(message);
  return all
    .filter((item) => normalizeTextForSearch(item) !== normalizedCurrent)
    .slice(0, 5);
};

const formatCount = (value) => Number(value || 0).toLocaleString('en-IN');

const buildStatsReply = ({ analysis, snapshot }) => {
  if (!analysis || !snapshot) return '';

  const lines = [];
  const targets = Array.isArray(analysis.targets) ? analysis.targets : [];

  const addLine = (label, value) => {
    if (value === null || value === undefined) return;
    lines.push(`- ${label}: ${formatCount(value)}`);
  };

  const hasTarget = (id) => targets.includes(id);
  const wantsGeneralSummary = targets.length === 0;

  if (wantsGeneralSummary || hasTarget('ngos')) {
    if (analysis.wantsVerified) {
      addLine('Verified NGOs', snapshot.ngosVerified);
    } else if (analysis.wantsPending) {
      addLine('Pending NGO verification', snapshot.ngosPending);
    } else {
      addLine('Total NGOs', snapshot.ngosTotal);
      addLine('Verified NGOs', snapshot.ngosVerified);
    }
  }

  if (wantsGeneralSummary || hasTarget('campaigns')) {
    addLine('Total campaigns', snapshot.campaignsTotal);
  }

  if (hasTarget('users')) {
    addLine('User accounts', snapshot.usersTotal);
  }

  if (hasTarget('admins')) {
    addLine('Admin accounts', snapshot.adminsTotal);
  }

  if (hasTarget('donations')) {
    if (analysis.wantsCompleted) {
      addLine('Completed donations', snapshot.donationsCompletedTotal);
    } else {
      addLine('Total donations', snapshot.donationsTotal);
      addLine('Completed donations', snapshot.donationsCompletedTotal);
    }
  }

  if (hasTarget('volunteer_opportunities')) {
    addLine('Volunteer opportunities', snapshot.volunteerOpportunitiesTotal);
  }

  if (hasTarget('volunteer_applications')) {
    addLine('Volunteer applications', snapshot.volunteerApplicationsTotal);
  }

  if (hasTarget('volunteering')) {
    addLine('Volunteer opportunities', snapshot.volunteerOpportunitiesTotal);
    addLine('Volunteer applications', snapshot.volunteerApplicationsTotal);
  }

  if (hasTarget('help_requests')) {
    addLine('Support requests', snapshot.helpRequestsTotal);
  }

  if (hasTarget('certificates')) {
    addLine('Certificates', snapshot.certificatesTotal);
  }

  if (hasTarget('categories')) {
    addLine('Categories', snapshot.categoriesTotal);
  }

  if (hasTarget('messages')) {
    addLine('Messages', snapshot.messagesTotal);
  }

  if (hasTarget('flag_requests')) {
    addLine('Flag requests', snapshot.flagRequestsTotal);
  }

  if (lines.length === 0) {
    addLine('Total NGOs', snapshot.ngosTotal);
    addLine('Total campaigns', snapshot.campaignsTotal);
    addLine('Volunteer opportunities', snapshot.volunteerOpportunitiesTotal);
    addLine('Completed donations', snapshot.donationsCompletedTotal);
  }

  return [
    'Here is the current platform snapshot:',
    ...lines,
    '',
    'Ask for a specific breakdown (for example: "verified NGOs", "completed donations", or "volunteer applications").'
  ].join('\n');
};

const parseDbContextSections = (dbContext = '') => {
  const text = String(dbContext || '').trim();
  if (!text) return { ngoLines: [], campaignLines: [] };
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return {
    ngoLines: lines.filter((line) => line.startsWith('- ') && line.includes('(Category:')),
    campaignLines: lines.filter((line) => line.startsWith('- ') && line.includes('raised'))
  };
};

const buildDiscoveryReply = ({ dbContext, signals }) => {
  const { ngoLines, campaignLines } = parseDbContextSections(dbContext);
  const locations = Array.isArray(signals?.locationHints) ? signals.locationHints : [];
  const categories = Array.isArray(signals?.categoryHints) ? signals.categoryHints : [];
  const hasFilters = locations.length > 0 || categories.length > 0;

  const wantsNgos = signals?.asksForNgos;
  const wantsCampaigns = signals?.asksForCampaigns;

  if (!ngoLines.length && !campaignLines.length) {
    if (!hasFilters) return '';
    const filterText = [
      locations.length ? `location "${locations.join(', ')}"` : '',
      categories.length ? `category "${categories.join(', ')}"` : ''
    ]
      .filter(Boolean)
      .join(' and ');
    return [
      `I could not find exact NGO/campaign matches for ${filterText}.`,
      'Try broadening the filter (nearby city or related category) and I can suggest alternatives.'
    ].join('\n');
  }

  const lines = ['I found relevant results from the platform:'];
  if (hasFilters) {
    if (locations.length) lines.push(`Requested location: ${locations.join(', ')}`);
    if (categories.length) lines.push(`Requested category: ${categories.join(', ')}`);
  }
  if ((wantsNgos || (!wantsNgos && !wantsCampaigns)) && ngoLines.length) {
    lines.push('NGOs:');
    lines.push(...ngoLines.slice(0, 4));
  }
  if ((wantsCampaigns || (!wantsNgos && !wantsCampaigns)) && campaignLines.length) {
    lines.push('Campaigns:');
    lines.push(...campaignLines.slice(0, 4));
  }
  lines.push('');
  lines.push('Tell me your preferred category/location and I can narrow this down further.');
  return lines.join('\n');
};

const buildFallbackReply = ({
  message,
  role,
  kbEntries,
  history = [],
  querySignals = null,
  platformSnapshot = null,
  dbContext = ''
}) => {
  if (containsSensitiveRequest(message)) {
    return [
      'I can\'t help with passwords, OTPs, or private credentials.',
      '',
      'If you are unable to sign in:',
      '- Confirm you are using the right email and role account.',
      '- Contact admin/support for account recovery help (password reset flow is not available in this build).'
    ].join('\n');
  }

  const signals = querySignals || extractQuerySignals({ message, history });
  const normalizedText = signals.normalizedText || normalizeTextForSearch(message);
  const entryList = Array.isArray(kbEntries) && kbEntries.length
    ? kbEntries
    : selectKbEntries(message, 2, { history });

  const statsAnalysis = analyzeStatsQuery({ message, history, querySignals: signals });
  if (platformSnapshot && statsAnalysis.isStatsQuery) {
    const statsReply = buildStatsReply({ analysis: statsAnalysis, snapshot: platformSnapshot });
    if (statsReply) return statsReply;
  }

  if (
    role === 'guest' &&
    /\b(without login|without account|guest|before login|not logged in|without signin|without sign in)\b/.test(normalizedText)
  ) {
    return [
      'You can browse public platform information without login, but account actions require sign-in.',
      '',
      'Without login:',
      '- View platform overview and public NGO/campaign details.',
      '',
      'After login:',
      '- User: donate, volunteer, message NGOs, request support.',
      '- NGO: manage NGO profile, campaigns, approvals, and inbox.',
      '- Admin: verification, moderation, and analytics workflows.'
    ].join('\n');
  }

  if (
    role === 'ngo' &&
    (
      /\bprofile\b/.test(normalizedText) ||
      (/\bwhere\b/.test(normalizedText) && /\bmanage\b/.test(normalizedText) && /\bcampaign\b/.test(normalizedText))
    )
  ) {
    return [
      'As an NGO, you manage profile and campaigns from NGO dashboard flows.',
      '',
      'Where to manage:',
      '- NGO profile: update your organization details from NGO profile/dashboard area.',
      '- Campaigns: create/edit campaigns and track campaign updates + analytics.',
      '- Approval queues: donation/volunteer certificates and campaign volunteer registrations.'
    ].join('\n');
  }

  if (
    signals.intentHints.includes('volunteering') &&
    role === 'ngo' &&
    /\b(review|approve|approval|certificate)\b/.test(normalizedText)
  ) {
    return [
      'NGO certificate review flow for volunteering:',
      '- Open NGO dashboard volunteer approval queue.',
      '- Review completed volunteer application details.',
      '- Approve/reject volunteer certificate request with notes if needed.',
      '',
      'This applies to volunteer opportunity certificates and campaign-volunteer certificate decisions.'
    ].join('\n');
  }

  if (
    signals.intentHints.includes('messaging') &&
    /\b(not showing|missing|error|issue|troubleshoot|cannot|cant|unable)\b/.test(normalizedText)
  ) {
    return [
      'If messages/inbox are not showing, try this checklist:',
      '- Refresh the page and confirm you are logged in with the correct role account.',
      '- Open Messages route directly (`/messages`) and retry thread load.',
      '- Verify backend API is running and API base URL/proxy config is correct.',
      '- If console shows 404/500, capture the endpoint and status for quick debugging.'
    ].join('\n');
  }

  if (
    /\b(frontend|backend|api|base|url|config|proxy)\b/.test(normalizedText) &&
    /\b(cannot|cant|unable|reach|connect|failed|error|issue)\b/.test(normalizedText)
  ) {
    return [
      'For frontend-to-backend connection issues, check API base URL config first.',
      '- Confirm backend server is running and reachable.',
      '- Validate frontend API base URL/proxy points to the correct backend URL.',
      '- Check browser network tab for failing endpoint path and status code.',
      '- Resolve 404 by fixing route/base path, and 500 by checking backend logs.'
    ].join('\n');
  }

  const hasEntityOrFilterHints =
    Boolean(signals.asksForNgos || signals.asksForCampaigns) ||
    (Array.isArray(signals.locationHints) && signals.locationHints.length > 0) ||
    (Array.isArray(signals.categoryHints) && signals.categoryHints.length > 0) ||
    (Array.isArray(signals.namedEntityHints) && signals.namedEntityHints.length > 0);
  const hasExplicitDiscoveryVerb = /\b(show|list|find|discover|recommend|suggest|search|browse|top|best)\b/.test(normalizedText);
  const discoveryRequested = Boolean(hasEntityOrFilterHints && (signals.wantsDirectoryResults || hasExplicitDiscoveryVerb));
  if (discoveryRequested) {
    const discoveryReply = buildDiscoveryReply({ dbContext, signals });
    if (discoveryReply) return discoveryReply;
  }

  if (signals.intentHints.includes('certificate')) {
    const certificateEntry = entryList.find((entry) => entry.id === 'donations') ||
      entryList.find((entry) => entry.id === 'campaign_volunteering') ||
      entryList[0];
    if (certificateEntry) return certificateEntry.content;
  }

  if (signals.intentHints.includes('volunteering') && signals.intentHints.includes('certificate')) {
    return [
      'Volunteer certificates are role-reviewed and not instant.',
      '- Volunteer Opportunities: user marks completion, then NGO approves certificate.',
      '- Campaign Volunteering: NGO approves registration and can update volunteer hours.',
      '',
      'Check status in Dashboard -> Volunteer History / Campaign Volunteer Registrations.'
    ].join('\n');
  }

  const roleLine = role && role !== 'guest' ? `You are currently logged in as: ${role}.` : '';
  const top = entryList[0];
  const relatedTitles = entryList.slice(1, 3).map((entry) => entry.title);

  return [
    roleLine,
    top ? top.content : 'Ask me anything about donations, volunteering, messages, support requests, admin tools, or innovation features.',
    relatedTitles.length ? `\nRelated topics I can help with: ${relatedTitles.join(', ')}.` : '',
    '\nShare your exact status/error text and I will give precise next steps.'
  ]
    .filter(Boolean)
    .join('\n');
};

module.exports = {
  normalizeRole,
  escapeRegExp,
  selectKbEntries,
  normalizeHistory,
  extractQuerySignals,
  analyzeStatsQuery,
  buildFollowUpSuggestions,
  buildPrompt,
  buildFallbackReply
};
