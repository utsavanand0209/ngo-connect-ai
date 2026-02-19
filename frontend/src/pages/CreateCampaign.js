import React, { useMemo, useState } from 'react';
import api, { forecastCampaignSuccess, generateProposalDraft } from '../services/api';

const parseRoles = (value) =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const calcDurationDays = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
};

export default function CreateCampaign() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [volunteersNeeded, setVolunteersNeeded] = useState('');
  const [needsFunding, setNeedsFunding] = useState(true);
  const [needsVolunteers, setNeedsVolunteers] = useState(false);
  const [category, setCategory] = useState('');
  const [timelineStartDate, setTimelineStartDate] = useState('');
  const [timelineEndDate, setTimelineEndDate] = useState('');
  const [draftType, setDraftType] = useState('campaign_description');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [forecastError, setForecastError] = useState('');
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState('success');

  const durationDays = useMemo(
    () => calcDurationDays(timelineStartDate, timelineEndDate),
    [timelineStartDate, timelineEndDate]
  );

  const setStatus = (text, tone = 'success') => {
    setMsg(text);
    setMsgTone(tone);
  };

  const classify = async (desc) => {
    if (!String(desc || '').trim()) return;
    try {
      const res = await api.post('/ai/classify-campaign', { description: desc });
      if (res?.data?.category) setCategory(res.data.category);
    } catch (err) {
      // Keep manual category entry as fallback if classify fails.
    }
  };

  const handleGenerateDraft = async () => {
    setStatus('');
    if (!title.trim() && !description.trim()) {
      setStatus('Add at least a title or context before generating an AI draft.', 'error');
      return;
    }
    setAiGenerating(true);
    try {
      const volunteerRoles = parseRoles(volunteersNeeded);
      const timeline =
        timelineStartDate && timelineEndDate
          ? `${timelineStartDate} to ${timelineEndDate}`
          : durationDays
            ? `${durationDays} days`
            : '';
      const res = await generateProposalDraft({
        type: draftType,
        title,
        cause: category,
        targetAudience: 'Donors and volunteers',
        beneficiaries: '',
        goalAmount: needsFunding ? Number(goalAmount || 0) : 0,
        location,
        keyActivities: volunteerRoles,
        timeline,
        existingContext: description
      });
      const nextDraft = String(res?.data?.draft || '').trim();
      if (!nextDraft) {
        setStatus('AI draft was empty. Try refining your inputs and retry.', 'error');
        return;
      }
      setDescription(nextDraft);
      if (!category) {
        await classify(nextDraft);
      }
      setStatus(`AI draft generated using ${res?.data?.mode === 'gemini' ? 'Gemini' : 'template mode'}.`, 'success');
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to generate AI draft.', 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleForecast = async () => {
    setForecastError('');
    setStatus('');
    if (!needsFunding || Number(goalAmount || 0) <= 0) {
      setForecast(null);
      setForecastError('Enable funding and enter a goal amount to run campaign forecasting.');
      return;
    }
    if (timelineStartDate && timelineEndDate && !durationDays) {
      setForecast(null);
      setForecastError('Timeline end date must be after start date.');
      return;
    }
    setForecastLoading(true);
    try {
      const volunteerRoles = parseRoles(volunteersNeeded);
      const res = await forecastCampaignSuccess({
        title,
        description,
        category,
        location,
        goalAmount: Number(goalAmount || 0),
        durationDays,
        timelineStartDate: timelineStartDate || undefined,
        timelineEndDate: timelineEndDate || undefined,
        volunteersNeeded: volunteerRoles
      });
      setForecast(res.data || null);
      setStatus('Campaign forecast generated.', 'success');
    } catch (err) {
      setForecast(null);
      setForecastError(err.response?.data?.message || 'Failed to generate campaign forecast.');
    } finally {
      setForecastLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setStatus('');

    if (!needsFunding && !needsVolunteers) {
      setStatus('Select at least one: Funding or Volunteers.', 'error');
      return;
    }
    const volunteersList = needsVolunteers ? parseRoles(volunteersNeeded) : [];
    if (needsFunding && Number(goalAmount || 0) <= 0) {
      setStatus('Enter a goal amount greater than 0.', 'error');
      return;
    }
    if (needsVolunteers && volunteersList.length === 0) {
      setStatus('Add at least one volunteer role or skill.', 'error');
      return;
    }
    if (timelineStartDate && timelineEndDate && !durationDays) {
      setStatus('Timeline end date must be after start date.', 'error');
      return;
    }

    const payload = {
      title,
      description,
      location,
      goalAmount: needsFunding ? Number(goalAmount || 0) : 0,
      volunteersNeeded: volunteersList,
      category,
      timelineStartDate: timelineStartDate || undefined,
      timelineEndDate: timelineEndDate || undefined,
      durationDays: durationDays || undefined
    };
    try {
      await api.post('/campaigns', payload);
      setStatus('Campaign created successfully.', 'success');
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to create campaign.', 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto mt-8 px-4 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">Create Campaign</h2>
          <p className="text-sm text-gray-600 mt-1">Step 1: Fill campaign basics. Step 2: Use AI assist. Step 3: Publish.</p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Campaign title"
              className="w-full p-2.5 border rounded-lg"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Campaign description"
              rows={8}
              className="w-full p-2.5 border rounded-lg"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
                className="w-full p-2.5 border rounded-lg"
              />
              <div className="flex gap-2">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category"
                  className="w-full p-2.5 border rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => classify(description)}
                  className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200"
                >
                  Auto
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Timeline Start</label>
                <input
                  type="date"
                  value={timelineStartDate}
                  onChange={(e) => setTimelineStartDate(e.target.value)}
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Timeline End</label>
                <input
                  type="date"
                  value={timelineEndDate}
                  onChange={(e) => setTimelineEndDate(e.target.value)}
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>
            </div>
            {durationDays !== null && (
              <p className="text-xs text-gray-500">Estimated campaign duration: {durationDays} day(s)</p>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={needsFunding} onChange={(e) => setNeedsFunding(e.target.checked)} />
                Needs Funding
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={needsVolunteers} onChange={(e) => setNeedsVolunteers(e.target.checked)} />
                Needs Volunteers
              </label>
            </div>

            <input
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
              placeholder="Goal Amount"
              type="number"
              className="w-full p-2.5 border rounded-lg disabled:bg-gray-100"
              disabled={!needsFunding}
            />
            <input
              value={volunteersNeeded}
              onChange={(e) => setVolunteersNeeded(e.target.value)}
              placeholder="Volunteer roles/skills (comma separated)"
              className="w-full p-2.5 border rounded-lg disabled:bg-gray-100"
              disabled={!needsVolunteers}
            />

            <button className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
              Create Campaign
            </button>
          </form>

          {msg && (
            <div className={`mt-3 text-sm ${msgTone === 'error' ? 'text-red-600' : 'text-green-600'}`}>{msg}</div>
          )}
        </div>

        <div className="space-y-6">
          <section className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">AI Proposal Writer</h3>
            <p className="text-sm text-gray-600 mt-1">
              Generate a structured draft using your campaign details, then edit before publishing.
            </p>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Draft Type</label>
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="w-full p-2.5 border rounded-lg"
              >
                <option value="campaign_description">Campaign Description</option>
                <option value="grant_proposal">Grant Proposal</option>
                <option value="impact_report">Impact Report</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={aiGenerating}
              className="mt-4 w-full py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {aiGenerating ? 'Generating Draft...' : 'Generate AI Draft'}
            </button>
          </section>

          <section className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Predictive Fundraising</h3>
            <p className="text-sm text-gray-600 mt-1">
              Run a pre-launch forecast to estimate probability of success and donation range.
            </p>
            <button
              type="button"
              onClick={handleForecast}
              disabled={forecastLoading}
              className="mt-4 w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {forecastLoading ? 'Analyzing...' : 'Predict Campaign Success'}
            </button>
            {forecastError && <p className="mt-3 text-sm text-red-600">{forecastError}</p>}
            {forecast && (
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-gray-500">Success Probability</p>
                  <p className="text-2xl font-bold text-gray-900">{forecast.successProbability}%</p>
                  <p className="text-xs text-gray-500 mt-1">Confidence: {forecast.confidence}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-gray-500">Predicted Donation Range</p>
                  <p className="font-semibold text-gray-900">
                    Rs {Number(forecast.predictedRange?.low || 0).toLocaleString('en-IN')} - Rs {Number(forecast.predictedRange?.high || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-gray-500">
                    Expected: Rs {Number(forecast.predictedRange?.expected || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-gray-500 mb-1">Strengths</p>
                  <ul className="list-disc pl-4 space-y-1 text-green-700">
                    {(forecast.strengths || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-gray-500 mb-1">Risks</p>
                  <ul className="list-disc pl-4 space-y-1 text-amber-700">
                    {(forecast.risks || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
