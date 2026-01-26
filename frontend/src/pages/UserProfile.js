import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function UserProfile() {
  const [user, setUser] = useState({
    name: '',
    email: '',
    interests: '',
    skills: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get('/auth/me');
        const userData = {
          ...res.data,
          interests: Array.isArray(res.data.interests) ? res.data.interests.join(', ') : '',
          skills: Array.isArray(res.data.skills) ? res.data.skills.join(', ') : '',
        };
        setUser(userData);
      } catch (err) {
        console.log('No profile found, ready to create');
      }
    };
    fetchUser();
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setUser(prev => ({ ...prev, [name]: value }));
  };

  const submitProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const updatedUser = {
        ...user,
        interests: user.interests ? user.interests.split(',').map(item => item.trim()) : [],
        skills: user.skills ? user.skills.split(',').map(item => item.trim()) : [],
      };
      const res = await api.put('/auth/me', updatedUser);
      
      const userData = {
        ...res.data,
        interests: Array.isArray(res.data.interests) ? res.data.interests.join(', ') : '',
        skills: Array.isArray(res.data.skills) ? res.data.skills.join(', ') : '',
      };
      
      setUser(userData);
      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Your Profile</h1>

        {message && <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg">{message}</div>}
        {error && <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">User Details</h2>
          <form onSubmit={submitProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                name="name"
                value={user.name}
                onChange={handleProfileChange}
                placeholder="Enter your name"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
              <input
                type="email"
                name="email"
                value={user.email}
                onChange={handleProfileChange}
                placeholder="Enter email"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Interests</label>
              <input
                type="text"
                name="interests"
                value={user.interests}
                onChange={handleProfileChange}
                placeholder="e.g., Education, Health, Environment"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Skills</label>
              <input
                type="text"
                name="skills"
                value={user.skills}
                onChange={handleProfileChange}
                placeholder="e.g., Web Development, Marketing, Writing"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
