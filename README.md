# NGO-Connect

NGO-Connect is a full-stack web application designed to connect NGOs with donors and volunteers. It provides a platform for NGOs to create profiles, showcase their campaigns, and receive donations. Users can browse through different NGOs, learn about their work, and contribute to their causes.

## Features

*   **User Authentication:** Secure user registration and login system.
*   **NGO Profiles:** NGOs can create and manage their profiles, including their mission, vision, and contact information.
*   **Campaign Management:** NGOs can create and manage fundraising campaigns with details like goals, progress, and duration.
*   **Donation System:** Users can easily donate to their favorite campaigns.
*   **Messaging:** A real-time messaging system for communication between users and NGOs.
*   **Admin Dashboard:** An admin dashboard to manage users, NGOs, and campaigns.
*   **AI Chatbot:** An AI-powered chatbot to assist users with their queries.
*   **Search and Filter:** Users can search for NGOs and campaigns based on various criteria.

## Tech Stack

**Frontend:**

*   React.js
*   React Router
*   Axios
*   Tailwind CSS
*   Heroicons

**Backend:**

*   Express.js
*   MongoDB
*   Mongoose
*   JWT (for authentication)
*   Bcryptjs (for password hashing)
*   Multer (for file uploads)
*   Cors
*   Dotenv

## Installation

To get started with NGO-Connect, follow these steps:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/Ngo-Connect.git
    ```

2.  **Navigate to the project directory:**

    ```bash
    cd Ngo-Connect
    ```

3.  **Install backend dependencies:**

    ```bash
    cd backend
    npm install
    ```

4.  **Install frontend dependencies:**

    ```bash
    cd ../frontend
    npm install
    ```

5.  **Set up environment variables:**

    *   In the `backend` directory, create a `.env` file and add the following variables:

        ```
        PORT=5000
        MONGO_URI=<your_mongodb_uri>
        JWT_SECRET=<your_jwt_secret>
        ```

    *   In the `frontend` directory, create a `.env` file and add the following variable:
        ```
        REACT_APP_API_URL=http://localhost:5000/api
        ```

6.  **Run the application:**

    *   **Start the backend server:**

        ```bash
        cd backend
        npm start
        ```

    *   **Start the frontend development server:**
        ```bash
        cd frontend
        npm start
        ```
The application will be available at `http://localhost:3000`.

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request.
               