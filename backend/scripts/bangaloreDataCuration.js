#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');

const connectDB = require('../src/config/db');
const NGO = require('../src/models/NGO');
const Campaign = require('../src/models/Campaign');
const VolunteerOpportunity = require('../src/models/VolunteerOpportunity');
const { query } = require('../src/db/postgres');
const { generateId } = require('../src/db/id');

const rootDir = path.resolve(__dirname, '../..');
const reportDir = path.join(rootDir, 'docs', 'test-reports');
const nowIso = () => new Date().toISOString();
const runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

const BANGALORE_MATCHERS = [
  'bengaluru',
  'bangalore',
  'whitefield',
  'indiranagar',
  'jayanagar',
  'koramangala',
  'hsr',
  'electronic city',
  'rajajinagar',
  'btm'
];

const toSafeText = (value, maxLength = 8000) => String(value || '').trim().slice(0, maxLength);
const toSafeArray = (value) => (Array.isArray(value) ? value : []);

const containsBangaloreMarker = (text) => {
  const lower = toSafeText(text).toLowerCase();
  if (!lower) return false;
  return BANGALORE_MATCHERS.some((needle) => lower.includes(needle));
};

const isBangaloreNgo = (ngo = {}) => {
  const addressDetails = ngo.addressDetails && typeof ngo.addressDetails === 'object' ? ngo.addressDetails : {};
  const candidates = [
    ngo.address,
    ngo.location,
    addressDetails.district,
    addressDetails.city,
    addressDetails.landmark,
    ...(toSafeArray(ngo.geographies)),
    ...(toSafeArray(ngo.offices))
  ];
  return candidates.some((entry) => containsBangaloreMarker(entry));
};

const computeCompletenessScore = (ngo = {}) => {
  const checks = {
    registrationId: Boolean(toSafeText(ngo.registrationId, 120)),
    helplineNumber: Boolean(toSafeText(ngo.helplineNumber, 40)),
    contactEmail: Boolean(toSafeText(ngo.email, 180)),
    address:
      Boolean(toSafeText(ngo.address, 300)) ||
      Boolean(toSafeText(ngo.addressDetails?.district, 80)) ||
      Boolean(toSafeText(ngo.addressDetails?.city, 80)),
    category: toSafeArray(ngo.categories).filter(Boolean).length > 0 || Boolean(toSafeText(ngo.category, 80)),
    description: toSafeText(ngo.description).length >= 80,
    mission: toSafeText(ngo.mission).length >= 40,
    about: toSafeText(ngo.about).length >= 80,
    verificationDocs: toSafeArray(ngo.verificationDocs).length > 0
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
};

const unique = (items = []) => [...new Set((items || []).filter(Boolean))];

const queryIdList = async (sql, params = []) => {
  const { rows } = await query(sql, params);
  return unique(rows.map((row) => String(row.external_id || '').trim()).filter(Boolean));
};

const deleteByExternalIds = async (tableName, ids = []) => {
  const normalized = unique(ids.map((id) => String(id || '').trim()).filter(Boolean));
  if (!normalized.length) return 0;
  const result = await query(`DELETE FROM ${tableName} WHERE external_id = ANY($1::text[])`, [normalized]);
  return Number(result.rowCount || 0);
};

const deleteGenericTableByNgoCampaignRefs = async (tableName, ngoIds = [], campaignIds = []) => {
  if (!ngoIds.length && !campaignIds.length) return 0;

  const result = await query(
    `
    DELETE FROM ${tableName}
    WHERE
      (
        COALESCE(NULLIF(source_doc->>'ngoId', ''), '') = ANY($1::text[])
        OR COALESCE(NULLIF(source_doc->>'recipientNgoId', ''), '') = ANY($1::text[])
        OR COALESCE(NULLIF(source_doc->>'fromNGO', ''), '') = ANY($1::text[])
        OR COALESCE(NULLIF(source_doc->>'toNGO', ''), '') = ANY($1::text[])
        OR (
          CASE
            WHEN jsonb_typeof(source_doc->'ngo') = 'string' THEN NULLIF(source_doc->>'ngo', '')
            WHEN jsonb_typeof(source_doc->'ngo') = 'object' THEN NULLIF(source_doc#>>'{ngo,id}', '')
            ELSE NULL
          END
        ) = ANY($1::text[])
        OR (
          LOWER(COALESCE(NULLIF(source_doc->>'targetType', ''), ''))
          = 'ngo'
          AND COALESCE(NULLIF(source_doc->>'targetId', ''), '') = ANY($1::text[])
        )
      )
      OR
      (
        COALESCE(NULLIF(source_doc->>'campaignId', ''), '') = ANY($2::text[])
        OR (
          CASE
            WHEN jsonb_typeof(source_doc->'campaign') = 'string' THEN NULLIF(source_doc->>'campaign', '')
            WHEN jsonb_typeof(source_doc->'campaign') = 'object' THEN NULLIF(source_doc#>>'{campaign,id}', '')
            ELSE NULL
          END
        ) = ANY($2::text[])
        OR (
          LOWER(COALESCE(NULLIF(source_doc->>'targetType', ''), ''))
          = 'campaign'
          AND COALESCE(NULLIF(source_doc->>'targetId', ''), '') = ANY($2::text[])
        )
      )
    `,
    [ngoIds, campaignIds]
  );
  return Number(result.rowCount || 0);
};

const buildNewBangaloreNgoSeeds = () => {
  return [
    {
      name: 'Bengaluru Youth Nutrition Network',
      email: `bynn.${runId}@ngo.org`,
      registrationId: `NGO-KA-BYNN-${runId}`,
      helplineNumber: '9000001101',
      category: 'Food',
      categories: ['Food', 'Children', 'Education'],
      address: 'Sampige Road, Malleswaram, Bengaluru, Karnataka 560003',
      addressDetails: {
        houseNumber: '12/3',
        landmark: 'Near Malleswaram Circle',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560003'
      },
      mission: 'To eliminate youth hunger in urban low-income communities through school and neighbourhood nutrition programs.',
      vision: 'No child in Bengaluru should study on an empty stomach.',
      description:
        'The network operates decentralised meal support hubs, school breakfast support, and weekend nutrition outreach in Bengaluru wards with high food insecurity.',
      about:
        'The organisation coordinates volunteers, nutrition experts, and community kitchens to deliver balanced meals and food education modules. It tracks attendance, health indicators, and household food stability outcomes.',
      geographies: ['Malleshwaram', 'Rajajinagar', 'Yeshwanthpur', 'Hebbal'],
      offices: ['Malleswaram Field Office', 'Rajajinagar Distribution Hub'],
      website: 'https://www.bynn.org',
      orgStrength: 86,
      impactMetrics: [
        '14,500 meals delivered monthly across Bengaluru',
        '96% on-time school breakfast coverage in partner schools',
        '220 active ward volunteers'
      ],
      programs: [
        { name: 'School Breakfast Support', area: 'Bengaluru Urban', since: 2021 },
        { name: 'Neighbourhood Nutrition Outreach', area: 'Bengaluru Urban', since: 2022 }
      ],
      leadership: [
        { name: 'Anupama R', role: 'Executive Director', linkedin: 'https://www.linkedin.com' },
        { name: 'Sandeep V', role: 'Head of Community Operations', linkedin: 'https://www.linkedin.com' }
      ],
      teamStrengthList: [
        { role: 'Volunteer Network', count: 42, contribution: 'Coordinates school and community volunteers for meal logistics.' },
        { role: 'Program Management', count: 18, contribution: 'Tracks nutrition targets and program delivery milestones.' },
        { role: 'Field Operations', count: 21, contribution: 'Executes distribution and beneficiary verification workflows.' },
        { role: 'Finance & Compliance', count: 9, contribution: 'Maintains audit-ready meal funding and utilisation reports.' }
      ]
    },
    {
      name: 'Namma Community Learning Trust',
      email: `nclt.${runId}@ngo.org`,
      registrationId: `NGO-KA-NCLT-${runId}`,
      helplineNumber: '9000001102',
      category: 'Education',
      categories: ['Education', 'Youth Development', 'Digital Literacy'],
      address: '12th Main, Indiranagar, Bengaluru, Karnataka 560038',
      addressDetails: {
        houseNumber: '88',
        landmark: 'Near CMH Road Metro',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560038'
      },
      mission: 'To improve foundational learning and digital readiness for first-generation learners in Bengaluru.',
      vision: 'Every learner in Bengaluru has access to high-quality supplementary education support.',
      description:
        'Namma Community Learning Trust runs after-school learning labs, digital literacy bootcamps, and mentorship support for adolescents across Bengaluru.',
      about:
        'The trust works with government schools, resident groups, and volunteer mentors to improve foundational literacy, numeracy, and technology confidence. It tracks class attendance, grade progression, and transition to higher education.',
      geographies: ['Indiranagar', 'Ulsoor', 'Domlur', 'CV Raman Nagar'],
      offices: ['Indiranagar Learning Center', 'Domlur Volunteer Desk'],
      website: 'https://www.ncltrust.org',
      orgStrength: 74,
      impactMetrics: [
        '2,800 learners enrolled in supplementary labs',
        '89% learner retention over academic cycle',
        '610 volunteers and mentors onboarded'
      ],
      programs: [
        { name: 'After-School Learning Labs', area: 'Bengaluru Urban', since: 2020 },
        { name: 'Digital Foundations Cohort', area: 'Bengaluru Urban', since: 2023 }
      ],
      leadership: [
        { name: 'Ritika P', role: 'Managing Trustee', linkedin: 'https://www.linkedin.com' },
        { name: 'Harsha M', role: 'Director of Academics', linkedin: 'https://www.linkedin.com' }
      ],
      teamStrengthList: [
        { role: 'Program Management', count: 16, contribution: 'Designs curriculum delivery milestones and mentorship targets.' },
        { role: 'Volunteer Network', count: 31, contribution: 'Mobilises mentors and classroom support volunteers.' },
        { role: 'Field Operations', count: 14, contribution: 'Runs classroom operations and parent engagement sessions.' },
        { role: 'Partnerships & Fundraising', count: 13, contribution: 'Builds school and CSR partnerships for scaling.' }
      ]
    },
    {
      name: 'Bengaluru Public Health Collective',
      email: `bphc.${runId}@ngo.org`,
      registrationId: `NGO-KA-BPHC-${runId}`,
      helplineNumber: '9000001103',
      category: 'Health',
      categories: ['Health', 'Public Health', 'Community Outreach'],
      address: 'ITPL Main Road, Whitefield, Bengaluru, Karnataka 560066',
      addressDetails: {
        houseNumber: '301',
        landmark: 'Near Hoodi Junction',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560066'
      },
      mission: 'To deliver preventive and primary health services in underserved Bengaluru clusters.',
      vision: 'Community-first healthcare access for all neighbourhoods in Bengaluru.',
      description:
        'The collective coordinates mobile clinics, preventive screening camps, and referral pathways for chronic disease management in Bengaluru.',
      about:
        'It works with ward health workers, hospitals, and volunteers to provide early screening, community follow-up, and reliable referrals. The model emphasises continuity of care, awareness sessions, and data-backed community health planning.',
      geographies: ['Whitefield', 'Mahadevapura', 'KR Puram', 'Marathahalli'],
      offices: ['Whitefield Health Operations Center'],
      website: 'https://www.bphcollective.org',
      orgStrength: 68,
      impactMetrics: [
        '9,100 preventive screenings conducted annually',
        '74% referral adherence in partner wards',
        '150 health volunteers trained'
      ],
      programs: [
        { name: 'Mobile Community Health Camps', area: 'Bengaluru Urban', since: 2021 },
        { name: 'Chronic Care Referral Program', area: 'Bengaluru Urban', since: 2022 }
      ],
      leadership: [
        { name: 'Dr. Kavya N', role: 'Medical Director', linkedin: 'https://www.linkedin.com' },
        { name: 'Prateek S', role: 'Head of Outreach', linkedin: 'https://www.linkedin.com' }
      ],
      teamStrengthList: [
        { role: 'Field Operations', count: 19, contribution: 'Conducts camps, screenings, and beneficiary follow-up.' },
        { role: 'Program Management', count: 14, contribution: 'Tracks health outreach outcomes and referral metrics.' },
        { role: 'Volunteer Network', count: 20, contribution: 'Coordinates local health volunteers and camp support.' },
        { role: 'Finance & Compliance', count: 8, contribution: 'Ensures healthcare reporting and compliance records.' }
      ]
    },
    {
      name: 'Green Bengaluru Circular Economy Forum',
      email: `gbcef.${runId}@ngo.org`,
      registrationId: `NGO-KA-GBCEF-${runId}`,
      helplineNumber: '9000001104',
      category: 'Environment',
      categories: ['Environment', 'Waste Management', 'Sustainability'],
      address: 'Outer Ring Road, Bellandur, Bengaluru, Karnataka 560103',
      addressDetails: {
        houseNumber: '44',
        landmark: 'Near Bellandur Lake',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560103'
      },
      mission: 'To accelerate circular waste practices and citizen-led environmental stewardship in Bengaluru.',
      vision: 'A cleaner, resource-efficient Bengaluru driven by community participation.',
      description:
        'The forum leads ward-level waste segregation campaigns, lake clean-up coordination, and decentralised recycling systems in Bengaluru.',
      about:
        'It partners with waste workers, citizen groups, and local authorities to improve segregation quality and reduce landfill dependency. The forum publishes monthly impact dashboards and supports community champions.',
      geographies: ['Bellandur', 'Sarjapur Road', 'HSR Layout', 'Kadubeesanahalli'],
      offices: ['Bellandur Circular Economy Hub'],
      website: 'https://www.gbcef.org',
      orgStrength: 79,
      impactMetrics: [
        '52 wards covered with segregation awareness drives',
        '1,900+ tonnes diverted from mixed waste streams',
        '110 resident communities onboarded'
      ],
      programs: [
        { name: 'Ward Segregation Champions', area: 'Bengaluru Urban', since: 2020 },
        { name: 'Lake Edge Clean-up Network', area: 'Bengaluru Urban', since: 2021 }
      ],
      leadership: [
        { name: 'Megha T', role: 'Executive Director', linkedin: 'https://www.linkedin.com' },
        { name: 'Nirmal B', role: 'Head of Circular Programs', linkedin: 'https://www.linkedin.com' }
      ],
      teamStrengthList: [
        { role: 'Volunteer Network', count: 36, contribution: 'Mobilises citizen volunteers and ward champions.' },
        { role: 'Field Operations', count: 17, contribution: 'Executes clean-up logistics and segregation audits.' },
        { role: 'Partnerships & Fundraising', count: 12, contribution: 'Builds ward-level partnerships and sponsorship support.' },
        { role: 'Leadership & Governance', count: 8, contribution: 'Provides strategy and policy-level governance guidance.' }
      ]
    }
  ];
};

const buildCampaignSeed = (ngo) => [
  {
    id: generateId(),
    ngo: ngo.id,
    title: `${ngo.name} - Ward Impact Drive`,
    description: `Community-focused intervention by ${ngo.name} across Bengaluru wards with transparent impact tracking.`,
    category: ngo.category || ngo.categories?.[0] || 'General',
    location: 'Bengaluru, Karnataka',
    goalAmount: 750000,
    currentAmount: 126000,
    status: 'active',
    image: `https://picsum.photos/seed/${encodeURIComponent(`${ngo.id}-ward`)}/1280/800`,
    volunteersNeeded: ['Field Outreach', 'Community Mobilization', 'Data Collection'],
    updates: [],
    contributors: [],
    raisedAmount: 126000
  },
  {
    id: generateId(),
    ngo: ngo.id,
    title: `${ngo.name} - Volunteer Capacity Sprint`,
    description: `Volunteer onboarding, training, and service delivery support initiative by ${ngo.name}.`,
    category: ngo.category || ngo.categories?.[0] || 'General',
    location: 'Bengaluru, Karnataka',
    goalAmount: 420000,
    currentAmount: 84000,
    status: 'active',
    image: `https://picsum.photos/seed/${encodeURIComponent(`${ngo.id}-volunteer`)}/1280/800`,
    volunteersNeeded: ['Volunteer Training', 'Program Support', 'Communications'],
    updates: [],
    contributors: [],
    raisedAmount: 84000
  }
];

const buildOpportunitySeed = (ngo) => ({
  id: generateId(),
  ngo: ngo.id,
  title: `${ngo.name} Community Volunteer Shift`,
  description: `Structured volunteer shift to support ${ngo.name} programs in Bengaluru.`,
  location: 'Bengaluru, Karnataka',
  skills: ['Community Outreach', 'Documentation', 'Coordination'],
  skillsRequired: ['Community Outreach', 'Documentation', 'Coordination'],
  timeCommitmentHours: 3,
  isMicroVolunteer: true,
  applicants: []
});

const writeReport = async (report) => {
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `bangalore_data_curation_report_${runId}.json`);
  const mdPath = path.join(reportDir, `bangalore_data_curation_report_${runId}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Bangalore Data Curation Report',
    '',
    `- Run ID: ${runId}`,
    `- Timestamp: ${report.generatedAt}`,
    '',
    '## Cleanup Summary',
    `- NGOs removed: ${report.cleanup.removedNgoCount}`,
    `- Related rows removed: ${report.cleanup.relatedRowsDeleted}`,
    '',
    '## Created Bangalore NGOs',
    ...report.created.ngos.map((ngo, index) => `- ${index + 1}. ${ngo.name} (${ngo.id}) - ${ngo.email}`),
    '',
    '## Created Campaigns',
    ...report.created.campaigns.map((campaign, index) => `- ${index + 1}. ${campaign.title} (${campaign.id}) [ngo=${campaign.ngoId}]`),
    '',
    '## Created Volunteer Opportunities',
    ...report.created.opportunities.map((item, index) => `- ${index + 1}. ${item.title} (${item.id}) [ngo=${item.ngoId}]`)
  ];

  await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  return { jsonPath, mdPath };
};

const main = async () => {
  await connectDB(process.env.POSTGRES_URL || process.env.DATABASE_URL);

  const report = {
    runId,
    generatedAt: nowIso(),
    criteria: {
      requiredBangalore: true,
      minimumCompletenessScore: 6
    },
    cleanup: {
      removedNgoCount: 0,
      removedNgoIds: [],
      removedNgoNames: [],
      relatedRowsDeleted: 0,
      tableDeleteCounts: {}
    },
    created: {
      ngos: [],
      campaigns: [],
      opportunities: []
    }
  };

  const ngos = await NGO.find().sort({ createdAt: -1 });
  const removable = [];
  for (const ngo of ngos) {
    const doc = ngo && typeof ngo.toObject === 'function' ? ngo.toObject() : { ...(ngo || {}) };
    const { score } = computeCompletenessScore(doc);
    const bangalore = isBangaloreNgo(doc);
    if (!bangalore || score < 6) {
      removable.push({
        id: String(doc.id || ''),
        name: toSafeText(doc.name, 180) || 'NGO',
        score,
        bangalore
      });
    }
  }

  const removeNgoIds = unique(removable.map((item) => item.id).filter(Boolean));
  report.cleanup.removedNgoCount = removeNgoIds.length;
  report.cleanup.removedNgoIds = removeNgoIds;
  report.cleanup.removedNgoNames = removable.map((item) => item.name);

  let campaignIdsToDelete = [];
  let opportunityIdsToDelete = [];
  let applicationIdsToDelete = [];
  let donationIdsToDelete = [];
  let certificateIdsToDelete = [];

  if (removeNgoIds.length > 0) {
    campaignIdsToDelete = await queryIdList(
      `
      SELECT external_id
      FROM campaigns_rel
      WHERE (
        CASE
          WHEN jsonb_typeof(source_doc->'ngo') = 'string' THEN NULLIF(source_doc->>'ngo', '')
          WHEN jsonb_typeof(source_doc->'ngo') = 'object' THEN NULLIF(source_doc#>>'{ngo,id}', '')
          ELSE NULL
        END
      ) = ANY($1::text[])
      OR COALESCE(NULLIF(source_doc->>'ngoId', ''), '') = ANY($1::text[])
      `,
      [removeNgoIds]
    );

    opportunityIdsToDelete = await queryIdList(
      `
      SELECT external_id
      FROM volunteer_opportunities_rel
      WHERE (
        CASE
          WHEN jsonb_typeof(source_doc->'ngo') = 'string' THEN NULLIF(source_doc->>'ngo', '')
          WHEN jsonb_typeof(source_doc->'ngo') = 'object' THEN NULLIF(source_doc#>>'{ngo,id}', '')
          ELSE NULL
        END
      ) = ANY($1::text[])
      OR COALESCE(NULLIF(source_doc->>'campaignId', ''), '') = ANY($2::text[])
      OR (
        CASE
          WHEN jsonb_typeof(source_doc->'campaign') = 'string' THEN NULLIF(source_doc->>'campaign', '')
          WHEN jsonb_typeof(source_doc->'campaign') = 'object' THEN NULLIF(source_doc#>>'{campaign,id}', '')
          ELSE NULL
        END
      ) = ANY($2::text[])
      `,
      [removeNgoIds, campaignIdsToDelete]
    );

    applicationIdsToDelete = await queryIdList(
      `
      SELECT external_id
      FROM volunteer_applications_rel
      WHERE (
        CASE
          WHEN jsonb_typeof(source_doc->'ngo') = 'string' THEN NULLIF(source_doc->>'ngo', '')
          WHEN jsonb_typeof(source_doc->'ngo') = 'object' THEN NULLIF(source_doc#>>'{ngo,id}', '')
          ELSE NULL
        END
      ) = ANY($1::text[])
      OR (
        CASE
          WHEN jsonb_typeof(source_doc->'opportunity') = 'string' THEN NULLIF(source_doc->>'opportunity', '')
          WHEN jsonb_typeof(source_doc->'opportunity') = 'object' THEN NULLIF(source_doc#>>'{opportunity,id}', '')
          ELSE NULL
        END
      ) = ANY($2::text[])
      OR COALESCE(NULLIF(source_doc->>'campaignId', ''), '') = ANY($3::text[])
      `,
      [removeNgoIds, opportunityIdsToDelete, campaignIdsToDelete]
    );

    donationIdsToDelete = await queryIdList(
      `
      SELECT external_id
      FROM donations_rel
      WHERE (
        CASE
          WHEN jsonb_typeof(source_doc->'ngo') = 'string' THEN NULLIF(source_doc->>'ngo', '')
          WHEN jsonb_typeof(source_doc->'ngo') = 'object' THEN NULLIF(source_doc#>>'{ngo,id}', '')
          ELSE NULL
        END
      ) = ANY($1::text[])
      OR (
        CASE
          WHEN jsonb_typeof(source_doc->'campaign') = 'string' THEN NULLIF(source_doc->>'campaign', '')
          WHEN jsonb_typeof(source_doc->'campaign') = 'object' THEN NULLIF(source_doc#>>'{campaign,id}', '')
          ELSE NULL
        END
      ) = ANY($2::text[])
      `,
      [removeNgoIds, campaignIdsToDelete]
    );

    certificateIdsToDelete = await queryIdList(
      `
      SELECT external_id
      FROM certificates_rel
      WHERE (
        CASE
          WHEN jsonb_typeof(source_doc->'ngo') = 'string' THEN NULLIF(source_doc->>'ngo', '')
          WHEN jsonb_typeof(source_doc->'ngo') = 'object' THEN NULLIF(source_doc#>>'{ngo,id}', '')
          ELSE NULL
        END
      ) = ANY($1::text[])
      OR COALESCE(NULLIF(source_doc->>'donation', ''), '') = ANY($2::text[])
      OR COALESCE(NULLIF(source_doc->>'volunteerApplication', ''), '') = ANY($3::text[])
      `,
      [removeNgoIds, donationIdsToDelete, applicationIdsToDelete]
    );

    const tableDeleteCounts = {};
    tableDeleteCounts.certificates_rel = await deleteByExternalIds('certificates_rel', certificateIdsToDelete);
    tableDeleteCounts.volunteer_applications_rel = await deleteByExternalIds('volunteer_applications_rel', applicationIdsToDelete);
    tableDeleteCounts.donations_rel = await deleteByExternalIds('donations_rel', donationIdsToDelete);
    tableDeleteCounts.volunteer_opportunities_rel = await deleteByExternalIds('volunteer_opportunities_rel', opportunityIdsToDelete);
    tableDeleteCounts.campaigns_rel = await deleteByExternalIds('campaigns_rel', campaignIdsToDelete);

    const directDeletes = await Promise.all([
      query(
        `
        DELETE FROM help_requests_rel
        WHERE (
          CASE
            WHEN jsonb_typeof(source_doc->'ngo') = 'string' THEN NULLIF(source_doc->>'ngo', '')
            WHEN jsonb_typeof(source_doc->'ngo') = 'object' THEN NULLIF(source_doc#>>'{ngo,id}', '')
            ELSE NULL
          END
        ) = ANY($1::text[])
        `,
        [removeNgoIds]
      ),
      query(
        `
        DELETE FROM messages_rel
        WHERE COALESCE(NULLIF(source_doc->>'fromNGO', ''), '') = ANY($1::text[])
           OR COALESCE(NULLIF(source_doc->>'toNGO', ''), '') = ANY($1::text[])
        `,
        [removeNgoIds]
      ),
      query(
        `
        DELETE FROM notifications_rel
        WHERE COALESCE(NULLIF(source_doc->>'recipientNgoId', ''), '') = ANY($1::text[])
           OR COALESCE(NULLIF(source_doc->>'ngoId', ''), '') = ANY($1::text[])
           OR COALESCE(NULLIF(source_doc->>'campaignId', ''), '') = ANY($2::text[])
        `,
        [removeNgoIds, campaignIdsToDelete]
      ),
      query(
        `
        DELETE FROM flag_requests_rel
        WHERE (
          LOWER(COALESCE(NULLIF(source_doc->>'targetType', ''), '')) = 'ngo'
          AND COALESCE(NULLIF(source_doc->>'targetId', ''), '') = ANY($1::text[])
        )
        OR (
          LOWER(COALESCE(NULLIF(source_doc->>'targetType', ''), '')) = 'campaign'
          AND COALESCE(NULLIF(source_doc->>'targetId', ''), '') = ANY($2::text[])
        )
        `,
        [removeNgoIds, campaignIdsToDelete]
      )
    ]);

    tableDeleteCounts.help_requests_rel = Number(directDeletes[0].rowCount || 0);
    tableDeleteCounts.messages_rel = Number(directDeletes[1].rowCount || 0);
    tableDeleteCounts.notifications_rel = Number(directDeletes[2].rowCount || 0);
    tableDeleteCounts.flag_requests_rel = Number(directDeletes[3].rowCount || 0);

    // Extra cleanup for innovation and auxiliary tables that may carry ngoId/campaignId in source_doc.
    const { rows: sourceDocTables } = await query(
      `
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'source_doc'
        AND table_name LIKE '%\\_rel'
      `
    );
    const skipTables = new Set([
      'ngos_rel',
      'campaigns_rel',
      'volunteer_opportunities_rel',
      'volunteer_applications_rel',
      'donations_rel',
      'certificates_rel',
      'help_requests_rel',
      'messages_rel',
      'notifications_rel',
      'flag_requests_rel'
    ]);

    for (const row of sourceDocTables) {
      const tableName = String(row.table_name || '').trim();
      if (!tableName || skipTables.has(tableName)) continue;
      const deletedCount = await deleteGenericTableByNgoCampaignRefs(tableName, removeNgoIds, campaignIdsToDelete);
      if (deletedCount > 0) tableDeleteCounts[tableName] = deletedCount;
    }

    const ngoDeleteResult = await query(`DELETE FROM ngos_rel WHERE external_id = ANY($1::text[])`, [removeNgoIds]);
    tableDeleteCounts.ngos_rel = Number(ngoDeleteResult.rowCount || 0);
    report.cleanup.tableDeleteCounts = tableDeleteCounts;
    report.cleanup.relatedRowsDeleted = Object.values(tableDeleteCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  const hashedPassword = await bcrypt.hash('password123', 10);
  const newNgos = buildNewBangaloreNgoSeeds();

  for (const seed of newNgos) {
    const ngoId = generateId();
    const verificationDocs = [
      `uploads/mock_docs/${ngoId}_registration.pdf`,
      `uploads/mock_docs/${ngoId}_tax_exemption.pdf`
    ];

    const ngo = await NGO.create({
      id: ngoId,
      name: seed.name,
      email: seed.email,
      password: hashedPassword,
      role: 'ngo',
      verified: false,
      verificationStatus: 'pending',
      flagged: false,
      isActive: true,
      registrationId: seed.registrationId,
      helplineNumber: seed.helplineNumber,
      category: seed.category,
      categories: seed.categories,
      address: seed.address,
      addressDetails: seed.addressDetails,
      mission: seed.mission,
      vision: seed.vision,
      description: seed.description,
      about: seed.about,
      website: seed.website,
      geographies: seed.geographies,
      offices: seed.offices,
      orgStrength: seed.orgStrength,
      impactMetrics: seed.impactMetrics,
      programs: seed.programs,
      leadership: seed.leadership,
      teamStrengthList: seed.teamStrengthList,
      members: [],
      verificationDocs,
      verificationHistory: [
        {
          id: generateId(),
          action: 'submitted',
          decidedAt: nowIso(),
          decidedBy: ngoId,
          note: 'Initial Bangalore rich-profile registration submitted for admin review.'
        }
      ]
    });

    report.created.ngos.push({
      id: ngo.id,
      name: ngo.name,
      email: ngo.email,
      registrationId: ngo.registrationId
    });

    const campaignSeeds = buildCampaignSeed(ngo);
    for (const campaignSeed of campaignSeeds) {
      const campaign = await Campaign.create(campaignSeed);
      report.created.campaigns.push({
        id: campaign.id,
        title: campaign.title,
        ngoId: ngo.id
      });
    }

    const opportunitySeed = buildOpportunitySeed(ngo);
    const opportunity = await VolunteerOpportunity.create(opportunitySeed);
    report.created.opportunities.push({
      id: opportunity.id,
      title: opportunity.title,
      ngoId: ngo.id
    });
  }

  const reportPaths = await writeReport(report);
  console.log(`Run ID: ${runId}`);
  console.log(`Removed NGOs: ${report.cleanup.removedNgoCount}`);
  console.log(`Created NGOs: ${report.created.ngos.length}`);
  console.log(`Created campaigns: ${report.created.campaigns.length}`);
  console.log(`Created opportunities: ${report.created.opportunities.length}`);
  console.log(`JSON report: ${path.relative(rootDir, reportPaths.jsonPath)}`);
  console.log(`Markdown report: ${path.relative(rootDir, reportPaths.mdPath)}`);
};

main().catch((err) => {
  console.error('bangaloreDataCuration failed:', err);
  process.exitCode = 1;
});
