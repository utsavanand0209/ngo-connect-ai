import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SparklesIcon, LocationMarkerIcon, HeartIcon, UserGroupIcon } from '@heroicons/react/outline';
import { getAIRecommendations, getUserPreferences } from '../services/api';
import { getUserRole } from '../utils/auth';

export default function Recommendations() {
  const [recommendations, setRecommendations] = useState({ ngos: [], campaigns: [] });
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const role = getUserRole();
  const isUser = role === 'user';

  useEffect(() => {
    if (!isUser) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [isUser]);

  const fetchData = async () => {
    try {
      const [recsRes, prefsRes] = await Promise.all([
        getAIRecommendations(),
        getUserPreferences()
      ]);
      setRecommendations(recsRes.data);
      setPreferences(prefsRes.data);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMatchScore = (item) => {
    if (item.score) {
      return Math.min(Math.round(item.score * 10), 99);
    }
    return 0;
  };

  const renderNGOCard = (item) => {
    const ngo = item.ngo;
    return (
      <div key={ngo.id} className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-100">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {ngo.logo ? (
                <img src={ngo.logo} alt={ngo.name} className="w-14 h-14 rounded-full object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-2xl">🏢</span>
                </div>
              )}
              <div>
                <h3 className="font-bold text-lg text-gray-800">{ngo.name}</h3>
                <p className="text-sm text-gray-500">
                  {(ngo.categories && ngo.categories.length > 0 ? ngo.categories : [ngo.category].filter(Boolean)).join(', ') || 'NGO'}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="bg-gradient-to-r from-green-400 to-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                {getMatchScore(item)}% Match
              </div>
              {ngo.verified && (
                <span className="text-xs text-green-600 font-medium mt-1">✓ Verified</span>
              )}
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {ngo.mission || ngo.description || 'No description available'}
          </p>

          {item.reasons && item.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {item.reasons.map((reason, idx) => (
                <span key={idx} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                  {reason}
                </span>
              ))}
            </div>
          )}

          {ngo.primarySectors && ngo.primarySectors.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {ngo.primarySectors.slice(0, 3).map((sector, idx) => (
                <span key={idx} className="text-xs bg-pink-50 text-pink-700 px-2 py-1 rounded-full">
                  {sector}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 text-sm text-gray-500 mb-4">
            <LocationMarkerIcon className="w-4 h-4" />
            <span>
            {
              ngo.location && typeof ngo.location === 'object' && ngo.location.type === 'Point' && Array.isArray(ngo.location.coordinates)
                ? `Coordinates: ${ngo.location.coordinates.join(', ')}`
                : ngo.location || 'Location not specified'
            }
            </span>
          </div>

          <div className="flex gap-2">
            <Link 
              to={`/ngos/${ngo.id}`}
              className="flex-1 text-center py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              View Profile
            </Link>
            <Link 
              to={`/ngos/${ngo.id}#campaigns`}
              className="flex-1 text-center py-2 border border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition"
            >
              See Campaigns
            </Link>
          </div>
        </div>
      </div>
    );
  };

  const renderCampaignCard = (item) => {
    const campaign = item.campaign;
    const hasFunding = (campaign.goalAmount || 0) > 0;
    const hasVolunteers = campaign.volunteersNeeded && campaign.volunteersNeeded.length > 0;
    const progress = hasFunding
      ? Math.round((campaign.currentAmount / campaign.goalAmount) * 100)
      : 0;
    const actionLabel = hasFunding && hasVolunteers
      ? 'Support Campaign'
      : hasVolunteers
        ? 'Volunteer Now'
        : 'Donate Now';
    
    return (
      <div key={campaign.id} className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-100">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {campaign.ngo?.logo ? (
                <img src={campaign.ngo.logo} alt={campaign.ngo.name} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <span className="text-xl">📢</span>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">{campaign.ngo?.name || 'NGO'}</p>
                <h3 className="font-bold text-lg text-gray-800">{campaign.title}</h3>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="bg-gradient-to-r from-purple-400 to-pink-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                {getMatchScore(item)}% Match
              </div>
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {campaign.description || 'No description available'}
          </p>

          {item.reasons && item.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {item.reasons.map((reason, idx) => (
                <span key={idx} className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded">
                  {reason}
                </span>
              ))}
            </div>
          )}

          {campaign.category && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mb-4">
              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs">
                {campaign.category}
              </span>
            </div>
          )}

          {hasFunding ? (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">₹{campaign.currentAmount?.toLocaleString() || 0} raised</span>
                <span className="text-gray-600">₹{campaign.goalAmount?.toLocaleString() || 0} goal</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1">{progress}% funded</p>
            </div>
          ) : (
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                {hasVolunteers
                  ? `${campaign.volunteersNeeded.length} volunteer roles needed`
                  : 'Support needed'}
              </p>
            </div>
          )}

          <div className="flex items-center gap-1 text-sm text-gray-500 mb-4">
            <LocationMarkerIcon className="w-4 h-4" />
            <span>{campaign.location || 'Location not specified'}</span>
          </div>

          <div className="flex gap-2">
            <Link 
              to={`/campaigns/${campaign.id}`}
              className="flex-1 text-center py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
            >
              {actionLabel}
            </Link>
            <Link 
              to={`/campaigns/${campaign.id}`}
              className="flex-1 text-center py-2 border border-green-600 text-green-600 rounded-lg font-medium hover:bg-green-50 transition"
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Finding your perfect matches...</p>
        </div>
      </div>
    );
  }

  if (!isUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 text-center max-w-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">User accounts only</h2>
          <p className="text-gray-600 mb-4">
            Personalized recommendations are available for beneficiaries. Please login as a user to view them.
          </p>
          <Link
            to="/dashboard"
            className="inline-block px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full mb-4">
            <SparklesIcon className="w-5 h-5" />
            <span className="font-medium">AI-Powered Recommendations</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Personalized For You</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Based on your preferences, we've found NGOs and campaigns that match your interests, 
            location, and skills.
          </p>
        </div>

        {preferences && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-center justify-center">
            <span className="text-sm font-medium text-gray-500">Your preferences:</span>
            {preferences.location && (
              <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                📍 {preferences.location}
              </span>
            )}
            {preferences.causes?.slice(0, 3).map((cause, idx) => (
              <span key={idx} className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full text-sm">
                ❤️ {cause}
              </span>
            ))}
            {preferences.skills?.slice(0, 3).map((skill, idx) => (
              <span key={idx} className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm">
                🛠️ {skill}
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-2 mb-8">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-6 py-2 rounded-full font-medium transition ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Recommendations ({recommendations.ngos.length + recommendations.campaigns.length})
          </button>
          <button
            onClick={() => setActiveTab('ngos')}
            className={`px-6 py-2 rounded-full font-medium transition ${
              activeTab === 'ngos'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            🏢 NGOs ({recommendations.ngos.length})
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-6 py-2 rounded-full font-medium transition ${
              activeTab === 'campaigns'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📢 Campaigns ({recommendations.campaigns.length})
          </button>
        </div>

        {(activeTab === 'all' || activeTab === 'ngos') && recommendations.ngos.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <UserGroupIcon className="w-6 h-6 text-indigo-600" />
              Recommended NGOs
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendations.ngos.map(renderNGOCard)}
            </div>
          </div>
        )}

        {(activeTab === 'all' || activeTab === 'campaigns') && recommendations.campaigns.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <HeartIcon className="w-6 h-6 text-green-600" />
              Recommended Campaigns
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendations.campaigns.map(renderCampaignCard)}
            </div>
          </div>
        )}

        {recommendations.ngos.length === 0 && recommendations.campaigns.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">
              We couldn't find recommendations based on your current preferences.
            </p>
            <p className="text-gray-500 text-sm mb-4">
              Try updating your preferences to include more causes, skills, or locations.
            </p>
            <Link 
              to="/dashboard"
              className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        <div className="text-center mt-8">
          <button
            onClick={fetchData}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            🔄 Refresh Recommendations
          </button>
        </div>
      </div>
    </div>
  );
}
