const SUPPORT_KB = [
  {
    id: 'overview',
    title: 'Platform Overview',
    keywords: ['what is', 'ngo connect', 'platform', 'features', 'help', 'guide'],
    content: [
      'NGO Connect connects donors, volunteers, NGOs, and admins in one place.',
      '',
      'Roles:',
      '- User: browse NGOs/campaigns, donate, volunteer, request help, message NGOs, view receipts/certificates.',
      '- NGO: manage profile, create campaigns/opportunities (after verification), review certificate approvals, message users.',
      '- Admin: verify NGOs, monitor flagged items, view admin dashboard analytics.'
    ].join('\n')
  },
  {
    id: 'registration',
    title: 'Registration & Login',
    keywords: ['register', 'signup', 'sign up', 'login', 'log in', 'account', 'role'],
    content: [
      'Registration:',
      '- Choose User or NGO during signup.',
      '- NGOs may require admin verification before they can fully operate (campaign creation/visibility depends on verification).',
      '',
      'Login:',
      '- Use your email + password.',
      '- There is no password recovery flow in the current app; if you forgot credentials, contact the admin/support team.'
    ].join('\n')
  },
  {
    id: 'donations',
    title: 'Donations, Receipts, and Certificates',
    keywords: ['donate', 'donation', 'payment', 'receipt', 'upi', 'card', 'confirm', 'certificate'],
    content: [
      'Donations flow:',
      '1. Open a campaign and click Donate.',
      '2. Complete payment (mock/razorpay depending on environment).',
      '3. After confirmation, the donation becomes "completed" and a receipt is generated.',
      '',
      'Certificates:',
      '- Donation certificates require NGO approval after a completed donation.',
      '- Common certificate statuses: not_requested, pending, approved, rejected.',
      '- If you see "Certificate is not available yet", it usually means approval is still pending (or not requested).',
      '',
      'Where to check:',
      '- User Dashboard -> Donation Details -> Receipt / Certificate status.'
    ].join('\n')
  },
  {
    id: 'volunteer_opps',
    title: 'Volunteer Opportunities (Applications)',
    keywords: ['volunteer opportunity', 'opportunity', 'apply', 'withdraw', 'complete', 'hours', 'assigned'],
    content: [
      'Volunteer Opportunities flow:',
      '1. Open Volunteer Opportunities and apply with your details.',
      '2. Status typically moves: applied/assigned -> completed.',
      '3. After you mark completion, the NGO reviews and approves the certificate.',
      '',
      'Certificates:',
      '- Only issued after NGO approval of a completed volunteer activity.',
      '- Common certificate statuses: not_requested, pending, approved, rejected.',
      '',
      'Where to check:',
      '- User Dashboard -> Volunteer History.'
    ].join('\n')
  },
  {
    id: 'campaign_volunteering',
    title: 'Campaign Volunteering (Onboarding + Approval)',
    keywords: ['campaign volunteer', 'volunteer for campaign', 'onboarding', 'registration', 'already volunteering', 'ngo details'],
    content: [
      'Campaign volunteering is separate from Volunteer Opportunities.',
      '',
      'How it works:',
      '- On a campaign page, submit the volunteer form (your onboarding details).',
      '- The NGO can approve/reject your campaign-volunteer registration from the NGO Dashboard.',
      '- On approval, a volunteer certificate is issued.',
      '',
      'Hours:',
      '- Campaign volunteer hours are recorded by the NGO (they can update hours after approval).',
      '',
      'Where to check:',
      '- User Dashboard -> Campaign Volunteer Registrations.'
    ].join('\n')
  },
  {
    id: 'support_requests',
    title: 'Request Support (Help Requests)',
    keywords: ['request support', 'support request', 'help request', 'request help', 'beneficiary request', 'need help'],
    content: [
      'Support Requests let users ask a specific NGO for help and track progress.',
      '',
      'User flow:',
      '- User Dashboard -> Request Support.',
      '- Select an NGO, enter the help type and optional details, then submit.',
      '- Track status updates as the NGO reviews your request.',
      '',
      'NGO flow:',
      '- NGO Dashboard -> Support Requests Inbox.',
      '- Review incoming requests and update status: Pending -> Approved -> In Progress -> Completed / Rejected.',
      '',
      'Admin:',
      '- Admin Dashboard shows totals + recent support requests.',
      '- Full list is available under Admin -> Support Requests.'
    ].join('\n')
  },
  {
    id: 'status_glossary',
    title: 'Status Glossary',
    keywords: ['pending', 'approved', 'rejected', 'completed', 'assigned', 'applied', 'status', 'meaning'],
    content: [
      'Common statuses you may see:',
      '',
      'Donations:',
      '- pending: payment initiated but not confirmed',
      '- completed: payment verified; receipt available',
      '',
      'Volunteer opportunities:',
      '- applied/assigned: request submitted (may be assigned by NGO)',
      '- completed: you marked the activity completed',
      '',
      'Certificate approval:',
      '- not_requested: approval not started yet',
      '- pending: waiting for NGO review',
      '- approved: certificate issued and available',
      '- rejected: needs changes; check the NGO note'
    ].join('\n')
  },
  {
    id: 'messaging',
    title: 'Messages and Communication',
    keywords: ['message', 'chat', 'inbox', 'contact ngo', 'reply'],
    content: [
      'Messaging:',
      '- Users can message a specific NGO (or broadcast to all NGOs, if enabled).',
      '- NGOs can reply to users.',
      '',
      'Where to check:',
      '- Messages page / Inbox in the dashboards.'
    ].join('\n')
  },
  {
    id: 'ngo_dashboard',
    title: 'NGO Dashboard',
    keywords: ['ngo dashboard', 'approval queue', 'transactions', 'pending', 'certificates', 'volunteers'],
    content: [
      'NGO Dashboard highlights:',
      '- Donation transactions + total received.',
      '- Donation certificate approval queue.',
      '- Volunteer certificate approval queue (volunteer opportunities).',
      '- Campaign volunteer registrations + approvals (campaign volunteering).',
      '- Support Requests inbox (beneficiary help requests + status updates).',
      '- Messages and unread count.'
    ].join('\n')
  },
  {
    id: 'admin_dashboard',
    title: 'Admin Dashboard',
    keywords: ['admin', 'verify', 'verification', 'analytics', 'flag', 'reports'],
    content: [
      'Admin capabilities:',
      '- Verify/disable NGOs.',
      '- Review flagged campaigns or requests.',
      '- View admin dashboard metrics (donations, volunteers, recent activity).',
      '- Track support requests submitted to NGOs.'
    ].join('\n')
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting Common Issues',
    keywords: ['not showing', 'missing', 'error', '404', '500', 'failed', 'bug', 'not available'],
    content: [
      'Troubleshooting quick checks:',
      '- If something is not showing, refresh the dashboard and ensure you are logged into the correct role.',
      '- Certificates appear only after the NGO approves (donation/volunteer).',
      '- Campaign volunteer details appear only after you submit the onboarding form on the campaign page.',
      '- If you see 404/500 errors in the browser console, ensure the backend is running and the API base URL is correct.'
    ].join('\n')
  },
  {
    id: 'security',
    title: 'Security and Privacy',
    keywords: ['password', 'credentials', 'otp', 'secret', 'private', 'data'],
    content: [
      'Security:',
      '- Never share passwords or ask others for their credentials.',
      '- The platform cannot reveal account passwords or private user data via chat.',
      '- If you need access to an account you do not own, contact the admin/support team.'
    ].join('\n')
  }
];

module.exports = { SUPPORT_KB };
