import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import UserProfile from './pages/UserProfile';
import NgoList from './pages/NgoList';
import NgoProfile from './pages/NgoProfile';
import NgoDetail from './pages/NgoDetail';
import NgoProfileUpdate from './pages/NgoProfileUpdate';
import CampaignList from './pages/CampaignList';
import CampaignDetails from './pages/CampaignDetails';
import CreateCampaign from './pages/CreateCampaign';
import Messages from './pages/Messages';
import Chatbot from './pages/Chatbot';
import AdminDashboard from './pages/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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
        <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
