
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Asset = require("../models/Asset");

const rooms = new Map();

function initializeRooms(io) {

    // Authenticate socket connections

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error("Authentication required"));
            }

            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET,
                { algorithms: ["HS256"] }
            );

            const user = await User.findById(decoded.id);

            if (!user) {
                return next(new Error("User not found"));
            }

            socket.user = {
                id: user._id.toString(),
                name: user.name
            };

            next();

        } catch {
            next(new Error("Invalid or expired token"));
        }
    });

    function generateRoomCode() {
        let code;

        do {
            code = crypto.randomBytes(3)
                .toString("hex")
                .toUpperCase();
        } while (rooms.has(code));

        return code;
    }

    function currentPosition(room) {
        if (!room.playing) {
            return room.position;
        }

        return room.position +
            (Date.now() - room.updatedAt) / 1000;
    }

    function getRoomState(room) {
        return {
            code: room.code,
            hostId: room.hostId,
            participants: Array.from(
                room.participants.values()
            ),
            assetId: room.assetId,
            assetTitle: room.assetTitle,
            playing: room.playing,
            position: currentPosition(room),
            serverTime: Date.now()
        };
    }

    function broadcastRoom(room) {
        io.to(room.code).emit(
            "room-state",
            getRoomState(room)
        );
    }

    function leaveRoom(socket) {
        const code = socket.data.roomCode;

        if (!code) return;

        const room = rooms.get(code);

        socket.leave(code);
        socket.data.roomCode = null;

        if (!room) return;

        room.participants.delete(socket.id);
        socket.to(code).emit("p2p-peer-left", {
            socketId: socket.id
        });

        if (room.participants.size === 0) {
            rooms.delete(code);
            return;
        }

        // Transfer host control if the host leaves

        if (room.hostId === socket.id) {
            room.hostId =
                room.participants.keys().next().value;
        }

        broadcastRoom(room);
    }

    io.on("connection", (socket) => {

        console.log(
            "Live Rooms connected:",
            socket.user.name
        );

        socket.on("clock-sync", (callback) => {
            if (typeof callback === "function") {
                callback(Date.now());
            }
        });

        socket.on("p2p-signal", (data, callback) => {
            const room = rooms.get(socket.data.roomCode);
            const targetSocketId = data?.targetSocketId;
            const signal = data?.signal;
            const respond = (success, message) => {
                if (typeof callback === "function") {
                    callback({ success, message });
                }
            };

            if (
                !room ||
                !room.participants.has(socket.id) ||
                typeof targetSocketId !== "string" ||
                targetSocketId === socket.id ||
                !room.participants.has(targetSocketId)
            ) {
                return respond(false, "Peer is not in your room.");
            }

            const now = Date.now();
            const rate = socket.data.signalRate || {
                startedAt: now,
                count: 0
            };

            if (now - rate.startedAt >= 10000) {
                rate.startedAt = now;
                rate.count = 0;
            }

            rate.count++;
            socket.data.signalRate = rate;

            if (rate.count > 100) {
                return respond(false, "Signaling rate limit exceeded.");
            }

            const validDescription =
                signal &&
                ["offer", "answer"].includes(signal.type) &&
                typeof signal.sdp === "string" &&
                signal.sdp.length > 0 &&
                signal.sdp.length <= 65536;

            const validCandidate =
                signal &&
                signal.type === "candidate" &&
                signal.candidate &&
                typeof signal.candidate.candidate === "string" &&
                signal.candidate.candidate.length <= 2048 &&
                (
                    signal.candidate.sdpMid == null ||
                    (
                        typeof signal.candidate.sdpMid === "string" &&
                        signal.candidate.sdpMid.length <= 64
                    )
                ) &&
                (
                    signal.candidate.sdpMLineIndex == null ||
                    Number.isInteger(signal.candidate.sdpMLineIndex)
                );

            if (!validDescription && !validCandidate) {
                return respond(false, "Invalid WebRTC signal.");
            }

            io.to(targetSocketId).emit("p2p-signal", {
                roomCode: room.code,
                fromSocketId: socket.id,
                fromName: socket.user.name,
                signal
            });

            respond(true);
        });

        // Create a new room

        socket.on("create-room", (callback) => {

            if (typeof callback !== "function") return;

            leaveRoom(socket);

            const code = generateRoomCode();

            const room = {
                code,
                hostId: socket.id,
                participants: new Map(),
                assetId: null,
                assetTitle: "",
                playing: false,
                position: 0,
                updatedAt: Date.now()
            };

            room.participants.set(socket.id, {
                socketId: socket.id,
                name: socket.user.name
            });

            rooms.set(code, room);

            socket.join(code);
            socket.data.roomCode = code;

            callback({
                success: true,
                room: getRoomState(room)
            });

            broadcastRoom(room);
        });

        // Join an existing room

        socket.on("join-room", (data, callback) => {

            if (typeof callback !== "function") return;

            const code = String(data?.code || "")
                .trim()
                .toUpperCase();

            const room = rooms.get(code);

            if (!room) {
                return callback({
                    success: false,
                    message: "Room not found."
                });
            }

            if (socket.data.roomCode === code) {
                return callback({
                    success: true,
                    room: getRoomState(room)
                });
            }

            if (room.participants.size >= 20) {
                return callback({
                    success: false,
                    message: "This room is full."
                });
            }

            leaveRoom(socket);

            socket.join(code);
            socket.data.roomCode = code;

            room.participants.set(socket.id, {
                socketId: socket.id,
                name: socket.user.name
            });

            callback({
                success: true,
                room: getRoomState(room)
            });

            broadcastRoom(room);
        });

        // Host selects an audio asset

        socket.on("select-track", async (data, callback) => {

            if (typeof callback !== "function") return;

            const room = rooms.get(socket.data.roomCode);

            if (!room || room.hostId !== socket.id) {
                return callback({
                    success: false,
                    message: "Only the host can select audio."
                });
            }

            try {
                const asset = await Asset.findById(
                    data?.assetId
                );

                if (!asset) {
                    return callback({
                        success: false,
                        message: "Audio asset not found."
                    });
                }

                if (
                    rooms.get(room.code) !== room ||
                    room.hostId !== socket.id ||
                    socket.data.roomCode !== room.code
                ) {
                    return callback({
                        success: false,
                        message: "Room membership changed."
                    });
                }

                room.assetId = asset._id.toString();
                room.assetTitle = asset.title;
                room.playing = false;
                room.position = 0;
                room.updatedAt = Date.now();

                broadcastRoom(room);

                callback({ success: true });

            } catch {
                callback({
                    success: false,
                    message: "Unable to select audio."
                });
            }
        });

        // Host controls playback

        socket.on("playback-control", (data, callback) => {

            if (typeof callback !== "function") return;

            const room = rooms.get(socket.data.roomCode);

            if (!room || room.hostId !== socket.id) {
                return callback({
                    success: false,
                    message: "Only the host can control playback."
                });
            }

            if (!room.assetId) {
                return callback({
                    success: false,
                    message: "Select an audio asset first."
                });
            }

            if (
                !["play", "pause", "seek"].includes(data?.action) ||
                !Number.isFinite(data.position) ||
                data.position < 0 ||
                data.position > 86400
            ) {
                return callback({
                    success: false,
                    message: "Invalid playback command."
                });
            }

            room.position = data.position;
            room.updatedAt = Date.now();

            if (data.action === "play") {
                room.playing = true;
            }

            if (data.action === "pause") {
                room.playing = false;
            }

            broadcastRoom(room);

            callback({ success: true });
        });

        socket.on("leave-room", (callback) => {

            leaveRoom(socket);

            if (typeof callback === "function") {
                callback({ success: true });
            }
        });

        socket.on("disconnect", () => {
            leaveRoom(socket);

            console.log(
                "Live Rooms disconnected:",
                socket.user.name
            );
        });
    });

    // Periodically synchronize connected participants

    const syncInterval = setInterval(() => {

        for (const room of rooms.values()) {
            if (room.playing) {
                broadcastRoom(room);
            }
        }

    }, 3000);

    syncInterval.unref();

    return () => {
        clearInterval(syncInterval);
        rooms.clear();
    };
}

module.exports = initializeRooms;
