import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getVolunteerOpportunities,
  getMyVolunteerApplications,
  applyToVolunteer,
  withdrawVolunteerApplication,
  completeVolunteerActivity,
  getCertificateById
} from '../services/api';

const openCertificateWindow = async (certificateId) => {
  const viewer = window.open('', '_blank');
  if (!viewer) return false;
  viewer.document.write('<p style="font-family: Arial, sans-serif; padding: 20px;">Loading certificate...</p>');
  const response = await getCertificateById(certificateId);
  viewer.document.open();
  viewer.document.write(response?.data?.html || '<p>Unable to load certificate.</p>');
  viewer.document.close();
  return true;
};

const statusStyles = {
  applied: 'bg-blue-100 text-blue-800 border-blue-200',
  assigned: 'bg-amber-100 text-amber-800 border-amber-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  withdrawn: 'bg-gray-100 text-gray-700 border-gray-200'
};

const approvalStyles = {
  not_requested: 'bg-gray-100 text-gray-700 border-gray-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200'
};

export default function VolunteerOpportunities() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('');
  const [commitment, setCommitment] = useState('');
  const [applicationForms, setApplicationForms] = useState({});
  const [applicationMap, setApplicationMap] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [hoursByOpportunity, setHoursByOpportunity] = useState({});

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      } catch (err) {
        setUser(null);
      }
    }
    fetchOpportunities();
  }, []);

  const fetchApplications = async () => {
    if (!localStorage.getItem('token')) {
      setApplicationMap({});
      return;
    }
    try {
      const res = await getMyVolunteerApplications();
      const nextMap = {};
      (res.data || []).forEach((application) => {
        const opportunityId = application?.opportunity?.id || application?.opportunity;
        if (opportunityId) nextMap[opportunityId] = application;
      });
      setApplicationMap(nextMap);
    } catch (err) {
      setApplicationMap({});
    }
  };

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const res = await getVolunteerOpportunities();
      setOpportunities(res.data || []);
      await fetchApplications();
    } catch (err) {
      setOpportunities([]);
      setMessage('Unable to load volunteer opportunities right now.');
    } finally {
      setLoading(false);
    }
  };

  const updateFormField = (opportunityId, field, value) => {
    setApplicationForms((prev) => {
      const existing = prev[opportunityId] || {
        fullName: '',
        email: user?.email || '',
        phone: '',
        preferredActivities: '',
        availability: '',
        motivation: ''
      };
      return {
        ...prev,
        [opportunityId]: {
          ...existing,
          [field]: value
        }
      };
    });
  };

  const withActionLoading = async (opportunityId, fn) => {
    setActionLoading((prev) => ({ ...prev, [opportunityId]: true }));
    try {
      await fn();
    } finally {
      setActionLoading((prev) => ({ ...prev, [opportunityId]: false }));
    }
  };

  const handleApply = async (opportunityId) => {
    if (!user) {
      setMessage('Please login to apply for volunteer opportunities.');
      return;
    }

    const form = applicationForms[opportunityId] || {};
    if (!form.fullName || !form.email) {
      setMessage('Please provide your full name and email before applying.');
      return;
    }

    await withActionLoading(opportunityId, async () => {
      try {
        await applyToVolunteer(opportunityId, {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          preferredActivities: form.preferredActivities
            ? form.preferredActivities.split(',').map((item) => item.trim()).filter(Boolean)
            : [],
          availability: form.availability,
          motivation: form.motivation
        });
        await fetchApplications();
        setMessage('Application submitted successfully.');
      } catch (err) {
        setMessage(err.response?.data?.message || 'Failed to apply. Please try again.');
      }
    });
  };

  const handleWithdraw = async (opportunityId) => {
    await withActionLoading(opportunityId, async () => {
      try {
        await withdrawVolunteerApplication(opportunityId);
        await fetchApplications();
        setMessage('Application withdrawn.');
      } catch (err) {
        setMessage('Failed to withdraw. Please try again.');
      }
    });
  };

  const handleComplete = async (opportunityId) => {
    await withActionLoading(opportunityId, async () => {
      try {
        await completeVolunteerActivity(opportunityId, {
          activityHours: hoursByOpportunity[opportunityId]
        });
        await fetchApplications();
        setMessage('Volunteer activity marked completed. Waiting for NGO approval before certificate issuance.');
      } catch (err) {
        setMessage(err.response?.data?.message || 'Unable to mark completion.');
      }
    });
  };

  const handleViewCertificate = async (certificateId, opportunityId) => {
    await withActionLoading(opportunityId, async () => {
      try {
        const opened = await openCertificateWindow(certificateId);
        if (!opened) {
          setMessage('Please allow popups to view the certificate.');
        }
      } catch (err) {
        setMessage('Unable to load certificate.');
      }
    });
  };

  const filteredOpportunities = opportunities.filter((op) => {
    const text = `${op.title || ''} ${op.description || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase()) &&
      (location === '' || (op.location && op.location.toLowerCase().includes(location.toLowerCase()))) &&
      (commitment === '' || op.commitment === commitment);
  });

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">Volunteer Opportunities</h1>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-500">
            Register with your details, get assigned tasks based on your preferences, and generate certificates after completion.
          </p>
        </header>

        {message && (
          <div className="mb-6 max-w-3xl mx-auto p-4 rounded-lg bg-blue-100 text-blue-800 text-center border border-blue-200">
            {message}
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <input
            type="text"
            placeholder="Search opportunities..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <input
            type="text"
            placeholder="Filter by location..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <select
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm"
            value={commitment}
            onChange={(e) => setCommitment(e.target.value)}
          >
            <option value="">All Commitment Levels</option>
            <option value="One-time">One-time</option>
            <option value="Weekly">Weekly</option>
            <option value="Monthly">Monthly</option>
            <option value="Flexible">Flexible</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading opportunities...</div>
        ) : filteredOpportunities.length > 0 ? (
          <div className="grid gap-8 lg:grid-cols-2">
            {filteredOpportunities.map((op) => {
              const application = applicationMap[op.id];
              const form = applicationForms[op.id] || {
                fullName: '',
                email: user?.email || '',
                phone: '',
                preferredActivities: '',
                availability: '',
                motivation: ''
              };
              const isBusy = !!actionLoading[op.id];
              const status = application?.status;
              const statusClass = statusStyles[status] || 'bg-gray-100 text-gray-700 border-gray-200';
              const approvalStatus = application?.certificateApprovalStatus || 'not_requested';
              const approvalClass = approvalStyles[approvalStatus] || approvalStyles.not_requested;
              const spotsLeft = Math.max((op.spots || 0) - (op.applicants?.length || 0), 0);

              return (
                <div key={op.id} className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-100">
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {op.ngo?.logo && (
                            <img src={op.ngo.logo} alt={op.ngo.name} className="w-8 h-8 rounded-full" />
                          )}
                          <span className="text-sm text-gray-500">{op.ngo?.name}</span>
                          {op.ngo?.verified && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Verified</span>
                          )}
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{op.title}</h3>
                        <p className="text-gray-600 mb-4">{(op.description || '').slice(0, 220)}...</p>

                        <div className="flex flex-wrap gap-2 mb-4">
                          {(op.skills || []).map((skill, index) => (
                            <span key={`${skill}-${index}`} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {skill}
                            </span>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-4">
                          <span>{op.location || 'Remote'}</span>
                          <span>{op.commitment}</span>
                          <span>{spotsLeft} spots left</span>
                          <span>{new Date(op.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {application ? (
                      <div className="mt-4 p-4 border rounded-lg bg-gray-50">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex gap-2 items-center">
                            <span className={`px-3 py-1 text-xs border rounded-full font-semibold ${statusClass}`}>
                              {String(status || 'applied').toUpperCase()}
                            </span>
                            {status === 'completed' && (
                              <span className={`px-3 py-1 text-xs border rounded-full font-semibold ${approvalClass}`}>
                                {String(approvalStatus).toUpperCase()}
                              </span>
                            )}
                          </div>
                          {application.assignedTask && (
                            <p className="text-xs text-gray-600">
                              Assigned Task: <span className="font-semibold">{application.assignedTask}</span>
                            </p>
                          )}
                        </div>

                        {status !== 'completed' ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="Hours served (optional)"
                                value={hoursByOpportunity[op.id] || ''}
                                onChange={(e) => setHoursByOpportunity((prev) => ({ ...prev, [op.id]: e.target.value }))}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => handleComplete(op.id)}
                                disabled={isBusy}
                                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60"
                              >
                                Mark Completed
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleWithdraw(op.id)}
                              disabled={isBusy}
                              className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-60"
                            >
                              Withdraw Application
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm text-green-700 font-semibold">
                              Completed on {new Date(application.completedAt || application.updatedAt || Date.now()).toLocaleDateString()}
                            </p>
                            {approvalStatus === 'pending' && (
                              <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-2">
                                Completion submitted. Your NGO must approve before certificate issuance.
                              </p>
                            )}
                            {approvalStatus === 'rejected' && (
                              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                                Certificate request was rejected by NGO.
                                {application.certificateApprovalNote ? ` Note: ${application.certificateApprovalNote}` : ''}
                              </p>
                            )}
                            {approvalStatus === 'approved' && application.certificate && (
                              <button
                                type="button"
                                onClick={() => handleViewCertificate(application.certificate.id || application.certificate, op.id)}
                                disabled={isBusy}
                                className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                              >
                                View Certificate
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 p-4 border rounded-lg">
                        <h4 className="font-semibold text-gray-800 mb-3">Volunteer Registration</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <input
                            type="text"
                            placeholder="Full Name *"
                            value={form.fullName}
                            onChange={(e) => updateFormField(op.id, 'fullName', e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="email"
                            placeholder="Email *"
                            value={form.email}
                            onChange={(e) => updateFormField(op.id, 'email', e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="tel"
                            placeholder="Contact Number"
                            value={form.phone}
                            onChange={(e) => updateFormField(op.id, 'phone', e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Availability (e.g. Weekends)"
                            value={form.availability}
                            onChange={(e) => updateFormField(op.id, 'availability', e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Preferred activities (comma separated)"
                          value={form.preferredActivities}
                          onChange={(e) => updateFormField(op.id, 'preferredActivities', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                        />
                        <textarea
                          rows={2}
                          placeholder="Why would you like to volunteer? (optional)"
                          value={form.motivation}
                          onChange={(e) => updateFormField(op.id, 'motivation', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                        />
                        <button
                          type="button"
                          onClick={() => handleApply(op.id)}
                          disabled={isBusy}
                          className="w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {isBusy ? 'Submitting...' : 'Apply to Volunteer'}
                        </button>
                      </div>
                    )}

                    <Link
                      to={`/ngos/${op.ngo?.id}`}
                      className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
                    >
                      View NGO profile
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <h2 className="text-2xl font-semibold text-gray-900">No Opportunities Found</h2>
            <p className="mt-2 text-gray-500">Try adjusting your search criteria.</p>
          </div>
        )}

        {!loading && filteredOpportunities.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Are you an NGO?</h2>
            <p className="text-gray-600 mb-6">Post and manage volunteer opportunities from your NGO profile.</p>
            <Link
              to={user?.role === 'ngo' ? '/ngo/profile' : '/register'}
              className="inline-block px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {user?.role === 'ngo' ? 'Manage Your NGO' : 'Register as NGO'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
