# NOVACORE Audio Asset Management

## Run locally

Start the backend from `backend` with `npm run dev` (port 5000 by default),
then start this frontend with `npm run dev` (port 5173). The backend requires
its normal MongoDB and JWT environment configuration.

Optional frontend overrides are `VITE_API_URL` (defaults to
`http://localhost:5000/api`) and `VITE_SOCKET_URL` (defaults to
`http://localhost:5000`).

## Live Rooms and P2P audio

Live Rooms uses the authenticated Socket.IO connection for room membership,
playback synchronization, and room-scoped WebRTC signaling. Socket.IO relays
SDP and ICE signaling only; audio itself is transferred between browsers over
WebRTC Data Channels in 64 KiB chunks with buffer backpressure.

Received files are reconstructed and SHA-256 checked against their registered
asset fingerprint before playback. Transfers are limited to the existing
50 MB upload limit. If a peer is unavailable or a transfer fails, the
authenticated audio stream endpoint is used as a fallback and checked too.
The P2P Network panel shows peer connection states, actual transferred bytes,
delivery source, progress, and integrity results.

To try P2P, sign in from two browser sessions, create a Live Room in one, join
its code in the other, and select an audio asset. The first browser may obtain
the asset from the server; a connected listener requests it from that peer.
Leaving a room closes its peer connections. A STUN server is used for ICE
discovery; no TURN relay is configured, so restrictive networks may use the
centralized fallback instead.
