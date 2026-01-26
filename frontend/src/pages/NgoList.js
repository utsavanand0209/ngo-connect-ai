import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { SearchIcon, LocationMarkerIcon, TagIcon } from '@heroicons/react/outline';

export default function NgoList() {
  const [ngos, setNgos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/ngos')
      .then(response => {
        setNgos(response.data);
        setLoading(false);
      })
      .catch(error => {
        console.error("Error fetching NGOs:", error);
        setLoading(false);
      });
  }, []);

  const filteredNgos = ngos.filter(ngo => {
    return (
      ngo.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (category === '' || ngo.category.toLowerCase().includes(category.toLowerCase())) &&
      (location === '' || ngo.location.toLowerCase().includes(location.toLowerCase()))
    );
  });

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            Our Partner NGOs
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Discover and connect with verified non-governmental organizations making a difference.
          </p>
        </div>

        <div className="mt-12 max-w-lg mx-auto grid gap-5 lg:grid-cols-3 lg:max-w-none">
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              placeholder="Search by name"
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
            <p className="mt-4 text-gray-500">Loading NGOs...</p>
          </div>
        ) : filteredNgos.length > 0 ? (
          <div className="mt-12 max-w-lg mx-auto grid gap-5 lg:grid-cols-3 lg:max-w-none">
            {filteredNgos.map(ngo => (
              <div key={ngo._id} className="flex flex-col rounded-lg shadow-lg overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
                <div className="flex-shrink-0">
                  {/* You can add an image here */}
                  <div className="h-48 w-full bg-gray-200"></div>
                </div>
                <div className="flex-1 bg-white p-6 flex flex-col justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-indigo-600">
                      {ngo.category}
                    </p>
                    <Link to={`/ngos/${ngo._id}`} className="block mt-2">
                      <p className="text-xl font-semibold text-gray-900">{ngo.name}</p>
                      <p className="mt-3 text-base text-gray-500">{ngo.description.substring(0, 100)}...</p>
                      {ngo.about && <p className="mt-2 text-gray-700 text-sm">{ngo.about.substring(0, 80)}...</p>}
                      {ngo.achievements && ngo.achievements.length > 0 && (
                        <ul className="mt-2 text-xs text-green-700 list-disc ml-4">
                          {ngo.achievements.slice(0,2).map((ach, i) => <li key={i}>{ach}</li>)}
                        </ul>
                      )}
                      {ngo.contactLink && (
                        <a href={ngo.contactLink} className="text-blue-600 underline text-xs" target="_blank" rel="noopener noreferrer">Contact</a>
                      )}
                    </Link>
                  </div>
                  <div className="mt-6 flex items-center">
                    <div className="flex-shrink-0">
                      {/* You can add an avatar here */}
                      <span className="sr-only">{ngo.name}</span>
                      <div className="h-10 w-10 rounded-full bg-gray-300"></div>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        {ngo.location}
                      </p>
                      <div className="flex space-x-1 text-sm text-gray-500">
                        <time dateTime={ngo.createdAt}>
                          Joined in {new Date(ngo.createdAt).getFullYear()}
                        </time>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center mt-12">
            <h2 className="text-xl font-semibold text-gray-900">No NGOs Found</h2>
            <p className="mt-2 text-gray-500">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
