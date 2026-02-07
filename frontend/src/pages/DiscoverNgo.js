import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { buildDirectionsUrl, getNgoCoordinates, getNgoLocationText } from '../utils/location';

export default function DiscoverNgo() {
  const [ngos, setNgos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const isAuthenticated = !!localStorage.getItem('token');

  useEffect(() => {
    setLoading(true);
    api.get('/ngos')
      .then((res) => setNgos(res.data || []))
      .catch(() => setError('Failed to load NGOs. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set();
    ngos.forEach((ngo) => {
      if (ngo.category) set.add(ngo.category);
      if (Array.isArray(ngo.categories)) ngo.categories.forEach((entry) => entry && set.add(entry));
    });
    return Array.from(set).sort();
  }, [ngos]);

  const filtered = useMemo(() => {
    return ngos.filter((ngo) => {
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

      const matchesSearch = !searchTerm || haystack.includes(searchTerm.toLowerCase());
      const matchesCategory = !category || (
        (ngo.category || '').toLowerCase() === category.toLowerCase() ||
        (Array.isArray(ngo.categories) && ngo.categories.some((entry) => entry.toLowerCase() === category.toLowerCase()))
      );
      const matchesLocation = !location || haystack.includes(location.toLowerCase());

      return matchesSearch && matchesCategory && matchesLocation;
    });
  }, [ngos, searchTerm, category, location]);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow p-8 mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900">Discover NGOs</h1>
          <p className="text-gray-600 mt-2">Browse verified NGOs in Bengaluru and Karnataka and find causes that match your interests.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/ngos" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
              View All NGOs
            </Link>
            <Link
              to={isAuthenticated ? '/insights' : '/login'}
              className="px-4 py-2 rounded-lg border border-indigo-600 text-indigo-600 font-semibold hover:bg-indigo-50"
            >
              {isAuthenticated ? 'Get Smart Insights' : 'Login for Insights'}
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by NGO, mission, or area"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Categories</option>
              {categories.map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Filter by location"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading NGOs...</div>
        ) : error ? (
          <div className="text-center text-red-600 py-12">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No NGOs found. Try adjusting your filters.</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((ngo) => {
              const coordinates = getNgoCoordinates(ngo);
              const directionsUrl = coordinates
                ? buildDirectionsUrl({ lat: coordinates.lat, lng: coordinates.lng })
                : '';

              return (
                <div key={ngo.id} className="bg-white rounded-lg shadow p-6 flex flex-col">
                  <div className="flex items-center gap-3">
                    <img
                      src={ngo.logo || `https://ui-avatars.com/api/?name=${ngo.name}&background=random`}
                      alt={ngo.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{ngo.name}</h3>
                      <p className="text-sm text-gray-500">
                        {(ngo.categories && ngo.categories.length > 0 ? ngo.categories : [ngo.category].filter(Boolean)).join(', ') || 'NGO'}
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-600 mt-3 line-clamp-3">{ngo.description || ngo.mission || 'No description available.'}</p>
                  <p className="mt-3 text-sm text-gray-500">{getNgoLocationText(ngo)}</p>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div className="bg-gray-50 rounded p-2">Programs: {ngo.programs?.length || 0}</div>
                    <div className="bg-gray-50 rounded p-2">Regions: {ngo.geographies?.length || 0}</div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/ngos/${ngo.id}`}
                      className="flex-1 text-center px-3 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                    >
                      View Profile
                    </Link>
                    {directionsUrl ? (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center px-3 py-2 rounded-lg border border-indigo-600 text-indigo-600 font-semibold hover:bg-indigo-50"
                      >
                        Directions
                      </a>
                    ) : (
                      <span className="flex-1 text-center px-3 py-2 rounded-lg border border-gray-300 text-gray-400 font-semibold">
                        No Map
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
