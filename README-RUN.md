Running the HealthShare Frontend (local demo)

1. Install dependencies:
   npm install

2. Start dev server:
   npm run dev

3. Visit:
   http://localhost:5173

By default the frontend runs with an in-memory mock backend (VITE_MOCK_API=true) so you don't need the full backend stack to try the website.

To connect to your real backend:
- Set VITE_MOCK_API=false and VITE_API_BASE=http://localhost:4000 in a .env file (see .env.example).
- Restart the dev server.
