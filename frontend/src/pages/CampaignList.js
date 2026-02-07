import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal';
import { getUserRole } from '../utils/auth';
import { buildDirectionsUrl, getCampaignCoordinates, getCampaignLocationText } from '../utils/location';

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [uniqueCategories, setUniqueCategories] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagLoading, setFlagLoading] = useState(false);
  const [flagMessage, setFlagMessage] = useState('');
  const [requestedIds, setRequestedIds] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const role = getUserRole();
  const isAdmin = role === 'admin';
  const isUser = role === 'user';

  useEffect(() => {
    setLoading(true);
    api.get('/campaigns')
      .then(response => {
        setCampaigns(response.data);
        const categories = [...new Set(response.data.map(c => c.category).filter(Boolean))];
        setUniqueCategories(categories);
        setLoading(false);
      })
      .catch(error => {
        console.error("Error fetching campaigns:", error);
        setLoading(false);
      });
  }, []);

  const filteredCampaigns = campaigns.filter((campaign) => {
    const haystack = [
      campaign.title,
      campaign.description,
      campaign.location,
      campaign.area,
      campaign.category,
      campaign.ngo?.name
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      haystack.includes(searchTerm.toLowerCase()) &&
      (category === '' || (campaign.category && campaign.category.toLowerCase() === category.toLowerCase())) &&
      (location === '' || haystack.includes(location.toLowerCase()))
    );
  });

  const ProgressBar = ({ goal, current }) => {
    const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
    return (
      <div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
          <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
        </div>
        <div className="flex justify-between mt-1 text-sm font-medium">
          <span className="text-indigo-700">₹{current.toLocaleString()} raised</span>
          <span className="text-gray-500">of ₹{goal.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  const getActionLabel = (campaign) => {
    if (!isUser) return 'View Campaign';
    const hasFunding = campaign.goalAmount > 0;
    const hasVolunteers = campaign.volunteersNeeded && campaign.volunteersNeeded.length > 0;
    if (hasFunding && hasVolunteers) return 'View & Support';
    if (hasVolunteers) return 'View & Volunteer';
    return 'View & Donate';
  };

  const openFlagModal = (campaign) => {
    setSelectedCampaign(campaign);
    setFlagReason('');
    setFlagMessage('');
    setModalOpen(true);
  };

  const closeFlagModal = () => {
    setModalOpen(false);
    setSelectedCampaign(null);
  };

  const handleFlagSubmit = async () => {
    if (!selectedCampaign) return;
    setFlagLoading(true);
    setFlagMessage('');
    try {
      if (isAdmin) {
        const res = await api.post(`/campaigns/${selectedCampaign.id}/flag`, { reason: flagReason });
        setCampaigns(prev => prev.map(c => (c.id === selectedCampaign.id ? res.data.campaign : c)));
        setFlagMessage('Campaign flagged successfully.');
      } else if (isUser) {
        await api.post(`/campaigns/${selectedCampaign.id}/flag-request`, { reason: flagReason });
        setRequestedIds(prev => [...new Set([...prev, selectedCampaign.id])]);
        setFlagMessage('Request sent to admin for review.');
      } else {
        setFlagMessage('Please login to submit a request.');
      }
    } catch (err) {
      setFlagMessage('Unable to submit request.');
    }
    setFlagLoading(false);
    setModalOpen(false);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            Active Campaigns
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
            Support a cause you care about. Donate, volunteer, or do both to make a real impact.
          </p>
        </header>

        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <input
            type="text"
            placeholder="Search by title..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <select
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Filter by location..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            value={location}
            onChange={e => setLocation(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading Campaigns...</p>
          </div>
        ) : filteredCampaigns.length > 0 ? (
          <div className="grid gap-8 lg:grid-cols-3">
            {filteredCampaigns.map(c => (
              <div key={c.id} className="bg-white rounded-lg shadow-lg overflow-hidden transform hover:-translate-y-2 transition-transform duration-300 flex flex-col">
                <img className="h-56 w-full object-cover" src={c.image || `https://source.unsplash.com/random/400x300?cause,${c.category}`} alt={c.title} />
                <div className="p-6 flex flex-col flex-grow">
                  <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">{c.category}</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">{c.title}</h3>
                  <p className="mt-2 text-gray-600 text-base flex-grow">{(c.description || '').substring(0, 120)}...</p>
                  <p className="mt-2 text-sm text-gray-500">{getCampaignLocationText(c)}</p>
                  <div className="mt-4">
                    {c.goalAmount > 0 && (
                  <ProgressBar current={c.currentAmount} goal={c.goalAmount} />
                    )}
                    {c.volunteersNeeded && c.volunteersNeeded.length > 0 && (
                      <div className="mt-2 flex items-center text-sm text-orange-600">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Volunteers needed
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <Link to={`/campaigns/${c.id}`} className="w-full inline-block text-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-300">
                      {getActionLabel(c)}
                    </Link>
                    {(() => {
                      const coordinates = getCampaignCoordinates(c);
                      const directionsUrl = coordinates
                        ? buildDirectionsUrl({ lat: coordinates.lat, lng: coordinates.lng })
                        : '';

                      if (!directionsUrl) {
                        return (
                          <span className="w-full inline-block text-center px-6 py-2 border border-gray-300 text-gray-400 font-semibold rounded-lg">
                            Directions Unavailable
                          </span>
                        );
                      }

                      return (
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-block text-center px-6 py-2 border border-indigo-600 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50"
                        >
                          Get Directions
                        </a>
                      );
                    })()}
                    <button
                      onClick={() => openFlagModal(c)}
                      disabled={c.flagged || requestedIds.includes(c.id)}
                      className="w-full inline-block text-center px-6 py-2 border border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 disabled:text-gray-400 disabled:border-gray-300"
                    >
                      {c.flagged
                        ? 'Flagged'
                        : requestedIds.includes(c.id)
                          ? 'Request Sent'
                          : isAdmin
                            ? 'Flag Campaign'
                            : 'Request Admin Review'}
                    </button>
                    {flagMessage && selectedCampaign && selectedCampaign.id === c.id && (
                      <p className="text-xs text-gray-600 text-center">{flagMessage}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <h2 className="text-2xl font-semibold text-gray-900">No Campaigns Found</h2>
            <p className="mt-2 text-gray-500">Your search and filter combination did not return any results. Try adjusting your criteria.</p>
          </div>
        )}
      </div>
      <ConfirmModal
        open={modalOpen}
        title={isAdmin ? 'Flag Campaign' : 'Request Admin Review'}
        description={
          isAdmin
            ? 'This will mark the campaign as flagged and visible to admins.'
            : 'Your request will be sent to the admin team for review.'
        }
        confirmLabel={isAdmin ? 'Flag Campaign' : 'Send Request'}
        onConfirm={handleFlagSubmit}
        onCancel={closeFlagModal}
        loading={flagLoading}
      >
        <label className="block text-sm font-medium text-gray-700">Reason (optional)</label>
        <textarea
          value={flagReason}
          onChange={(e) => setFlagReason(e.target.value)}
          className="mt-2 w-full border border-gray-300 rounded-md p-2"
          rows={3}
          placeholder="Describe why this looks suspicious"
        />
      </ConfirmModal>
    </div>
  );
}
