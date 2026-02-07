# AI-Powered Recommendations Implementation Plan

## Backend Changes

### 1. Update User Model ✅ COMPLETE
- [x] Add `preferences` object to UserSchema
  - `location`: String
  - `preferredLocations`: [String]
  - `interests`: [String]
  - `causes`: [String]
  - `skills`: [String]

### 2. Create User Preferences API ✅ COMPLETE
- [x] Add endpoint to save/update user preferences
  - `GET /api/users/preferences` - Get user preferences
  - `PUT /api/users/preferences` - Update user preferences

### 3. Enhance AI Recommendation Engine ✅ COMPLETE
- [x] Update `/api/ai/recommendations` to return BOTH NGOs AND Campaigns
- [x] Implement smart matching algorithm:
  - Location matching
  - Interest/cause matching
  - Skill matching
- [x] Add scoring system for relevance
- [x] Include "reasons" for each recommendation

---

## Frontend Changes

### 4. Update API Service ✅ COMPLETE
- [x] Add `getUserPreferences` method
- [x] Add `updateUserPreferences` method
- [x] Add `getAIRecommendations` method

### 5. Create Preferences Modal ✅ COMPLETE
- [x] Create `frontend/src/components/PreferencesModal.js`
- [x] Collect: location, interests, skills, causes
- [x] Pre-populate with existing user data
- [x] Show as modal

### 6. Create Recommendations Page ✅ COMPLETE
- [x] Create `frontend/src/pages/Recommendations.js`
- [x] Display recommended NGOs with match scores
- [x] Display recommended campaigns with match scores
- [x] Add "Why recommended" badges
- [x] Add tabs for filtering (All/NGOs/Campaigns)

### 7. Update App.js Routes ✅ COMPLETE
- [x] Add route for `/recommendations`

### 8. Update UserDashboard ✅ COMPLETE
- [x] Integrate PreferencesModal
- [x] Check if preferences exist before showing recommendations
- [x] Update button text based on preferences status

---

## User Flow

### New User:
1. Click "Get Personalized Recommendations" on Dashboard
2. Modal opens: "Personalize Your Experience"
3. User fills: Location, Causes, Skills, Interests
4. Click "Get Recommendations"
5. Navigate to Recommendations page with personalized results

### Returning User (with preferences):
1. Click "See Your Recommendations"
2. Navigate directly to Recommendations page

---

## Key Features

✅ **Smart Matching**: Algorithm matches user preferences with NGO sectors/campaign categories
✅ **Transparency**: Show "Why recommended" badges
✅ **Comprehensive**: Show both NGOs and campaigns with match scores
✅ **Campaign Progress**: Visual progress bars for campaign funding
✅ **User-friendly**: Modal flow for new users, direct access for returning users
✅ **Responsive**: Works on all screen sizes

---

## File Changes Summary

### Modified Files:
- `backend/src/models/User.js` - Add preferences field
- `backend/src/routes/users.js` - Add preferences endpoints
- `backend/src/routes/ai.js` - Enhanced recommendations with scoring
- `frontend/src/services/api.js` - Add preferences API methods
- `frontend/src/App.js` - Add /recommendations route
- `frontend/src/pages/UserDashboard.js` - Integrate PreferencesModal

### New Files Created:
- `frontend/src/components/PreferencesModal.js` - User preferences form modal
- `frontend/src/pages/Recommendations.js` - Recommendations display page

---

## How to Test

1. Start the backend: `cd backend && npm start`
2. Start the frontend: `cd frontend && npm start`
3. Log in as a user
4. Click "Get Personalized Recommendations" on the Dashboard
5. Fill in preferences (location, causes, skills)
6. Click "Get Recommendations"
7. View personalized NGO and campaign recommendations

---

## Implementation Status: ✅ COMPLETE

All features implemented and ready to use!
