import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { getUserRole } from '../utils/auth';

export default function VolunteerCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('');
  const isAuthenticated = !!localStorage.getItem('token');
  const role = getUserRole();
  const isUser = role === 'user';

  useEffect(() => {
    setLoading(true);
    api.get('/campaigns')
      .then(res => setCampaigns(res.data))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoading(false));
  }, []);

  const volunteerCampaigns = useMemo(() => {
    return campaigns.filter(c => c.volunteersNeeded && c.volunteersNeeded.length > 0);
  }, [campaigns]);

  const filtered = useMemo(() => {
    return volunteerCampaigns.filter(c => {
      const matchesSearch = c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = !location || (c.location || '').toLowerCase().includes(location.toLowerCase());
      return matchesSearch && matchesLocation;
    });
  }, [volunteerCampaigns, searchTerm, location]);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow p-8 mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900">Volunteer in Campaigns</h1>
          <p className="text-gray-600 mt-2">Join campaigns that need hands-on support and make a direct impact.</p>
          <div className="mt-4">
            {isAuthenticated && isUser ? (
              <p className="text-sm text-gray-600">You can volunteer directly from any campaign page.</p>
            ) : isAuthenticated && !isUser ? (
              <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 inline-block px-3 py-2 rounded-lg">
                Volunteering is available for user accounts only.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Link to="/login" className="px-4 py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600">
                  Login to Volunteer
                </Link>
                <Link to="/register" className="px-4 py-2 rounded-lg border border-orange-500 text-orange-500 font-semibold hover:bg-orange-50">
                  Create Account
                </Link>
              </div>
            )}
          </div>
        </div>

        {isUser && (
          <div className="bg-white rounded-xl shadow p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title or description"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Filter by location"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}

        {isUser && (
          <>
            {loading ? (
              <div className="text-center py-12">Loading volunteer campaigns...</div>
            ) : error ? (
              <div className="text-center text-red-600 py-12">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No volunteer campaigns found.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map(campaign => (
                  <div key={campaign.id} className="bg-white rounded-lg shadow p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-900">{campaign.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{campaign.ngo?.name || 'NGO'}</p>
                    <p className="text-gray-600 mt-3 line-clamp-3">{campaign.description || 'No description available.'}</p>
                    <div className="mt-3 text-sm text-gray-500">{campaign.location || 'Location TBD'}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {campaign.volunteersNeeded?.slice(0, 4).map((role, idx) => (
                        <span key={idx} className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                          {role}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4">
                      {isAuthenticated ? (
                        <Link
                          to={`/campaigns/${campaign.id}`}
                          className="block w-full text-center px-4 py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600"
                        >
                          Volunteer Now
                        </Link>
                      ) : (
                        <Link
                          to="/login"
                          className="block w-full text-center px-4 py-2 rounded-lg border border-orange-500 text-orange-500 font-semibold hover:bg-orange-50"
                        >
                          Login to Volunteer
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
