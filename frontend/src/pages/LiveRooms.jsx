
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";

import {
    AudioLines,
    ArrowLeft,
    ArrowUpRight,
    Radio,
    Users,
    Copy,
    Play,
    Pause,
    Crown,
    LogOut,
    Headphones,
    Wifi,
    Volume2
} from "lucide-react";

import api from "../services/api";
import PeerNetwork from "../services/peerNetwork";
import "./LiveRooms.css";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const hashBlob = async (blob) => {
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
};

function LiveRooms() {

    const [connected, setConnected] = useState(false);
    const [socketId, setSocketId] = useState("");
    const [room, setRoom] = useState(null);
    const [roomCode, setRoomCode] = useState("");
    const [assets, setAssets] = useState([]);
    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const [p2pPeers, setP2pPeers] = useState([]);
    const [transferInfo, setTransferInfo] = useState(null);
    const [message, setMessage] = useState("");
    const [audioReady, setAudioReady] = useState(false);
    const [loadingAudio, setLoadingAudio] = useState(false);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [volume, setVolume] = useState(0.8);

    const socketRef = useRef(null);
    const peerNetworkRef = useRef(null);
    const audioRef = useRef(null);
    const roomRef = useRef(null);
    const urlRef = useRef(null);
    const loadedAssetRef = useRef(null);
    const requestRef = useRef(0);
    const clockOffsetRef = useRef(0);
    const audioReadyRef = useRef(false);

    const isHost = room?.hostId === socketId;

    const formatBytes = (bytes = 0) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const formatTime = (seconds) => {
        const safe = Number.isFinite(seconds)
            ? Math.max(0, Math.floor(seconds))
            : 0;

        const minutes = Math.floor(safe / 60);
        const remaining = safe % 60;

        return `${minutes}:${String(remaining).padStart(2, "0")}`;
    };

    const syncClock = (socket) => {

        const start = Date.now();

        socket.emit("clock-sync", (serverTime) => {

            const end = Date.now();

            clockOffsetRef.current =
                serverTime - (start + end) / 2;
        });
    };

    const syncAudio = async () => {

        const audio = audioRef.current;
        const state = roomRef.current;

        if (
            !audio ||
            !state ||
            !state.assetId ||
            loadedAssetRef.current !== state.assetId ||
            audio.readyState < 1
        ) {
            return;
        }

        let targetPosition = state.position;

        if (state.playing) {

            const serverNow =
                Date.now() + clockOffsetRef.current;

            targetPosition += Math.max(
                0,
                (serverNow - state.serverTime) / 1000
            );
        }

        if (Number.isFinite(audio.duration)) {
            targetPosition = Math.min(
                targetPosition,
                audio.duration
            );
        }

        if (
            Math.abs(audio.currentTime - targetPosition) > 0.35
        ) {
            audio.currentTime = targetPosition;
        }

        setPosition(audio.currentTime);

        if (!state.playing) {
            audio.pause();
            return;
        }

        if (!audioReadyRef.current) {
            return;
        }

        if (
            Number.isFinite(audio.duration) &&
            targetPosition >= audio.duration
        ) {
            audio.pause();
            return;
        }

        if (audio.paused) {
            try {
                await audio.play();
            } catch {
                audioReadyRef.current = false;
                setAudioReady(false);
                setMessage(
                    "Click Enable Audio to allow synchronized playback."
                );
            }
        }
    };

    const clearAudio = () => {

        requestRef.current++;
        const previousAssetId = loadedAssetRef.current;

        if (previousAssetId) {
            peerNetworkRef.current?.clearLocalAsset(previousAssetId);
        }

        const audio = audioRef.current;

        if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        }

        if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
        }

        loadedAssetRef.current = null;

        setDuration(0);
        setPosition(0);
        setLoadingAudio(false);
    };

    useEffect(() => {

        let active = true;

        api.get("/assets")
            .then((response) => {
                if (active) {
                    setAssets(response.data);
                }
            })
            .catch(() => {
                if (active) {
                    setMessage("Unable to load audio assets.");
                }
            })
            .finally(() => {
                if (active) {
                    setAssetsLoaded(true);
                }
            });

        const socket = io(
            import.meta.env.VITE_SOCKET_URL ||
                "http://localhost:5000",
            {
                auth: {
                    token: localStorage.getItem("token")
                }
            }
        );

        socketRef.current = socket;
        const peerNetwork = new PeerNetwork(
            socket,
            setP2pPeers,
            setTransferInfo
        );
        peerNetworkRef.current = peerNetwork;

        socket.on("connect", () => {

            setConnected(true);
            setSocketId(socket.id);
            setMessage("");

            syncClock(socket);
        });

        socket.on("connect_error", (error) => {

            setConnected(false);

            setMessage(
                error.message || "Unable to connect to Live Rooms."
            );
        });

        socket.on("disconnect", () => {

            setConnected(false);
            setSocketId("");
            setRoom(null);
            peerNetwork.updateRoom(null);

            roomRef.current = null;

            clearAudio();

            setMessage(
                "Disconnected. Rejoin or create a room after reconnecting."
            );
        });

        socket.on("room-state", (state) => {

            roomRef.current = state;
            peerNetwork.updateRoom(state);

            setRoom(state);

            syncAudio();
        });

        const clockInterval = setInterval(() => {

            if (socket.connected) {
                syncClock(socket);
            }

        }, 15000);

        return () => {

            active = false;

            clearInterval(clockInterval);

            socket.removeAllListeners();
            socket.disconnect();
            peerNetwork.destroy();
            peerNetworkRef.current = null;

            requestRef.current++;

            if (urlRef.current) {
                URL.revokeObjectURL(urlRef.current);
                urlRef.current = null;
            }

            loadedAssetRef.current = null;
            roomRef.current = null;
        };

    }, []);

    useEffect(() => {

        const assetId = room?.assetId;
        const peerNetwork = peerNetworkRef.current;

        if (!assetId) {
            clearAudio();
            return;
        }

        if (!assetsLoaded) return;

        if (loadedAssetRef.current === assetId) {
            syncAudio();
            return;
        }

        clearAudio();

        const requestId = ++requestRef.current;
        const asset = assets.find((item) => item._id === assetId);

        if (!asset) {
            setMessage("Selected asset metadata is unavailable.");
            return;
        }

        setLoadingAudio(true);
        setTransferInfo({
            status: "searching",
            source: "P2P",
            bytes: 0,
            total: asset.fileSize,
            verified: null
        });

        const loadAudio = async () => {
            try {
                let blob = await peerNetwork?.requestAsset(
                    asset,
                    setTransferInfo,
                    isHost ? 15000 : 30000
                );
                let source = "P2P";

                if (
                    requestId !== requestRef.current ||
                    roomRef.current?.assetId !== assetId
                ) {
                    return;
                }

                if (!blob) {
                    source = "Central server fallback";
                    setTransferInfo({
                        status: "server-fallback",
                        source,
                        bytes: 0,
                        total: asset.fileSize,
                        verified: null
                    });

                    const response = await api.get(
                        `/assets/${assetId}/stream`,
                        {
                            responseType: "blob",
                            onDownloadProgress: (progress) => {
                                setTransferInfo({
                                    status: "downloading",
                                    source,
                                    bytes: progress.loaded,
                                    total: asset.fileSize,
                                    verified: null
                                });
                            }
                        }
                    );
                    blob = response.data;

                    if (
                        blob.size !== asset.fileSize ||
                        blob.size > MAX_FILE_SIZE
                    ) {
                        throw new Error("Downloaded audio size is invalid.");
                    }

                    const actualHash = await hashBlob(blob);
                    if (actualHash !== asset.fileHash) {
                        setTransferInfo({
                            status: "integrity-failed",
                            source,
                            bytes: blob.size,
                            total: asset.fileSize,
                            verified: false
                        });
                        throw new Error(
                            "Downloaded audio failed SHA-256 verification."
                        );
                    }

                    setTransferInfo({
                        status: "verified",
                        source,
                        bytes: blob.size,
                        total: asset.fileSize,
                        verified: true,
                        hash: actualHash
                    });
                }

                if (
                    requestId !== requestRef.current ||
                    roomRef.current?.assetId !== assetId
                ) {
                    return;
                }

                if (!blob || blob.size > MAX_FILE_SIZE) {
                    throw new Error("Audio file exceeds the 50 MB limit.");
                }

                peerNetwork?.setLocalAsset(assetId, blob, {
                    fileHash: asset.fileHash,
                    fileSize: asset.fileSize,
                    mimeType: asset.mimeType
                });

                const url = URL.createObjectURL(blob);
                urlRef.current = url;
                loadedAssetRef.current = assetId;

                audioRef.current.src = url;
                audioRef.current.load();
                setMessage("");
            } catch (error) {
                if (requestId === requestRef.current) {
                    setMessage(
                        error.message || "Unable to load selected audio."
                    );
                    setLoadingAudio(false);
                }
            }
        };

        loadAudio();

        return () => {
            peerNetwork?.cancelRequest(assetId);
            requestRef.current++;
        };

    }, [room?.assetId, assetsLoaded, assets, isHost]);

    useEffect(() => {

        if (audioRef.current) {
            audioRef.current.volume = volume;
        }

    }, [volume]);

    const sendCommand = (event, data, onSuccess) => {

        const socket = socketRef.current;

        if (!socket?.connected) {
            setMessage("Live Rooms server is disconnected.");
            return;
        }

        setMessage("");

        const callback = (error, response) => {

            if (error) {
                setMessage("Server response timed out.");
                return;
            }

            if (!response?.success) {
                setMessage(
                    response?.message || "Request failed."
                );
                return;
            }

            if (response.room) {

                roomRef.current = response.room;

                setRoom(response.room);
            }

            onSuccess?.(response);
        };

        if (data === undefined) {
            socket.timeout(5000).emit(event, callback);
        } else {
            socket.timeout(5000).emit(event, data, callback);
        }
    };

    const createRoom = () => {
        setTransferInfo(null);
        sendCommand("create-room");
    };

    const joinRoom = (e) => {

        e.preventDefault();

        if (!roomCode.trim()) {
            setMessage("Enter a room code.");
            return;
        }

        sendCommand("join-room", {
            code: roomCode.trim().toUpperCase()
        });
    };

    const leaveRoom = () => {

        sendCommand("leave-room", undefined, () => {

            roomRef.current = null;

            setRoom(null);
            setRoomCode("");
            setTransferInfo(null);

            clearAudio();
        });
    };

    const selectTrack = (assetId) => {

        if (!assetId) return;

        sendCommand("select-track", { assetId });
    };

    const enableAudio = async () => {

        const audio = audioRef.current;

        if (
            !audio ||
            !loadedAssetRef.current ||
            audio.readyState < 2
        ) {
            setMessage("Wait for the selected audio to load.");
            return;
        }

        try {

            await audio.play();

            audioReadyRef.current = true;

            setAudioReady(true);
            setMessage("");

            await syncAudio();

        } catch {

            setMessage(
                "Audio could not be enabled. Please try again."
            );
        }
    };

    const controlPlayback = (action, seekPosition) => {

        if (!isHost || !audioRef.current) return;

        if (!audioReadyRef.current) {
            setMessage("Enable Audio before starting playback.");
            return;
        }

        const audio = audioRef.current;

        let nextPosition =
            action === "seek"
                ? seekPosition
                : audio.currentTime;

        if (
            action === "play" &&
            Number.isFinite(audio.duration) &&
            nextPosition >= audio.duration
        ) {
            nextPosition = 0;
        }

        sendCommand("playback-control", {
            action,
            position: nextPosition
        });
    };

    const copyRoomCode = async () => {

        try {
            await navigator.clipboard.writeText(room.code);
            setMessage("Room code copied!");
        } catch {
            setMessage(`Your room code is ${room.code}`);
        }
    };

    return (

        <div className="live-page">

            <header className="live-nav">

                <Link to="/dashboard" className="live-logo">
                    <AudioLines size={30} />
                    novacore.
                </Link>

                <Link
                    to="/dashboard"
                    className="neo-button yellow"
                >
                    <ArrowLeft size={18} />
                    Workspace
                </Link>

            </header>

            <main className="live-main">

                <div className="live-topline">

                    <span>NC / LIVE ROOMS 03</span>

                    <span className="live-connection">
                        <Wifi size={17} />
                        {connected ? "CONNECTED" : "OFFLINE"}
                    </span>

                </div>

                <section className="live-hero">

                    <div>

                        <span className="live-sticker">
                            SHARED LISTENING EXPERIENCE
                        </span>

                        <h1>
                            Same sound.
                            <br />
                            Different worlds.
                        </h1>

                        <p>
                            Connect, listen and experience
                            audio together in real time.
                        </p>

                    </div>

                    <Radio
                        className="live-hero-icon"
                        size={140}
                        strokeWidth={1.4}
                    />

                </section>

                {message && (
                    <div className="live-message" role="status">
                        {message}
                    </div>
                )}

                {!room ? (

                    <section className="live-entry-grid">

                        <article className="live-entry lime">

                            <Radio size={50} />

                            <span>01 / HOST</span>

                            <h2>Host a room.</h2>

                            <p>
                                Create your own listening
                                session and invite others.
                            </p>

                            <button
                                className="neo-button yellow"
                                onClick={createRoom}
                                disabled={!connected}
                            >
                                Create Room
                                <ArrowUpRight size={20} />
                            </button>

                        </article>

                        <article className="live-entry lavender">

                            <Users size={50} />

                            <span>02 / PARTICIPANT</span>

                            <h2>Join the sound.</h2>

                            <p>
                                Enter a room code to join
                                a shared audio session.
                            </p>

                            <form onSubmit={joinRoom}>

                                <input
                                    value={roomCode}
                                    onChange={(e) =>
                                        setRoomCode(
                                            e.target.value.toUpperCase()
                                        )
                                    }
                                    placeholder="ROOM CODE"
                                    maxLength={6}
                                    aria-label="Room code"
                                    required
                                />

                                <button
                                    className="neo-button yellow"
                                    disabled={!connected}
                                >
                                    Join Room
                                    <ArrowUpRight size={20} />
                                </button>

                            </form>

                        </article>

                    </section>

                ) : (

                    <>

                        <section className="live-room-header">

                            <div>
                                <span>YOUR LISTENING ROOM</span>
                                <h2>{room.code}</h2>
                            </div>

                            <button
                                className="neo-button yellow"
                                onClick={copyRoomCode}
                            >
                                <Copy size={18} />
                                Copy Code
                            </button>

                            <button
                                className="neo-button coral"
                                onClick={leaveRoom}
                            >
                                <LogOut size={18} />
                                Leave Room
                            </button>

                        </section>

                        <div className="live-room-grid">

                            <section className="live-player-card">

                                <div className="live-panel-label">
                                    01 / SHARED AUDIO
                                </div>

                                <div className="live-disc-area">

                                    <div className={
                                        `live-disc ${
                                            room.playing && audioReady
                                                ? "spinning"
                                                : ""
                                        }`
                                    }>

                                        <div className="live-disc-label">
                                            <AudioLines size={36} />
                                            NC.
                                        </div>

                                    </div>

                                </div>

                                <div className="live-player-body">

                                    <h2>
                                        {room.assetTitle ||
                                            "Choose a sound."}
                                    </h2>

                                    <p>
                                        {loadingAudio
                                            ? "Loading audio..."
                                            : room.playing
                                                ? "Shared playback active"
                                                : "Playback paused"}
                                    </p>

                                    {isHost && (

                                        <select
                                            value={room.assetId || ""}
                                            onChange={(e) =>
                                                selectTrack(e.target.value)
                                            }
                                            aria-label="Select audio"
                                        >

                                            <option value="">
                                                Select an audio asset
                                            </option>

                                            {assets.map((asset) => (
                                                <option
                                                    key={asset._id}
                                                    value={asset._id}
                                                >
                                                    {asset.title}
                                                </option>
                                            ))}

                                        </select>

                                    )}

                                    {!audioReady && (

                                        <button
                                            className="neo-button lime full-width"
                                            onClick={enableAudio}
                                            disabled={
                                                loadingAudio ||
                                                !room.assetId
                                            }
                                        >
                                            <Headphones size={20} />
                                            Enable Audio
                                        </button>

                                    )}

                                    <input
                                        type="range"
                                        className="live-progress"
                                        min="0"
                                        max={duration || 1}
                                        step="0.1"
                                        value={Math.min(
                                            position,
                                            duration || 1
                                        )}
                                        disabled={
                                            !isHost ||
                                            !audioReady ||
                                            loadingAudio ||
                                            !duration
                                        }
                                        aria-label="Playback position"
                                        onChange={(e) =>
                                            controlPlayback(
                                                "seek",
                                                Number(e.target.value)
                                            )
                                        }
                                    />

                                    <div className="live-time">

                                        <span>
                                            {formatTime(position)}
                                        </span>

                                        <span>
                                            {formatTime(duration)}
                                        </span>

                                    </div>

                                    {isHost ? (

                                        <div className="live-play-controls">

                                            <button
                                                className="neo-button yellow"
                                                disabled={
                                                    !room.assetId ||
                                                    loadingAudio ||
                                                    !audioReady
                                                }
                                                onClick={() =>
                                                    controlPlayback(
                                                        room.playing
                                                            ? "pause"
                                                            : "play"
                                                    )
                                                }
                                            >

                                                {room.playing
                                                    ? <Pause size={24} />
                                                    : <Play size={24} />
                                                }

                                                {room.playing
                                                    ? "Pause for everyone"
                                                    : "Play for everyone"}

                                            </button>

                                        </div>

                                    ) : (

                                        <div className="live-listener-note">
                                            <Headphones size={20} />
                                            Playback is controlled by the host.
                                        </div>

                                    )}

                                    <div className="live-volume">

                                        <Volume2 size={20} />

                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={volume}
                                            aria-label="Local volume"
                                            onChange={(e) =>
                                                setVolume(
                                                    Number(e.target.value)
                                                )
                                            }
                                        />

                                        <span>
                                            {Math.round(volume * 100)}%
                                        </span>

                                    </div>

                                </div>

                            </section>

                            <aside className="live-participants">

                                <div className="live-panel-label">
                                    02 / CONNECTED USERS
                                </div>

                                <div className="live-participants-body">

                                    <Users size={35} />

                                    <h2>
                                        {room.participants.length}
                                        {" "}Listening
                                    </h2>

                                    {room.participants.map((person) => (

                                        <div
                                            className="live-person"
                                            key={person.socketId}
                                        >

                                            <div className="live-avatar">
                                                {person.name
                                                    ?.charAt(0)
                                                    .toUpperCase()}
                                            </div>

                                            <div className="live-person-info">

                                                <strong>
                                                    {person.name}
                                                    {person.socketId === socketId
                                                        ? " (You)"
                                                        : ""}
                                                </strong>

                                                <small>
                                                    {person.socketId === room.hostId
                                                        ? "ROOM HOST"
                                                        : "LISTENER"}
                                                </small>

                                            </div>

                                            {person.socketId === room.hostId
                                                ? <Crown size={21} />
                                                : <Headphones size={21} />
                                            }

                                        </div>

                                    ))}

                                    <section className="live-p2p-network">
                                        <div className="live-panel-label">
                                            03 / P2P NETWORK
                                        </div>

                                        <div className="live-p2p-body">
                                            <strong>
                                                {p2pPeers.filter(
                                                    (peer) =>
                                                        peer.status === "connected"
                                                ).length}
                                                {" "}WebRTC data channels open
                                            </strong>

                                            <p>
                                                Socket.IO authenticates and
                                                relays room-scoped WebRTC
                                                signaling. Audio bytes move
                                                directly between browsers.
                                            </p>

                                            {p2pPeers.length === 0 ? (
                                                <p className="live-p2p-empty">
                                                    Join with another listener
                                                    to discover room peers.
                                                </p>
                                            ) : p2pPeers.map((peer) => (
                                                <div
                                                    className="live-p2p-peer"
                                                    key={peer.socketId}
                                                >
                                                    <span>
                                                        {peer.name}
                                                        <small>
                                                            {peer.status.toUpperCase()}
                                                        </small>
                                                    </span>
                                                    <strong>
                                                        {formatBytes(
                                                            peer.transferredBytes
                                                        )}
                                                    </strong>
                                                </div>
                                            ))}

                                            {transferInfo && (
                                                <div className="live-transfer">
                                                    <span>
                                                        ASSET DELIVERY /{" "}
                                                        {transferInfo.status
                                                            .replaceAll("-", " ")
                                                            .toUpperCase()}
                                                    </span>
                                                    <strong>
                                                        {transferInfo.source ||
                                                            "P2P"}
                                                        {transferInfo.peerName
                                                            ? ` · ${transferInfo.peerName}`
                                                            : ""}
                                                    </strong>
                                                    {Number.isFinite(
                                                        transferInfo.total
                                                    ) && transferInfo.total > 0 && (
                                                        <>
                                                            <progress
                                                                value={Math.min(
                                                                    transferInfo.bytes || 0,
                                                                    transferInfo.total
                                                                )}
                                                                max={transferInfo.total}
                                                                aria-label="Audio transfer progress"
                                                            />
                                                            <small>
                                                                {formatBytes(
                                                                    transferInfo.bytes || 0
                                                                )}
                                                                {" / "}
                                                                {formatBytes(
                                                                    transferInfo.total
                                                                )}
                                                            </small>
                                                        </>
                                                    )}
                                                    <small>
                                                        Integrity:{" "}
                                                        {transferInfo.verified === true
                                                            ? "SHA-256 verified"
                                                            : transferInfo.verified === false
                                                                ? "verification failed"
                                                                : "pending"}
                                                    </small>
                                                    {transferInfo.hash && (
                                                        <code>
                                                            {transferInfo.hash}
                                                        </code>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <div className="live-sync-note">

                                        <Radio size={25} />

                                        <strong>
                                            Real-time synchronization
                                        </strong>

                                        <p>
                                            Playback state is shared
                                            through Socket.IO.
                                        </p>

                                    </div>

                                </div>

                            </aside>

                        </div>

                    </>

                )}

                <audio
                    ref={audioRef}
                    preload="auto"
                    onLoadedMetadata={(e) => {
                        setDuration(e.currentTarget.duration);
                        syncAudio();
                    }}
                    onCanPlay={() => {
                        setLoadingAudio(false);
                        syncAudio();
                    }}
                    onTimeUpdate={(e) => {
                        setPosition(e.currentTarget.currentTime);
                    }}
                    onEnded={() => {

                        if (
                            roomRef.current?.hostId ===
                            socketRef.current?.id
                        ) {

                            socketRef.current.emit(
                                "playback-control",
                                {
                                    action: "pause",
                                    position: audioRef.current.duration
                                },
                                () => {}
                            );
                        }
                    }}
                    onError={() => {

                        if (loadedAssetRef.current) {
                            setLoadingAudio(false);
                            setMessage("Unable to play this audio.");
                        }
                    }}
                />

                <footer className="live-footer">
                    NOVACORE / SOUND WITHOUT BOUNDARIES
                </footer>

            </main>

        </div>
    );
}

export default LiveRooms;
