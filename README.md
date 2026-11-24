# NOVACORE

NOVACORE is a React/Vite frontend with an Express, MongoDB, and Socket.IO
backend. Live Rooms and WebRTC peer-to-peer audio transfer are part of the
existing application.

## Local setup

1. Install Node.js 22.12 or later (recommended), or Node.js 20.19 or later.
2. In `backend`, run `npm install`, copy `.env.example` to `.env`, and set
   `MONGO_URI` and a private `JWT_SECRET`. Keep the local values
   `PORT=5000` and `CORS_ORIGINS=http://localhost:5173`.
3. In `frontend`, run `npm install`. The defaults in `src/services/api.js` and
   `src/pages/LiveRooms.jsx` point to the local backend; optionally copy
   `.env.example` to `.env.local` to set those same values explicitly.
4. Start the backend with `npm start` from `backend`, and start the frontend
   with `npm run dev` from `frontend`.

## Deploy MongoDB Atlas

1. Create an Atlas cluster and a database user with `readWrite` access to the
   `novacore` database.
2. In **Network Access**, allow the Render service's outbound IP addresses if
   they are available for your Render plan. If Render does not provide stable
   outbound IPs, Atlas may require `0.0.0.0/0`; this permits connections from
   any IP, so use a strong database password and the narrowly scoped database
   user above.
3. In Atlas, choose **Connect → Drivers**, copy the Node.js connection string,
   and replace its username, password, and database name as needed. URL-encode
   special characters in the username or password. The URI should select the
   `novacore` database, for example:

   ```text
   mongodb+srv://<database-user>:<url-encoded-password>@<cluster-host>/novacore?retryWrites=true&w=majority
   ```

   Keep this URI private. Atlas connections use TLS by default.

## Deploy the backend to Render

1. Create a **Web Service** from the GitHub repository.
2. Set **Root Directory** to `backend`, **Build Command** to `npm install`,
   and **Start Command** to `npm start`. Use Node.js 22.12 or later.
3. Set the health check path to `/api/health`.
4. Add these environment variables in the Render dashboard:

   | Name | Value |
   | --- | --- |
   | `MONGO_URI` | The private Atlas connection string for the `novacore` database |
   | `JWT_SECRET` | A private random secret (at least 32 random bytes); generate locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `CORS_ORIGINS` | Your Vercel site origin, e.g. `https://<your-project>.vercel.app` |
   | `NODE_ENV` | `production` |

   For multiple site origins, use a comma-separated list with no spaces or
   trailing slashes, for example
   `https://novacore.vercel.app,https://app.example.com`. Add Vercel preview
   origins only if those deployments need API access.

   Do **not** set `PORT` in Render: the application listens on Render's
   assigned `PORT` automatically. The `5000` default is for local development.
   The backend reads `CORS_ORIGINS` for both Express HTTP requests and
   Socket.IO handshakes.

## Deploy the frontend to Vercel

1. Import the same GitHub repository as a Vercel project.
2. Set **Root Directory** to `frontend`, **Framework Preset** to **Vite**,
   **Build Command** to `npm run build`, and **Output Directory** to `dist`.
   Select Node.js 22.x (22.12 or later). The package manager install command
   can remain Vercel's default (`npm install`). `frontend/vercel.json`
   rewrites client-side routes to
   `index.html` for React Router.
3. Set these environment variables for the deployments that should use the
   backend (Production and, if needed, Preview):

   | Name | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://<your-render-service>.onrender.com/api` |
   | `VITE_SOCKET_URL` | `https://<your-render-service>.onrender.com` |

   Use the actual Render service hostname and HTTPS. `VITE_API_URL` includes
   `/api`; `VITE_SOCKET_URL` does not. After changing Vercel environment
   variables, redeploy so Vite includes the new values in the frontend build.
   Add each frontend origin that needs access to the comma-separated
   `CORS_ORIGINS` value in Render.

Vercel serves the app over HTTPS; the configured HTTPS Socket.IO URL uses a
secure WebSocket connection, and HTTPS provides the secure context required
by browser WebRTC APIs. The current peer connection uses a public STUN server
but has no TURN relay. Direct peer-to-peer transfers can therefore fail on
some restrictive networks.

## Audio storage limitation

Audio uploads are written to `backend/uploads`; MongoDB stores their metadata
and filesystem paths, not the audio bytes. Render's default filesystem is
ephemeral: files can disappear on deploys, restarts, or instance replacement,
while their MongoDB records remain. Streaming then returns “Audio file not
found,” and peers cannot fetch the missing source file. Do not treat this
filesystem as durable production storage. A Render persistent disk can retain
files for a single service instance, subject to the plan's disk support and
scaling constraints. For durable, scalable storage, the application would
need to be adapted to use object storage; no storage provider is configured
by this deployment setup.

## Verification

From `frontend`, run `npm run build`. From `backend`, run
`node --check server.js` (or run `node --check` on the backend JavaScript
files). Do not commit `.env` files or deployment secrets.
