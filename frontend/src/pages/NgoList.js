import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal';
import { getUserRole } from '../utils/auth';
import { buildDirectionsUrl, getNgoCoordinates, getNgoLocationText } from '../utils/location';

export default function NgoList() {
  const [ngos, setNgos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [uniqueCategories, setUniqueCategories] = useState([]);
  const [selectedNgo, setSelectedNgo] = useState(null);
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
    api.get('/ngos')
      .then(response => {
        const verifiedNgos = response.data.filter(ngo => ngo.verified);
        setNgos(verifiedNgos);
        const categorySet = new Set();
        verifiedNgos.forEach(ngo => {
          if (ngo.category) categorySet.add(ngo.category);
          if (Array.isArray(ngo.categories)) {
            ngo.categories.forEach(cat => cat && categorySet.add(cat));
          }
        });
        setUniqueCategories(Array.from(categorySet));
        setLoading(false);
      })
      .catch(error => {
        console.error("Error fetching NGOs:", error);
        setLoading(false);
      });
  }, []);

  const filteredNgos = ngos.filter((ngo) => {
    const haystack = [
      ngo.name,
      ngo.description,
      ngo.mission,
      ngo.about,
      getNgoLocationText(ngo),
      ...(ngo.geographies || []),
      ...(ngo.categories || [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      haystack.includes(searchTerm.toLowerCase()) &&
      (category === '' ||
        (ngo.category && ngo.category.toLowerCase() === category.toLowerCase()) ||
        (Array.isArray(ngo.categories) && ngo.categories.some((cat) => cat.toLowerCase() === category.toLowerCase()))) &&
      (location === '' || haystack.includes(location.toLowerCase()))
    );
  });

  const openFlagModal = (ngo) => {
    setSelectedNgo(ngo);
    setFlagReason('');
    setFlagMessage('');
    setModalOpen(true);
  };

  const closeFlagModal = () => {
    setModalOpen(false);
    setSelectedNgo(null);
  };

  const handleFlagSubmit = async () => {
    if (!selectedNgo) return;
    setFlagLoading(true);
    setFlagMessage('');
    try {
      if (isAdmin) {
        const res = await api.post(`/ngos/${selectedNgo.id}/flag`, { reason: flagReason });
        setNgos(prev => prev.map(n => (n.id === selectedNgo.id ? res.data.ngo : n)));
        setFlagMessage('NGO flagged successfully.');
      } else if (isUser) {
        await api.post(`/ngos/${selectedNgo.id}/flag-request`, { reason: flagReason });
        setRequestedIds(prev => [...new Set([...prev, selectedNgo.id])]);
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

  const formatCompact = (value) => {
    if (!value && value !== 0) return 'N/A';
    return Number(value).toLocaleString('en-IN', {
      notation: 'compact',
      maximumFractionDigits: 1
    });
  };

  const getTrendBars = (ngo) => {
    const incomes = (ngo.financials?.income || []).slice(-4);
    if (!incomes.length) return [];
    const max = Math.max(...incomes, 1);
    return incomes.map(value => Math.max(Math.round((value / max) * 100), 12));
  };

  const getProgramShare = (ngo) => {
    const program = Number(ngo.financials?.program || 0);
    const nonProgram = Number(ngo.financials?.nonProgram || 0);
    const total = program + nonProgram;
    if (!total) return 0;
    return Math.round((program / total) * 100);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            Our Partner NGOs
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
            Discover and connect with verified non-governmental organizations making a difference.
          </p>
        </header>

        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <input
            type="text"
            placeholder="Search by name..."
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
            {uniqueCategories.map((cat, index) => (
              <option key={cat || `category-${index}`} value={cat}>{cat}</option>
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
            <p className="mt-4 text-gray-600">Loading NGOs...</p>
          </div>
        ) : filteredNgos.length > 0 ? (
          <div className="grid gap-8 lg:grid-cols-3">
            {filteredNgos.map(ngo => {
              const trendBars = getTrendBars(ngo);
              return (
              <div key={ngo.id} className="bg-white rounded-lg shadow-lg overflow-hidden transform hover:-translate-y-2 transition-transform duration-300">
                <div className="relative">
                  <img
                    className="h-56 w-full object-cover"
                    src={ngo.programs?.[0]?.img || ngo.logo || `https://source.unsplash.com/random/400x300?charity,${ngo.category}`}
                    alt={ngo.name}
                  />
                  {ngo.logo && (
                    <div className="absolute -bottom-6 left-6 bg-white p-2 rounded-xl shadow">
                      <img src={ngo.logo} alt={`${ngo.name} logo`} className="w-12 h-12 rounded-lg object-cover" />
                    </div>
                  )}
                </div>
                <div className="p-6 pt-10">
                  <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">
                    {(ngo.categories && ngo.categories.length > 0 ? ngo.categories : [ngo.category].filter(Boolean)).join(', ')}
                  </p>
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-bold text-gray-900 mt-1">{ngo.name}</h3>
                    {ngo.verified && <span className="text-xs bg-green-100 text-green-800 font-semibold px-2 py-1 rounded-full">Verified</span>}
                  </div>
                  <p className="mt-2 text-gray-600 text-base">{getNgoLocationText(ngo)}</p>
                  <p className="mt-2 text-gray-600 text-base">{(ngo.description || ngo.mission || '').substring(0, 120)}...</p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-gray-600">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="font-semibold text-gray-900">{ngo.orgStrength || 0}</p>
                      <p>Team</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="font-semibold text-gray-900">{ngo.programs?.length || 0}</p>
                      <p>Programs</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="font-semibold text-gray-900">{ngo.geographies?.length || 1}</p>
                      <p>Regions</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <span>Funding Trend</span>
                      <span>₹{formatCompact(ngo.financials?.income?.slice(-1)[0])} latest</span>
                    </div>
                    <div className="flex items-end gap-1 h-12">
                      {trendBars.length > 0 ? (
                        trendBars.map((height, idx) => (
                          <span
                            key={`${ngo.id}-trend-${idx}`}
                            className="w-3 rounded bg-indigo-200"
                            style={{ height: `${height}%` }}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">No data</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Program Allocation</span>
                      <span>{getProgramShare(ngo)}% program spend</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{ width: `${getProgramShare(ngo)}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <Link to={`/ngos/${ngo.id}`} className="w-full inline-block text-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-300">
                      View Details
                    </Link>
                    {(() => {
                      const coordinates = getNgoCoordinates(ngo);
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
                      onClick={() => openFlagModal(ngo)}
                      disabled={ngo.flagged || requestedIds.includes(ngo.id)}
                      className="w-full inline-block text-center px-6 py-2 border border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 disabled:text-gray-400 disabled:border-gray-300"
                    >
                      {ngo.flagged
                        ? 'Flagged'
                        : requestedIds.includes(ngo.id)
                          ? 'Request Sent'
                          : isAdmin
                            ? 'Flag NGO'
                            : 'Request Admin Review'}
                    </button>
                    {flagMessage && selectedNgo && selectedNgo.id === ngo.id && (
                      <p className="text-xs text-gray-600 text-center">{flagMessage}</p>
                    )}
                  </div>
                </div>
              </div>
            )})}
          </div>
        ) : (
          <div className="text-center py-16">
            <h2 className="text-2xl font-semibold text-gray-900">No NGOs Found</h2>
            <p className="mt-2 text-gray-500">Your search and filter combination did not return any results. Try adjusting your criteria.</p>
          </div>
        )}
      </div>
      <ConfirmModal
        open={modalOpen}
        title={isAdmin ? 'Flag NGO' : 'Request Admin Review'}
        description={
          isAdmin
            ? 'This will mark the NGO as flagged and visible to admins.'
            : 'Your request will be sent to the admin team for review.'
        }
        confirmLabel={isAdmin ? 'Flag NGO' : 'Send Request'}
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
