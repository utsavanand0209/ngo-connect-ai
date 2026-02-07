import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Home() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [helplines, setHelplines] = useState([]);
  const [categoryHighlights, setCategoryHighlights] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    api.get('/ngos')
      .then(res => {
        const withHelplines = (res.data || []).filter(ngo => ngo.helplineNumber);
        setHelplines(withHelplines.slice(0, 6));
      })
      .catch(() => setHelplines([]));
    api.get('/categories')
      .then(res => {
        const names = (res.data || [])
          .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
          .filter(Boolean)
          .slice(0, 8);
        setCategoryHighlights(names);
      })
      .catch(() => setCategoryHighlights([]));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <header className="relative bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-20 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
            Connect with a Cause
          </h1>
          <p className="mt-4 text-lg md:text-xl opacity-90">
            The platform for discovering and supporting non-profits making a real impact.
          </p>
          {!isAuthenticated && (
            <div className="mt-8">
              <Link
                to="/register"
                className="inline-block px-8 py-4 bg-white text-indigo-600 font-bold rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300"
              >
                Join Now & Make a Difference
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {helplines.length > 0 && (
          <section className="bg-white rounded-xl shadow-lg p-8 mb-10">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Emergency Helplines</h2>
            <p className="text-gray-600 mb-6">Reach out directly to NGOs providing urgent support.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {helplines.map(ngo => {
                const dialableNumber = String(ngo.helplineNumber || '').replace(/[^\d+]/g, '');
                const hasDial = dialableNumber.length > 5;
                return (
                <div
                  key={ngo.id}
                  className="border rounded-lg p-4 bg-gray-50 cursor-pointer hover:border-indigo-300 transition"
                  onClick={() => navigate(`/ngos/${ngo.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/ngos/${ngo.id}`);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <p className="font-semibold text-gray-800">{ngo.name}</p>
                  <p className="text-sm text-gray-500">{ngo.address || 'Location not specified'}</p>
                  <a
                    href={hasDial ? `tel:${dialableNumber}` : '#'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!hasDial) e.preventDefault();
                    }}
                    className={`text-sm font-semibold mt-2 inline-block ${
                      hasDial ? 'text-indigo-600 hover:underline' : 'text-gray-500'
                    }`}
                  >
                    {ngo.helplineNumber}
                  </a>
                  <div className="mt-3 flex gap-2">
                    <a
                      href={hasDial ? `tel:${dialableNumber}` : '#'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasDial) e.preventDefault();
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-semibold ${
                        hasDial
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Call Helpline
                    </a>
                    <Link
                      to={`/ngos/${ngo.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 rounded text-xs font-semibold border border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                    >
                      View NGO
                    </Link>
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {categoryHighlights.length > 0 && (
          <section className="bg-white rounded-xl shadow-lg p-8 mb-10">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Category Highlights</h2>
            <p className="text-gray-600 mb-6">Explore NGOs by the causes you care about.</p>
            <div className="flex flex-wrap gap-3">
              {categoryHighlights.map((cat, idx) => (
                <span key={`${cat}-${idx}`} className="px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-sm">
                  {cat}
                </span>
              ))}
            </div>
          </section>
        )}
        {/* Features Section */}
        <section className="py-16">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              A simple, transparent, and effective way to support the causes you care about.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-8">
            <Link to="/discover" className="bg-white rounded-xl shadow-lg p-8 transform hover:-translate-y-2 transition-transform duration-300 block">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-500 text-white mb-6">
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Discover NGOs</h3>
              <p className="text-gray-600">
                Find verified non-profits tailored to your interests and location using our smart recommendation engine.
              </p>
            </Link>
            <Link to="/volunteer-opportunities" className="bg-white rounded-xl shadow-lg p-8 transform hover:-translate-y-2 transition-transform duration-300 block">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-500 text-white mb-6">
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Volunteer Opportunities</h3>
              <p className="text-gray-600">
                Give your time and skills to causes you care about. Join volunteer campaigns that need hands-on help.
              </p>
            </Link>
            <Link to="/donate" className="bg-white rounded-xl shadow-lg p-8 transform hover:-translate-y-2 transition-transform duration-300 block">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-500 text-white mb-6">
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Donate</h3>
              <p className="text-gray-600">
                Support campaigns and causes with financial contributions. Track your impact with transparent reporting.
              </p>
            </Link>
            <Link to="/insights" className="bg-white rounded-xl shadow-lg p-8 transform hover:-translate-y-2 transition-transform duration-300 block">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-500 text-white mb-6">
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Get Smart Insights</h3>
                <p className="text-gray-600">
                  Our AI Chatbot provides instant answers and helps you find the perfect cause to support.
                </p>
              </Link>
            </div>
          </section>

        {/* CTA Section */}
        {isAuthenticated ? (
          <section className="bg-white rounded-xl shadow-lg p-12 text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Welcome Back!</h2>
            <p className="text-gray-600 mb-8">
              Continue your journey of making a difference.
            </p>
            <Link
              to="/dashboard"
              className="inline-block px-10 py-4 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-300"
            >
              Go to Your Dashboard
            </Link>
          </section>
        ) : (
          <section className="bg-white rounded-xl shadow-lg p-12">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-6 text-center">Join Our Community</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 border border-gray-200 rounded-lg text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-3">For Individuals</h3>
                <p className="text-gray-600 mb-6">Create an account to discover, donate, and volunteer in campaigns you care about.</p>
                <Link
                  to="/register"
                  className="w-full inline-block px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors duration-300"
                >
                  Register as a User
                </Link>
              </div>
              <div className="p-6 border border-gray-200 rounded-lg text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-3">For NGOs</h3>
                <p className="text-gray-600 mb-6">Showcase your work, manage campaigns, and connect with supporters.</p>
                <Link
                  to="/register"
                  className="w-full inline-block px-6 py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors duration-300"
                >
                  Register as an NGO
                </Link>
              </div>
            </div>
            <div className="mt-8 text-center">
              <p className="text-gray-600">
                Already have an account?{' '}
                <Link to="/login" className="font-bold text-indigo-600 hover:underline">
                  Sign in here
                </Link>
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
