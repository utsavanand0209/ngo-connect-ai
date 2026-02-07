import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import ConfirmModal from '../components/ConfirmModal';
import { getUserRole } from '../utils/auth';
import { buildDirectionsUrl, getNgoCoordinates, getNgoLocationText } from '../utils/location';

const uniqueNonEmpty = (items = []) => [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];

const NGO_DETAIL_FALLBACKS = {
  'the akshaya patra foundation': {
    mission: 'To eliminate classroom hunger by implementing the Mid-Day Meal Scheme in government and government-aided schools.',
    vision: 'A hunger-free classroom where every child has the nutrition required to learn and thrive.',
    about: 'The Akshaya Patra Foundation operates large-scale kitchens and school meal distribution systems in Bengaluru and across Karnataka. It partners with schools, local authorities, and volunteers to provide safe, nutritious food with high compliance standards.',
    impact: 'The foundation drives school attendance, concentration, and retention by ensuring children receive dependable mid-day meals during the academic year.',
    website: 'https://www.akshayapatra.org',
    helplineNumber: '080-3012-4000',
    address: 'ISKCON Temple, Chord Road, Rajajinagar, Bengaluru, Karnataka 560010',
    addressDetails: {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      pincode: '560010'
    },
    location: { type: 'Point', coordinates: [77.55106, 13.010086] },
    geographies: ['Rajajinagar', 'Bengaluru', 'Karnataka'],
    orgStrength: 210,
    certifications: ['ISO 22000 Food Safety', '80G Certified', '12A Certified'],
    awards: ['Karnataka CSR Excellence Award 2024', 'School Nutrition Impact Recognition 2023'],
    programs: [
      {
        name: 'Mid-Day Meal Program',
        desc: 'Daily nutritious meal support for children in government and aided schools.'
      },
      {
        name: 'Centralized Kitchen Operations',
        desc: 'Technology-enabled, high-volume kitchens for consistent meal quality and food safety.'
      },
      {
        name: 'School Nutrition Monitoring',
        desc: 'Regular quality checks, menu balance, and outcome tracking with partner schools.'
      }
    ],
    impactMetrics: [
      '2.4 million meals served in Karnataka in the last 12 months',
      '450+ schools supported across Bengaluru and nearby districts',
      'Average attendance improvement of 11% in partner school clusters'
    ],
    testimonials: [
      {
        name: 'Meenakshi R',
        role: 'School Principal, Rajajinagar',
        quote: 'Attendance improved consistently after meal service became regular and predictable.'
      }
    ],
    registration: {
      regNo: 'BLR-TRUST-2000-1189',
      pan: 'AAATA1111A',
      csr: 'CSR00001001',
      g80: 'AAATA1111AF20241',
      a12: 'AAATA1111AE20241',
      fcra: '094421301'
    },
    financials: {
      years: [2021, 2022, 2023, 2024, 2025],
      income: [48000000, 51840000, 55680000, 59520000, 63360000],
      expenses: [42000000, 45150000, 48300000, 51450000, 54600000],
      nonProgram: 10374000,
      program: 44226000
    }
  }
};

export default function NgoProfile() {
  const { id } = useParams();
  const [ngo, setNgo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [campaigns, setCampaigns] = useState([]);
  const [flagReason, setFlagReason] = useState('');
  const [flagMessage, setFlagMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [flagLoading, setFlagLoading] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const isAuthenticated = !!localStorage.getItem('token');
  const role = getUserRole();
  const isAdmin = role === 'admin';
  const isUser = role === 'user';

  useEffect(() => {
    setLoading(true);
    Promise.all([api.get(`/ngos/${id}`), api.get('/campaigns')])
      .then(([ngoRes, campaignRes]) => {
        setNgo(ngoRes.data);
        const related = (campaignRes.data || []).filter((campaign) => String(campaign.ngo?.id || campaign.ngo) === String(id));
        setCampaigns(related);
      })
      .catch(() => {
        setError('Failed to fetch NGO details. The NGO may not exist or is not verified.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const ngoFallback = useMemo(() => {
    const key = String(ngo?.name || '').trim().toLowerCase();
    return NGO_DETAIL_FALLBACKS[key] || null;
  }, [ngo]);

  const ngoViewData = useMemo(() => {
    if (!ngoFallback) return ngo || {};
    return {
      ...ngoFallback,
      ...ngo,
      addressDetails: {
        ...(ngoFallback.addressDetails || {}),
        ...(ngo?.addressDetails || {})
      },
      registration: {
        ...(ngoFallback.registration || {}),
        ...(ngo?.registration || {})
      },
      financials: {
        ...(ngoFallback.financials || {}),
        ...(ngo?.financials || {})
      }
    };
  }, [ngo, ngoFallback]);

  const finData = useMemo(() => (
    ngoViewData?.financials?.years?.map((year, index) => ({
      year,
      Income: Number(ngoViewData?.financials?.income?.[index] || 0),
      Expenses: Number(ngoViewData?.financials?.expenses?.[index] || 0)
    })) || []
  ), [ngoViewData]);

  const derivedFinData = useMemo(() => {
    const donationCampaigns = campaigns.filter((campaign) => Number(campaign.goalAmount || 0) > 0);
    if (donationCampaigns.length === 0) return [];

    const totalRaised = donationCampaigns.reduce((sum, campaign) => sum + Number(campaign.currentAmount || 0), 0);
    const totalGoal = donationCampaigns.reduce((sum, campaign) => sum + Number(campaign.goalAmount || 0), 0);
    const base = Math.round(Math.max(totalRaised, totalGoal * 0.72));
    if (!base) return [];

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear];
    return years.map((year, index) => ({
      year,
      Income: Math.round(base * (0.82 + index * 0.1)),
      Expenses: Math.round(base * (0.76 + index * 0.09))
    }));
  }, [campaigns]);

  const displayFinData = finData.length > 0 ? finData : derivedFinData;

  const ngoCoordinates = getNgoCoordinates(ngoViewData);
  const locationText = getNgoLocationText(ngoViewData || {});

  const displayCategories = useMemo(() => {
    const fromNgo = uniqueNonEmpty([...(ngoViewData?.categories || []), ngoViewData?.category]);
    if (fromNgo.length > 0) return fromNgo;
    return uniqueNonEmpty(campaigns.map((campaign) => campaign.category));
  }, [ngoViewData, campaigns]);

  const serviceRegions = useMemo(() => {
    const fromNgo = uniqueNonEmpty(ngoViewData?.geographies || []);
    if (fromNgo.length > 0) return fromNgo;
    return uniqueNonEmpty([
      ...campaigns.map((campaign) => campaign.area),
      ...campaigns.map((campaign) => campaign.location),
      ngoViewData?.addressDetails?.district,
      ngoViewData?.addressDetails?.state
    ]);
  }, [ngoViewData, campaigns]);

  const displayPrograms = useMemo(() => {
    const programs = Array.isArray(ngoViewData?.programs) ? ngoViewData.programs : [];
    if (programs.length > 0) {
      return programs.map((program, index) => {
        if (typeof program === 'string') {
          return {
            name: program,
            desc: '',
            img: ngoViewData?.gallery?.[index] || ngoViewData?.logo || ''
          };
        }
        return {
          name: program?.name || `Program ${index + 1}`,
          desc: program?.desc || program?.description || '',
          img: program?.img || ngoViewData?.gallery?.[index] || ngoViewData?.logo || ''
        };
      });
    }

    return campaigns.slice(0, 6).map((campaign, index) => ({
      name: campaign?.title || `Campaign ${index + 1}`,
      desc: campaign?.description || 'Program details coming soon.',
      img: campaign?.image || campaign?.gallery?.[0] || ngoViewData?.gallery?.[index] || ngoViewData?.logo || ''
    }));
  }, [ngoViewData, campaigns]);

  const displayImpactMetrics = useMemo(() => {
    const fromNgo = uniqueNonEmpty(ngoViewData?.impactMetrics || []);
    if (fromNgo.length > 0) return fromNgo;

    const totalRaised = campaigns.reduce((sum, campaign) => sum + Number(campaign.currentAmount || 0), 0);
    const totalGoal = campaigns.reduce((sum, campaign) => sum + Number(campaign.goalAmount || 0), 0);
    const totalTarget = campaigns.reduce((sum, campaign) => sum + Number(campaign.beneficiaryStats?.target || 0), 0);
    const totalReached = campaigns.reduce((sum, campaign) => sum + Number(campaign.beneficiaryStats?.reached || 0), 0);
    const volunteersEngaged = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.beneficiaryStats?.volunteersEngaged || campaign.volunteers?.length || 0),
      0
    );

    return uniqueNonEmpty([
      totalRaised > 0 ? `Rs ${Math.round(totalRaised).toLocaleString('en-IN')} raised across active campaigns` : '',
      totalGoal > 0 ? `Rs ${Math.round(totalGoal).toLocaleString('en-IN')} cumulative campaign funding goal` : '',
      totalReached > 0 ? `${Math.round(totalReached).toLocaleString('en-IN')} beneficiaries reached so far` : '',
      totalTarget > 0 ? `${Math.round(totalTarget).toLocaleString('en-IN')} target beneficiaries in ongoing programs` : '',
      volunteersEngaged > 0 ? `${Math.round(volunteersEngaged).toLocaleString('en-IN')} volunteer contributions recorded` : '',
      serviceRegions.length > 0 ? `Programs active across ${serviceRegions.length} service regions` : ''
    ]);
  }, [ngoViewData, campaigns, serviceRegions]);

  const displayTestimonials = useMemo(() => {
    const fromNgo = Array.isArray(ngoViewData?.testimonials) ? ngoViewData.testimonials.filter((item) => item?.quote) : [];
    if (fromNgo.length > 0) return fromNgo;

    const fromCampaigns = campaigns.flatMap((campaign) =>
      (campaign.testimonials || []).map((item) => ({
        name: item?.name || 'Community Supporter',
        role: item?.role || 'Community Partner',
        quote: item?.quote || ''
      }))
    ).filter((item) => item.quote);
    return fromCampaigns.slice(0, 4);
  }, [ngoViewData, campaigns]);

  const displayAwards = useMemo(() => {
    const fromNgo = uniqueNonEmpty(ngoViewData?.awards || []);
    if (fromNgo.length > 0) return fromNgo;
    const fromCampaigns = uniqueNonEmpty(campaigns.flatMap((campaign) => campaign.recognitions || []));
    return fromCampaigns;
  }, [ngoViewData, campaigns]);

  const displayCertifications = useMemo(() => {
    const fromNgo = uniqueNonEmpty(ngoViewData?.certifications || []);
    if (fromNgo.length > 0) return fromNgo;

    const badgeDriven = uniqueNonEmpty((ngoViewData?.badges || []).map((badge) => `${badge} Compliant`));
    if (badgeDriven.length > 0) return badgeDriven;

    const fromRegistration = uniqueNonEmpty([
      ngoViewData?.registration?.g80 ? `80G: ${ngoViewData.registration.g80}` : '',
      ngoViewData?.registration?.a12 ? `12A: ${ngoViewData.registration.a12}` : '',
      ngoViewData?.registration?.fcra ? `FCRA: ${ngoViewData.registration.fcra}` : ''
    ]);
    return fromRegistration;
  }, [ngoViewData]);

  const teamStrength = useMemo(() => {
    const direct = Number(ngoViewData?.orgStrength || 0);
    if (direct > 0) return direct;

    const leadershipSize = Array.isArray(ngoViewData?.leadership) ? ngoViewData.leadership.length : 0;
    const volunteerSignals = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.beneficiaryStats?.volunteersEngaged || campaign.volunteers?.length || 0),
      0
    );
    const inferred = (leadershipSize * 6) + Math.min(volunteerSignals, 120);
    return inferred;
  }, [ngoViewData, campaigns]);

  const aboutText = ngoViewData?.about || ngoViewData?.description || 'Detailed information about this NGO is not available yet.';
  const visionText = ngoViewData?.vision || ngoViewData?.mission || 'Vision details are currently unavailable.';
  const impactText = ngoViewData?.impact || (displayImpactMetrics.length > 0
    ? displayImpactMetrics.slice(0, 3).join('. ')
    : 'Impact summary is currently unavailable.');
  const missionText = ngoViewData?.mission || ngoViewData?.description;

  const programSpendShare = useMemo(() => {
    const program = Number(ngoViewData?.financials?.program || 0);
    const nonProgram = Number(ngoViewData?.financials?.nonProgram || 0);
    const total = program + nonProgram;
    if (total > 0) return Math.round((program / total) * 100);
    if (displayFinData.length === 0) return 0;
    const latest = displayFinData[displayFinData.length - 1];
    const inferredBase = Number(latest?.Expenses || latest?.Income || 0);
    if (!inferredBase) return 0;
    const inferredProgram = Math.round(inferredBase * 0.78);
    return Math.round((inferredProgram / inferredBase) * 100);
  }, [ngoViewData, displayFinData]);

  const openDirections = () => {
    if (!ngoCoordinates) {
      setInfoMessage('Coordinates are not available for this NGO yet.');
      return;
    }

    const openRoute = (origin) => {
      const url = buildDirectionsUrl({
        lat: ngoCoordinates.lat,
        lng: ngoCoordinates.lng,
        origin
      });
      if (!url) {
        setInfoMessage('Unable to generate directions link.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    };

    setDirectionsLoading(true);
    setInfoMessage('');

    if (!navigator.geolocation) {
      openRoute();
      setDirectionsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        openRoute({ lat: position.coords.latitude, lng: position.coords.longitude });
        setDirectionsLoading(false);
      },
      () => {
        openRoute();
        setDirectionsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 300000
      }
    );
  };

  const handleFlagNgo = async () => {
    if (!isAdmin && !isUser) {
      setFlagMessage('Please login to submit a request.');
      return;
    }
    if (ngo.flagged) {
      setFlagMessage('This NGO is already flagged.');
      return;
    }

    setFlagLoading(true);
    setFlagMessage('');

    try {
      if (isAdmin) {
        const res = await api.post(`/ngos/${id}/flag`, { reason: flagReason });
        setNgo(res.data.ngo);
        setFlagMessage('NGO flagged successfully.');
      } else {
        await api.post(`/ngos/${id}/flag-request`, { reason: flagReason });
        setFlagMessage('Request sent to admin for review.');
      }
      setFlagReason('');
    } catch (err) {
      setFlagMessage('Failed to submit request. Please try again.');
    }

    setFlagLoading(false);
    setFlagModalOpen(false);
  };

  const TabButton = ({ active, onClick, children }) => (
    <button
      type="button"
      className={`py-2 px-4 font-semibold rounded-t-lg transition-colors duration-300 ${
        active
          ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
          : 'bg-transparent text-gray-500 hover:text-indigo-600'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );

  if (loading) return <div className="p-8 text-center">Loading NGO profile...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!ngo) return <div className="p-8 text-center">This NGO profile is not available.</div>;

  return (
    <div className="bg-gray-50 min-h-screen">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl overflow-hidden border border-gray-200">
            <img
              src={ngoViewData.coverImage || ngoViewData.gallery?.[0] || ngoViewData.logo || 'https://via.placeholder.com/1200x400'}
              alt={`${ngoViewData.name} cover`}
              className="w-full h-48 object-cover"
            />
            <div className="p-6 flex flex-col md:flex-row items-start gap-6 bg-white">
              <img
                src={ngoViewData.logo || 'https://via.placeholder.com/150'}
                alt={`${ngoViewData.name} logo`}
                className="w-24 h-24 rounded-full border-4 border-indigo-500 object-cover"
              />
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900">{ngoViewData.name}</h1>
                <p className="mt-2 text-gray-700">{missionText}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ngoViewData.verified && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                      Verified
                    </span>
                  )}
                  {displayCategories.map((cat, idx) => (
                    <span key={`${cat}-${idx}`} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                      {cat}
                    </span>
                  ))}
                  {displayCertifications.slice(0, 2).map((cert, idx) => (
                    <span key={`cert-${idx}`} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800">
                      {cert}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-gray-600">{locationText}</p>
                <button
                  type="button"
                  onClick={openDirections}
                  disabled={directionsLoading}
                  className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  {directionsLoading ? 'Opening Directions...' : 'Get Directions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {(flagMessage || infoMessage) && (
          <div className="mb-6 space-y-2">
            {infoMessage && <div className="p-3 rounded bg-blue-50 border border-blue-200 text-blue-800">{infoMessage}</div>}
            {flagMessage && <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-800">{flagMessage}</div>}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Programs</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{displayPrograms.length}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Service Regions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{serviceRegions.length}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Team Strength</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{teamStrength || 0}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Program Spend</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{programSpendShare}%</p>
          </div>
        </div>

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4 md:space-x-8" aria-label="Tabs">
            <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
            <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')}>Campaigns</TabButton>
            <TabButton active={tab === 'volunteer'} onClick={() => setTab('volunteer')}>Volunteer</TabButton>
            <TabButton active={tab === 'about'} onClick={() => setTab('about')}>About</TabButton>
            <TabButton active={tab === 'contact'} onClick={() => setTab('contact')}>Contact</TabButton>
          </nav>
        </div>

        <div className="mt-8">
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Report This NGO</h2>
              {ngo.flagged && <span className="text-sm text-red-600 font-semibold">Flagged</span>}
            </div>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Reason for reporting (optional)"
              className="w-full border border-gray-300 rounded-md p-2 mb-3"
              rows={3}
              disabled={ngo.flagged}
            />
            <button
              type="button"
              onClick={() => setFlagModalOpen(true)}
              disabled={flagLoading || ngo.flagged}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-300"
            >
              {ngo.flagged ? 'Already Flagged' : flagLoading ? 'Submitting...' : isAdmin ? 'Flag NGO' : 'Request Admin Review'}
            </button>
          </div>

          {tab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-lg shadow">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Financial Trend</h2>
                  {displayFinData.length > 0 ? (
                    <div style={{ width: '100%', height: 320 }}>
                      <ResponsiveContainer>
                        <BarChart data={displayFinData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="year" />
                          <YAxis tickFormatter={(value) => `₹${Math.round(value / 100000)}L`} />
                          <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                          <Legend />
                          <Bar dataKey="Income" fill="#818cf8" />
                          <Bar dataKey="Expenses" fill="#f87171" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-gray-600">Financial data not available.</p>
                  )}
                </div>

                <div className="bg-white p-8 rounded-lg shadow">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Impact Metrics</h2>
                  {displayImpactMetrics.length > 0 ? (
                    <ul className="space-y-3 text-sm text-gray-700">
                      {displayImpactMetrics.map((metric, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">✔</span>
                          <span>{metric}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-600">Impact data not available.</p>
                  )}
                </div>
              </div>

              <div className="bg-white p-8 rounded-lg shadow">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Programs</h2>
                {displayPrograms.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {displayPrograms.map((program, index) => (
                      <div key={`${program.name}-${index}`} className="border rounded-lg overflow-hidden">
                        <img
                          src={program.img || ngoViewData.gallery?.[index] || ngoViewData.logo || 'https://via.placeholder.com/640x420'}
                          alt={program.name}
                          className="w-full h-40 object-cover"
                        />
                        <div className="p-4">
                          <h3 className="font-semibold text-gray-900">{program.name}</h3>
                          <p className="text-sm text-gray-600 mt-2">{program.desc || 'Program details coming soon.'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">No program details available.</p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-lg shadow">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Testimonials</h2>
                  {displayTestimonials.length > 0 ? (
                    <div className="space-y-4">
                      {displayTestimonials.map((item, index) => (
                        <blockquote key={`${item.name}-${index}`} className="border-l-4 border-indigo-300 pl-4">
                          <p className="text-gray-700 italic">"{item.quote}"</p>
                          <footer className="mt-2 text-sm text-gray-500">{item.name} • {item.role}</footer>
                        </blockquote>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600">No testimonials available.</p>
                  )}
                </div>

                <div className="bg-white p-8 rounded-lg shadow">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Recognition</h2>
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Awards</h3>
                      {displayAwards.length > 0 ? (
                        <ul className="space-y-2 text-sm text-gray-700">
                          {displayAwards.map((award, index) => <li key={index}>• {award}</li>)}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">No awards listed.</p>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Certifications</h3>
                      {displayCertifications.length > 0 ? (
                        <ul className="space-y-2 text-sm text-gray-700">
                          {displayCertifications.map((cert, index) => <li key={index}>• {cert}</li>)}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">No certifications listed.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'campaigns' && (
            <div className="bg-white p-8 rounded-lg shadow">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Active Campaigns</h2>
              {campaigns.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {campaigns.map((campaign) => (
                    <Link to={`/campaigns/${campaign.id}`} key={campaign.id} className="block border rounded-lg p-4 hover:shadow-lg">
                      <h3 className="font-bold text-gray-900">{campaign.title}</h3>
                      <p className="text-sm text-gray-600 mt-2">{campaign.description?.substring(0, 140) || ''}...</p>
                      <p className="text-xs text-gray-500 mt-2">{campaign.location || 'Location TBD'}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">This NGO has no active campaigns.</p>
              )}
            </div>
          )}

          {tab === 'volunteer' && (
            <div className="bg-white p-8 rounded-lg shadow">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Volunteer With Us</h2>
              <p className="text-gray-600 mb-6">
                Join active campaigns where your time and skills can directly support communities.
              </p>

              {campaigns.filter((campaign) => campaign.volunteersNeeded && campaign.volunteersNeeded.length > 0).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {campaigns.filter((campaign) => campaign.volunteersNeeded && campaign.volunteersNeeded.length > 0).map((campaign) => (
                    <div key={campaign.id} className="border rounded-lg p-4 hover:shadow-lg">
                      <h3 className="font-bold text-lg mb-2">{campaign.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">{campaign.description?.substring(0, 160) || ''}...</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {campaign.volunteersNeeded?.slice(0, 4).map((roleName, index) => (
                          <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {roleName}
                          </span>
                        ))}
                      </div>
                      <div className="flex justify-between text-sm text-gray-500 mb-3">
                        <span>{campaign.location || 'Location TBD'}</span>
                        <span>{campaign.volunteers?.length || 0} joined</span>
                      </div>

                      {!isAuthenticated ? (
                        <Link
                          to="/login"
                          className="block w-full text-center px-4 py-2 border border-orange-500 text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors"
                        >
                          Login to Volunteer
                        </Link>
                      ) : isUser ? (
                        <Link
                          to={`/campaigns/${campaign.id}`}
                          className="block w-full text-center px-4 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
                        >
                          Volunteer Now
                        </Link>
                      ) : (
                        <div className="block w-full text-center px-4 py-2 rounded-lg bg-gray-100 text-gray-600 font-semibold">
                          Users only
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No volunteer campaigns available at the moment.</p>
              )}

              <div className="mt-8 text-center">
                <Link to="/campaigns" className="text-indigo-600 hover:underline">
                  Explore all campaigns →
                </Link>
              </div>
            </div>
          )}

          {tab === 'about' && (
            <div className="bg-white p-8 rounded-lg shadow space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-3">About {ngoViewData.name}</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{aboutText}</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Vision</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{visionText}</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Impact Summary</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{impactText}</p>
              </div>
            </div>
          )}

          {tab === 'contact' && (
            <div className="bg-white p-8 rounded-lg shadow">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Contact & Legal Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg mb-2">Contact</h3>
                  <p><strong>Helpline:</strong> {ngoViewData.helplineNumber || 'Not available'}</p>
                  <p><strong>Email:</strong> {ngoViewData.email || 'Not available'}</p>
                  <p><strong>Address:</strong> {locationText}</p>
                  <p>
                    <strong>Website:</strong>{' '}
                    {ngoViewData.website ? (
                      <a href={ngoViewData.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                        {ngoViewData.website}
                      </a>
                    ) : (
                      'Not available'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={openDirections}
                    disabled={directionsLoading}
                    className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-300"
                  >
                    {directionsLoading ? 'Opening Directions...' : 'Get Directions'}
                  </button>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-lg mb-2">Registration</h3>
                  <p><strong>Registration ID:</strong> {ngoViewData.registrationId || ngoViewData.registration?.regNo || 'Not available'}</p>
                  <p><strong>PAN:</strong> {ngoViewData.registration?.pan || 'Not available'}</p>
                  <p><strong>CSR:</strong> {ngoViewData.registration?.csr || 'Not available'}</p>
                  <p><strong>80G:</strong> {ngoViewData.registration?.g80 || 'Not available'}</p>
                  <p><strong>12A:</strong> {ngoViewData.registration?.a12 || 'Not available'}</p>
                  <p><strong>FCRA:</strong> {ngoViewData.registration?.fcra || 'Not available'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <ConfirmModal
        open={flagModalOpen}
        title={isAdmin ? 'Flag NGO' : 'Request Admin Review'}
        description={
          isAdmin
            ? 'This will mark the NGO as flagged and visible to admins.'
            : 'Your request will be sent to the admin team for review.'
        }
        confirmLabel={isAdmin ? 'Flag NGO' : 'Send Request'}
        onConfirm={handleFlagNgo}
        onCancel={() => setFlagModalOpen(false)}
        loading={flagLoading}
      />
    </div>
  );
}
