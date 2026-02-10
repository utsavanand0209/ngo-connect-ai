# NGO-Connect: Design & Architecture Document

> **Version**: 1.0  
> **Date**: February 10, 2026  
> **Platform**: NGO-Connect — Full-Stack Platform for NGOs, Donors, Volunteers & Admins

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
   - 3.1 [High-Level Architecture](#31-high-level-architecture)
   - 3.2 [Technology Stack](#32-technology-stack)
   - 3.3 [Repository Structure](#33-repository-structure)
4. [Backend Design](#4-backend-design)
   - 4.1 [Server & Middleware Chain](#41-server--middleware-chain)
   - 4.2 [Authentication & Authorization](#42-authentication--authorization)
   - 4.3 [Database Design](#43-database-design)
   - 4.4 [Model / Data Access Layer](#44-model--data-access-layer)
   - 4.5 [Payment Gateway](#45-payment-gateway)
   - 4.6 [AI & Recommendation Engine](#46-ai--recommendation-engine)
   - 4.7 [Utility Modules](#47-utility-modules)
5. [Frontend Design](#5-frontend-design)
   - 5.1 [Routing & Access Control](#51-routing--access-control)
   - 5.2 [Component Architecture](#52-component-architecture)
   - 5.3 [Feature Pages](#53-feature-pages)
   - 5.4 [API Client](#54-api-client)
6. [REST API Reference](#6-rest-api-reference)
   - 6.1 [Authentication (`/api/auth`)](#61-authentication-apiauth)
   - 6.2 [Users (`/api/users`)](#62-users-apiusers)
   - 6.3 [NGOs (`/api/ngos`)](#63-ngos-apingos)
   - 6.4 [Campaigns (`/api/campaigns`)](#64-campaigns-apicampaigns)
   - 6.5 [Donations (`/api/donations`)](#65-donations-apidonations)
   - 6.6 [Volunteering (`/api/volunteering`)](#66-volunteering-apivolunteering)
   - 6.7 [Certificates (`/api/certificates`)](#67-certificates-apicertificates)
   - 6.8 [Messages (`/api/messages`)](#68-messages-apimessages)
   - 6.9 [Notifications (`/api/notifications`)](#69-notifications-apinotifications)
   - 6.10 [Categories (`/api/categories`)](#610-categories-apicategories)
   - 6.11 [Help Requests (`/api/requests`)](#611-help-requests-apirequests)
   - 6.12 [Admin (`/api/admin`)](#612-admin-apiadmin)
   - 6.13 [AI & Recommendations (`/api/ai`)](#613-ai--recommendations-apiai)
7. [Key Workflows](#7-key-workflows)
   - 7.1 [Donation Flow](#71-donation-flow)
   - 7.2 [Volunteer Flow](#72-volunteer-flow)
   - 7.3 [Help Request Flow](#73-help-request-flow)
   - 7.4 [NGO Verification & Moderation Flow](#74-ngo-verification--moderation-flow)
   - 7.5 [Messaging Flow](#75-messaging-flow)
8. [Database Schema Reference](#8-database-schema-reference)
9. [Deployment & Configuration](#9-deployment--configuration)
10. [Seed Data & Testing](#10-seed-data--testing)

---

## 1. Executive Summary

**NGO-Connect** is a full-stack web platform that bridges the gap between Non-Governmental Organizations (NGOs), donors, volunteers, and platform administrators. The system enables:

- **Donors** to discover NGOs, donate to campaigns with real payment processing, receive digital receipts and certificates.
- **Volunteers** to find and apply for volunteer opportunities and campaign volunteer roles, complete activities, and receive certificates.
- **NGOs** to manage their profiles, create campaigns, publish volunteer opportunities, process help requests, and communicate with users.
- **Administrators** to verify NGOs, moderate flagged content, manage categories, broadcast notifications, and monitor platform analytics.
- **AI-powered features** including personalized NGO/campaign recommendations, a chatbot with RAG (Retrieval-Augmented Generation) support via Google Gemini, campaign auto-classification, fraud scoring, and volunteer-campaign matching.

The platform is built with a **React 18** frontend communicating via **REST APIs** with a **Node.js/Express** backend, backed by **PostgreSQL** as the primary data store.

---

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────┐  │
│  │   React SPA      │   │   Admin SSR      │   │   Chatbot   │  │
│  │   (Browser)      │   │   Dashboard      │   │   Widget    │  │
│  └────────┬─────────┘   └────────┬─────────┘   └──────┬──────┘  │
└───────────┼──────────────────────┼─────────────────────┼─────────┘
            │  Axios + JWT         │  HTML Response       │
            ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                    EXPRESS API SERVER (:5001)                     │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐   │
│  │ CORS       │  │ JSON Body  │  │ JWT Auth Middleware       │   │
│  │ Middleware  │  │ Parser     │  │ (role-based access)       │   │
│  └────────────┘  └────────────┘  └──────────────────────────┘   │
│                                                                   │
│  ┌─ Route Handlers ──────────────────────────────────────────┐   │
│  │ /api/auth    /api/ngos      /api/campaigns   /api/ai      │   │
│  │ /api/users   /api/donations /api/volunteering /api/admin   │   │
│  │ /api/messages /api/notifications /api/categories           │   │
│  │ /api/requests /api/certificates                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Services & Utils ────────────────────────────────────────┐   │
│  │ Payment Gateway │ Certificate Templates │ Support Chat KB  │   │
│  │ Admin SSR       │ Platform KB           │ AI/Gemini        │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Data Access Layer ───────────────────────────────────────┐   │
│  │ Model Factory (Mongoose-like API) │ PostgreSQL Pool       │   │
│  │ Query Matcher │ ID Generator      │ SQL Helpers            │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                        POSTGRESQL                                │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 13 Primary Tables + 4 Junction Tables                    │    │
│  │ JSONB source_doc + Relational Columns + Indexes          │    │
│  │ Foreign Keys + Unique Constraints                        │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                                │
                                │ (Optional)
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│              EXTERNAL SERVICES                                   │
│  ┌─────────────────┐   ┌──────────────────────────────────┐     │
│  │ Razorpay API    │   │ Google Gemini API (gemini-2.5-flash) │  │
│  │ (Payments)      │   │ (AI Chatbot & Recommendations)   │     │
│  └─────────────────┘   └──────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture

### 3.1 High-Level Architecture

The system follows a **three-tier architecture**:

| Tier | Technology | Responsibility |
|------|-----------|----------------|
| **Presentation** | React 18 SPA + Tailwind CSS | User interface, routing, state management |
| **Application** | Node.js + Express | REST API, business logic, auth, AI integration |
| **Data** | PostgreSQL | Persistent storage, relational integrity, JSONB documents |

**Communication Pattern**: The frontend communicates with the backend exclusively via RESTful HTTP APIs using Axios. Authentication is handled via JWT Bearer tokens attached to every authenticated request.

### 3.2 Technology Stack

#### Backend
| Component | Technology | Version/Details |
|-----------|-----------|-----------------|
| Runtime | Node.js | LTS |
| Framework | Express.js | ^4.22.1 |
| Database | PostgreSQL | 14+ (via `pg` ^8.16.3) |
| Authentication | JWT | `jsonwebtoken` ^9.0.3 |
| Password Hashing | bcrypt | `bcryptjs` ^2.4.3 |
| File Uploads | Multer | ^1.4.5-lts.1 |
| AI/LLM | Google Gemini | `@google/generative-ai` ^0.24.1 |
| Payments | Razorpay / Mock | Custom abstraction |
| Environment | dotenv | ^16.6.1 |
| CORS | cors | ^2.8.6 |

#### Frontend
| Component | Technology | Version/Details |
|-----------|-----------|-----------------|
| UI Library | React | ^18.2.0 |
| Routing | React Router | v6 (`react-router-dom` ^6.14.1) |
| HTTP Client | Axios | ^1.4.0 |
| CSS Framework | Tailwind CSS | ^3.4.4 |
| Charts | Recharts | ^2.8.0 |
| Maps | Leaflet + react-leaflet | ^1.9.4 / ^4.2.1 |
| Routing (Maps) | leaflet-routing-machine | ^3.2.12 |
| Icons | Heroicons | ^1.0.6 |

### 3.3 Repository Structure

```
ngo-connect-ai/
├── README.md                           # Project overview & setup
├── TODO.md                             # Feature implementation tracker
├── backend/
│   ├── package.json
│   ├── seed.js                         # Database seeder
│   ├── sql/
│   │   └── normalized_schema.sql       # Full PostgreSQL schema
│   ├── docs/                           # Migration & design notes
│   ├── scripts/
│   │   └── smokeTest.js                # End-to-end API smoke test
│   └── src/
│       ├── server.js                   # Express app entry point
│       ├── config/
│       │   └── db.js                   # DB connection config
│       ├── db/
│       │   ├── postgres.js             # pg pool + query helpers
│       │   ├── modelFactory.js         # Mongoose-like model abstraction
│       │   ├── queryMatcher.js         # In-memory query filter engine
│       │   ├── utils.js                # Deep clone, dot-path utils
│       │   └── id.js                   # UUID generator
│       ├── middleware/
│       │   ├── auth.js                 # JWT + role-based access
│       │   └── index.js                # Middleware barrel (reserved)
│       ├── models/                     # 13 model wrappers
│       ├── routes/                     # 13 route modules
│       ├── services/
│       │   └── paymentGateway.js       # Razorpay/mock payment abstraction
│       └── utils/
│           ├── adminDashboardSsr.js    # SSR admin dashboard HTML
│           ├── certificateTemplates.js # Certificate generation & rendering
│           ├── platformSupportKb.js    # Chatbot knowledge base
│           └── supportChat.js          # Chatbot prompt builder
├── frontend/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.js                      # Route definitions
│       ├── index.js                    # React entry point
│       ├── index.css                   # Tailwind imports
│       ├── components/                 # 7 shared components
│       ├── pages/                      # 28+ feature pages
│       ├── services/
│       │   └── api.js                  # Centralized API client
│       └── utils/                      # Client-side helpers
└── uploads/                            # Document upload storage
```

---

## 4. Backend Design

### 4.1 Server & Middleware Chain

The Express server (`server.js`) sets up the following pipeline:

1. **CORS**: Configured for `localhost:3000`, `localhost:3001`, `127.0.0.1:3000/3001` with credentials support.
2. **JSON Body Parser**: `express.json()` for parsing request bodies.
3. **Route Mounting**: 13 route groups mounted under `/api/*`.
4. **Health Check**: `GET /` returns `{ ok: true, message: 'NGO Connect API running' }`.
5. **Startup**: Connects to PostgreSQL via pooled connection, then starts listening on port `5001` (configurable via `PORT` env).

### 4.2 Authentication & Authorization

| Aspect | Implementation |
|--------|---------------|
| **Strategy** | Stateless JWT Bearer Token |
| **Token Lifetime** | 7 days |
| **Password Storage** | bcrypt (bcryptjs) |
| **Middleware** | `auth(roles[])` — verifies token, checks role, injects `req.user` |
| **Roles** | `user`, `ngo`, `admin` |
| **Error Codes** | 401 Unauthorized (missing/invalid token), 403 Forbidden (role mismatch) |

**Token Payload**: Contains `id`, `role`, and – for NGOs – the NGO record ID. The JWT secret defaults to `'secret'` but should be overridden via `JWT_SECRET` environment variable.

### 4.3 Database Design

#### Design Philosophy
The database uses a **hybrid document-relational pattern**:
- Every table has typed relational columns with proper foreign keys, indexes, and constraints.
- Every table also has a `source_doc JSONB` column that stores the full API payload for compatibility.
- A `BIGSERIAL` internal `id` is the primary key; a `TEXT external_id` (UUID v4) is the API-facing identifier.
- `created_at` and `updated_at` timestamps are maintained on all tables.

#### Entity-Relationship Overview

```
users_rel ──────┬──── donations_rel ──── campaigns_rel ──── ngos_rel
                │          │                    │               │
                │          ▼                    │               │
                │    certificates_rel           │               │
                │          ▲                    │               │
                │          │                    │               │
                ├──── volunteer_applications_rel │               │
                │          │                    │               │
                │          ▼                    │               │
                │    volunteer_opportunities_rel ──────────────┘
                │
                ├──── messages_rel
                ├──── help_requests_rel
                ├──── flag_requests_rel
                └──── notifications_rel

ngos_rel ◄──── ngo_categories_rel
campaigns_rel ◄──── campaign_volunteers_rel
campaigns_rel ◄──── campaign_volunteer_registrations_rel
volunteer_opportunities_rel ◄──── opportunity_applicants_rel
```

#### Primary Tables (13)

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `users_rel` | Platform users (donors, volunteers, admins) | — |
| `ngos_rel` | Non-Governmental Organizations | — |
| `categories_rel` | NGO/campaign categories | `created_by → users_rel` |
| `campaigns_rel` | Fundraising/volunteer campaigns | `ngo_id → ngos_rel` |
| `volunteer_opportunities_rel` | Standalone volunteer positions | `ngo_id → ngos_rel` |
| `volunteer_applications_rel` | User applications to opportunities | `user_id → users_rel`, `ngo_id → ngos_rel`, `opportunity_id → volunteer_opportunities_rel` |
| `donations_rel` | Financial contributions | `user_id → users_rel`, `campaign_id → campaigns_rel`, `ngo_id → ngos_rel` |
| `certificates_rel` | Donation & volunteer certificates | `user_id, ngo_id, campaign_id, donation_id, volunteer_application_id` |
| `messages_rel` | User-NGO messaging | `from_user_id → users_rel`, `to_ngo_id → ngos_rel` |
| `notifications_rel` | Platform notifications | `created_by_user_id → users_rel` |
| `help_requests_rel` | Support requests from users to NGOs | `user_id → users_rel`, `ngo_id → ngos_rel` |
| `flag_requests_rel` | Content moderation flag requests | `requested_by → users_rel`, `resolved_by → users_rel` |
| `ai_logs_rel` | AI operation audit logs | — |

#### Junction Tables (4)

| Table | Purpose |
|-------|---------|
| `ngo_categories_rel` | Many-to-many NGO ↔ Category names |
| `campaign_volunteers_rel` | Many-to-many Campaign ↔ User volunteers |
| `campaign_volunteer_registrations_rel` | Campaign volunteer sign-ups with onboarding details |
| `opportunity_applicants_rel` | Many-to-many Opportunity ↔ User applicants |

### 4.4 Model / Data Access Layer

The model layer (`db/modelFactory.js`) provides a **Mongoose-compatible API over PostgreSQL JSONB**:

- **`createModel(name, refs, tableName)`** — Creates a model class with CRUD methods.
- **CRUD Methods**: `create()`, `insertMany()`, `find()`, `findOne()`, `findById()`, `findByIdAndUpdate()`, `findOneAndUpdate()`, `findByIdAndDelete()`, `deleteMany()`, `countDocuments()`.
- **Query Chaining**: `Model.find(filter).populate('ref').sort('-createdAt').limit(10).exec()`
- **Population**: Resolves foreign-key references to full documents (like Mongoose `populate()`).
- **Update Operators**: Supports `$set`, `$inc`, `$push` for partial updates.
- **ID Strategy**: Reads/writes use the `external_id` (UUID v4) as the document `_id` in the application layer.

Some route handlers also use **direct PostgreSQL queries** for performance-critical operations (admin dashboard, complex joins, aggregations).

### 4.5 Payment Gateway

The payment service (`services/paymentGateway.js`) implements a dual-mode abstraction:

| Mode | Activation | Behavior |
|------|-----------|----------|
| **Mock** | Default (no Razorpay credentials) | Generates deterministic mock order/payment IDs; verification always succeeds |
| **Razorpay** | When `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set | Real payment order creation via Razorpay API; HMAC-SHA256 signature verification |

- Currency: INR (amounts in paise internally).
- Uses raw Node.js `https` module (no external HTTP client dependency).

### 4.6 AI & Recommendation Engine

| Feature | Implementation |
|---------|---------------|
| **Personalized Recommendations** | Rule-based scoring using user preferences (location, interests, causes, skills) matched against NGO sectors/geographies and campaign categories. Returns top 10 NGOs + top 10 campaigns with scores and reasons. |
| **Chatbot** | RAG-powered using Google Gemini (`gemini-2.5-flash`). Retrieves relevant NGOs/campaigns from DB based on message keywords. Falls back to keyword-matched KB articles when LLM is unavailable. |
| **Campaign Classification** | Keyword-based classification into categories: Education, Health, Food, Disaster Relief, Environment, Other. |
| **Fraud Scoring** | Heuristic analysis: checks verification docs, account age, suspicious keywords, unrealistic campaign goals. Flags if score ≥ 50. |
| **Volunteer Matching** | Scores users against campaign requirements by location, skills, and availability. Returns top 10 matches. |

### 4.7 Utility Modules

| Module | Purpose |
|--------|---------|
| `adminDashboardSsr.js` | Generates a self-contained HTML admin dashboard with inline CSS/JS, auto-refresh, interactive tables, and moderation action buttons |
| `certificateTemplates.js` | Certificate number generation, slug creation, and HTML rendering for both donation and volunteer certificates (print-ready) |
| `platformSupportKb.js` | 13 knowledge base articles covering all platform features, used by the chatbot for keyword matching |
| `supportChat.js` | Chatbot prompt engineering: KB entry selection, history normalization, role-aware prompt building, and fallback reply generation |

---

## 5. Frontend Design

### 5.1 Routing & Access Control

The frontend uses **React Router v6** with three levels of route protection:

| Guard Component | Access Level | Behavior on Unauthorized |
|----------------|-------------|-------------------------|
| *(none)* | Public | Accessible to all |
| `ProtectedRoute` | Any authenticated user | Redirect to `/login` |
| `UserRoute` | `role=user` only | Redirect to `/login` or `/dashboard` |
| `AdminRoute` | `role=admin` only | Redirect to `/login` or `/dashboard` |

#### Route Map (28 routes)

| Path | Page Component | Access |
|------|---------------|--------|
| `/` | Home | Public |
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/ngos` | NgoList | Public |
| `/ngos/:id` | NgoProfile | Public |
| `/ngo-detail` | NgoDetail (static) | Public |
| `/campaigns` | CampaignList | Public |
| `/campaigns/:id` | CampaignDetails | Public |
| `/chatbot` | Chatbot | Public |
| `/discover` | DiscoverNgo | Protected |
| `/map` | NgoMap | Protected |
| `/dashboard` | Dashboard (role router) | Protected |
| `/profile` | UserProfile | Protected |
| `/ngo/profile` | NgoProfileUpdate | Protected |
| `/campaigns/create` | CreateCampaign | Protected |
| `/messages` | Messages | Protected |
| `/volunteer-campaigns` | VolunteerCampaigns | User |
| `/volunteer-opportunities` | VolunteerOpportunities | User |
| `/donate` | Donate | User |
| `/insights` | SmartInsights | User |
| `/recommendations` | Recommendations | User |
| `/admin` | AdminDashboard | Admin |
| `/admin/verifications` | AdminVerifications | Admin |
| `/admin/flagged-content` | FlaggedContent | Admin |
| `/admin/users` | AdminUsers | Admin |
| `/admin/analytics` | AdminAnalytics | Admin |
| `/admin/notifications` | AdminNotifications | Admin |
| `/admin/requests` | AdminRequests | Admin |
| `/admin/categories` | AdminCategories | Admin |

### 5.2 Component Architecture

#### Shared Components (7)

| Component | Purpose |
|-----------|---------|
| **Navbar** | Global navigation bar with role-conditional links, auth state listener, responsive hamburger menu |
| **ProtectedRoute** | Auth guard for any logged-in user |
| **UserRoute** | Auth guard for `role=user` only |
| **AdminRoute** | Auth guard for `role=admin` only |
| **ConfirmModal** | Reusable confirmation dialog with loading state |
| **PreferencesModal** | User preferences form (city, interests) for AI recommendations |
| **RecommendedNgos** | Widget showing top 3 AI-recommended NGOs |

### 5.3 Feature Pages

#### Public Pages
| Page | Description |
|------|-------------|
| **Home** | Landing page with hero CTA, emergency helplines from NGOs, category highlights, feature links |
| **Login** | Email/password login with token persistence |
| **Register** | Dual-mode registration (user vs NGO) with category selection and address details |
| **NgoList** | Public verified NGO listing with search, filter, and flag functionality |
| **NgoProfile** | Detailed NGO profile with tabbed layout (Overview, Programs, People, About, Impact, Contact), financial charts |
| **CampaignList** | Campaign listing with progress bars, search/filter, flag functionality |
| **CampaignDetails** | Full campaign page with donation flow (UPI/Card/NetBanking), volunteer registration |
| **Chatbot** | AI support chatbot with suggested questions and conversation history |

#### User Pages
| Page | Description |
|------|-------------|
| **UserDashboard** | Comprehensive dashboard: help requests, donations, volunteer applications, campaign registrations, certificates, recommendations |
| **Donate** | Standalone donation page: campaign selection, payment processing, receipt viewing, certificates |
| **VolunteerOpportunities** | Browse, apply, withdraw, complete volunteer activities with certificate tracking |
| **VolunteerCampaigns** | Browse campaigns needing volunteers with search/filter |
| **Recommendations** | AI-powered personalized NGO/campaign recommendations with match scores |
| **SmartInsights** | AI insights landing with inline recommendations |
| **UserProfile** | Profile editor with certificate gallery and download |
| **DiscoverNgo** | NGO discovery with search and category/location filters |
| **Messages** | In-platform messaging with conversation threads |
| **NgoMap** | Interactive Leaflet map with NGO markers and routing |

#### NGO Pages
| Page | Description |
|------|-------------|
| **NgoDashboard** | Donation/volunteer/request management, certificate approval queues, messaging |
| **NgoProfileUpdate** | Self-service profile editor with document upload |
| **CreateCampaign** | Campaign creation with AI auto-classification |

#### Admin Pages
| Page | Description |
|------|-------------|
| **AdminDashboard** | KPI cards, campaign/donation/volunteer tables, charts, SSR viewer, auto-refresh |
| **AdminVerifications** | NGO verification queue with approve/reject |
| **FlaggedContent** | Moderation of flagged NGOs, campaigns, and flag requests |
| **AdminUsers** | User deletion and NGO enable/disable management |
| **AdminAnalytics** | Platform analytics with line/bar charts (Recharts) |
| **AdminNotifications** | Notification broadcast with audience targeting |
| **AdminRequests** | All help requests with search/filter |
| **AdminCategories** | CRUD management for NGO categories |

### 5.4 API Client

The centralized API client (`services/api.js`) provides:

- **Base URL**: `REACT_APP_API_URL` environment variable (default: `http://localhost:5001/api`)
- **Request Interceptor**: Attaches JWT from `localStorage` to every request
- **Response Interceptor**: Auto-retries 404s with alternate paths; auto-logout on 401 or "User not found" errors
- **Named Export Functions**: 40+ helper functions for all API domains (volunteering, donations, certificates, messages, categories, requests, admin, AI)

---

## 6. REST API Reference

> **Base URL**: `http://localhost:5001/api`  
> **Auth Header**: `Authorization: Bearer <jwt_token>`  
> **Content-Type**: `application/json` (except file uploads: `multipart/form-data`)

**Total Endpoints: 89**

### 6.1 Authentication (`/api/auth`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `POST` | `/api/auth/register` | Public | Register a new user or NGO account |
| 2 | `POST` | `/api/auth/login` | Public | Login and receive JWT token (7-day expiry) |
| 3 | `GET` | `/api/auth/me` | User | Get current user profile |
| 4 | `PUT` | `/api/auth/me` | User | Update current user profile |

**POST `/api/auth/register`** — Request Body:
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "role": "user | ngo",
  "mobileNumber": "string",
  "registrationId": "string (ngo only)",
  "helplineNumber": "string (ngo only)",
  "categories": ["string (ngo only)"],
  "addressDetails": {
    "houseNumber": "string",
    "landmark": "string",
    "district": "string",
    "state": "string",
    "pincode": "string"
  }
}
```

**POST `/api/auth/login`** — Request/Response:
```json
// Request
{ "email": "string", "password": "string" }

// Response
{ "token": "jwt_string" }
```

### 6.2 Users (`/api/users`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/users/` | Any authenticated | List all users (name, email, role only) |
| 2 | `GET` | `/api/users/preferences` | User | Get user preferences for AI recommendations |
| 3 | `PUT` | `/api/users/preferences` | User | Update user preferences |

**PUT `/api/users/preferences`** — Request Body:
```json
{
  "location": "string",
  "preferredLocations": ["string"],
  "interests": ["string"],
  "causes": ["string"],
  "skills": ["string"],
  "donationRange": "string",
  "causesCareAbout": ["string"],
  "hasDonated": "boolean",
  "hasVolunteered": "boolean"
}
```

### 6.3 NGOs (`/api/ngos`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/ngos/` | Public | List verified & active NGOs (supports `?category`, `?location`, `?q` search) |
| 2 | `GET` | `/api/ngos/me` | NGO | Get own NGO profile |
| 3 | `PUT` | `/api/ngos/me` | NGO | Update own NGO profile |
| 4 | `POST` | `/api/ngos/me/verify` | NGO | Upload verification documents (multipart, up to 5 files) |
| 5 | `GET` | `/api/ngos/:id` | Public | Get a single NGO profile (must be verified & active) |
| 6 | `POST` | `/api/ngos/:id/flag` | Admin | Flag an NGO |
| 7 | `POST` | `/api/ngos/:id/flag-request` | User | Request admin to review/flag an NGO |

### 6.4 Campaigns (`/api/campaigns`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/campaigns/` | Public | List campaigns (supports `?category`, `?location`) |
| 2 | `POST` | `/api/campaigns/` | NGO | Create a new campaign |
| 3 | `GET` | `/api/campaigns/:id` | Public | Get single campaign details |
| 4 | `GET` | `/api/campaigns/my/volunteered` | Any authenticated | Campaigns where current user volunteered |
| 5 | `GET` | `/api/campaigns/my/volunteer-registrations` | User | User's detailed campaign volunteer registrations |
| 6 | `GET` | `/api/campaigns/ngo/volunteers` | NGO | All volunteer registrations across NGO's campaigns |
| 7 | `GET` | `/api/campaigns/:id/volunteer/me` | User | User's volunteer registration for a specific campaign |
| 8 | `POST` | `/api/campaigns/:id/volunteer` | User | Register as campaign volunteer |
| 9 | `POST` | `/api/campaigns/:id/volunteer/decision` | NGO | Approve/reject campaign volunteer |
| 10 | `POST` | `/api/campaigns/:id/flag` | Admin | Flag a campaign |
| 11 | `POST` | `/api/campaigns/:id/flag-request` | User | Request admin to flag a campaign |

**POST `/api/campaigns/:id/volunteer`** — Request Body:
```json
{
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "preferredActivities": ["string"],
  "availability": "string",
  "motivation": "string"
}
```

**POST `/api/campaigns/:id/volunteer/decision`** — Request Body:
```json
{
  "userId": "string",
  "decision": "approve | reject",
  "note": "string (optional)",
  "activityHours": "number (optional, for approve)"
}
```

### 6.5 Donations (`/api/donations`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/donations/my` | Any authenticated | Get current user's donations |
| 2 | `GET` | `/api/donations/:id/receipt` | User | Get donation receipt |
| 3 | `GET` | `/api/donations/ngo/transactions` | NGO | NGO donation transactions with summary |
| 4 | `GET` | `/api/donations/ngo/pending-approvals` | NGO | Pending certificate approval queue |
| 5 | `POST` | `/api/donations/campaign/:id/initiate` | User | Initiate donation payment order |
| 6 | `POST` | `/api/donations/:id/confirm` | User | Confirm payment & finalize donation |
| 7 | `POST` | `/api/donations/:id/certificate/decision` | NGO | Approve/reject donation certificate |
| 8 | `POST` | `/api/donations/campaign/:id` | User | Legacy one-step donation (mock only) |

**POST `/api/donations/campaign/:id/initiate`** — Request Body:
```json
{
  "amount": "number",
  "paymentMethod": "upi | card | netbanking",
  "donorName": "string",
  "donorEmail": "string",
  "donorPhone": "string",
  "message": "string (optional)",
  "paymentDetails": {
    "upiId": "string (for upi)",
    "cardNumber": "string (for card)",
    "cardHolderName": "string (for card)",
    "expiry": "string (for card)",
    "cvv": "string (for card)",
    "netbankingBank": "string (for netbanking)"
  }
}
```

**POST `/api/donations/:id/confirm`** — Request Body:
```json
{
  "orderId": "string",
  "paymentId": "string",
  "signature": "string"
}
```

### 6.6 Volunteering (`/api/volunteering`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/volunteering/` | Public | List volunteer opportunities (supports `?location`, `?skills`) |
| 2 | `POST` | `/api/volunteering/` | NGO | Create volunteer opportunity |
| 3 | `GET` | `/api/volunteering/my` | Any authenticated | Opportunities where user has applied |
| 4 | `GET` | `/api/volunteering/my/applications` | User | User's detailed volunteer applications |
| 5 | `GET` | `/api/volunteering/ngo/:id` | Public | Opportunities posted by a specific NGO |
| 6 | `GET` | `/api/volunteering/ngo/requests` | NGO | NGO's volunteer requests with summary |
| 7 | `GET` | `/api/volunteering/approvals/ngo/pending` | NGO | Pending certificate approval queue |
| 8 | `POST` | `/api/volunteering/:id/apply` | User | Apply to a volunteer opportunity |
| 9 | `DELETE` | `/api/volunteering/:id/withdraw` | User | Withdraw volunteer application |
| 10 | `POST` | `/api/volunteering/:id/complete` | User | Mark activity complete & request certificate |
| 11 | `POST` | `/api/volunteering/applications/:appId/certificate/decision` | NGO | Approve/reject volunteer certificate |
| 12 | `DELETE` | `/api/volunteering/:id` | NGO | Delete volunteer opportunity |

### 6.7 Certificates (`/api/certificates`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/certificates/my` | User | List user's certificates |
| 2 | `GET` | `/api/certificates/:id` | User | Get certificate details + HTML |
| 3 | `GET` | `/api/certificates/:id/download` | User | Download certificate as HTML attachment |

### 6.8 Messages (`/api/messages`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `POST` | `/api/messages/to-ngo/:ngoId` | User | Send message to an NGO |
| 2 | `POST` | `/api/messages/to-all-ngos` | User | Broadcast message to all active NGOs |
| 3 | `POST` | `/api/messages/to-user/:userId` | NGO | NGO replies to a user |
| 4 | `GET` | `/api/messages/conversations` | User/NGO | Conversation list with unread counts |
| 5 | `GET` | `/api/messages/thread/:counterpartId` | User/NGO | Full message thread (marks as read) |
| 6 | `POST` | `/api/messages/thread/:counterpartId/read` | User/NGO | Mark thread as read |
| 7 | `GET` | `/api/messages/ngo` | NGO | Legacy NGO inbox |

### 6.9 Notifications (`/api/notifications`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/notifications/` | Any authenticated | Notifications for current user (filtered by role/audience) |

### 6.10 Categories (`/api/categories`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/categories/` | Public | Categories with registered verified NGOs |
| 2 | `GET` | `/api/categories/all` | Public | All predefined categories |
| 3 | `POST` | `/api/categories/` | Admin | Create a category |
| 4 | `PUT` | `/api/categories/:id` | Admin | Update a category |
| 5 | `DELETE` | `/api/categories/:id` | Admin | Delete a category |

### 6.11 Help Requests (`/api/requests`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `POST` | `/api/requests/` | User | Create help request to an NGO |
| 2 | `GET` | `/api/requests/my` | User | User's help requests |
| 3 | `GET` | `/api/requests/ngo` | NGO | NGO's incoming help requests |
| 4 | `PUT` | `/api/requests/:id/status` | NGO | Update help request status |

**POST `/api/requests/`** — Request Body:
```json
{
  "ngoId": "string",
  "name": "string",
  "age": "number",
  "location": "string",
  "helpType": "string",
  "description": "string"
}
```

**PUT `/api/requests/:id/status`** — Allowed status values:
`Pending`, `Approved`, `In Progress`, `Completed`, `Rejected`

### 6.12 Admin (`/api/admin`)

All endpoints require `admin` role.

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `GET` | `/api/admin/ngo-registrations` | List unverified NGOs |
| 2 | `POST` | `/api/admin/verify-ngo/:id` | Verify an NGO |
| 3 | `POST` | `/api/admin/reject-ngo/:id` | Reject & delete an NGO |
| 4 | `DELETE` | `/api/admin/user/:id` | Delete a user |
| 5 | `GET` | `/api/admin/ngos` | List all NGOs |
| 6 | `PUT` | `/api/admin/ngos/:id/active` | Enable/disable an NGO |
| 7 | `GET` | `/api/admin/flagged-ngos` | List flagged NGOs |
| 8 | `GET` | `/api/admin/flagged-campaigns` | List flagged campaigns |
| 9 | `PUT` | `/api/admin/resolve-flag/:type/:id` | Resolve flag on NGO or campaign |
| 10 | `GET` | `/api/admin/flag-requests` | List flag requests (supports `?status`, `?type` filters) |
| 11 | `PUT` | `/api/admin/flag-requests/:id/approve` | Approve flag request |
| 12 | `PUT` | `/api/admin/flag-requests/:id/reject` | Reject flag request |
| 13 | `GET` | `/api/admin/notifications` | List all notifications |
| 14 | `POST` | `/api/admin/notifications` | Create/broadcast notification |
| 15 | `GET` | `/api/admin/requests` | List all help requests |
| 16 | `GET` | `/api/admin/dashboard` | Dashboard snapshot (JSON) — KPI stats, donation/volunteer series, tables |
| 17 | `GET` | `/api/admin/dashboard/ssr` | Dashboard snapshot (SSR HTML) — same data rendered as full HTML page |
| 18 | `GET` | `/api/admin/analytics` | Platform analytics — totals, users by month/role, donations by month, top volunteers |

### 6.13 AI & Recommendations (`/api/ai`)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | `POST` | `/api/ai/recommend-ngos` | Public | Rule-based NGO recommendations based on location & interests |
| 2 | `GET` | `/api/ai/recommendations` | Any authenticated | Personalized NGO + Campaign recommendations with scores |
| 3 | `POST` | `/api/ai/classify-campaign` | Public | Keyword-based campaign category classification |
| 4 | `POST` | `/api/ai/chat` | Public | LLM-powered chatbot with RAG and fallback |
| 5 | `POST` | `/api/ai/fraud-score` | Public | Heuristic NGO fraud risk scoring |
| 6 | `POST` | `/api/ai/match-volunteers` | Public | Score and rank volunteer-campaign matches |

**POST `/api/ai/chat`** — Request Body:
```json
{
  "message": "string",
  "history": [{ "role": "user|model", "content": "string" }],
  "clientContext": { "role": "string" }
}
```

**GET `/api/ai/recommendations`** — Response:
```json
{
  "ngos": [
    {
      "_id": "string",
      "name": "string",
      "score": "number (0-100)",
      "reasons": ["Location match", "Sector overlap"]
    }
  ],
  "campaigns": [
    {
      "_id": "string",
      "title": "string",
      "score": "number (0-100)",
      "reasons": ["Category match", "Location proximity"]
    }
  ]
}
```

---

## 7. Key Workflows

### 7.1 Donation Flow

```
User                    Backend                     Payment Gateway
 │                        │                              │
 ├─ POST /donations/campaign/:id/initiate ──────────────►│
 │  (amount, payment method, donor info)                  │
 │                        │◄──── createPaymentOrder ─────┤
 │◄─── gatewayOrder ──────┤                              │
 │                        │                              │
 ├─ POST /donations/:id/confirm ────────────────────────►│
 │  (orderId, paymentId, signature)                      │
 │                        │◄──── verifyPayment ──────────┤
 │                        │                              │
 │                        ├── Update donation → completed
 │                        ├── Update campaign currentAmount
 │                        ├── Set certificateApprovalStatus → pending
 │◄─── receipt payload ───┤
 │                        │
 │  (Later) NGO reviews   │
 │  POST /donations/:id/certificate/decision ──► Issue Certificate
```

### 7.2 Volunteer Flow

```
User                           Backend                        NGO
 │                               │                              │
 │── POST /volunteering/:id/apply ►│                            │
 │   (fullName, email, phone...)   │── Create Application       │
 │◄──── application confirmation ──┤                            │
 │                                 │                            │
 │── POST /volunteering/:id/complete ►│                         │
 │   (activityHours)               │── Status → completed       │
 │                                 │── CertApproval → pending   │
 │                                 │                            │
 │                                 │◄─ POST /.../:appId/certificate/decision
 │                                 │   (approve + note)         │
 │                                 │── Issue Certificate ──────►│
 │◄──── Certificate available ─────┤                            │
```

### 7.3 Help Request Flow

```
User                          Backend                      NGO
 │                              │                            │
 ├── POST /requests/ ──────────►│                            │
 │   (ngoId, name, helpType)    │── Create HelpRequest       │
 │                              │   status: Pending          │
 │                              │                            │
 │                              │◄── GET /requests/ngo ──────┤
 │                              │                            │
 │                              │◄── PUT /requests/:id/status┤
 │                              │    (Approved/In Progress/  │
 │                              │     Completed/Rejected)    │
 │◄── Status visible ──────────┤                            │
```

### 7.4 NGO Verification & Moderation Flow

```
NGO                     Backend                      Admin
 │                        │                            │
 ├── POST /auth/register ►│  (role=ngo)                │
 │   verified=false        │                            │
 │                         │                            │
 ├── POST /ngos/me/verify ►│  (upload docs)            │
 │                         │                            │
 │                         │◄── GET /admin/ngo-registrations
 │                         │    (unverified NGOs list)   │
 │                         │                            │
 │                         │◄── POST /admin/verify-ngo/:id
 │   verified=true ◄───────┤    OR                      │
 │                         │◄── POST /admin/reject-ngo/:id
 │   (deleted) ◄───────────┤                            │

--- Flagging Flow ---
User ── POST /ngos/:id/flag-request ──► Backend ──► Notification
                                                         │
                                          Admin ◄────────┘
                                           │
                     PUT /admin/flag-requests/:id/approve ──► Flag target
                     PUT /admin/flag-requests/:id/reject  ──► Dismiss
```

### 7.5 Messaging Flow

```
User                       Backend                        NGO
 │                           │                              │
 ├── POST /messages/to-ngo/:ngoId ►│                        │
 │   (body)                  │── Create Message             │
 │                           │                              │
 │                           │◄── GET /messages/conversations─┤
 │                           │    (with unread counts)       │
 │                           │                              │
 │                           │◄── GET /messages/thread/:userId─┤
 │                           │    (marks as read)            │
 │                           │                              │
 │                           │◄── POST /messages/to-user/:userId
 │◄── New message ───────────┤    (NGO reply)               │
```

---

## 8. Database Schema Reference

### Table Details

#### `users_rel`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY |
| `external_id` | TEXT | NOT NULL, UNIQUE |
| `name` | TEXT | NOT NULL, DEFAULT '' |
| `email` | TEXT | NOT NULL, DEFAULT '' |
| `password` | TEXT | NOT NULL, DEFAULT '' |
| `mobile_number` | TEXT | |
| `location` | TEXT | |
| `availability` | TEXT | |
| `role` | TEXT | CHECK (user/ngo/admin) |
| `interests` | TEXT[] | DEFAULT '{}' |
| `skills` | TEXT[] | DEFAULT '{}' |
| `preferences` | JSONB | DEFAULT '{}' |
| `source_doc` | JSONB | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

#### `ngos_rel`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY |
| `external_id` | TEXT | UNIQUE |
| `name`, `email`, `password`, `role` | TEXT | |
| `category`, `description`, `about` | TEXT | |
| `registration_id`, `helpline_number` | TEXT | |
| `address`, `flag_reason` | TEXT | |
| `categories`, `geographies`, `offices` | TEXT[] | |
| `primary_sectors`, `secondary_sectors` | TEXT[] | |
| `verified`, `flagged`, `is_active` | BOOLEAN | |
| `location_lat`, `location_lng` | DOUBLE PRECISION | |
| `socials`, `registration`, `address_details`, `financials` | JSONB | |
| `programs`, `testimonials`, `leadership` | JSONB | |
| `source_doc` | JSONB | NOT NULL |

#### `campaigns_rel`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY |
| `external_id` | TEXT | UNIQUE |
| `ngo_id` | BIGINT | FK → ngos_rel |
| `title`, `description`, `category`, `location` | TEXT | |
| `goal_amount`, `current_amount` | NUMERIC(14,2) | |
| `coordinates_lat`, `coordinates_lng` | DOUBLE PRECISION | |
| `timeline_start_date`, `timeline_end_date` | TIMESTAMPTZ | |
| `flagged` | BOOLEAN | |
| `source_doc` | JSONB | NOT NULL |

#### `donations_rel`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY |
| `external_id` | TEXT | UNIQUE |
| `user_id` | BIGINT | FK → users_rel |
| `ngo_id` | BIGINT | FK → ngos_rel |
| `campaign_id` | BIGINT | FK → campaigns_rel |
| `amount` | NUMERIC(14,2) | |
| `currency`, `payment_method`, `status` | TEXT | |
| `receipt_number` | TEXT | UNIQUE (partial) |
| `certificate_approval_status` | TEXT | DEFAULT 'not_requested' |
| `certificate_id` | BIGINT | FK → certificates_rel (deferred) |
| `source_doc` | JSONB | NOT NULL |

#### `certificates_rel`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY |
| `external_id` | TEXT | UNIQUE |
| `user_id` | BIGINT | FK → users_rel |
| `ngo_id` | BIGINT | FK → ngos_rel |
| `campaign_id` | BIGINT | FK → campaigns_rel |
| `donation_id` | BIGINT | FK → donations_rel |
| `volunteer_application_id` | BIGINT | FK → volunteer_applications_rel |
| `certificate_type`, `title`, `certificate_number` | TEXT | |
| `status` | TEXT | |
| `issued_at`, `delivered_at` | TIMESTAMPTZ | |
| `metadata` | JSONB | |
| `source_doc` | JSONB | NOT NULL |

#### `volunteer_opportunities_rel`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY |
| `external_id` | TEXT | UNIQUE |
| `ngo_id` | BIGINT | FK → ngos_rel |
| `title`, `description`, `location`, `commitment` | TEXT | |
| `skills` | TEXT[] | |
| `spots` | INTEGER | DEFAULT 10 |
| `source_doc` | JSONB | NOT NULL |

#### `volunteer_applications_rel`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY |
| `external_id` | TEXT | UNIQUE |
| `user_id` | BIGINT | FK → users_rel |
| `ngo_id` | BIGINT | FK → ngos_rel |
| `opportunity_id` | BIGINT | FK → volunteer_opportunities_rel |
| `status` | TEXT | DEFAULT 'applied' |
| `certificate_approval_status` | TEXT | DEFAULT 'not_requested' |
| `activity_hours` | NUMERIC(8,2) | DEFAULT 0 |
| `certificate_id` | BIGINT | FK → certificates_rel (deferred) |
| `source_doc` | JSONB | NOT NULL |

#### Other Tables
| Table | Key Purpose |
|-------|-------------|
| `messages_rel` | User↔NGO messaging with read tracking |
| `notifications_rel` | Platform notifications with audience targeting |
| `help_requests_rel` | User support requests to NGOs with status workflow |
| `flag_requests_rel` | Content moderation flag requests |
| `ai_logs_rel` | AI operation audit trail |

#### Junction Tables
| Table | Columns | Purpose |
|-------|---------|---------|
| `ngo_categories_rel` | `ngo_id`, `category_name` | NGO ↔ Category mapping |
| `campaign_volunteers_rel` | `campaign_id`, `user_id` | Campaign ↔ Volunteer mapping |
| `campaign_volunteer_registrations_rel` | `campaign_id`, `user_id`, + details | Campaign volunteer sign-ups |
| `opportunity_applicants_rel` | `opportunity_id`, `user_id` | Opportunity ↔ Applicant mapping |

---

## 9. Deployment & Configuration

### Environment Variables

#### Backend (`backend/.env`)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5001` | Server listen port |
| `POSTGRES_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | `'secret'` | JWT signing secret |
| `GEMINI_API_KEY` | No | — | Google Gemini API key for AI chatbot |
| `PAYMENT_GATEWAY_PROVIDER` | No | `mock` | Payment provider (`mock` / `razorpay`) |
| `RAZORPAY_KEY_ID` | No | — | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | No | — | Razorpay API key secret |

#### Frontend (`frontend/.env`)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REACT_APP_API_URL` | No | `http://localhost:5001/api` | Backend API base URL |

### Setup Commands

```bash
# Backend
cd backend
npm install
npm run db:relational-schema    # Create PostgreSQL schema
npm run seed                     # Seed sample data
npm run dev                      # Start with nodemon (dev)
npm start                        # Start production

# Frontend
cd frontend
npm install
npm start                        # Start React dev server (port 3000)
npm run build                    # Production build
```

### Prerequisites
- Node.js LTS
- PostgreSQL 14+
- npm

---

## 10. Seed Data & Testing

### Default Seed Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@ngoconnect.org` | `password123` |
| User | `rahul@example.com` | `password123` |
| NGO | `akshayapatra@ngo.org` | `password123` |

### Smoke Test
```bash
cd backend
npm run smoke
```

The smoke test exercises end-to-end flows: user/NGO/admin login, donations, volunteering, certificates, support requests, messaging, moderation, and admin dashboard snapshot.

### Configurable Smoke Test Variables
- `API_BASE` (default: `http://localhost:5001/api`)
- `SMOKE_USER_EMAIL`, `SMOKE_NGO_EMAIL`, `SMOKE_ADMIN_EMAIL`

---

*Document generated from source code analysis of the NGO-Connect codebase.*
