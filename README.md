# HealthShare Frontend (Demo Website)

This is a self-contained frontend demo for the HealthShare project. It implements a React + Vite single-page app that demonstrates client-side AES-GCM encryption of files before upload and a lightweight mock backend for local testing. The mock backend is enabled by default via Vite env `VITE_MOCK_API`.

Features:
- Client-side AES-GCM encryption (Web Crypto) before upload
- In-browser mock API server for quick demos (no backend required)
- Upload page with recipients and encryption metadata
- Library page listing uploaded/shared files
- Viewer page to download and decrypt files with a provided symmetric key
- Simple Auth (login/register) backed by mock storage

Requirements:
- Node.js 18+ and npm
- Optional: Web3.Storage token if you want to enable direct client uploads

Quickstart (frontend-only demo):

1. Install dependencies
   cd frontend
   npm install

2. Start the dev server
   npm run dev

3. Open http://localhost:5173 in your browser

Environment variables:
- VITE_MOCK_API (default: true) - when true, frontend uses an in-memory mock backend
- VITE_API_BASE - when using a real backend, set this to the backend base URL (e.g., http://localhost:4000)
- VITE_WEB3_STORAGE_TOKEN - optional, if you want to upload directly from client to Web3.Storage

Notes:
- This frontend is intended as a demo and developer convenience. In production, use a secure backend and proper key exchange mechanisms.
- When you upload a file, the app will display a base64 symmetric key; preserve it for decryption.
