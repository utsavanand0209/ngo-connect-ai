import React, { useState } from "react";
import ngoDetailMock from "./ngoDetailMock";

const NgoDetail = () => {
  const ngo = ngoDetailMock;
  const [tab, setTab] = useState("overview");

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <img src={ngo.logo} alt={ngo.name} className="w-20 h-20 rounded-full border" />
        <div>
          <h1 className="text-2xl font-bold">{ngo.name}</h1>
          <div className="flex gap-2 mt-1">
            {ngo.badges.map((b) => (
              <span key={b} className="bg-gray-200 text-xs px-2 py-1 rounded">{b}</span>
            ))}
            <span className="ml-2 text-xs text-green-700 font-semibold">{ngo.transparency}</span>
          </div>
          <p className="mt-2 text-gray-700">{ngo.mission}</p>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-4 border-b mb-4">
        {[
          ["overview", "Overview"],
          ["programs", "Programs"],
          ["people", "People"],
          ["about", "About Us"],
          ["impact", "Impact"],
          ["contact", "Contact"]
        ].map(([key, label]) => (
          <button
            key={key}
            className={`py-2 px-3 -mb-px border-b-2 ${tab === key ? "border-blue-600 text-blue-700 font-bold" : "border-transparent text-gray-600"}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Tab Content */}
      <div>
        {tab === "overview" && (
          <div>
            <h2 className="font-semibold mb-2">Cause Areas</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {ngo.primarySectors.map((s) => (
                <span key={s} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">{s}</span>
              ))}
              {ngo.secondarySectors.map((s) => (
                <span key={s} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">{s}</span>
              ))}
            </div>
            <h2 className="font-semibold mb-2">Financials (2023-24)</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Total Income</div>
                <div className="font-bold text-lg">₹{ngo.financials.income[4].toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Total Expenses</div>
                <div className="font-bold text-lg">₹{ngo.financials.expenses[4].toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Program Expenses</div>
                <div className="font-bold text-lg">₹{ngo.financials.program.toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Non-Program Expenses</div>
                <div className="font-bold text-lg">₹{ngo.financials.nonProgram.toLocaleString()}</div>
              </div>
            </div>
            <h2 className="font-semibold mb-2">Impact Metrics</h2>
            <ul className="list-disc ml-6 text-sm">
              {ngo.impactMetrics.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
        {tab === "programs" && (
          <div>
            <h2 className="font-semibold mb-2">Programs</h2>
            <ul className="list-disc ml-6">
              {ngo.programs.map((p, i) => (
                <li key={i} className="mb-1 font-medium">{p.name}</li>
              ))}
            </ul>
          </div>
        )}
        {tab === "people" && (
          <div>
            <h2 className="font-semibold mb-2">Leadership Team</h2>
            <ul className="list-disc ml-6">
              {ngo.leadership.map((l, i) => (
                <li key={i} className="mb-1">
                  <span className="font-medium">{l.name}</span> - {l.role} {l.linkedin && <a href={l.linkedin} className="text-blue-600 underline ml-2" target="_blank" rel="noopener noreferrer">LinkedIn</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === "about" && (
          <div>
            <h2 className="font-semibold mb-2">About</h2>
            <p className="mb-2">{ngo.about}</p>
            <h2 className="font-semibold mb-2">Vision</h2>
            <p>{ngo.vision}</p>
          </div>
        )}
        {tab === "impact" && (
          <div>
            <h2 className="font-semibold mb-2">Impact</h2>
            <p>{ngo.impact}</p>
          </div>
        )}
        {tab === "contact" && (
          <div>
            <h2 className="font-semibold mb-2">Contact & Registration</h2>
            <div className="mb-2 text-sm">
              <div><strong>Address:</strong> {ngo.address}</div>
              <div><strong>Offices:</strong> {ngo.offices.join(", ")}</div>
              <div><strong>Type:</strong> {ngo.type} ({ngo.subType})</div>
              <div><strong>PAN:</strong> {ngo.registration.pan}</div>
              <div><strong>Reg No:</strong> {ngo.registration.regNo}</div>
              <div><strong>CSR:</strong> {ngo.registration.csr}</div>
              <div><strong>80G:</strong> {ngo.registration.g80}</div>
              <div><strong>12A:</strong> {ngo.registration.a12}</div>
              <div><strong>FCRA:</strong> {ngo.registration.fcra}</div>
            </div>
            <div className="mb-2">
              <a href={ngo.website} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Website</a>
            </div>
            <div className="flex gap-2">
              {ngo.socials.youtube && <a href={ngo.socials.youtube} target="_blank" rel="noopener noreferrer" className="text-red-600">YouTube</a>}
              {ngo.socials.linkedin && <a href={ngo.socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700">LinkedIn</a>}
              {ngo.socials.facebook && <a href={ngo.socials.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600">Facebook</a>}
              {ngo.socials.instagram && <a href={ngo.socials.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-600">Instagram</a>}
              {ngo.socials.twitter && <a href={ngo.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-400">Twitter</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NgoDetail;
