import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-400">
      <div className="max-w-4xl mx-auto px-6 py-20">
        {/* Hero Section */}
        <div className="text-center text-white mb-12">
          <h1 className="text-5xl font-bold mb-4">Welcome to NGO Connect</h1>
          <p className="text-xl mb-2">AI-Enabled Platform for Connecting Users with NGOs</p>
          <p className="text-lg opacity-90">Find verified NGOs, support causes, and make a difference in your community</p>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <h3 className="text-xl font-bold text-blue-600 mb-2">🔍 Discover</h3>
            <p className="text-gray-700">Find verified NGOs by category and location with AI-powered recommendations</p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <h3 className="text-xl font-bold text-blue-600 mb-2">🤝 Connect</h3>
            <p className="text-gray-700">Message NGOs, volunteer for campaigns, and support meaningful causes</p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <h3 className="text-xl font-bold text-blue-600 mb-2">💡 Smart Matching</h3>
            <p className="text-gray-700">AI chatbot helps with recommendations and answers all your questions</p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-white rounded-lg p-12 shadow-xl text-center">
          {isAuthenticated ? (
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-4">Welcome Back!</h2>
              <p className="text-gray-600 mb-8">You're already logged in. Head to your dashboard to manage your activities.</p>
              <Link 
                to="/dashboard" 
                className="inline-block px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-8">Get Started Today</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-gray-600 mb-4">New to NGO Connect? Create your account</p>
                  <Link 
                    to="/register" 
                    className="inline-block px-8 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition"
                  >
                    Register Now
                  </Link>
                </div>

                <div className="my-6 flex items-center">
                  <div className="flex-1 border-t border-gray-300"></div>
                  <span className="px-4 text-gray-600 font-semibold">or</span>
                  <div className="flex-1 border-t border-gray-300"></div>
                </div>

                <div>
                  <p className="text-gray-600 mb-4">Already have an account? Sign in</p>
                  <Link 
                    to="/login" 
                    className="inline-block px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
                  >
                    Login
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-gray-300">
            <p className="text-gray-600 mb-4">Or, you can explore first without signing in</p>
            <Link 
              to="/ngos" 
              className="inline-block px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition"
            >
              Browse NGOs
            </Link>
            <span className="mx-4 text-gray-400">•</span>
            <Link 
              to="/campaigns" 
              className="inline-block px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition"
            >
              View Campaigns
            </Link>
            <span className="mx-4 text-gray-400">•</span>
            <Link 
              to="/chatbot" 
              className="inline-block px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition"
            >
              Chat with Bot
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
