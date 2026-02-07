import React, { useState, useEffect } from 'react';
import api, { getMyCertificates, getCertificateById, downloadCertificate } from '../services/api';

const openHtmlDocument = (html) => {
  const viewer = window.open('', '_blank');
  if (!viewer) return false;
  viewer.document.open();
  viewer.document.write(html);
  viewer.document.close();
  return true;
};

export default function UserProfile() {
  const [user, setUser] = useState({
    name: '',
    email: '',
    mobileNumber: '',
    interests: '',
    skills: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [certificates, setCertificates] = useState([]);
  const [certificatesLoading, setCertificatesLoading] = useState(true);
  const [certificateActionLoading, setCertificateActionLoading] = useState({});

  const loadUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const userData = {
        ...res.data,
        mobileNumber: res.data.mobileNumber || '',
        interests: Array.isArray(res.data.interests) ? res.data.interests.join(', ') : '',
        skills: Array.isArray(res.data.skills) ? res.data.skills.join(', ') : ''
      };
      setUser(userData);
    } catch (err) {
      setError('Could not load user profile. Please try again later.');
    }
  };

  const loadCertificates = async () => {
    setCertificatesLoading(true);
    try {
      const res = await getMyCertificates();
      setCertificates(res.data || []);
    } catch (err) {
      setCertificates([]);
    } finally {
      setCertificatesLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    loadCertificates();
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setUser((prev) => ({ ...prev, [name]: value }));
  };

  const submitProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const updatedUser = {
        ...user,
        interests: user.interests ? user.interests.split(',').map((item) => item.trim()) : [],
        skills: user.skills ? user.skills.split(',').map((item) => item.trim()) : []
      };
      const res = await api.put('/auth/me', updatedUser);

      const userData = {
        ...res.data,
        mobileNumber: res.data.mobileNumber || '',
        interests: Array.isArray(res.data.interests) ? res.data.interests.join(', ') : '',
        skills: Array.isArray(res.data.skills) ? res.data.skills.join(', ') : ''
      };

      setUser(userData);
      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    }
    setLoading(false);
  };

  const withCertificateLoading = async (certificateId, fn) => {
    setCertificateActionLoading((prev) => ({ ...prev, [certificateId]: true }));
    try {
      await fn();
    } finally {
      setCertificateActionLoading((prev) => ({ ...prev, [certificateId]: false }));
    }
  };

  const viewCertificate = async (certificateId) => {
    await withCertificateLoading(certificateId, async () => {
      try {
        const res = await getCertificateById(certificateId);
        const opened = openHtmlDocument(res?.data?.html || '<p>Unable to load certificate.</p>');
        if (!opened) {
          setError('Please allow popups to view certificates.');
        }
      } catch (err) {
        setError('Failed to open certificate.');
      }
    });
  };

  const downloadCertificateFile = async (certificateId, certificateNumber) => {
    await withCertificateLoading(certificateId, async () => {
      try {
        const res = await downloadCertificate(certificateId);
        const blob = new Blob([res.data], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${certificateNumber || 'certificate'}.html`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError('Failed to download certificate.');
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-gray-900">Your Profile</h1>
          <p className="mt-2 text-lg text-gray-600">Keep your information up to date and manage your certificates.</p>
        </header>

        {message && <div className="mb-6 p-4 bg-green-100 border border-green-300 text-green-800 rounded-lg">{message}</div>}
        {error && <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-lg">{error}</div>}

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <div className="md:col-span-1 flex flex-col items-center">
              <img className="h-32 w-32 rounded-full object-cover" src="https://source.unsplash.com/random/200x200?face" alt="Profile" />
              <button className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-500">Change Picture</button>
            </div>
            <form onSubmit={submitProfile} className="md:col-span-2 space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  value={user.name}
                  onChange={handleProfileChange}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={user.email}
                  onChange={handleProfileChange}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="mobileNumber" className="block text-sm font-medium text-gray-700">Mobile Number</label>
                <input
                  id="mobileNumber"
                  type="tel"
                  name="mobileNumber"
                  value={user.mobileNumber}
                  onChange={handleProfileChange}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="interests" className="block text-sm font-medium text-gray-700">Your Interests</label>
                <input
                  id="interests"
                  type="text"
                  name="interests"
                  value={user.interests}
                  onChange={handleProfileChange}
                  placeholder="e.g., Education, Health, Environment"
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500">Separate interests with a comma.</p>
              </div>

              <div>
                <label htmlFor="skills" className="block text-sm font-medium text-gray-700">Your Skills</label>
                <input
                  id="skills"
                  type="text"
                  name="skills"
                  value={user.skills}
                  onChange={handleProfileChange}
                  placeholder="e.g., Web Development, Marketing, Writing"
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500">Separate skills with a comma.</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-400 transition-colors duration-300"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>

        <section className="mt-10 bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Your Certificates</h2>
            <button
              type="button"
              onClick={loadCertificates}
              className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Refresh
            </button>
          </div>

          {certificatesLoading ? (
            <p className="mt-6 text-gray-600">Loading certificates...</p>
          ) : certificates.length === 0 ? (
            <p className="mt-6 text-gray-500">No certificates issued yet. Donate or complete volunteer work to earn one.</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {certificates.map((certificate) => {
                const busy = certificateActionLoading[certificate.id];
                const meta = certificate.metadata || {};
                return (
                  <div key={certificate.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">{certificate.type}</p>
                        <h3 className="text-lg font-bold text-gray-900">{certificate.title}</h3>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(certificate.issuedAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">Certificate No: <span className="font-semibold">{certificate.certificateNumber}</span></p>
                    {certificate.type === 'donation' ? (
                      <p className="text-sm text-gray-600 mt-1">
                        Contribution: ₹{Number(meta.contributionAmount || certificate.donation?.amount || 0).toLocaleString('en-IN')}
                        {meta.campaignTitle ? ` • ${meta.campaignTitle}` : ''}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 mt-1">
                        Activity: {meta.activityTitle || certificate.volunteerApplication?.opportunity?.title || 'Volunteer Service'}
                        {meta.assignedTask ? ` • Task: ${meta.assignedTask}` : ''}
                      </p>
                    )}
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => viewCertificate(certificate.id)}
                        disabled={busy}
                        className="px-3 py-2 text-sm rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60"
                      >
                        View / Print
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadCertificateFile(certificate.id, certificate.certificateNumber)}
                        disabled={busy}
                        className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 disabled:opacity-60"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
