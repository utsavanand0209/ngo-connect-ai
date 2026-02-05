import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { SearchIcon, LocationMarkerIcon, TagIcon } from '@heroicons/react/outline';

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/campaigns')
      .then(response => {
        setCampaigns(response.data);
        setLoading(false);
      })
      .catch(error => {
        console.error("Error fetching campaigns:", error);
        setLoading(false);
      });
  }, []);

  const filteredCampaigns = campaigns.filter(c => {
    return (
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (category === '' || (c.category && c.category.toLowerCase().includes(category.toLowerCase()))) &&
      (location === '' || (c.location && c.location.toLowerCase().includes(location.toLowerCase())))
    );
  });

  const ProgressBar = ({ goal, current }) => {
    const percentage = Math.min((current / goal) * 100, 100);
    return (
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-base font-medium text-indigo-700">${current.toLocaleString()}</span>
          <span className="text-sm font-medium text-gray-500">${goal.toLocaleString()}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            Active Campaigns
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Support a cause you care about. Your contribution can make a real impact.
          </p>
        </div>

        <div className="mt-12 max-w-lg mx-auto grid gap-5 lg:grid-cols-3 lg:max-w-none">
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              placeholder="Search by title"
              className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <TagIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              placeholder="Filter by category"
              className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </div>
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LocationMarkerIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              placeholder="Filter by location"
              className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center mt-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading Campaigns...</p>
          </div>
        ) : filteredCampaigns.length > 0 ? (
          <div className="mt-12 max-w-lg mx-auto grid gap-8 lg:grid-cols-3 lg:max-w-none">
            {filteredCampaigns.map(c => (
              <div key={c._id} className="flex flex-col rounded-lg shadow-lg overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
                <div className="flex-shrink-0">
                  <img className="h-48 w-full object-cover" src={c.image} alt={c.title} />

                </div>
                <div className="flex-1 bg-white p-6 flex flex-col justify-between">
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-indigo-600">
                        {c.category}
                      </p>
                      {c.ngo && (
                        <p className="text-sm text-gray-500">
                          by {c.ngo.name}
                        </p>
                      )}
                    </div>
                    <Link to={`/campaigns/${c._id}`} className="block mt-2">
                      <p className="text-xl font-semibold text-gray-900">{c.title}</p>
                      <p className="mt-3 text-base text-gray-500">{c.description.substring(0, 100)}...</p>
                    </Link>
                  </div>
                  <div className="mt-6">
                    {c.goalAmount > 0 && (
                      <ProgressBar current={c.currentAmount} goal={c.goalAmount} />
                    )}
                    <div className="mt-4 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <LocationMarkerIcon className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-500">{c.location}</span>
                      </div>
                      {c.volunteersNeeded && c.volunteersNeeded.length > 0 && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">
                            {c.volunteers.length} / {c.volunteersNeeded.length} volunteers
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center mt-12">
            <h2 className="text-xl font-semibold text-gray-900">No Campaigns Found</h2>
            <p className="mt-2 text-gray-500">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
