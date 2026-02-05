# NGO-Connect

NGO-Connect is a full-stack AI-enabled platform designed to bridge the gap between NGOs, donors, and volunteers. It provides a comprehensive suite of tools for NGOs to showcase their work, manage campaigns, and engage with their supporters. For users, it offers a centralized platform to discover, donate to, and volunteer for causes they care about. The platform is enhanced with AI features to provide a smarter, more intuitive experience.

## Features

- **Rich NGO Profiles:** NGOs can create detailed profiles with their mission, programs, leadership, financial transparency, and impact metrics.
- **Campaign Management:** NGOs can create and manage fundraising and volunteering campaigns.
- **Donations & Volunteering:** Users can easily donate to campaigns or sign up as volunteers.
- **AI Chatbot:** A smart assistant powered by Google's Gemini 2.5 Flash model to help users navigate the platform and find information.
- **Personalized Dashboards:** Separate dashboards for users, NGOs, and admins to manage their activities.
- **Admin Tools:** A dedicated admin dashboard for verifying NGOs, managing users, and overseeing platform activity.
- **Messaging:** Direct messaging functionality for communication between users and NGOs.
- **Search & Discovery:** Advanced search and filtering options to discover NGOs and campaigns.
- **Impact Tracking:** Interactive graphs to visualize financial data and impact metrics.
- **Profile Management:** Users and NGOs can easily update their profiles and manage their information.
- **AI-Powered Recommendations:** The platform uses AI to recommend NGOs and campaigns to users based on their interests and location.
- **Fraud Detection:** An AI-powered feature to score and flag potentially fraudulent NGOs or campaigns.
- **Volunteer Matching:** An AI-driven tool to match volunteers with suitable campaigns based on their skills and availability.

## Tech Stack

### Frontend
- **React 18:** For building the user interface.
- **React Router v6:** For client-side routing.
- **Axios:** For making API requests.
- **Tailwind CSS:** For styling the application.
- **Heroicons:** For icons.
- **Recharts:** For creating interactive charts.

### Backend
- **Node.js & Express.js:** For the server-side application.
- **MongoDB & Mongoose:** As the database and ODM.
- **JWT (JSON Web Tokens):** For authentication.
- **Bcryptjs:** For password hashing.
- **Multer:** For handling file uploads.
- **CORS:** For enabling Cross-Origin Resource Sharing.
- **Dotenv:** For managing environment variables.
- **@google/generative-ai:** For integrating with Google's Generative AI models.

### AI/Smart Features
- **Google Gemini 2.5 Flash:** Powers the AI chatbot.
- **Rule-based AI Endpoints:** For recommendations, classification, fraud scoring, and volunteer matching.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- **Node.js and npm:** Make sure you have Node.js and npm installed. You can download them from [nodejs.org](https://nodejs.org/).
- **MongoDB:** You need a running instance of MongoDB. You can use a local installation or a cloud service like MongoDB Atlas.

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/Ngo-Connect.git
    cd Ngo-Connect
    ```

2.  **Install backend dependencies:**
    ```bash
    cd backend
    npm install
    ```

3.  **Install frontend dependencies:**
    ```bash
    cd ../frontend
    npm install
    ```

4.  **Set up environment variables:**

    *   In the `backend` directory, create a `.env` file and add the following variables. Replace the placeholder values with your actual data.

        ```env
        PORT=5001
        MONGO_URI=<your_mongodb_uri>
        JWT_SECRET=<your_jwt_secret>
        GEMINI_API_KEY=<your_gemini_api_key>
        ```

    *   In the `frontend` directory, create a `.env` file and add the following variable:
        ```env
        REACT_APP_API_URL=http://localhost:5001/api
        ```

### Database Seeding

To populate the database with sample data, run the following command in the `backend` directory:

```bash
node seed.js
```

This will create a set of users, NGOs, and campaigns, including an admin user.

### Running the Application

1.  **Start the backend server:**
    ```bash
    cd backend
    npm start
    ```
    The backend server will start on `http://localhost:5001`.

2.  **Start the frontend development server:**
    ```bash
    cd frontend
    npm start
    ```
    The frontend application will be available at `http://localhost:3000`.

### Test Credentials

After seeding the database, you can use the following credentials to test the application:

-   **Admin:** `admin@ngoconnect.org` / `password123`
-   **User:** `rahul@example.com` / `password123`
-   **NGO:** `eduforall@ngo.org` / `password123`

## API Endpoints

The backend provides a RESTful API with the following main endpoints:

-   `/api/auth`: Authentication (register, login)
-   `/api/users`: User management
-   `/api/ngos`: NGO profiles and management
-   `/api/campaigns`: Campaign management
-   `/api/donations`: Donation handling
-   `/api/messages`: Messaging functionality
-   `/api/admin`: Admin-specific actions
-   `/api/ai`: AI-powered features (chatbot, recommendations, etc.)

For detailed information about each endpoint, please refer to the route files in the `backend/src/routes` directory.

## Project Structure

The project is organized into two main directories: `frontend` and `backend`.

### `backend`
```
backend/
├── src/
│   ├── config/       # Database configuration
│   ├── middleware/   # Express middleware (e.g., auth)
│   ├── models/       # Mongoose models
│   ├── routes/       # API routes
│   └── server.js     # Express server entry point
├── .env.example    # Example environment variables
├── package.json
└── seed.js         # Database seeding script
```

### `frontend`
```
frontend/
├── public/         # Public assets
├── src/
│   ├── components/   # Reusable React components
│   ├── pages/        # Page components
│   ├── services/     # API service functions
│   ├── App.js        # Main application component
│   └── index.js      # React entry point
├── .env.example    # Example environment variables
└── package.json
```
## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request.
