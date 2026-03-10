const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const currency = (value) => `Rs ${toNumber(value).toLocaleString('en-IN')}`;

const when = (value) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString();
};

const clamp01 = (value) => Math.max(0, Math.min(1, toNumber(value)));
const pct = (value) => `${Math.round(clamp01(value) * 100)}%`;

const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const renderCampaignRows = (campaigns = []) =>
  (campaigns || [])
    .map((campaign) => {
      const progress = clamp01(campaign.progress);
      return `
        <tr>
          <td>
            <div class="row-title">
              ${campaign.flagged ? '<span class="pill pill-warn">Flagged</span>' : ''}
              <span class="strong">${escapeHtml(campaign.title || 'Campaign')}</span>
            </div>
            <div class="muted small">${escapeHtml(campaign.category || '')}${campaign.location ? ` • ${escapeHtml(campaign.location)}` : ''}</div>
          </td>
          <td>${escapeHtml(campaign.ngo?.name || 'Unknown')}</td>
          <td class="nowrap">
            <div class="bar"><div class="bar-fill" style="width:${pct(progress)}"></div></div>
            <div class="muted small">${pct(progress)}</div>
          </td>
          <td class="right strong">${currency(campaign.currentAmount)}</td>
          <td class="right">${currency(campaign.goalAmount)}</td>
        </tr>
      `;
    })
    .join('');

const renderDonationRows = (donations = []) =>
  (donations || [])
    .map((donation) => `
      <tr>
        <td class="nowrap">${when(donation.createdAt)}</td>
        <td>
          <div class="strong">${escapeHtml(donation.donorName || donation.user?.name || 'Donor')}</div>
          <div class="muted small">${escapeHtml(donation.donorEmail || donation.user?.email || '-')}</div>
        </td>
        <td>
          <div class="strong">${escapeHtml(donation.campaign?.title || '-')}</div>
          <div class="muted small">${escapeHtml(donation.ngo?.name || '-')}</div>
        </td>
        <td class="right strong">${currency(donation.amount)}</td>
        <td>${escapeHtml(donation.status || '-')}</td>
        <td>${escapeHtml(donation.certificateApprovalStatus || '-')}</td>
        <td class="mono small">${escapeHtml(donation.receiptNumber || '-')}</td>
      </tr>
    `)
    .join('');

const renderVolunteerRows = (applications = []) =>
  (applications || [])
    .map((app) => `
      <tr>
        <td class="nowrap">${when(app.createdAt)}</td>
        <td>
          <div class="strong">${escapeHtml(app.user?.name || 'Volunteer')}</div>
          <div class="muted small">${escapeHtml(app.user?.email || '-')}</div>
        </td>
        <td>
          <div class="strong">${escapeHtml(app.opportunity?.title || '-')}</div>
          <div class="muted small">${escapeHtml(app.ngo?.name || '-')}</div>
        </td>
        <td>${escapeHtml(app.status || '-')}</td>
        <td>${escapeHtml(app.certificateApprovalStatus || '-')}</td>
      </tr>
    `)
    .join('');

const renderCampaignVolunteerRows = (rows = []) =>
  (rows || [])
    .map((row) => {
      const reg = row.registration || {};
      const activities = Array.isArray(reg.preferredActivities) ? reg.preferredActivities.filter(Boolean).join(', ') : '';
      const submittedAt = reg.submittedAt || reg.updatedAt || reg.createdAt || null;
      return `
        <tr>
          <td class="nowrap">${when(submittedAt)}</td>
          <td>
            <div class="strong">${escapeHtml(row.user?.name || reg.fullName || 'Volunteer')}</div>
            <div class="muted small">${escapeHtml(row.user?.email || reg.email || '-')}</div>
          </td>
          <td>
            <div class="strong">${escapeHtml(row.campaign?.title || '-')}</div>
            <div class="muted small">${escapeHtml(row.ngo?.name || '-')}</div>
          </td>
          <td>${escapeHtml(reg.availability || '-')}</td>
          <td>${escapeHtml(activities || '-')}</td>
        </tr>
      `;
    })
    .join('');

const renderPendingNgoCards = (ngos = []) =>
  (ngos || [])
    .map((ngo) => `
      <div class="card-item">
        <div class="strong">
          <a href="/admin/verifications?status=pending&ngoId=${encodeURIComponent(String(ngo.id || ''))}" target="_blank" rel="noreferrer">${escapeHtml(ngo.name || 'NGO')}</a>
        </div>
        <div class="muted small">${escapeHtml(ngo.email || 'No email')}</div>
        <div class="muted small">Submitted: ${when(ngo.createdAt)}</div>
        <div class="muted small">Open full profile, documents, checklist, and history before any decision.</div>
        <div class="actions">
          <a class="btn btn-dark" href="/admin/verifications?status=pending&ngoId=${encodeURIComponent(String(ngo.id || ''))}" target="_blank" rel="noreferrer">Open Detailed Verification</a>
        </div>
      </div>
    `)
    .join('');

const renderFlaggedCards = (items = [], typeLabel = 'campaign') =>
  (items || [])
    .map((item) => `
      <div class="card-item">
        <div class="strong">${escapeHtml(item.title || item.name || 'Flagged')}</div>
        <div class="muted small">${escapeHtml(item.flagReason || 'No reason provided')}</div>
        <div class="muted small">Flagged: ${when(item.createdAt)}</div>
        <div class="actions">
          <button class="btn btn-dark" data-action="resolveFlag" data-type="${escapeHtml(typeLabel)}" data-id="${escapeHtml(item.id)}">Resolve</button>
        </div>
      </div>
    `)
    .join('');

const renderAdminDashboardHtml = (snapshot = {}) => {
  const stats = snapshot?.stats || {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Dashboard (SSR)</title>
  <style>
    :root {
      --bg: #f8fafc;
      --panel: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #475569;
      --accent: #0f766e;
      --warn: #b45309;
      --danger: #be123c;
      --shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
      --radius: 16px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: radial-gradient(1100px 600px at 20% 5%, #ecfeff 0%, rgba(255,255,255,0) 55%), radial-gradient(900px 500px at 95% 0%, #ecfdf5 0%, rgba(255,255,255,0) 55%), var(--bg); color: var(--text); }
    .wrap { max-width: 1160px; margin: 0 auto; padding: 28px 18px 48px; }
    header { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; justify-content: space-between; }
    h1 { margin: 0; font-size: 34px; letter-spacing: -0.02em; }
    .subtitle { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
    .meta { margin: 10px 0 0; color: #64748b; font-size: 12px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: flex-end; }
    .btn { border: 1px solid var(--border); background: var(--panel); color: var(--text); padding: 10px 12px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
    .btn:hover { filter: brightness(0.98); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-dark { background: #0f172a; color: #fff; border-color: #0f172a; }
    .btn-green { background: #059669; color: #fff; border-color: #059669; }
    .btn-red { background: var(--danger); color: #fff; border-color: var(--danger); }
    .btn-outline { background: transparent; }
    .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); font-weight: 600; }
    .notice { margin-top: 18px; background: #fff1f2; border: 1px solid #fecdd3; color: #881337; padding: 12px 14px; border-radius: 12px; }
    .hidden { display: none; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
    @media (max-width: 920px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }
    .k { font-size: 11px; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; }
    .v { font-size: 22px; font-weight: 900; margin-top: 10px; }
    .s { font-size: 13px; color: var(--muted); margin-top: 6px; }

    .panel { margin-top: 14px; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; }
    .panel h2 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
    .panel p { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
    .controls { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
    .controls .left, .controls .right { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    input[type="text"], select { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 13px; min-width: 220px; background: #fff; }
    select { min-width: 180px; }

    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th { text-align: left; padding: 10px 10px; background: #f1f5f9; color: #334155; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    td { padding: 10px 10px; border-top: 1px solid #f1f5f9; vertical-align: top; }
    .right { text-align: right; }
    .nowrap { white-space: nowrap; }
    .strong { font-weight: 800; }
    .strong a { color: inherit; text-decoration: none; }
    .strong a:hover { text-decoration: underline; }
    .muted { color: var(--muted); }
    .small { font-size: 12px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }
    .row-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 800; border: 1px solid var(--border); }
    .pill-warn { background: #fffbeb; border-color: #fde68a; color: var(--warn); }

    .bar { width: 160px; height: 10px; border-radius: 999px; background: #e2e8f0; overflow: hidden; border: 1px solid #cbd5e1; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #10b981); }

    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    @media (max-width: 720px) { .cards { grid-template-columns: 1fr; } }
    .card-item { border: 1px solid var(--border); border-radius: 14px; padding: 12px; background: #fff; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>Admin Dashboard (SSR)</h1>
        <p class="subtitle">Server-rendered snapshot with client-side refresh and moderation actions.</p>
        <p class="meta">Last updated: <span id="generatedAt">${escapeHtml(when(snapshot.generatedAt))}</span></p>
      </div>
      <div class="toolbar">
        <label class="toggle"><input id="autoRefresh" type="checkbox" checked /> Auto refresh (10s)</label>
        <button id="refreshBtn" class="btn btn-dark" type="button">Refresh</button>
      </div>
    </header>

    <div id="authNotice" class="notice hidden"></div>

    <div class="grid">
      <div class="card">
        <div class="k">Completed Donations</div>
        <div class="v" data-stat="donationsCompletedTotal">${currency(stats.donationsCompletedTotal)}</div>
        <div class="s"><span data-stat="donationsCompletedCount">${escapeHtml(stats.donationsCompletedCount || 0)}</span> transactions</div>
      </div>
      <div class="card">
        <div class="k">Volunteer Activity</div>
        <div class="v" data-stat="volunteerApplicationsCount">${escapeHtml(stats.volunteerApplicationsCount || 0)}</div>
        <div class="s"><span data-stat="volunteerCompletedCount">${escapeHtml(stats.volunteerCompletedCount || 0)}</span> completed</div>
      </div>
      <div class="card">
        <div class="k">Moderation</div>
        <div class="v" data-stat="flaggedTotal">${escapeHtml(stats.flaggedTotal || 0)}</div>
        <div class="s">NGOs: <span data-stat="flaggedNgos">${escapeHtml(stats.flaggedNgos || 0)}</span> • Campaigns: <span data-stat="flaggedCampaigns">${escapeHtml(stats.flaggedCampaigns || 0)}</span></div>
      </div>
      <div class="card">
        <div class="k">Pending NGO Verifications</div>
        <div class="v" data-stat="pendingNgos">${escapeHtml(stats.pendingNgos || 0)}</div>
        <div class="s">Verify NGOs to make them visible publicly.</div>
      </div>
    </div>

    <div class="panel">
      <h2>Campaign Progress</h2>
      <p>Top campaigns by progress toward their goal amount.</p>
      <div class="controls">
        <div class="left">
          <input id="campaignSearch" type="text" placeholder="Search campaigns..." />
          <label class="toggle"><input id="campaignFlaggedOnly" type="checkbox" /> Flagged only</label>
        </div>
        <div class="right">
          <select id="campaignSort">
            <option value="progress" selected>Sort: Progress</option>
            <option value="raised">Sort: Raised</option>
            <option value="latest">Sort: Latest</option>
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>NGO</th>
              <th>Progress</th>
              <th class="right">Raised</th>
              <th class="right">Goal</th>
            </tr>
          </thead>
          <tbody id="campaignsBody">${renderCampaignRows(snapshot.campaigns)}</tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h2>Donation Registrations</h2>
      <p>Recent donations across the platform.</p>
      <div class="controls">
        <div class="left">
          <input id="donationSearch" type="text" placeholder="Search donors, receipts, NGOs..." />
        </div>
        <div class="right">
          <select id="donationStatus">
            <option value="all" selected>Status: All</option>
            <option value="completed">Status: Completed</option>
            <option value="pending">Status: Pending</option>
            <option value="failed">Status: Failed</option>
          </select>
          <select id="donationSort">
            <option value="latest" selected>Sort: Latest</option>
            <option value="amount">Sort: Amount</option>
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Donor</th>
            <th>Campaign / NGO</th>
            <th class="right">Amount</th>
            <th>Status</th>
            <th>Certificate</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody id="donationsBody">${renderDonationRows(snapshot.donations)}</tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Volunteer Registrations</h2>
      <p>Recent volunteer opportunity applications.</p>
      <div class="controls">
        <div class="left">
          <input id="volunteerSearch" type="text" placeholder="Search users, NGOs, opportunities..." />
        </div>
        <div class="right">
          <select id="volunteerStatus">
            <option value="all" selected>Status: All</option>
            <option value="applied">Status: Applied</option>
            <option value="assigned">Status: Assigned</option>
            <option value="completed">Status: Completed</option>
          </select>
          <select id="volunteerSort">
            <option value="latest" selected>Sort: Latest</option>
            <option value="status">Sort: Status</option>
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Volunteer</th>
            <th>Opportunity / NGO</th>
            <th>Status</th>
            <th>Certificate</th>
          </tr>
        </thead>
        <tbody id="volunteersBody">${renderVolunteerRows(snapshot.volunteerApplications)}</tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Campaign Volunteer Registrations</h2>
      <p>Volunteers who registered directly on campaign pages.</p>
      <div class="controls">
        <div class="left">
          <input id="campaignVolunteerSearch" type="text" placeholder="Search campaign volunteers..." />
        </div>
        <div class="right muted small">
          Total registrations: <span data-stat="campaignVolunteerRegistrationsCount">${escapeHtml(stats.campaignVolunteerRegistrationsCount || 0)}</span>
          &nbsp;•&nbsp; Joined: <span data-stat="campaignVolunteersCount">${escapeHtml(stats.campaignVolunteersCount || 0)}</span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Volunteer</th>
            <th>Campaign / NGO</th>
            <th>Availability</th>
            <th>Preferred Activities</th>
          </tr>
        </thead>
        <tbody id="campaignVolunteersBody">${renderCampaignVolunteerRows(snapshot.campaignVolunteerRegistrations)}</tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Moderation Actions</h2>
      <p>Resolve flags and open detailed NGO verification review.</p>

      <div class="controls">
        <div class="left"><span class="strong">Pending NGOs</span></div>
        <div class="right muted small">Total: <span data-stat="pendingNgos">${escapeHtml(stats.pendingNgos || 0)}</span></div>
      </div>
      <div id="pendingNgoCards" class="cards">
        ${renderPendingNgoCards(snapshot.pendingNgos)}
      </div>

      <div class="controls" style="margin-top: 18px;">
        <div class="left"><span class="strong">Flagged NGOs</span></div>
        <div class="right muted small">Total: <span data-stat="flaggedNgos">${escapeHtml(stats.flaggedNgos || 0)}</span></div>
      </div>
      <div id="flaggedNgoCards" class="cards">
        ${renderFlaggedCards(snapshot.flagged?.ngos, 'ngo')}
      </div>

      <div class="controls" style="margin-top: 18px;">
        <div class="left"><span class="strong">Flagged Campaigns</span></div>
        <div class="right muted small">Total: <span data-stat="flaggedCampaigns">${escapeHtml(stats.flaggedCampaigns || 0)}</span></div>
      </div>
      <div id="flaggedCampaignCards" class="cards">
        ${renderFlaggedCards(snapshot.flagged?.campaigns, 'campaign')}
      </div>
    </div>
  </div>

  <script>
    const INITIAL = ${safeJson(snapshot)};

    const clamp01 = (value) => Math.max(0, Math.min(1, Number(value || 0)));
    const pct = (value) => String(Math.round(clamp01(value) * 100)) + '%';
    const currency = (value) => 'Rs ' + (Number(value || 0)).toLocaleString('en-IN');
    const when = (value) => {
      if (!value) return 'N/A';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return 'N/A';
      return dt.toLocaleString();
    };

    const state = {
      snapshot: INITIAL,
      timers: { refresh: null }
    };

    const token = () => localStorage.getItem('token') || '';
    const authHeaders = () => {
      const t = token();
      return t ? { 'Authorization': 'Bearer ' + t } : {};
    };

    const el = (id) => document.getElementById(id);
    const setText = (selector, value) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.textContent = String(value ?? '');
      });
    };

    const showNotice = (message) => {
      const node = el('authNotice');
      if (!node) return;
      if (!message) {
        node.classList.add('hidden');
        node.textContent = '';
        return;
      }
      node.textContent = message;
      node.classList.remove('hidden');
    };

    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const applyCampaignFilters = (campaigns) => {
      const query = String(el('campaignSearch')?.value || '').trim().toLowerCase();
      const flaggedOnly = Boolean(el('campaignFlaggedOnly')?.checked);
      const sort = String(el('campaignSort')?.value || 'progress');

      const filtered = (campaigns || []).filter((campaign) => {
        if (flaggedOnly && !campaign.flagged) return false;
        if (!query) return true;
        const hay = [
          campaign.title,
          campaign.category,
          campaign.location,
          campaign.area,
          campaign.ngo && campaign.ngo.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(query);
      });

      const sorted = filtered.slice();
      if (sort === 'raised') {
        sorted.sort((a, b) => Number(b.currentAmount || 0) - Number(a.currentAmount || 0));
      } else if (sort === 'latest') {
        sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      } else {
        sorted.sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0));
      }
      return sorted.slice(0, 12);
    };

    const applyDonationFilters = (donations) => {
      const query = String(el('donationSearch')?.value || '').trim().toLowerCase();
      const status = String(el('donationStatus')?.value || 'all').toLowerCase();
      const sort = String(el('donationSort')?.value || 'latest');

      const filtered = (donations || []).filter((donation) => {
        if (status !== 'all' && String(donation.status || '').toLowerCase() !== status) return false;
        if (!query) return true;
        const hay = [
          donation.receiptNumber,
          donation.donorName,
          donation.donorEmail,
          donation.user && donation.user.name,
          donation.user && donation.user.email,
          donation.campaign && donation.campaign.title,
          donation.ngo && donation.ngo.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(query);
      });

      const sorted = filtered.slice();
      if (sort === 'amount') {
        sorted.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
      } else {
        sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      }
      return sorted.slice(0, 15);
    };

    const applyVolunteerFilters = (applications) => {
      const query = String(el('volunteerSearch')?.value || '').trim().toLowerCase();
      const status = String(el('volunteerStatus')?.value || 'all').toLowerCase();
      const sort = String(el('volunteerSort')?.value || 'latest');

      const filtered = (applications || []).filter((app) => {
        if (status !== 'all' && String(app.status || '').toLowerCase() !== status) return false;
        if (!query) return true;
        const hay = [
          app.user && app.user.name,
          app.user && app.user.email,
          app.opportunity && app.opportunity.title,
          app.ngo && app.ngo.name,
          app.assignedTask
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(query);
      });

      const sorted = filtered.slice();
      if (sort === 'status') {
        sorted.sort((a, b) => String(a.status || '').localeCompare(String(b.status || '')));
      } else {
        sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      }
      return sorted.slice(0, 15);
    };

    const applyCampaignVolunteerFilters = (rows) => {
      const query = String(el('campaignVolunteerSearch')?.value || '').trim().toLowerCase();
      const filtered = (rows || []).filter((row) => {
        if (!query) return true;
        const reg = row.registration || {};
        const hay = [
          row.user && row.user.name,
          row.user && row.user.email,
          reg.fullName,
          reg.email,
          row.campaign && row.campaign.title,
          row.ngo && row.ngo.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(query);
      });
      const sorted = filtered.slice();
      sorted.sort((a, b) => {
        const left = (a.registration && (a.registration.submittedAt || a.registration.updatedAt || a.registration.createdAt)) || 0;
        const right = (b.registration && (b.registration.submittedAt || b.registration.updatedAt || b.registration.createdAt)) || 0;
        return new Date(right) - new Date(left);
      });
      return sorted.slice(0, 15);
    };

    const renderCampaignRows = (campaigns) => applyCampaignFilters(campaigns).map((campaign) => {
      const progress = clamp01(campaign.progress);
      return '<tr>' +
        '<td>' +
          '<div class=\"row-title\">' +
            (campaign.flagged ? '<span class=\"pill pill-warn\">Flagged</span>' : '') +
            '<span class=\"strong\">' + escapeHtml(campaign.title || 'Campaign') + '</span>' +
          '</div>' +
          '<div class=\"muted small\">' + escapeHtml(campaign.category || '') + (campaign.location ? ' • ' + escapeHtml(campaign.location) : '') + '</div>' +
        '</td>' +
        '<td>' + escapeHtml((campaign.ngo && campaign.ngo.name) || 'Unknown') + '</td>' +
        '<td class=\"nowrap\">' +
          '<div class=\"bar\"><div class=\"bar-fill\" style=\"width:' + pct(progress) + '\"></div></div>' +
          '<div class=\"muted small\">' + pct(progress) + '</div>' +
        '</td>' +
        '<td class=\"right strong\">' + currency(campaign.currentAmount) + '</td>' +
        '<td class=\"right\">' + currency(campaign.goalAmount) + '</td>' +
      '</tr>';
    }).join('');

    const renderDonationRows = (donations) => applyDonationFilters(donations).map((donation) => {
      return '<tr>' +
        '<td class=\"nowrap\">' + when(donation.createdAt) + '</td>' +
        '<td><div class=\"strong\">' + escapeHtml(donation.donorName || (donation.user && donation.user.name) || 'Donor') + '</div>' +
          '<div class=\"muted small\">' + escapeHtml(donation.donorEmail || (donation.user && donation.user.email) || '-') + '</div></td>' +
        '<td><div class=\"strong\">' + escapeHtml((donation.campaign && donation.campaign.title) || '-') + '</div>' +
          '<div class=\"muted small\">' + escapeHtml((donation.ngo && donation.ngo.name) || '-') + '</div></td>' +
        '<td class=\"right strong\">' + currency(donation.amount) + '</td>' +
        '<td>' + escapeHtml(donation.status || '-') + '</td>' +
        '<td>' + escapeHtml(donation.certificateApprovalStatus || '-') + '</td>' +
        '<td class=\"mono small\">' + escapeHtml(donation.receiptNumber || '-') + '</td>' +
      '</tr>';
    }).join('');

    const renderVolunteerRows = (applications) => applyVolunteerFilters(applications).map((app) => {
      return '<tr>' +
        '<td class=\"nowrap\">' + when(app.createdAt) + '</td>' +
        '<td><div class=\"strong\">' + escapeHtml((app.user && app.user.name) || 'Volunteer') + '</div>' +
          '<div class=\"muted small\">' + escapeHtml((app.user && app.user.email) || '-') + '</div></td>' +
        '<td><div class=\"strong\">' + escapeHtml((app.opportunity && app.opportunity.title) || '-') + '</div>' +
          '<div class=\"muted small\">' + escapeHtml((app.ngo && app.ngo.name) || '-') + '</div></td>' +
        '<td>' + escapeHtml(app.status || '-') + '</td>' +
        '<td>' + escapeHtml(app.certificateApprovalStatus || '-') + '</td>' +
      '</tr>';
    }).join('');

    const renderCampaignVolunteerRows = (rows) => applyCampaignVolunteerFilters(rows).map((row) => {
      const reg = row.registration || {};
      const activities = Array.isArray(reg.preferredActivities) ? reg.preferredActivities.filter(Boolean).join(', ') : '';
      const submittedAt = reg.submittedAt || reg.updatedAt || reg.createdAt || null;
      return '<tr>' +
        '<td class=\"nowrap\">' + when(submittedAt) + '</td>' +
        '<td><div class=\"strong\">' + escapeHtml((row.user && row.user.name) || reg.fullName || 'Volunteer') + '</div>' +
          '<div class=\"muted small\">' + escapeHtml((row.user && row.user.email) || reg.email || '-') + '</div></td>' +
        '<td><div class=\"strong\">' + escapeHtml((row.campaign && row.campaign.title) || '-') + '</div>' +
          '<div class=\"muted small\">' + escapeHtml((row.ngo && row.ngo.name) || '-') + '</div></td>' +
        '<td>' + escapeHtml(reg.availability || '-') + '</td>' +
        '<td>' + escapeHtml(activities || '-') + '</td>' +
      '</tr>';
    }).join('');

    const renderPendingNgoCards = (ngos) => (ngos || []).slice(0, 10).map((ngo) => {
      const href = '/admin/verifications?status=pending&ngoId=' + encodeURIComponent(String(ngo.id || ''));
      return '<div class=\"card-item\">' +
        '<div class=\"strong\"><a href=\"' + href + '\" target=\"_blank\" rel=\"noreferrer\">' + escapeHtml(ngo.name || 'NGO') + '</a></div>' +
        '<div class=\"muted small\">' + escapeHtml(ngo.email || 'No email') + '</div>' +
        '<div class=\"muted small\">Submitted: ' + when(ngo.createdAt) + '</div>' +
        '<div class=\"muted small\">Open full profile, documents, checklist, and history before any decision.</div>' +
        '<div class=\"actions\">' +
          '<a class=\"btn btn-dark\" href=\"' + href + '\" target=\"_blank\" rel=\"noreferrer\">Open Detailed Verification</a>' +
        '</div>' +
      '</div>';
    }).join('');

    const renderFlaggedCards = (items, typeLabel) => (items || []).slice(0, 10).map((item) => {
      return '<div class=\"card-item\">' +
        '<div class=\"strong\">' + escapeHtml(item.title || item.name || 'Flagged') + '</div>' +
        '<div class=\"muted small\">' + escapeHtml(item.flagReason || 'No reason provided') + '</div>' +
        '<div class=\"muted small\">Flagged: ' + when(item.createdAt) + '</div>' +
        '<div class=\"actions\">' +
          '<button class=\"btn btn-dark\" data-action=\"resolveFlag\" data-type=\"' + escapeHtml(typeLabel) + '\" data-id=\"' + escapeHtml(item.id) + '\">Resolve</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const render = (snapshot) => {
      state.snapshot = snapshot;

      el('generatedAt').textContent = when(snapshot.generatedAt);

      const stats = snapshot.stats || {};
      setText('[data-stat=\"donationsCompletedTotal\"]', currency(stats.donationsCompletedTotal));
      setText('[data-stat=\"donationsCompletedCount\"]', stats.donationsCompletedCount || 0);
      setText('[data-stat=\"volunteerApplicationsCount\"]', stats.volunteerApplicationsCount || 0);
      setText('[data-stat=\"volunteerCompletedCount\"]', stats.volunteerCompletedCount || 0);
      setText('[data-stat=\"flaggedTotal\"]', stats.flaggedTotal || 0);
      setText('[data-stat=\"flaggedNgos\"]', stats.flaggedNgos || 0);
      setText('[data-stat=\"flaggedCampaigns\"]', stats.flaggedCampaigns || 0);
      setText('[data-stat=\"pendingNgos\"]', stats.pendingNgos || 0);
      setText('[data-stat=\"campaignVolunteerRegistrationsCount\"]', stats.campaignVolunteerRegistrationsCount || 0);
      setText('[data-stat=\"campaignVolunteersCount\"]', stats.campaignVolunteersCount || 0);

      el('campaignsBody').innerHTML = renderCampaignRows(snapshot.campaigns || []);
      el('donationsBody').innerHTML = renderDonationRows(snapshot.donations || []);
      el('volunteersBody').innerHTML = renderVolunteerRows(snapshot.volunteerApplications || []);
      el('campaignVolunteersBody').innerHTML = renderCampaignVolunteerRows(snapshot.campaignVolunteerRegistrations || []);

      el('pendingNgoCards').innerHTML = (snapshot.pendingNgos && snapshot.pendingNgos.length)
        ? renderPendingNgoCards(snapshot.pendingNgos)
        : '<div class=\"card-item muted\">No pending NGO verifications.</div>';

      const flaggedNgos = snapshot.flagged && snapshot.flagged.ngos ? snapshot.flagged.ngos : [];
      const flaggedCampaigns = snapshot.flagged && snapshot.flagged.campaigns ? snapshot.flagged.campaigns : [];
      el('flaggedNgoCards').innerHTML = flaggedNgos.length
        ? renderFlaggedCards(flaggedNgos, 'ngo')
        : '<div class=\"card-item muted\">No flagged NGOs.</div>';
      el('flaggedCampaignCards').innerHTML = flaggedCampaigns.length
        ? renderFlaggedCards(flaggedCampaigns, 'campaign')
        : '<div class=\"card-item muted\">No flagged campaigns.</div>';
    };

    const requestJson = async (path, options) => {
      const res = await fetch(path, Object.assign({}, options, { headers: Object.assign({}, (options && options.headers) || {}, authHeaders()) }));
      if (!res.ok) {
        let message = 'Request failed.';
        try {
          const body = await res.json();
          if (body && body.message) message = body.message;
        } catch (err) {}
        throw new Error(message);
      }
      return res.json();
    };

    const refresh = async () => {
      if (!token()) {
        showNotice('You are not logged in. Open this view from the app while logged in as admin.');
        return;
      }
      showNotice('');

      const refreshBtn = el('refreshBtn');
      if (refreshBtn) refreshBtn.disabled = true;

      try {
        const data = await requestJson('/api/admin/dashboard?limit=30&days=14&noCache=1', { method: 'GET' });
        render(data || {});
      } catch (err) {
        showNotice(err && err.message ? err.message : 'Failed to refresh dashboard.');
      } finally {
        if (refreshBtn) refreshBtn.disabled = false;
      }
    };

    const postAction = async (action, id, typeLabel) => {
      if (!token()) {
        showNotice('Missing token. Please open this view from the app.');
        return;
      }
      showNotice('');
      try {
        if (action === 'verifyNgo') {
          await requestJson('/api/admin/verify-ngo/' + encodeURIComponent(id), { method: 'POST' });
        } else if (action === 'rejectNgo') {
          await requestJson('/api/admin/reject-ngo/' + encodeURIComponent(id), { method: 'POST' });
        } else if (action === 'resolveFlag') {
          await requestJson('/api/admin/resolve-flag/' + encodeURIComponent(typeLabel) + '/' + encodeURIComponent(id), { method: 'PUT' });
        }
        await refresh();
      } catch (err) {
        showNotice(err && err.message ? err.message : 'Action failed.');
      }
    };

    const setAutoRefresh = (enabled) => {
      if (state.timers.refresh) {
        window.clearInterval(state.timers.refresh);
        state.timers.refresh = null;
      }
      if (!enabled) return;
      state.timers.refresh = window.setInterval(() => {
        refresh();
      }, 10000);
    };

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.getAttribute) return;
      const action = target.getAttribute('data-action');
      if (!action) return;
      const id = target.getAttribute('data-id');
      const typeLabel = target.getAttribute('data-type');
      if (!id) return;
      postAction(action, id, typeLabel);
    });

    const bindFilters = () => {
      ['campaignSearch', 'campaignFlaggedOnly', 'campaignSort'].forEach((id) => {
        const node = el(id);
        if (!node) return;
        node.addEventListener('input', () => render(state.snapshot));
        node.addEventListener('change', () => render(state.snapshot));
      });
      ['donationSearch', 'donationStatus', 'donationSort'].forEach((id) => {
        const node = el(id);
        if (!node) return;
        node.addEventListener('input', () => render(state.snapshot));
        node.addEventListener('change', () => render(state.snapshot));
      });
      ['volunteerSearch', 'volunteerStatus', 'volunteerSort'].forEach((id) => {
        const node = el(id);
        if (!node) return;
        node.addEventListener('input', () => render(state.snapshot));
        node.addEventListener('change', () => render(state.snapshot));
      });
      ['campaignVolunteerSearch'].forEach((id) => {
        const node = el(id);
        if (!node) return;
        node.addEventListener('input', () => render(state.snapshot));
      });
    };

    document.addEventListener('DOMContentLoaded', () => {
      render(INITIAL);
      bindFilters();
      el('refreshBtn').addEventListener('click', refresh);
      el('autoRefresh').addEventListener('change', (e) => setAutoRefresh(Boolean(e.target.checked)));
      setAutoRefresh(true);
    });
  </script>
</body>
</html>`;
};

module.exports = {
  renderAdminDashboardHtml
};
