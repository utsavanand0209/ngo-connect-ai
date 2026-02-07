import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import UserProfile from './pages/UserProfile';
import DiscoverNgo from './pages/DiscoverNgo';
import NgoMap from './pages/Map/NgoMap';
import VolunteerCampaigns from './pages/VolunteerCampaigns';
import VolunteerOpportunities from './pages/VolunteerOpportunities';
import Donate from './pages/Donate';
import SmartInsights from './pages/SmartInsights';
import NgoList from './pages/NgoList';
import NgoProfile from './pages/NgoProfile';
import NgoDetail from './pages/NgoDetail';
import NgoProfileUpdate from './pages/NgoProfileUpdate';
import CampaignList from './pages/CampaignList';
import CampaignDetails from './pages/CampaignDetails';
import CreateCampaign from './pages/CreateCampaign';
import Messages from './pages/Messages';
import Chatbot from './pages/Chatbot';
import ProtectedRoute from './components/ProtectedRoute';
import Recommendations from './pages/Recommendations';
import AdminDashboard from './pages/AdminDashboard';
import FlaggedContent from './pages/FlaggedContent';
import AdminVerifications from './pages/AdminVerifications';
import AdminUsers from './pages/AdminUsers';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminNotifications from './pages/AdminNotifications';
import AdminRequests from './pages/AdminRequests';
import AdminCategories from './pages/AdminCategories';
import AdminRoute from './components/AdminRoute';
import UserRoute from './components/UserRoute';

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/discover" element={<ProtectedRoute><DiscoverNgo /></ProtectedRoute>} />
        <Route path="/map" element={<ProtectedRoute><NgoMap /></ProtectedRoute>} />
        <Route path="/volunteer-campaigns" element={<UserRoute><VolunteerCampaigns /></UserRoute>} />
        <Route path="/volunteer-opportunities" element={<UserRoute><VolunteerOpportunities /></UserRoute>} />
        <Route path="/donate" element={<UserRoute><Donate /></UserRoute>} />
        <Route path="/insights" element={<UserRoute><SmartInsights /></UserRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
        <Route path="/ngo/profile" element={<ProtectedRoute><NgoProfileUpdate /></ProtectedRoute>} />
        <Route path="/ngos" element={<NgoList />} />
        <Route path="/ngos/:id" element={<NgoProfile />} />
        {/* Demo route for static detailed NGO page */}
        <Route path="/ngo-detail" element={<NgoDetail />} />
        <Route path="/campaigns" element={<CampaignList />} />
        <Route path="/campaigns/:id" element={<CampaignDetails />} />
        <Route path="/campaigns/create" element={<ProtectedRoute><CreateCampaign /></ProtectedRoute>} />
        <Route path="/volunteer" element={<Navigate to="/volunteer-opportunities" replace />} />
        <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/recommendations" element={<UserRoute><Recommendations /></UserRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/verifications" element={<AdminRoute><AdminVerifications /></AdminRoute>} />
        <Route path="/admin/flagged-content" element={<AdminRoute><FlaggedContent /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
        <Route path="/admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
        <Route path="/admin/requests" element={<AdminRoute><AdminRequests /></AdminRoute>} />
        <Route path="/admin/categories" element={<AdminRoute><AdminCategories /></AdminRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
