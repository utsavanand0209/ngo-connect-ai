import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function NgoProfileUpdate() {
  const [ngo, setNgo] = useState({
    name: '',
    email: '',
    category: '',
    description: '',
    location: ''
  });
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch current NGO data if logged in
    const fetchNgo = async () => {
      try {
        const res = await api.get('/ngos/me');
        setNgo(res.data);
      } catch (err) {
        console.log('No profile found, ready to create');
      }
    };
    fetchNgo();
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setNgo(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setDocs(e.target.files);
  };

  const submitProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const res = await api.put('/ngos/me', ngo);
      setMessage('Profile updated successfully!');
      setNgo(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    }
    setLoading(false);
  };

  const uploadDocs = async (e) => {
    e.preventDefault();
    if (!docs || docs.length === 0) {
      setError('Please select at least one document');
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const formData = new FormData();
      for (let i = 0; i < docs.length; i++) {
        formData.append('docs', docs[i]);
      }

      const res = await api.post('/ngos/me/verify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setMessage('Documents uploaded successfully! Your NGO is under verification.');
      setDocs([]);
      // Clear file input
      document.getElementById('fileInput').value = '';
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload documents');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">NGO Profile & Verification</h1>

        {message && <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg">{message}</div>}
        {error && <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Profile Form */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">NGO Profile</h2>
            <form onSubmit={submitProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Organization Name *</label>
                <input
                  type="text"
                  name="name"
                  value={ngo.name}
                  onChange={handleProfileChange}
                  placeholder="Enter NGO name"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  name="email"
                  value={ngo.email}
                  onChange={handleProfileChange}
                  placeholder="Enter email"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Category *</label>
                <select
                  name="category"
                  value={ngo.category}
                  onChange={handleProfileChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                >
                  <option value="">Select Category</option>
                  <option value="Education">Education</option>
                  <option value="Health">Health</option>
                  <option value="Food">Food & Nutrition</option>
                  <option value="Disaster Relief">Disaster Relief</option>
                  <option value="Environment">Environment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Location *</label>
                <input
                  type="text"
                  name="location"
                  value={ngo.location}
                  onChange={handleProfileChange}
                  placeholder="City, Country"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  name="description"
                  value={ngo.description}
                  onChange={handleProfileChange}
                  placeholder="Tell us about your NGO and its mission"
                  rows="5"
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

          {/* Document Upload */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Verification Documents</h2>
            
            <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mb-6 rounded">
              <p className="text-blue-900 font-semibold">📋 Required Documents:</p>
              <ul className="text-blue-800 mt-2 space-y-1 text-sm">
                <li>✓ Registration Certificate</li>
                <li>✓ Tax ID (12A/80G Certificate)</li>
                <li>✓ Address Proof</li>
                <li>✓ Board Members List</li>
                <li>✓ Latest Audit Report (Optional)</li>
              </ul>
            </div>

            <form onSubmit={uploadDocs} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Documents (PDF, DOC, Image)</label>
                <input
                  id="fileInput"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>

              {docs.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Selected Files ({docs.length}):</p>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {Array.from(docs).map((doc, idx) => (
                      <li key={idx} className="flex items-center">
                        <span className="text-green-600 mr-2">✓</span>
                        {doc.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || docs.length === 0}
                className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
              >
                {loading ? 'Uploading...' : 'Submit for Verification'}
              </button>
            </form>

            <div className="mt-8 p-4 bg-yellow-50 border-l-4 border-yellow-600 rounded">
              <p className="text-yellow-900 text-sm">
                <strong>⏱️ Verification Process:</strong> Our admin team will review your documents within 48 hours. You'll be notified via email once your NGO is verified.
              </p>
            </div>

            <div className="mt-6 p-4 bg-purple-50 border-l-4 border-purple-600 rounded">
              <p className="text-purple-900 text-sm">
                <strong>🔒 Data Security:</strong> All documents are securely stored and used only for verification purposes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
