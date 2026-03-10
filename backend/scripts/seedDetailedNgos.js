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
const { generateId } = require('../src/db/id');
const { close } = require('../src/db/postgres');

const rootDir = path.resolve(__dirname, '..', '..');
const reportDir = path.join(rootDir, 'docs', 'test-reports');

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const NOW_ISO = () => new Date().toISOString();
const DEFAULT_COUNT = 15;
const NGO_COUNT = Math.max(Number(process.env.DETAILED_NGO_COUNT) || DEFAULT_COUNT, 1);
const DEFAULT_PASSWORD = process.env.DETAILED_NGO_PASSWORD || 'password123';

const ROLE_DISTRIBUTION = [
  { role: 'Volunteer Network', ratio: 0.31, contribution: 'Mobilizes volunteers and coordinates community outreach drives.' },
  { role: 'Field Operations', ratio: 0.24, contribution: 'Executes ground implementation and quality checks for beneficiaries.' },
  { role: 'Program Management', ratio: 0.19, contribution: 'Tracks milestones, outcomes, and delivery timelines.' },
  { role: 'Partnerships & Fundraising', ratio: 0.12, contribution: 'Builds donor, CSR, and partner relationships to scale programs.' },
  { role: 'Leadership & Governance', ratio: 0.08, contribution: 'Sets strategic direction and governance guardrails.' },
  { role: 'Finance & Compliance', ratio: 0.06, contribution: 'Maintains utilization reports, audits, and statutory compliance.' }
];

const TASK_BANK = [
  'Strategic Planning',
  'Community Mobilization',
  'Field Monitoring',
  'Donor Reporting',
  'Volunteer Coordination',
  'Program Review',
  'Impact Measurement',
  'Stakeholder Engagement'
];

const TAG_BANK = ['nutrition', 'education', 'health', 'livelihood', 'environment', 'inclusion'];

const TEMPLATE_NGOS = [
  {
    code: 'bmcc',
    name: 'Bengaluru Midday Care Collective',
    category: 'Food',
    categories: ['Food', 'Children', 'Education'],
    locality: 'Rajajinagar',
    landmark: 'Near ISKCON Metro',
    pincode: '560010',
    focus: 'school meal reliability and neighborhood nutrition access'
  },
  {
    code: 'rsnm',
    name: 'Rajajinagar School Nutrition Mission',
    category: 'Food',
    categories: ['Food', 'School Support', 'Children'],
    locality: 'Rajajinagar',
    landmark: 'Near Bashyam Circle',
    pincode: '560010',
    focus: 'nutrition continuity for government-school learners'
  },
  {
    code: 'kylc',
    name: 'Koramangala Youth Learning Collective',
    category: 'Education',
    categories: ['Education', 'Youth Development', 'Digital Literacy'],
    locality: 'Koramangala',
    landmark: 'Near Forum Signal',
    pincode: '560034',
    focus: 'after-school learning and digital fluency for adolescents'
  },
  {
    code: 'what',
    name: 'Whitefield Health Access Trust',
    category: 'Health',
    categories: ['Health', 'Public Health', 'Community Outreach'],
    locality: 'Whitefield',
    landmark: 'Near Hope Farm',
    pincode: '560066',
    focus: 'preventive healthcare screening and referral follow-through'
  },
  {
    code: 'hcwn',
    name: 'HSR Community Wellness Network',
    category: 'Health',
    categories: ['Health', 'Wellness', 'Women & Children'],
    locality: 'HSR Layout',
    landmark: 'Near BDA Complex',
    pincode: '560102',
    focus: 'community wellness and maternal-child health counseling'
  },
  {
    code: 'jscf',
    name: 'Jayanagar Senior Care Foundation',
    category: 'Elder Care',
    categories: ['Elder Care', 'Health', 'Community'],
    locality: 'Jayanagar',
    landmark: 'Near 4th Block Complex',
    pincode: '560041',
    focus: 'elder care access, medicine support, and home visits'
  },
  {
    code: 'iwlf',
    name: 'Indiranagar Women Livelihood Forum',
    category: 'Women Empowerment',
    categories: ['Women Empowerment', 'Livelihood', 'Skill Development'],
    locality: 'Indiranagar',
    landmark: 'Near CMH Road Metro',
    pincode: '560038',
    focus: 'income pathways and enterprise readiness for women'
  },
  {
    code: 'yssb',
    name: 'Yeshwanthpur Skills Bridge',
    category: 'Skill Development',
    categories: ['Skill Development', 'Employment', 'Youth Development'],
    locality: 'Yeshwanthpur',
    landmark: 'Near Metro Station',
    pincode: '560022',
    focus: 'job readiness and placement-linked skilling for youth'
  },
  {
    code: 'hlgc',
    name: 'Hebbal Lake Guardians Collective',
    category: 'Environment',
    categories: ['Environment', 'Water Conservation', 'Community'],
    locality: 'Hebbal',
    landmark: 'Near Lake View Point',
    pincode: '560024',
    focus: 'lake restoration and citizen stewardship'
  },
  {
    code: 'ecde',
    name: 'Electronic City Digital Education Trust',
    category: 'Education',
    categories: ['Education', 'Digital Literacy', 'Youth Development'],
    locality: 'Electronic City',
    landmark: 'Near Infosys Gate 1',
    pincode: '560100',
    focus: 'digital education and maker labs for school students'
  },
  {
    code: 'bcsi',
    name: 'Basavanagudi Child Safety Initiative',
    category: 'Child Welfare',
    categories: ['Child Welfare', 'Education', 'Protection'],
    locality: 'Basavanagudi',
    landmark: 'Near Gandhi Bazaar',
    pincode: '560004',
    focus: 'child protection awareness and school safety workflows'
  },
  {
    code: 'mcrn',
    name: 'Malleshwaram Civic Relief Network',
    category: 'Relief',
    categories: ['Relief', 'Food', 'Community'],
    locality: 'Malleshwaram',
    landmark: 'Near 8th Cross',
    pincode: '560003',
    focus: 'rapid civic relief and household support coordination'
  },
  {
    code: 'bdif',
    name: 'Banashankari Disability Inclusion Foundation',
    category: 'Disability Support',
    categories: ['Disability Support', 'Education', 'Livelihood'],
    locality: 'Banashankari',
    landmark: 'Near BDA Complex',
    pincode: '560070',
    focus: 'inclusive services, assistive support, and livelihood pathways'
  },
  {
    code: 'mmsc',
    name: 'Marathahalli Migrant Support Collective',
    category: 'Social Welfare',
    categories: ['Social Welfare', 'Livelihood', 'Legal Aid'],
    locality: 'Marathahalli',
    landmark: 'Near Multiplex Junction',
    pincode: '560037',
    focus: 'migrant family support, legal awareness, and social access'
  },
  {
    code: 'kgnm',
    name: 'KR Puram Green Neighbourhood Mission',
    category: 'Environment',
    categories: ['Environment', 'Waste Management', 'Community'],
    locality: 'KR Puram',
    landmark: 'Near Tin Factory',
    pincode: '560036',
    focus: 'decentralized waste segregation and neighborhood climate action'
  }
];

const unique = (items = []) => [...new Set(items.filter(Boolean))];

const buildTeamStrengthList = (orgStrength, focus) => {
  const raw = ROLE_DISTRIBUTION.map((item) => ({
    ...item,
    count: Math.max(2, Math.floor(orgStrength * item.ratio))
  }));
  let allocated = raw.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;

  while (allocated < orgStrength) {
    raw[cursor % raw.length].count += 1;
    allocated += 1;
    cursor += 1;
  }
  while (allocated > orgStrength) {
    const target = raw[cursor % raw.length];
    if (target.count > 2) {
      target.count -= 1;
      allocated -= 1;
    }
    cursor += 1;
  }

  return raw.map((item) => ({
    role: item.role,
    count: item.count,
    contribution: `${item.contribution} Focus: ${focus}.`
  }));
};

const buildLeadership = (template, idx) => ([
  { name: `Asha ${idx} R`, role: 'Executive Director', linkedin: 'https://www.linkedin.com' },
  { name: `Vikram ${idx} N`, role: 'Program Director', linkedin: 'https://www.linkedin.com' }
]);

const buildPrograms = (template) => ([
  { name: `${template.locality} Core Program`, area: 'Bengaluru Urban', since: 2021 },
  { name: `${template.locality} Community Expansion`, area: 'Bengaluru Urban', since: 2023 }
]);

const buildImpactMetrics = (orgStrength, idx) => ([
  `${(3200 + idx * 170).toLocaleString('en-IN')} beneficiaries supported in the last 12 months`,
  `${(85 + (idx % 10)).toFixed(1)}% on-time delivery compliance across active initiatives`,
  `${(orgStrength * 2 + idx * 3).toLocaleString('en-IN')} recurring volunteers activated`
]);

const buildCampaigns = (ngo, template, idx) => {
  const baseDate = Date.now();
  return [1, 2, 3].map((campaignIndex) => {
    const startDate = new Date(baseDate - campaignIndex * 10 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(baseDate + (45 + campaignIndex * 15) * 24 * 60 * 60 * 1000).toISOString();
    return {
      id: generateId(),
      ngo: ngo.id,
      title: `${template.name} Impact Drive ${campaignIndex}`,
      description: `${template.name} campaign ${campaignIndex} focused on ${template.focus} across ${template.locality} and nearby wards.`,
      image: `https://picsum.photos/seed/${encodeURIComponent(`${ngo.id}-campaign-${campaignIndex}`)}/1280/720`,
      category: template.category,
      location: `Bengaluru - ${template.locality}`,
      area: 'Bengaluru Urban',
      goalAmount: 450000 + idx * 15000 + campaignIndex * 50000,
      currentAmount: 90000 + idx * 7000 + campaignIndex * 11000,
      volunteersNeeded: ['Field Outreach', 'Documentation', 'Community Mobilization'],
      highlights: ['Transparent fund utilization', 'Ward-level tracking', 'Volunteer-led execution'],
      timeline: { startDate, endDate },
      tags: unique(['bangalore', TAG_BANK[(idx + campaignIndex) % TAG_BANK.length], `run-${RUN_ID}`]),
      updates: [],
      raisedAmount: 90000 + idx * 7000 + campaignIndex * 11000
    };
  });
};

const buildOpportunities = (ngo, template, idx) => ([
  {
    id: generateId(),
    ngo: ngo.id,
    title: `${template.name} Weekend Volunteer Shift`,
    description: `Weekend field shift supporting ${template.focus}.`,
    location: `Bengaluru - ${template.locality}`,
    skills: ['Community Outreach', 'Logistics', 'Data Entry'],
    skillsRequired: ['Community Outreach', 'Logistics', 'Data Entry'],
    timeCommitmentHours: 3,
    isMicroVolunteer: true,
    spots: 24 + (idx % 8),
    applicants: []
  },
  {
    id: generateId(),
    ngo: ngo.id,
    title: `${template.name} Program Monitoring Volunteer`,
    description: `Monitoring and reporting role for ${template.locality} execution plans.`,
    location: `Bengaluru - ${template.locality}`,
    skills: ['Reporting', 'Monitoring', 'Stakeholder Communication'],
    skillsRequired: ['Reporting', 'Monitoring', 'Stakeholder Communication'],
    timeCommitmentHours: 5,
    isMicroVolunteer: false,
    spots: 14 + (idx % 6),
    applicants: []
  }
]);

const buildMembers = ({ ngo, template, campaigns, orgStrength }) => {
  const roles = [
    'Volunteer Network Lead',
    'Field Operations Lead',
    'Program Manager',
    'Partnership Manager',
    'Finance Associate',
    'Community Coordinator',
    'Monitoring Associate',
    'Volunteer Coordinator'
  ];

  const memberCount = Math.max(12, Math.min(28, Math.round(orgStrength * 0.22)));

  return Array.from({ length: memberCount }, (_, index) => {
    const role = roles[index % roles.length];
    const campaign = campaigns[index % campaigns.length];
    const taskA = TASK_BANK[index % TASK_BANK.length];
    const taskB = TASK_BANK[(index + 2) % TASK_BANK.length];
    return {
      id: generateId(),
      name: `${template.locality} Member ${index + 1}`,
      role,
      tasksCompleted: 18 + (index % 17),
      contributions: `Supports ${template.focus} workflows and campaign delivery in ${template.locality}.`,
      badges: unique([
        'Campaign Contributor',
        index % 4 === 0 ? 'Member of the Month' : '',
        index % 3 === 0 ? 'Community Champion' : ''
      ]),
      tasks: unique([taskA, taskB, 'Impact Follow-up']),
      campaignAssignments: [
        {
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          task: taskA,
          contribution: `Contributed to ${taskA.toLowerCase()} for ${campaign.title}.`
        }
      ],
      joinedAt: new Date(Date.now() - (index + 10) * 86400000).toISOString()
    };
  });
};

const writeReport = async (report) => {
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `detailed_ngo_flood_report_${RUN_ID}.json`);
  const mdPath = path.join(reportDir, `detailed_ngo_flood_report_${RUN_ID}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Detailed NGO Flood Report',
    '',
    `- Run ID: \`${RUN_ID}\``,
    `- Timestamp: \`${report.generatedAt}\``,
    `- NGOs created: \`${report.summary.ngos}\``,
    `- Campaigns created: \`${report.summary.campaigns}\``,
    `- Opportunities created: \`${report.summary.opportunities}\``,
    `- Members added: \`${report.summary.members}\``,
    '',
    '## Created NGOs',
    ...report.createdNgos.map((ngo, index) => (
      `- ${index + 1}. ${ngo.name} (${ngo.id}) | ${ngo.email} | ${ngo.category}`
    ))
  ];
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  return { jsonPath, mdPath };
};

const main = async () => {
  await connectDB(process.env.POSTGRES_URL || process.env.DATABASE_URL);
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const report = {
    runId: RUN_ID,
    generatedAt: NOW_ISO(),
    requestedCount: NGO_COUNT,
    createdNgos: [],
    summary: {
      ngos: 0,
      campaigns: 0,
      opportunities: 0,
      members: 0
    }
  };

  for (let index = 0; index < NGO_COUNT; index += 1) {
    const template = TEMPLATE_NGOS[index % TEMPLATE_NGOS.length];
    const sequence = index + 1;
    const seedTag = `${RUN_ID}-${sequence}`;
    const ngoId = generateId();
    const orgStrength = 62 + (index % 8) * 7 + Math.floor(index / TEMPLATE_NGOS.length) * 2;
    const teamStrengthList = buildTeamStrengthList(orgStrength, template.focus);
    const leadership = buildLeadership(template, sequence);
    const programs = buildPrograms(template);
    const impactMetrics = buildImpactMetrics(orgStrength, sequence);
    const displayName =
      NGO_COUNT <= TEMPLATE_NGOS.length
        ? template.name
        : `${template.name} Chapter ${Math.floor(index / TEMPLATE_NGOS.length) + 1}`;

    const ngo = await NGO.create({
      id: ngoId,
      name: displayName,
      email: `detailed.${template.code}.${seedTag}@ngo.org`,
      password: passwordHash,
      role: 'ngo',
      verified: true,
      verificationStatus: 'verified',
      verificationHistory: [
        {
          id: generateId(),
          action: 'verified',
          decidedAt: NOW_ISO(),
          decidedBy: 'system-admin',
          note: `Auto-verified during detailed flood seed run ${RUN_ID}.`
        }
      ],
      flagged: false,
      isActive: true,
      registrationId: `NGO-KA-${template.code.toUpperCase()}-${seedTag}`,
      helplineNumber: `90001${String(10000 + sequence).slice(-5)}`,
      category: template.category,
      categories: template.categories,
      mission: `To advance ${template.focus} for underserved communities in Bengaluru.`,
      vision: `A measurable, transparent, and community-led impact model in ${template.locality}.`,
      description: `${displayName} drives operational programs in ${template.locality} with a data-backed model focused on ${template.focus}. The team works with residents, volunteers, and institutions to execute measurable interventions.`,
      about: `${displayName} is a Bengaluru-based organization combining field operations, volunteer mobilization, and transparent reporting. It publishes structured impact metrics, maintains role-based delivery teams, and runs recurring campaigns with clear beneficiary outcomes.`,
      address: `No. ${20 + sequence}, ${template.landmark}, ${template.locality}, Bengaluru, Karnataka ${template.pincode}`,
      addressDetails: {
        houseNumber: String(20 + sequence),
        landmark: template.landmark,
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: template.pincode
      },
      geographies: unique([template.locality, 'Bengaluru', 'Bengaluru Urban', 'Karnataka']),
      offices: unique([`${template.locality} Program Office`, `${template.locality} Volunteer Hub`]),
      website: `https://www.${template.code}${sequence}.org`,
      orgStrength,
      impactMetrics,
      programs,
      leadership,
      teamStrengthList,
      members: [],
      verificationDocs: [
        `uploads/mock_docs/${ngoId}_registration.pdf`,
        `uploads/mock_docs/${ngoId}_governance.pdf`,
        `uploads/mock_docs/${ngoId}_financials.pdf`
      ],
      createdAt: NOW_ISO(),
      updatedAt: NOW_ISO()
    });

    const campaigns = [];
    const campaignPayloads = buildCampaigns(ngo, template, sequence);
    for (const payload of campaignPayloads) {
      const campaign = await Campaign.create(payload);
      campaigns.push(campaign);
      report.summary.campaigns += 1;
    }

    const opportunityPayloads = buildOpportunities(ngo, template, sequence);
    for (const payload of opportunityPayloads) {
      await VolunteerOpportunity.create(payload);
      report.summary.opportunities += 1;
    }

    const members = buildMembers({
      ngo,
      template,
      campaigns,
      orgStrength
    });

    await NGO.findByIdAndUpdate(ngo.id, {
      members
    }, { new: true });

    report.summary.members += members.length;
    report.summary.ngos += 1;
    report.createdNgos.push({
      id: ngo.id,
      name: ngo.name,
      email: ngo.email,
      category: ngo.category,
      orgStrength,
      campaigns: campaigns.length,
      opportunities: opportunityPayloads.length,
      members: members.length
    });
  }

  const reportPaths = await writeReport(report);
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Detailed NGOs created: ${report.summary.ngos}`);
  console.log(`Campaigns created: ${report.summary.campaigns}`);
  console.log(`Volunteer opportunities created: ${report.summary.opportunities}`);
  console.log(`Members added: ${report.summary.members}`);
  console.log(`JSON report: ${path.relative(rootDir, reportPaths.jsonPath)}`);
  console.log(`Markdown report: ${path.relative(rootDir, reportPaths.mdPath)}`);
};

main()
  .catch((error) => {
    console.error(`seedDetailedNgos failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await close();
    } catch (error) {
      // no-op
    }
  });
