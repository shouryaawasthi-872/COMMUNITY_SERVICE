
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const http = require("http");

const { Server } = require("socket.io");
const { rateLimit } = require("express-rate-limit");
const mongoose = require("mongoose");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const assetRoutes = require("./routes/assetRoutes");
const registryRoutes = require("./routes/registryRoutes");

const protect = require("./middleware/authMiddleware");

const initializeRooms = require("./sockets/roomsocket");

dotenv.config();

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
}

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

app.use(helmet());

app.use(cors({
    origin: "http://localhost:5173"
}));

app.use(express.json());

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30
});

app.get("/", (req, res) => {
    res.send("NOVACORE Backend is running!");
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "NOVACORE API is working",
        liveRooms: "Enabled"
    });
});

app.use("/api/auth", authLimiter, authRoutes);

app.use("/api/assets", assetRoutes);

app.use("/api/registry", registryRoutes);

app.get("/api/auth/me", protect, (req, res) => {
    res.json(req.user);
});

app.use((err, req, res, next) => {
    res.status(400).json({
        message: "Invalid request or unsupported audio upload"
    });
});

const PORT = Number(process.env.PORT) || 5000;
const cleanupRooms = initializeRooms(io);

let shuttingDown = false;
let shutdownPromise;

async function shutdown(signal) {
    if (shutdownPromise) {
        return shutdownPromise;
    }

    shuttingDown = true;
    console.log(`NOVACORE shutting down${signal ? ` (${signal})` : ""}`);

    cleanupRooms();

    shutdownPromise = (async () => {
        if (server.listening) {
            await new Promise((resolve) => io.close(resolve));
        }

        await mongoose.disconnect();
    })();

    return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
        shutdown(signal)
            .then(() => {
                process.exitCode = 0;
            })
            .catch((error) => {
                console.error(
                    "NOVACORE shutdown failed:",
                    error.message
                );
                process.exitCode = 1;
            });
    });
}

async function startServer() {
    try {
        await connectDB();

        if (shuttingDown) {
            return;
        }

        await new Promise((resolve, reject) => {
            const onError = (error) => {
                server.removeListener("listening", onListening);
                reject(error);
            };
            const onListening = () => {
                server.removeListener("error", onError);
                resolve();
            };

            server.once("error", onError);
            server.once("listening", onListening);
            server.listen(PORT);
        });

        console.log(`NOVACORE Server running on port ${PORT}`);
        console.log("NOVACORE Live Rooms enabled");
    } catch (error) {
        console.error(
            `NOVACORE failed to start on port ${PORT}:`,
            error.message
        );

        try {
            await shutdown("startup failure");
        } catch (shutdownError) {
            console.error(
                "NOVACORE startup cleanup failed:",
                shutdownError.message
            );
        }

        process.exitCode = 1;
    }
}

startServer();
