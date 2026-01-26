

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

export default function NgoProfile() {
  const { id } = useParams();
  const [ngo, setNgo] = useState(null);
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    api.get(`/ngos/${id}`).then(r => setNgo(r.data)).catch(() => {});
  }, [id]);
  if (!ngo) return <div className="p-6">Loading or NGO not verified</div>;


  // Fallback demo data for empty fields
  const demoPrograms = [
    { name: "Community Library", img: "https://images.unsplash.com/photo-1464983953574-0892a716854b", desc: "A vibrant space for children and adults to read, learn, and grow together." },
    { name: "Health Camps", img: "https://images.unsplash.com/photo-1506744038136-46273834b3fb", desc: "Monthly free health checkups and awareness drives in rural areas." },
    { name: "Women Empowerment", img: "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2", desc: "Skill development and microfinance for women entrepreneurs." }
  ];
  const demoPeople = [
    { name: "Aarti Sharma", role: "Director", linkedin: "https://linkedin.com/in/aartisharma", photo: "https://randomuser.me/api/portraits/women/70.jpg" },
    { name: "Rohit Verma", role: "Program Manager", linkedin: "https://linkedin.com/in/rohitverma", photo: "https://randomuser.me/api/portraits/men/71.jpg" },
    { name: "Neha Singh", role: "Field Officer", linkedin: "https://linkedin.com/in/nehasingh", photo: "https://randomuser.me/api/portraits/women/72.jpg" }
  ];
  const demoImpact = [
    "10,000+ books distributed in 2025",
    "5,000+ people received free health checkups",
    "2,000+ women trained in new skills"
  ];

  // Prepare financials for graph
  const fin = ngo.financials || { years: [2020,2021,2022,2023,2024], income: [0,0,0,0,0], expenses: [0,0,0,0,0] };
  const finData = fin.years.map((year, i) => ({
    year,
    Income: fin.income?.[i] || Math.floor(Math.random()*1000000+100000),
    Expenses: fin.expenses?.[i] || Math.floor(Math.random()*900000+100000)
  }));

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        {ngo.logo && <img src={ngo.logo} alt={ngo.name} className="w-20 h-20 rounded-full border" />}
        <div>
          <h1 className="text-2xl font-bold">{ngo.name}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            {ngo.badges && ngo.badges.map((b) => (
              <span key={b} className="bg-gray-200 text-xs px-2 py-1 rounded">{b}</span>
            ))}
            {ngo.transparency && <span className="ml-2 text-xs text-green-700 font-semibold">{ngo.transparency}</span>}
          </div>
          {ngo.mission && <p className="mt-2 text-gray-700">{ngo.mission}</p>}
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-4 border-b mb-4">
        {[
          ['overview', 'Overview'],
          ['programs', 'Programs'],
          ['people', 'People'],
          ['about', 'About Us'],
          ['impact', 'Impact'],
          ['contact', 'Contact']
        ].map(([key, label]) => (
          <button
            key={key}
            className={`py-2 px-3 -mb-px border-b-2 ${tab === key ? 'border-blue-600 text-blue-700 font-bold' : 'border-transparent text-gray-600'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Tab Content */}
      <div>
        {tab === 'overview' && (
          <div>
            <h2 className="font-semibold mb-2">Cause Areas</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {(ngo.primarySectors?.length ? ngo.primarySectors : ["Education","Health","Women Empowerment"]).map((s) => (
                <span key={s} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">{s}</span>
              ))}
              {(ngo.secondarySectors?.length ? ngo.secondarySectors : ["Skill Development","Nutrition"]).map((s) => (
                <span key={s} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">{s}</span>
              ))}
            </div>
            <h2 className="font-semibold mb-2">Financials (Interactive)</h2>
            <div className="w-full h-64 bg-white mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip formatter={v => `₹${v.toLocaleString()}`}/>
                  <Legend />
                  <Bar dataKey="Income" fill="#4f46e5" />
                  <Bar dataKey="Expenses" fill="#f59e42" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {ngo.impactMetrics?.length || demoImpact.length ? (
              <>
                <h2 className="font-semibold mb-2">Impact Metrics</h2>
                <ul className="list-disc ml-6 text-sm">
                  {(ngo.impactMetrics?.length ? ngo.impactMetrics : demoImpact).map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </>
            ) : null}
          </div>
        )}
        {tab === 'programs' && (
          <div>
            <h2 className="font-semibold mb-2">Programs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(ngo.programs?.length ? ngo.programs : demoPrograms).map((p, i) => (
                <div key={i} className="bg-gray-50 rounded shadow p-3 flex gap-3 items-center">
                  {p.img && <img src={p.img} alt={p.name} className="w-20 h-20 object-cover rounded" />}
                  <div>
                    <div className="font-bold text-lg">{p.name}</div>
                    <div className="text-gray-700 text-sm">{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'people' && (
          <div>
            <h2 className="font-semibold mb-2">Leadership Team</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(ngo.leadership?.length ? ngo.leadership : demoPeople).map((l, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 rounded shadow p-3">
                  {l.photo && <img src={l.photo} alt={l.name} className="w-16 h-16 rounded-full object-cover border" />}
                  <div>
                    <div className="font-bold">{l.name}</div>
                    <div className="text-gray-700 text-sm">{l.role}</div>
                    {l.linkedin && <a href={l.linkedin} className="text-blue-600 underline text-xs" target="_blank" rel="noopener noreferrer">LinkedIn</a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'about' && (
          <div>
            <h2 className="font-semibold mb-2">About</h2>
            <p className="mb-2">{ngo.about || "We are a passionate team dedicated to making a difference in our community through education, health, and empowerment."}</p>
            {ngo.vision && <><h2 className="font-semibold mb-2">Vision</h2><p>{ngo.vision}</p></>}
          </div>
        )}
        {tab === 'impact' && (
          <div>
            <h2 className="font-semibold mb-2">Impact</h2>
            <p>{ngo.impact || "Our impact is measured by the thousands of lives we touch every year through our programs and outreach."}</p>
          </div>
        )}
        {tab === 'contact' && (
          <div>
            <h2 className="font-semibold mb-2">Contact & Registration</h2>
            <div className="mb-2 text-sm">
              {ngo.address && <div><strong>Address:</strong> {ngo.address}</div>}
              {ngo.offices && <div><strong>Offices:</strong> {ngo.offices.join(', ')}</div>}
              {ngo.type && <div><strong>Type:</strong> {ngo.type} {ngo.subType && <>({ngo.subType})</>}</div>}
              {ngo.registration && (
                <>
                  <div><strong>PAN:</strong> {ngo.registration.pan}</div>
                  <div><strong>Reg No:</strong> {ngo.registration.regNo}</div>
                  <div><strong>CSR:</strong> {ngo.registration.csr}</div>
                  <div><strong>80G:</strong> {ngo.registration.g80}</div>
                  <div><strong>12A:</strong> {ngo.registration.a12}</div>
                  <div><strong>FCRA:</strong> {ngo.registration.fcra}</div>
                </>
              )}
            </div>
            {ngo.website && <div className="mb-2"><a href={ngo.website} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Website</a></div>}
            {ngo.socials && (
              <div className="flex gap-2">
                {ngo.socials.youtube && <a href={ngo.socials.youtube} target="_blank" rel="noopener noreferrer" className="text-red-600">YouTube</a>}
                {ngo.socials.linkedin && <a href={ngo.socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700">LinkedIn</a>}
                {ngo.socials.facebook && <a href={ngo.socials.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600">Facebook</a>}
                {ngo.socials.instagram && <a href={ngo.socials.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-600">Instagram</a>}
                {ngo.socials.twitter && <a href={ngo.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-400">Twitter</a>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
