# NGO Connect Explainer Video Script

## Target length
9 to 11 minutes.

## Demo credentials (seeded)
- Admin: `admin@ngoconnect.org` / `password123`
- User: `rahul@example.com` / `password123`
- NGO: `akshayapatra@ngo.org` / `password123`

## Storyline
### 1. Problem and solution (0:00 to 0:45)
Narration:
"NGO Connect is a full-stack platform that connects donors, volunteers, NGOs, and admins in one unified workflow. Instead of using disconnected tools for fundraising, volunteering, communication, and reporting, NGOs can operate everything from one system while users get transparent impact visibility."

Screen:
- Home page (`/`)
- Quick scroll to hero and feature highlights.

### 2. User journey: discover, donate, volunteer (0:45 to 3:50)
Narration:
"Let us start from the user side. After login, users can discover NGOs, view campaigns, donate with integrated payment flows, apply for volunteering, and track their own contribution history."

Screen:
- Login as user.
- `NGOs` (`/discover`): search and category filtering.
- `Map` (`/map`): location-based NGO discovery and route view.
- `Campaigns` (`/campaigns`) and one campaign detail (`/campaigns/:id`).
- `Donate` (`/donate`): show payment method options like UPI, card, and netbanking.
- `Volunteer Opportunities` (`/volunteer-opportunities`): show apply flow.
- `Dashboard` (`/dashboard`) and `Profile` (`/profile`) to show user contribution view.

### 3. Trust and engagement features (3:50 to 5:20)
Narration:
"The platform focuses on trust and retention. Users can see campaign progress, impact updates, NGO transparency details, and receive post-donation engagement through notifications and messaging."

Screen:
- `NGO list/profile` (`/ngos`, `/ngos/:id`) show transparency and program details.
- `Messages` (`/messages`) for user to NGO communication.
- `Insights` (`/insights`) and `Recommendations` (`/recommendations`) for personalized discovery.
- `Chatbot` (`/chatbot`) for guided support.

### 4. Innovation Center modules (5:20 to 7:00)
Narration:
"A key differentiator is the Innovation Center. It includes giving circles, in-kind wishlists, emergency response contributions, corporate matching, donor CRM capabilities, impact updates, volunteer endorsements, and gamification with leaderboards."

Screen:
- `Innovation Center` (`/innovation-center`).
- Scroll through:
  - Emergency feed
  - Giving circles
  - Wishlist pledges
  - Leaderboard and endorsements
  - Corporate matching and donor CRM views.

### 5. NGO operations workflow (7:00 to 8:50)
Narration:
"Now switching to NGO role. NGOs can update their profile, create and manage campaigns, review volunteer and donation-related approvals, publish campaign updates, and monitor campaign-level analytics."

Screen:
- Logout, login as NGO.
- `Dashboard` (`/dashboard`) for operational metrics.
- `My NGO Profile` (`/ngo/profile`) for org profile updates.
- `Create Campaign` (`/campaigns/create`) for campaign creation workflow.
- `Campaign details` (`/campaigns/:id`) and publish an update section.
- `Messages` (`/messages`) and `Innovation Center` (`/innovation-center`) as NGO view.

### 6. Admin governance and reliability (8:50 to 10:20)
Narration:
"Admin workflows provide governance and platform reliability. Admins verify NGOs, moderate flag requests, monitor platform analytics, and operate webhook reliability tools including dead-letter retries, worker status, metrics, export, and retention cleanup."

Screen:
- Logout, login as admin.
- `Admin Dashboard` (`/admin`) show top summary cards and health panels.
- `Admin Verifications` (`/admin/verifications`).
- `Flagged Content` (`/admin/flagged-content`).
- `Admin Analytics` (`/admin/analytics`).
- `Admin Requests` (`/admin/requests`).
- `Admin Notifications` (`/admin/notifications`).
- `Admin Categories` (`/admin/categories`).
- `Admin Users` (`/admin/users`).

### 7. Architecture close (10:20 to 10:55)
Narration:
"Technically, NGO Connect runs as a React frontend with role-based route protection, an Express backend with JWT auth, and a PostgreSQL relational model. It supports donation payment integrations, campaign engagement tracking, and operational modules for all stakeholders. This creates one transparent and scalable ecosystem for social impact delivery."

Screen:
- Return to home page.
- Show README architecture section quickly.

## Tips for smooth narration
- Keep cursor movement slow and intentional.
- Pause for 1 to 2 seconds after route changes.
- Keep zoom at 100% and browser at full screen.
- Record in one take for continuity, then trim silences.
