import axios from 'axios';

const normalizeBase = (value) => value.replace(/\/+$/, '');
const envApiUrl = process.env.REACT_APP_API_URL;
const LOCAL_API_URL = 'http://localhost:5001/api';
const API_URL = normalizeBase(envApiUrl || LOCAL_API_URL);

const api = axios.create({ baseURL: API_URL });

const getRoleFromToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch (err) {
    return null;
  }
};

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
          candidates.push(LOCAL_API_URL);
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

// Messages
export const getMessageConversations = () => api.get('/messages/conversations');
export const getMessageThread = (counterpartId) => api.get(`/messages/thread/${counterpartId}`);
export const markMessageThreadRead = (counterpartId) => api.post(`/messages/thread/${counterpartId}/read`);
export const sendMessageToNgo = (ngoId, body) => api.post(`/messages/to-ngo/${ngoId}`, { body });
export const sendMessageToAllNgos = (body) => api.post('/messages/to-all-ngos', { body });
export const sendMessageToUser = (userId, body) => api.post(`/messages/to-user/${userId}`, { body });

// User preferences for AI recommendations
export const getUserPreferences = () => api.get('/users/preferences');
export const updateUserPreferences = (data) => api.put('/users/preferences', data);

// AI Recommendations
export const getAIRecommendations = () => api.get('/ai/recommendations');

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

export default api;
