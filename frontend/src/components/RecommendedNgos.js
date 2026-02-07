import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const RecommendedNgos = () => {
  const [ngos, setNgos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const response = await api.get('/ai/recommendations');
        // Get top 3 NGOs from recommendations
        const recommendedNgos = response.data.ngos?.slice(0, 3).map(item => item.ngo) || [];
        setNgos(recommendedNgos);
      } catch (error) {
        console.error('Error fetching recommendations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, []);

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">✨ Top Picks for You</h2>
        <Link to="/recommendations" className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">
          View All →
        </Link>
      </div>
      
      {ngos.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-600 mb-2">No recommendations yet.</p>
          <p className="text-sm text-gray-500">Set your preferences to get personalized NGO recommendations!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ngos.map(ngo => (
            <div key={ngo.id} className="border rounded-lg p-4 flex flex-col justify-between hover:shadow-md transition">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {ngo.logo ? (
                    <img src={ngo.logo} alt={ngo.name} className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-xl">🏢</span>
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-sm">{ngo.name}</h3>
                    {ngo.verified && <span className="text-xs text-green-600">✓ Verified</span>}
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                  {ngo.mission || ngo.description || 'No description available'}
                </p>
                {ngo.primarySectors && ngo.primarySectors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {ngo.primarySectors.slice(0, 2).map((sector, i) => (
                      <span key={i} className="text-xs bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full">
                        {sector}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Link to={`/ngos/${ngo.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium self-start mt-2">
                View Profile →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecommendedNgos;
