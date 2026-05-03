import axios from 'axios';
import { getUserRole, getValidToken } from '../utils/auth';

const normalizeBase = (value) => String(value || '').trim().replace(/\/+$/, '');
const envApiUrl = normalizeBase(process.env.REACT_APP_API_URL);
const LOCAL_API_URL = 'http://localhost:5001/api';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const isBrowser = typeof window !== 'undefined';
const browserHost = isBrowser ? String(window.location.hostname || '').toLowerCase() : '';
const isLocalBrowserHost = LOCAL_HOSTS.has(browserHost);

const resolveApiUrl = () => {
  if (envApiUrl) return envApiUrl;
  if (isLocalBrowserHost) return LOCAL_API_URL;
  return '/api';
};

const API_URL = resolveApiUrl();

const api = axios.create({ baseURL: API_URL });

const getRoleFromToken = () => getUserRole();

if (!envApiUrl && !isLocalBrowserHost) {
  // Helps diagnose broken API calls on deployed frontend builds (for example GitHub Pages).
  // In production-like hosts, set REACT_APP_API_URL to your deployed backend /api URL.
  // eslint-disable-next-line no-console
  console.warn('[NGO Connect] REACT_APP_API_URL is not set. Falling back to "/api".');
}

api.interceptors.request.use(config => {
  const token = getValidToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    if (config.headers && config.headers.Authorization) {
      delete config.headers.Authorization;
    }
    window.dispatchEvent(new Event('authChange'));
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    // Retry once if API base path is misconfigured (with/without /api or missing proxy)
    const { config, response } = error || {};
    if (response && response.status === 404 && config && !config.__retriedApiBase) {
      const currentBase = config.baseURL || api.defaults.baseURL || '';
      const candidates = [];
      const isAbsoluteBase = /^https?:\/\//i.test(currentBase);

      if (!isAbsoluteBase) {
        if (currentBase.startsWith('/')) {
          if (isLocalBrowserHost) {
            candidates.push(LOCAL_API_URL);
          }
        } else if (currentBase) {
          candidates.push('/api');
        }
        if (currentBase.endsWith('/api')) {
          candidates.push(currentBase.slice(0, -4));
        } else if (currentBase) {
          candidates.push(`${currentBase}/api`);
        }
      }
      const nextBase = candidates.find(base => base && base !== currentBase);
      if (nextBase) {
        config.__retriedApiBase = true;
        config.baseURL = nextBase;
        return api.request(config);
      }
    }
    if (
      error.response &&
      (error.response.status === 401 ||
        (error.response.status === 404 &&
          error.response.data &&
          error.response.data.message === 'User not found' &&
          getRoleFromToken() === 'user'))
    ) {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('authChange'));
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Volunteer opportunities
export const getVolunteerOpportunities = (params = {}) => api.get('/volunteering', { params });
export const getMyVolunteerOpportunities = () => api.get('/volunteering/my');
export const getMyVolunteerApplications = () => api.get('/volunteering/my/applications');
export const getNgoVolunteerOpportunities = (ngoId) => api.get(`/volunteering/ngo/${ngoId}`);
export const createVolunteerOpportunity = (data) => api.post('/volunteering', data);
export const applyToVolunteer = (id, data = {}) => api.post(`/volunteering/${id}/apply`, data);
export const withdrawVolunteerApplication = (id) => api.delete(`/volunteering/${id}/withdraw`);
export const completeVolunteerActivity = (id, data = {}) => api.post(`/volunteering/${id}/complete`, data);
export const deleteVolunteerOpportunity = (id) => api.delete(`/volunteering/${id}`);

// Donations + certificates
export const getMyDonations = () => api.get('/donations/my');
export const getDonationReceipt = (donationId) => api.get(`/donations/${donationId}/receipt`);
export const initiateDonationPayment = (campaignId, data) => api.post(`/donations/campaign/${campaignId}/initiate`, data);
export const confirmDonationPayment = (donationId, data) => api.post(`/donations/${donationId}/confirm`, data);
export const getNgoDonationApprovalQueue = () => api.get('/donations/ngo/pending-approvals');
export const getNgoDonationTransactions = (params = {}) => api.get('/donations/ngo/transactions', { params });
export const reviewDonationCertificateRequest = (donationId, data) =>
  api.post(`/donations/${donationId}/certificate/decision`, data);
export const getMyCertificates = () => api.get('/certificates/my');
export const getCertificateById = (certificateId) => api.get(`/certificates/${certificateId}`);
export const downloadCertificate = (certificateId) =>
  api.get(`/certificates/${certificateId}/download`, { responseType: 'blob' });

export const getNgoVolunteerApprovalQueue = () => api.get('/volunteering/approvals/ngo/pending');
export const getNgoVolunteerRequests = (params = {}) => api.get('/volunteering/ngo/requests', { params });
export const reviewVolunteerCertificateRequest = (applicationId, data) =>
  api.post(`/volunteering/applications/${applicationId}/certificate/decision`, data);

// Campaign volunteer registrations (campaign volunteer feature)
export const getNgoCampaignVolunteers = (params = {}) => api.get('/campaigns/ngo/volunteers', { params });
export const getNgoCampaignUpdateAnalytics = () => api.get('/campaigns/ngo/campaign-updates/analytics');
export const getMyCampaignVolunteerRegistrations = () => api.get('/campaigns/my/volunteer-registrations');
export const reviewCampaignVolunteerRegistration = (campaignId, data) =>
  api.post(`/campaigns/${campaignId}/volunteer/decision`, data);
export const postCampaignUpdate = (campaignId, data) => api.post(`/campaigns/${campaignId}/updates`, data);
export const getCampaignUpdateAnalytics = (campaignId) => api.get(`/campaigns/${campaignId}/updates/analytics`);

// Messages
export const getMessageConversations = () => api.get('/messages/conversations');
export const getMessageThread = (counterpartId) => api.get(`/messages/thread/${counterpartId}`);
export const markMessageThreadRead = (counterpartId) => api.post(`/messages/thread/${counterpartId}/read`);
export const sendMessageToNgo = (ngoId, body) => api.post(`/messages/to-ngo/${ngoId}`, { body });
export const sendMessageToAllNgos = (body) => api.post('/messages/to-all-ngos', { body });
export const sendMessageToUser = (userId, body) => api.post(`/messages/to-user/${userId}`, { body });
export const trackNotificationEngagement = (notificationId, data = {}) =>
  api.post(`/notifications/${notificationId}/open`, data);

// Admin dashboard
export const getAdminDashboard = (params = {}) => api.get('/admin/dashboard', { params });
export const getAdminWebhookDeliveries = (params = {}) => api.get('/admin/webhooks', { params });
export const getAdminWebhookMetrics = (params = {}) => api.get('/admin/webhooks/metrics', { params });
export const exportAdminWebhooks = (params = {}) =>
  api.get('/admin/webhooks/export', { params, responseType: params.format === 'json' ? 'json' : 'blob' });
export const retryAdminWebhookDelivery = (deliveryId, data = {}) =>
  api.post(`/admin/webhooks/${deliveryId}/retry`, data);
export const getAdminWebhookWorkerStatus = () => api.get('/admin/webhooks/worker/status');
export const runAdminWebhookWorkerTick = () => api.post('/admin/webhooks/worker/run');
export const runAdminWebhookCleanup = (data = {}) => api.post('/admin/webhooks/cleanup', data);

// User preferences for AI recommendations
export const getUserPreferences = () => api.get('/users/preferences');
export const updateUserPreferences = (data) => api.put('/users/preferences', data);

// AI Recommendations
export const getAIRecommendations = () => api.get('/ai/recommendations');
export const generateProposalDraft = (data) => api.post('/ai/proposal-draft', data);
export const forecastCampaignSuccess = (data) => api.post('/ai/campaign-forecast', data);

// Categories
export const getAvailableCategories = () => api.get('/categories');
export const getAllCategories = () => api.get('/categories/all');
export const createCategory = (data) => api.post('/categories', data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);

// Help Requests
export const createHelpRequest = (data) => api.post('/requests', data);
export const getMyHelpRequests = () => api.get('/requests/my');
export const getNgoHelpRequests = () => api.get('/requests/ngo');
export const updateHelpRequestStatus = (id, status) => api.put(`/requests/${id}/status`, { status });
export const getAllHelpRequests = () => api.get('/admin/requests');

// NGOs
export const getNgos = (params = {}) => api.get('/ngos', { params });
export const getNgoProfile = () => api.get('/ngos/me');
export const updateNgoProfile = (data) => api.put('/ngos/me', data);
export const getNgoMembers = () => api.get('/ngos/me/members');
export const addNgoMember = (data) => api.post('/ngos/me/members', data);
export const getNgoTransparencyScore = (ngoId) => api.get(`/ngos/${ngoId}/transparency`);

// Innovation APIs
export const listGivingCircles = (params = {}) => api.get('/innovation/giving-circles', { params });
export const getGivingCircleDetails = (circleId) => api.get(`/innovation/giving-circles/${circleId}`);
export const createGivingCircle = (data) => api.post('/innovation/giving-circles', data);
export const joinGivingCircle = (circleId) => api.post(`/innovation/giving-circles/${circleId}/join`, {});
export const contributeGivingCircle = (circleId, data) => api.post(`/innovation/giving-circles/${circleId}/contribute`, data);

export const listWishlistItems = (params = {}) => api.get('/innovation/wishlists/items', { params });
export const createWishlistItem = (data) => api.post('/innovation/wishlists/items', data);
export const getNgoWishlistItems = () => api.get('/innovation/wishlists/ngo');
export const pledgeWishlistItem = (itemId, data) => api.post(`/innovation/wishlists/items/${itemId}/pledge`, data);
export const updateWishlistPledgeStatus = (pledgeId, data) => api.post(`/innovation/wishlists/pledges/${pledgeId}/status`, data);

export const createVolunteerShift = (data) => api.post('/innovation/volunteer/shifts', data);
export const listVolunteerShifts = (params = {}) => api.get('/innovation/volunteer/shifts', { params });
export const listMyVolunteerShiftSignups = () => api.get('/innovation/volunteer/shifts/my');
export const signupVolunteerShift = (shiftId) => api.post(`/innovation/volunteer/shifts/${shiftId}/signup`, {});
export const sendVolunteerShiftReminders = (data = {}) => api.post('/innovation/volunteer/shifts/reminders/run', data);
export const createVolunteerLog = (signupId, data) => api.post(`/innovation/volunteer/logs/${signupId}`, data);
export const getNgoVolunteerLogs = (params = {}) => api.get('/innovation/volunteer/logs/ngo', { params });
export const approveVolunteerLog = (logId, data) => api.post(`/innovation/volunteer/logs/${logId}/approve`, data);
export const exportNgoVolunteerLogs = () =>
  api.get('/innovation/volunteer/logs/ngo/export', { responseType: 'blob' });

export const getCrmDonors = (params = {}) => api.get('/innovation/crm/donors', { params });
export const createCrmDonorNote = (donorUserId, data) => api.post(`/innovation/crm/donors/${donorUserId}/notes`, data);
export const getCrmDonorNotes = (donorUserId) => api.get(`/innovation/crm/donors/${donorUserId}/notes`);
export const createCrmSegment = (data) => api.post('/innovation/crm/segments', data);
export const listCrmSegments = () => api.get('/innovation/crm/segments');
export const addCrmSegmentMembers = (segmentId, data) => api.post(`/innovation/crm/segments/${segmentId}/members`, data);
export const sendCrmSegmentMessage = (segmentId, data) => api.post(`/innovation/crm/segments/${segmentId}/campaign-message`, data);

export const createImpactUpdate = (data) => api.post('/innovation/impact-updates', data);
export const getImpactUpdatesForCampaign = (campaignId, params = {}) =>
  api.get(`/innovation/impact-updates/campaign/${campaignId}`, { params });
export const getNgoImpactUpdates = (params = {}) => api.get('/innovation/impact-updates/ngo', { params });

export const createCorporateProfile = (data) => api.post('/innovation/corporate/profiles', data);
export const getMyCorporateProfiles = () => api.get('/innovation/corporate/profiles/my');
export const linkCorporateProfile = (profileId, data) => api.post(`/innovation/corporate/profiles/${profileId}/link`, data);
export const listCorporateEmployees = (profileId) => api.get(`/innovation/corporate/profiles/${profileId}/employees`);
export const approveCorporateEmployeeLink = (profileId, linkId) =>
  api.post(`/innovation/corporate/profiles/${profileId}/employees/${linkId}/approve`, {});
export const evaluateCorporateMatch = (data) => api.post('/innovation/corporate/matches/evaluate', data);
export const approveCorporateMatch = (matchId) => api.post(`/innovation/corporate/matches/${matchId}/approve`, {});
export const getMyCorporateMatches = () => api.get('/innovation/corporate/matches/my');

export const toggleEmergencyCampaign = (campaignId, data) => api.post(`/innovation/emergency/campaigns/${campaignId}`, data);
export const toggleEmergencyOpportunity = (opportunityId, data) =>
  api.post(`/innovation/emergency/opportunities/${opportunityId}`, data);
export const getEmergencyFeed = () => api.get('/innovation/emergency/feed');

export const createVolunteerEndorsement = (data) => api.post('/innovation/endorsements', data);
export const getMyVolunteerEndorsements = () => api.get('/innovation/endorsements/my');

export const getGamificationSummary = () => api.get('/innovation/gamification/me');
export const getGamificationLeaderboard = (params = {}) => api.get('/innovation/gamification/leaderboard', { params });

export default api;
