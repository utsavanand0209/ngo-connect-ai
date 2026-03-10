#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { computeFraudScore, FRAUD_THRESHOLD } = require('../src/utils/fraudScore');

const now = new Date('2026-03-10T00:00:00.000Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgoIso = (days) => new Date(now - (days * DAY_MS)).toISOString();
const stableTimestamp = () => new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const cases = [
  {
    id: 'FRAUD-001',
    name: 'Old verified NGO with normal campaign stays unflagged',
    input: {
      ngo: {
        verificationDocs: ['reg-cert.pdf'],
        createdAt: daysAgoIso(120),
        description: 'Community nutrition support and volunteer outreach.'
      },
      campaigns: [{ goalAmount: 75000 }]
    },
    expected: {
      score: 0,
      flagged: false,
      checks: {
        missingVerificationDocs: false,
        newOrUnknownAccount: false,
        suspiciousKeywords: false,
        unrealisticGoal: false
      }
    }
  },
  {
    id: 'FRAUD-002',
    name: 'Missing verification docs alone adds 40 and is not flagged',
    input: {
      ngo: {
        verificationDocs: [],
        createdAt: daysAgoIso(120),
        description: 'Trusted long-running education NGO.'
      },
      campaigns: [{ goalAmount: 90000 }]
    },
    expected: {
      score: 40,
      flagged: false,
      checks: {
        missingVerificationDocs: true,
        newOrUnknownAccount: false,
        suspiciousKeywords: false,
        unrealisticGoal: false
      }
    }
  },
  {
    id: 'FRAUD-003',
    name: 'Missing docs + very new NGO crosses threshold',
    input: {
      ngo: {
        verificationDocs: [],
        createdAt: daysAgoIso(5),
        description: 'Youth skilling project.'
      },
      campaigns: [{ goalAmount: 30000 }]
    },
    expected: {
      score: 60,
      flagged: true,
      checks: {
        missingVerificationDocs: true,
        newOrUnknownAccount: true,
        suspiciousKeywords: false,
        unrealisticGoal: false
      }
    }
  },
  {
    id: 'FRAUD-004',
    name: 'Suspicious keywords + unrealistic goal hits exact threshold',
    input: {
      ngo: {
        verificationDocs: ['kyc.pdf'],
        createdAt: daysAgoIso(90),
        description: 'Urgent! Donate now to unlock this mission.'
      },
      campaigns: [{ goalAmount: 100000 }]
    },
    expected: {
      score: 50,
      flagged: true,
      checks: {
        missingVerificationDocs: false,
        newOrUnknownAccount: false,
        suspiciousKeywords: true,
        unrealisticGoal: true
      }
    }
  },
  {
    id: 'FRAUD-005',
    name: 'Invalid createdAt is treated as unknown-risk and string goal is parsed',
    input: {
      ngo: {
        verificationDocs: ['kyc.pdf'],
        createdAt: 'not-a-date',
        description: 'Regular field operations update.'
      },
      campaigns: [{ goalAmount: '150000' }]
    },
    expected: {
      score: 40,
      flagged: false,
      checks: {
        missingVerificationDocs: false,
        newOrUnknownAccount: true,
        suspiciousKeywords: false,
        unrealisticGoal: true
      }
    }
  },
  {
    id: 'FRAUD-006',
    name: 'Non-array verification docs are treated as missing',
    input: {
      ngo: {
        verificationDocs: 'reg-cert.pdf',
        createdAt: daysAgoIso(140),
        description: 'Food relief campaign.'
      },
      campaigns: [{ goalAmount: 10000 }]
    },
    expected: {
      score: 40,
      flagged: false,
      checks: {
        missingVerificationDocs: true,
        newOrUnknownAccount: false,
        suspiciousKeywords: false,
        unrealisticGoal: false
      }
    }
  }
];

const results = cases.map((testCase) => {
  const actual = computeFraudScore({ ...testCase.input, now });
  const passed = deepEqual(actual, testCase.expected);
  return {
    id: testCase.id,
    name: testCase.name,
    passed,
    expected: testCase.expected,
    actual
  };
});

const passedCount = results.filter((item) => item.passed).length;
const failed = results.filter((item) => !item.passed);

const report = {
  generatedAt: new Date().toISOString(),
  testSuite: 'fraudScoring',
  threshold: FRAUD_THRESHOLD,
  total: results.length,
  passed: passedCount,
  failed: failed.length,
  results
};

const rootDir = path.resolve(__dirname, '../..');
const reportDir = path.join(rootDir, 'docs', 'test-reports');
fs.mkdirSync(reportDir, { recursive: true });

const timestamp = stableTimestamp();
const jsonPath = path.join(reportDir, `fraud_scoring_report_${timestamp}.json`);
const mdPath = path.join(reportDir, `fraud_scoring_report_${timestamp}.md`);

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

const lines = [
  '# Fraud Scoring Test Report',
  '',
  `- Generated At: ${report.generatedAt}`,
  `- Threshold: ${FRAUD_THRESHOLD}`,
  `- Total: ${report.total}`,
  `- Passed: ${report.passed}`,
  `- Failed: ${report.failed}`,
  '',
  '## Cases',
  ''
];

for (const result of report.results) {
  lines.push(`- ${result.id} | ${result.passed ? 'PASS' : 'FAIL'} | ${result.name}`);
}

if (failed.length > 0) {
  lines.push('', '## Failures', '');
  for (const result of failed) {
    lines.push(`### ${result.id} ${result.name}`);
    lines.push('');
    lines.push('Expected:');
    lines.push('```json');
    lines.push(JSON.stringify(result.expected, null, 2));
    lines.push('```');
    lines.push('Actual:');
    lines.push('```json');
    lines.push(JSON.stringify(result.actual, null, 2));
    lines.push('```');
    lines.push('');
  }
}

fs.writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf-8');

console.log(`Fraud scoring tests: ${report.passed}/${report.total} passed`);
if (failed.length > 0) {
  console.log(`Failures: ${failed.length}`);
  failed.forEach((item) => console.log(` - ${item.id}: ${item.name}`));
} else {
  console.log('All fraud scoring tests passed.');
}
console.log(`JSON report: ${path.relative(rootDir, jsonPath)}`);
console.log(`Markdown report: ${path.relative(rootDir, mdPath)}`);
