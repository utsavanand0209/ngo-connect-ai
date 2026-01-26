import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('');
  const [stats, setStats] = useState({ ngos: 0, campaigns: 0, donations: 0 });
  const [myDonationTotal, setMyDonationTotal] = useState(0);
  const [myVolunteerCount, setMyVolunteerCount] = useState(0);
  const [donationDetails, setDonationDetails] = useState([]);
  const [volunteerDetails, setVolunteerDetails] = useState([]);
  const [showDonations, setShowDonations] = useState(false);
  const [showVolunteered, setShowVolunteered] = useState(false);
  const [ngoCount, setNgoCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState([]);
  const [donationCampaignId, setDonationCampaignId] = useState('');
  const [donationAmount, setDonationAmount] = useState('');
  const [donationLoading, setDonationLoading] = useState(false);
  const [donationMessage, setDonationMessage] = useState('');

  // Helper to fetch donation and volunteer stats
  const fetchStats = () => {
    api.get('/donations/my')
      .then(res => {
        setDonationDetails(res.data);
        const total = res.data.reduce((sum, d) => sum + (d.amount || 0), 0);
        setMyDonationTotal(total);
      })
      .catch((err) => {
        setMyDonationTotal(0);
        setDonationDetails([]);
      });
    api.get('/campaigns/my/volunteered')
      .then(res => {
        setVolunteerDetails(res.data);
        setMyVolunteerCount(res.data.length);
      })
      .catch((err) => {
        setMyVolunteerCount(0);
        setVolunteerDetails([]);
      });
  };

  useEffect(() => {
    // Decode JWT to get user info
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setRole(payload.role);
        setUser(payload);
      } catch (err) {
        console.error('Failed to decode token');
      }
    }
    // Fetch campaigns for donation
    api.get('/campaigns')
      .then(res => {
        setCampaigns(res.data);
        setCampaignCount(res.data.length);
      })
      .catch(() => {
        setCampaigns([]);
        setCampaignCount(0);
      })
      .finally(() => setLoading(false));
    // Fetch verified NGOs
    api.get('/ngos')
      .then(res => setNgoCount(res.data.length))
      .catch(() => setNgoCount(0));
    fetchStats();
  }, []);

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  if (role === 'admin') {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-800 mb-8">Admin Dashboard</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-red-600">
              <h3 className="text-lg font-semibold text-gray-700">Pending NGO Verifications</h3>
              <p className="text-3xl font-bold text-red-600 mt-2">⚠️</p>
              <Link to="/admin" className="mt-4 inline-block px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                View & Verify
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-yellow-600">
              <h3 className="text-lg font-semibold text-gray-700">Flagged Content</h3>
              <p className="text-3xl font-bold text-yellow-600 mt-2">🚩</p>
              <p className="text-sm text-gray-600 mt-4">AI-detected suspicious NGOs & campaigns</p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-600">
              <h3 className="text-lg font-semibold text-gray-700">User Management</h3>
              <p className="text-3xl font-bold text-blue-600 mt-2">👥</p>
              <p className="text-sm text-gray-600 mt-4">Delete fake/spam accounts</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link to="/admin" className="p-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:shadow-lg transition">
                <span className="text-2xl">✓</span> Verify NGOs
              </Link>
              <button className="p-4 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg hover:shadow-lg transition">
                <span className="text-2xl">🚫</span> Review Flagged Content
              </button>
              <button className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition">
                <span className="text-2xl">📊</span> View Analytics
              </button>
              <button className="p-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition">
                <span className="text-2xl">📧</span> Send Notifications
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'ngo') {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">NGO Dashboard</h1>
          <p className="text-gray-600 mb-8">Welcome, {user?.email}</p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-3xl">📋</p>
              <h3 className="text-gray-600 mt-2">Profile Status</h3>
              <p className="text-2xl font-bold text-blue-600 mt-2">⏳ Pending</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-3xl">📢</p>
              <h3 className="text-gray-600 mt-2">Active Campaigns</h3>
              <p className="text-2xl font-bold text-green-600 mt-2">0</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-3xl">💰</p>
              <h3 className="text-gray-600 mt-2">Total Donations</h3>
              <p className="text-2xl font-bold text-purple-600 mt-2">$0</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-3xl">👥</p>
              <h3 className="text-gray-600 mt-2">Volunteers</h3>
              <p className="text-2xl font-bold text-orange-600 mt-2">0</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">🎯 Quick Actions</h2>
              <div className="space-y-3">
                <Link to="/ngo/profile" className="block p-4 bg-blue-50 border-l-4 border-blue-600 rounded hover:bg-blue-100 transition">
                  <span className="font-semibold text-blue-600">Complete Your Profile</span>
                  <p className="text-sm text-gray-600">Upload verification documents to get verified</p>
                </Link>
                <Link to="/campaigns/create" className="block p-4 bg-green-50 border-l-4 border-green-600 rounded hover:bg-green-100 transition">
                  <span className="font-semibold text-green-600">Create New Campaign</span>
                  <p className="text-sm text-gray-600">Launch a fundraising or volunteering campaign</p>
                </Link>
                <Link to="/messages" className="block p-4 bg-purple-50 border-l-4 border-purple-600 rounded hover:bg-purple-100 transition">
                  <span className="font-semibold text-purple-600">View Messages</span>
                  <p className="text-sm text-gray-600">Check inquiries from users</p>
                </Link>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">📋 Verification Status</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded">
                  <span className="text-gray-700">Documents Submitted</span>
                  <span className="text-yellow-600 font-bold">⏳ Pending</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="text-gray-700">Admin Review</span>
                  <span className="text-gray-600 font-bold">⏸ Waiting</span>
                </div>
                <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-600 rounded">
                  <p className="text-sm text-blue-900">
                    <strong>⏱️ Expected Timeline:</strong> Verification takes 24-48 hours. You'll receive an email notification once approved.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular User Dashboard
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Welcome to NGO Connect!</h1>
        <p className="text-gray-600 mb-8">Your personal dashboard to discover and support NGOs</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition cursor-pointer" onClick={() => navigate('/ngos')}>
            <p className="text-4xl">🔍</p>
            <h3 className="text-gray-600 mt-2">Verified NGOs</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">{ngoCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition cursor-pointer" onClick={() => navigate('/campaigns')}>
            <p className="text-4xl">📢</p>
            <h3 className="text-gray-600 mt-2">Active Campaigns</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">{campaignCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition cursor-pointer" onClick={() => setShowDonations(true)}>
            <p className="text-4xl">💰</p>
            <h3 className="text-gray-600 mt-2">Donated</h3>
            <p className="text-3xl font-bold text-purple-600 mt-2">₹{myDonationTotal}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition cursor-pointer" onClick={() => setShowVolunteered(true)}>
            <p className="text-4xl">🤝</p>
            <h3 className="text-gray-600 mt-2">Volunteered</h3>
            <p className="text-3xl font-bold text-orange-600 mt-2">{myVolunteerCount}</p>
          </div>
              {/* Donation Details Modal */}
              {showDonations && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full relative">
                    <button className="absolute top-2 right-4 text-2xl" onClick={() => setShowDonations(false)}>&times;</button>
                    <h2 className="text-xl font-bold mb-4">Your Donations</h2>
                    {donationDetails.length === 0 ? (
                      <p className="text-gray-600">No donations found.</p>
                    ) : (
                      <ul className="divide-y">
                        {donationDetails.map((d, i) => (
                          <li key={d._id || i} className="py-2 flex justify-between items-center">
                            <span>Campaign: {d.campaign ? d.campaign : d.campaignId || 'N/A'}</span>
                            <span className="font-semibold">₹{d.amount}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              {/* Volunteered Campaigns Modal */}
              {showVolunteered && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full relative">
                    <button className="absolute top-2 right-4 text-2xl" onClick={() => setShowVolunteered(false)}>&times;</button>
                    <h2 className="text-xl font-bold mb-4">Your Volunteered Campaigns</h2>
                    {volunteerDetails.length === 0 ? (
                      <p className="text-gray-600">No volunteered campaigns found.</p>
                    ) : (
                      <ul className="divide-y">
                        {volunteerDetails.map((c, i) => (
                          <li key={c._id || i} className="py-2">
                            <span className="font-semibold">{c.title || 'Campaign'}</span>
                            <span className="block text-sm text-gray-500">{c.description}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">🎯 Explore & Support</h2>
            <div className="space-y-3">
              <Link to="/ngos" className="block p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-600 rounded hover:shadow transition">
                <span className="font-semibold text-blue-600">Browse Verified NGOs</span>
                <p className="text-sm text-gray-600">Find NGOs working in your areas of interest</p>
              </Link>
              <Link to="/campaigns" className="block p-4 bg-gradient-to-r from-green-50 to-green-100 border-l-4 border-green-600 rounded hover:shadow transition">
                <span className="font-semibold text-green-600">View All Campaigns</span>
                <p className="text-sm text-gray-600">Donate to campaigns or volunteer</p>
              </Link>
              <Link to="/chatbot" className="block p-4 bg-gradient-to-r from-purple-50 to-purple-100 border-l-4 border-purple-600 rounded hover:shadow transition">
                <span className="font-semibold text-purple-600">Ask Our AI Chatbot</span>
                <p className="text-sm text-gray-600">Get personalized NGO recommendations</p>
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">💡 Get Started</h2>
            <div className="space-y-3">
              <Link to="/profile" className="block p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 border-l-4 border-yellow-600 rounded hover:shadow transition">
                <h3 className="font-semibold text-yellow-600">📋 Complete Your Profile</h3>
                <p className="text-sm text-gray-600 mt-2">Add your interests and skills to get better NGO recommendations</p>
              </Link>
              <div className="block p-4 bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-600 rounded hover:shadow transition">
                <h3 className="font-semibold text-red-600">💳 Make Your Donation</h3>
                {campaigns.length === 0 ? (
                  <p className="text-sm text-gray-600 mt-2">There is nothing inside to donate.</p>
                ) : (
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      setDonationLoading(true);
                      setDonationMessage('');
                      try {
                        await api.post(`/donations/campaign/${donationCampaignId}`, {
                          amount: donationAmount
                        });
                        setDonationMessage('Donation successful!');
                        setDonationAmount('');
                        setDonationCampaignId('');
                        setTimeout(() => setDonationMessage(''), 2000);
                        await fetchStats();
                    } catch (err) {
                      setDonationMessage('Donation failed.');
                      console.error('Donation error:', err);
                    }
                    setDonationLoading(false);
                    }}
                    className="space-y-2 mt-2"
                  >
                    <label className="block text-sm font-medium text-gray-700">Select Campaign</label>
                    <select
                      value={donationCampaignId}
                      onChange={e => setDonationCampaignId(e.target.value)}
                      className="block w-full border-gray-300 rounded-md"
                      required
                    >
                      <option value="" disabled>Select a campaign</option>
                      {campaigns.map(c => (
                        <option key={c._id} value={c._id}>{c.title}</option>
                      ))}
                    </select>
                    <label className="block text-sm font-medium text-gray-700">Amount</label>
                    <input
                      type="number"
                      min="1"
                      value={donationAmount}
                      onChange={e => setDonationAmount(e.target.value)}
                      className="block w-full border-gray-300 rounded-md"
                      required
                    />
                    <button
                      type="submit"
                      className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                      disabled={donationLoading}
                    >
                      {donationLoading ? 'Donating...' : 'Donate'}
                    </button>
                    {donationMessage && <p className="text-sm mt-2">{donationMessage}</p>}
                  </form>
                )}
              </div>
              <div className="block p-4 bg-gradient-to-r from-teal-50 to-teal-100 border-l-4 border-teal-600 rounded hover:shadow transition">
                <h3 className="font-semibold text-teal-600">🤝 Volunteer for a Campaign</h3>
                {campaigns.length === 0 ? (
                  <p className="text-sm text-gray-600 mt-2">There is nothing inside to volunteer.</p>
                ) : (
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      setDonationLoading(true);
                      setDonationMessage('');
                      try {
                        await api.post(`/campaigns/${donationCampaignId}/volunteer`);
                        setDonationMessage('Successfully volunteered!');
                        setDonationCampaignId('');
                        setTimeout(() => setDonationMessage(''), 2000);
                        await fetchStats();
                      } catch (err) {
                        setDonationMessage('Failed to volunteer.');
                        console.error('Volunteer error:', err);
                      }
                      setDonationLoading(false);
                    }}
                    className="space-y-2 mt-2"
                  >
                    <label className="block text-sm font-medium text-gray-700">Select Campaign</label>
                    <select
                      value={donationCampaignId}
                      onChange={e => setDonationCampaignId(e.target.value)}
                      className="block w-full border-gray-300 rounded-md"
                      required
                    >
                      <option value="" disabled>Select a campaign</option>
                      {campaigns.map(c => (
                        <option key={c._id} value={c._id}>{c.title}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="mt-2 px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
                      disabled={donationLoading}
                    >
                      {donationLoading ? 'Submitting...' : 'Volunteer'}
                    </button>
                    {donationMessage && <p className="text-sm mt-2">{donationMessage}</p>}
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-4">🤖 AI-Powered Recommendations</h2>
          <p className="mb-6">Our smart matching algorithm suggests NGOs and campaigns based on your interests, location, and past activity.</p>
          <button onClick={() => navigate('/chatbot')} className="px-6 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-gray-100 transition">
            Get Personalized Recommendations →
          </button>
        </div>
      </div>
    </div>
  );
}
