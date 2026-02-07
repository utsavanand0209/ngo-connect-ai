import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function NgoProfileUpdate() {
  const [ngo, setNgo] = useState({
    name: '',
    email: '',
    category: '',
    categories: [],
    description: '',
    location: '',
    helplineNumber: '',
    registrationId: '',
    addressDetails: {
      houseNumber: '',
      landmark: '',
      district: '',
      state: '',
      pincode: ''
    }
  });
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [categoryOptions, setCategoryOptions] = useState([]);

  useEffect(() => {
    const fetchNgo = async () => {
      try {
        const res = await api.get('/ngos/me');
        setNgo(prev => ({
          ...prev,
          ...res.data,
          categories: res.data.categories || (res.data.category ? [res.data.category] : []),
          addressDetails: res.data.addressDetails || prev.addressDetails
        }));
      } catch (err) {
        console.log('No profile found, ready to create one.');
      }
    };
    fetchNgo();
    api.get('/categories/all')
      .then(res => setCategoryOptions(res.data || []))
      .catch(() => setCategoryOptions([]));
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setNgo(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (field, value) => {
    setNgo(prev => ({ ...prev, addressDetails: { ...prev.addressDetails, [field]: value } }));
  };

  const toggleCategory = (cat) => {
    setNgo(prev => {
      const exists = prev.categories.includes(cat);
      const nextCategories = exists
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat];
      return {
        ...prev,
        categories: nextCategories,
        category: nextCategories[0] || prev.category
      };
    });
  };

  const handleFileChange = (e) => {
    setDocs(e.target.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      // First, update the profile data
      const profileRes = await api.put('/ngos/me', ngo);
      setNgo(profileRes.data);
      setMessage('Profile updated successfully!');

      // Then, if there are documents, upload them
      if (docs.length > 0) {
        const formData = new FormData();
        for (let i = 0; i < docs.length; i++) {
          formData.append('docs', docs[i]);
        }
        await api.post('/ngos/me/verify', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setMessage('Profile and documents submitted successfully! Your NGO is under review.');
        setDocs([]);
        document.getElementById('fileInput').value = '';
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-gray-900">NGO Profile & Verification</h1>
          <p className="mt-2 text-lg text-gray-600">Complete your profile to get verified and start connecting with supporters.</p>
        </header>

        {message && <div className="mb-6 p-4 bg-green-100 border border-green-300 text-green-800 rounded-lg">{message}</div>}
        {error && <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8 space-y-8">
          
          <div>
            <h2 className="text-2xl font-bold text-gray-800 border-b pb-4 mb-6">Organization Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">Organization Name</label>
                    <input id="name" type="text" name="name" value={ngo.name} onChange={handleProfileChange} required className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                    <input id="email" type="email" name="email" value={ngo.email} onChange={handleProfileChange} required className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Categories</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(categoryOptions.length > 0 ? categoryOptions.map(c => c.name) : [
                        'Birds',
                        'Dogs',
                        'Cows',
                        'Cats',
                        'Wildlife',
                        'Senior Citizens',
                        'Children',
                        'Education',
                        'Medical Support',
                        'Other'
                      ]).map(cat => (
                        <button
                          type="button"
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className={`px-3 py-1 rounded-full text-sm border ${
                            ngo.categories?.includes(cat)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                </div>
                <div>
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">Location</label>
                    <input id="location" type="text" name="location" value={
                      ngo.location && typeof ngo.location === 'object' && ngo.location.type === 'Point' && Array.isArray(ngo.location.coordinates)
                        ? ngo.location.coordinates.join(', ')
                        : ngo.location || ''
                    } onChange={handleProfileChange} placeholder="City, Country" required className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label htmlFor="registrationId" className="block text-sm font-medium text-gray-700">Registration ID</label>
                    <input id="registrationId" type="text" name="registrationId" value={ngo.registrationId || ''} onChange={handleProfileChange} className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label htmlFor="helplineNumber" className="block text-sm font-medium text-gray-700">Helpline Number</label>
                    <input id="helplineNumber" type="text" name="helplineNumber" value={ngo.helplineNumber || ''} onChange={handleProfileChange} className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Address</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <input
                          type="text"
                          placeholder="House No."
                          value={ngo.addressDetails?.houseNumber || ''}
                          onChange={(e) => handleAddressChange('houseNumber', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm"
                        />
                        <input
                          type="text"
                          placeholder="Landmark"
                          value={ngo.addressDetails?.landmark || ''}
                          onChange={(e) => handleAddressChange('landmark', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm"
                        />
                        <input
                          type="text"
                          placeholder="District"
                          value={ngo.addressDetails?.district || ''}
                          onChange={(e) => handleAddressChange('district', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm"
                        />
                        <input
                          type="text"
                          placeholder="State"
                          value={ngo.addressDetails?.state || ''}
                          onChange={(e) => handleAddressChange('state', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm"
                        />
                        <input
                          type="text"
                          placeholder="Pincode"
                          value={ngo.addressDetails?.pincode || ''}
                          onChange={(e) => handleAddressChange('pincode', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm"
                        />
                    </div>
                </div>
                <div className="md:col-span-2">
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea id="description" name="description" value={ngo.description} onChange={handleProfileChange} rows="5" placeholder="Tell us about your NGO and its mission" className="mt-1 w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
                </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-gray-800 border-b pb-4 mb-6">Verification Documents</h2>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg">
              <p className="text-blue-800 font-semibold">Required Documents:</p>
              <ul className="text-blue-700 mt-2 space-y-1 text-sm list-disc list-inside">
                <li>Registration Certificate</li>
                <li>Tax ID (12A/80G Certificate)</li>
                <li>Address Proof</li>
              </ul>
            </div>
            <div>
              <label htmlFor="fileInput" className="block text-sm font-medium text-gray-700">Upload Documents</label>
              <input id="fileInput" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
            </div>
            {docs.length > 0 && (
              <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">Selected Files ({docs.length}):</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600 list-disc list-inside">
                  {Array.from(docs).map((doc, idx) => <li key={idx}>{doc.name}</li>)}
                </ul>
              </div>
            )}
          </div>
          
          <div className="pt-6 border-t">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-400 transition-colors duration-300"
            >
              {loading ? 'Submitting...' : 'Save and Submit for Verification'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
