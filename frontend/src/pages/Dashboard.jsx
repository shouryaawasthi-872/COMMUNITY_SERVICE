
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
    AudioLines,
    Upload,
    Play,
    ShieldCheck,
    Search,
    LogOut,
    X,
    Disc3,
    ArrowUpRight,
    HardDrive,
    Music2,
    RefreshCw,
    Fingerprint,
    Headphones
} from "lucide-react";

import api from "../services/api";

function Dashboard() {
    const navigate = useNavigate();

    const user = JSON.parse(
        localStorage.getItem("user") || "{}"
    );

    const [assets, setAssets] = useState([]);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("All");
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [showUpload, setShowUpload] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [verification, setVerification] = useState({});

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("Music");
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    const [currentTrack, setCurrentTrack] = useState(null);
    const [audioUrl, setAudioUrl] = useState("");
    const [playing, setPlaying] = useState(false);

    const requestRef = useRef(0);

    const categories = [
        "All",
        "Music",
        "Sound Effects",
        "Ambient",
        "Voice",
        "Other"
    ];

    const colors = [
        "#C4B5FD",
        "#FF795D",
        "#D4ED91",
        "#FFD65A"
    ];

    const fetchAssets = async () => {
        try {
            const response = await api.get("/assets");
            setAssets(response.data);
        } catch (error) {
            setMessage(
                error.response?.data?.message ||
                "Unable to load assets."
            );

            if (error.response?.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                navigate("/login");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAssets();
    }, []);

    useEffect(() => {
        return () => {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);

    useEffect(() => {
        return () => {
            requestRef.current++;
        };
    }, []);

    const handleUpload = async (e) => {
        e.preventDefault();

        if (!file) {
            setMessage("Please select an audio file.");
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            setMessage("Maximum file size is 50 MB.");
            return;
        }

        setUploading(true);
        setMessage("");

        const formData = new FormData();

        formData.append("title", title);
        formData.append("description", description);
        formData.append("category", category);
        formData.append("audio", file);

        try {
            await api.post("/assets/upload", formData);

            setMessage("Sound successfully registered!");
            setTitle("");
            setDescription("");
            setFile(null);
            setShowUpload(false);

            await fetchAssets();

        } catch (error) {
            setMessage(
                error.response?.data?.message ||
                "Upload failed."
            );
        } finally {
            setUploading(false);
        }
    };

    const verifyAsset = async (id) => {
        setVerification((previous) => ({
            ...previous,
            [id]: "Checking..."
        }));

        try {
            const response = await api.get(
                `/assets/${id}/verify`
            );

            setVerification((previous) => ({
                ...previous,
                [id]: response.data.verified
                    ? "Verified"
                    : "Modified"
            }));

        } catch {
            setVerification((previous) => ({
                ...previous,
                [id]: "Failed"
            }));
        }
    };

    const playAsset = async (asset) => {
        const requestId = ++requestRef.current;

        try {
            setMessage("Loading sound...");

            const response = await api.get(
                `/assets/${asset._id}/stream`,
                { responseType: "blob" }
            );

            if (requestId !== requestRef.current) {
                return;
            }

            const url = URL.createObjectURL(response.data);

            setCurrentTrack(asset);
            setAudioUrl(url);
            setPlaying(false);
            setMessage("");

        } catch {
            if (requestId === requestRef.current) {
                setMessage("Unable to play this audio.");
            }
        }
    };

    const recordPlayback = async () => {
        setPlaying(true);

        if (!currentTrack) return;

        try {
            await api.post(
                `/assets/${currentTrack._id}/play`
            );

            fetchAssets();

        } catch {
            setMessage("Unable to update playback count.");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const formatSize = (bytes) =>
        `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

    const totalPlays = assets.reduce(
        (sum, asset) => sum + (asset.playCount || 0),
        0
    );

    const totalStorage = assets.reduce(
        (sum, asset) => sum + asset.fileSize,
        0
    );

    const filteredAssets = assets.filter((asset) => {
        const matchesSearch =
            `${asset.title} ${asset.category} ${asset.owner?.name || ""}`
                .toLowerCase()
                .includes(search.toLowerCase());

        const matchesCategory =
            filter === "All" || asset.category === filter;

        return matchesSearch && matchesCategory;
    });

    return (
        <div className="neo-workspace">

            <header className="neo-nav">

                <a href="#home" className="neo-logo">
                    <AudioLines size={32} />
                    novacore<span>.</span>
                </a>

                <nav className="neo-links">

                    <a href="#home">Home</a>

                    <a href="#collection">Collection</a>

                    <button
                        className="neo-button lime"
                        onClick={() => navigate("/spatial-lab")}
                    >
                        Spatial Lab ↗
                    </button>

                    <button
                        className="neo-button yellow"
                        onClick={() => navigate("/registry")}
                    >
                        Registry ↗
                    </button>

                    <button
                        className="neo-button coral"
                        onClick={() => navigate("/live-rooms")}
                    >
                        Live Rooms / P2P ↗
                    </button>

                </nav>

                <div className="neo-profile">
                    <span>{user.name}</span>

                    <button
                        className="neo-icon-button"
                        onClick={handleLogout}
                        title="Logout"
                        aria-label="Logout"
                    >
                        <LogOut size={19} />
                    </button>
                </div>

            </header>

            <main className="neo-main" id="home">

                <div className="neo-status">
                    <span>✳ AUDIO ASSET MANAGEMENT</span>
                    <span>VOL. 01 — LOCAL WORKSPACE</span>
                </div>

                <section className="neo-hero">

                    <div className="neo-hero-text">

                        <span className="neo-sticker">
                            THE AUDIO REVOLUTION
                        </span>

                        <h1>
                            GOOD SOUND.
                            <br />
                            NO LIMITS<span>.</span>
                        </h1>

                        <p>
                            Your sound. Your assets.
                            Your universe.
                        </p>

                        <button
                            className="neo-button coral"
                            onClick={() => {
                                setMessage("");
                                setShowUpload(true);
                            }}
                        >
                            <Upload size={20} />
                            Import your sound
                            <ArrowUpRight size={20} />
                        </button>

                    </div>

                    <div className="neo-hero-art">

                        <div className="neo-art-label">
                            NOVACORE / NC-001
                        </div>

                        <div className="neo-vinyl">

                            <div className="vinyl-label">
                                <AudioLines size={32} />
                                <span>NC.</span>
                            </div>

                        </div>

                        <div className="neo-art-bottom">
                            <strong>SOUND IS POWER.</strong>
                            <ArrowUpRight size={24} />
                        </div>

                    </div>

                </section>

                <div className="neo-lab-banner">

                    <div>
                        <span>NC / EXPERIMENT 01</span>

                        <h2>
                            Don't just hear it. Feel it.
                        </h2>

                        <p>
                            Experience positional audio in a
                            virtual sound environment.
                        </p>
                    </div>

                    <button
                        className="neo-button yellow"
                        onClick={() => navigate("/spatial-lab")}
                    >
                        <Headphones size={20} />
                        Enter Spatial Lab
                        <ArrowUpRight size={20} />
                    </button>

                </div>

                <div className="neo-registry-banner">

                    <div>
                        <span>NC / TRUST INFRASTRUCTURE</span>

                        <h2>
                            Every sound leaves a trace.
                        </h2>

                        <p>
                            Explore audio fingerprints, ownership
                            records and registry integrity.
                        </p>
                    </div>

                    <div className="neo-live-banner">

                        <div>
                            <span>NC / PEER-TO-PEER AUDIO</span>

                            <h2>
                                Share the sound, directly.
                            </h2>

                            <p>
                                Discover room peers and deliver verified
                                audio over WebRTC data channels.
                            </p>
                        </div>

                        <button
                            className="neo-button yellow"
                            onClick={() => navigate("/live-rooms")}
                        >
                            <Headphones size={20} />
                            Open Live Rooms + P2P
                            <ArrowUpRight size={20} />
                        </button>

                    </div>

                    <button
                        className="neo-button yellow"
                        onClick={() => navigate("/registry")}
                    >
                        <Fingerprint size={20} />
                        Explore Registry
                        <ArrowUpRight size={20} />
                    </button>

                </div>

                <section className="neo-metrics">

                    <div className="neo-stat yellow">
                        <Music2 size={25} />
                        <strong>{assets.length}</strong>
                        <span>Indexed audio assets</span>
                    </div>

                    <div className="neo-stat lime">
                        <Play size={25} />
                        <strong>{totalPlays}</strong>
                        <span>Total playbacks</span>
                    </div>

                    <div className="neo-stat lavender">
                        <HardDrive size={25} />
                        <strong>
                            {formatSize(totalStorage)}
                        </strong>
                        <span>Audio storage</span>
                    </div>

                </section>

                {message && (
                    <div className="neo-message" role="status">

                        <span>{message}</span>

                        <button
                            onClick={() => setMessage("")}
                            aria-label="Dismiss message"
                        >
                            <X size={18} />
                        </button>

                    </div>
                )}

                <section
                    className="neo-collection"
                    id="collection"
                >

                    <div className="neo-section-heading">

                        <div>
                            <span className="neo-small-label">
                                02 / SOUND DIRECTORY
                            </span>

                            <h2>The collection.</h2>
                        </div>

                        <button
                            className="neo-button yellow"
                            onClick={() => {
                                setMessage("");
                                setShowUpload(true);
                            }}
                        >
                            <Upload size={18} />
                            Add sound
                        </button>

                    </div>

                    <div className="neo-toolbar">

                        <div className="neo-search">

                            <Search size={20} />

                            <input
                                placeholder="Find your sound..."
                                value={search}
                                aria-label="Search audio assets"
                                onChange={(e) =>
                                    setSearch(e.target.value)
                                }
                            />

                        </div>

                        <button
                            className="neo-icon-button"
                            onClick={fetchAssets}
                            title="Refresh"
                            aria-label="Refresh assets"
                        >
                            <RefreshCw size={20} />
                        </button>

                    </div>

                    <div className="neo-filters">

                        {categories.map((item) => (
                            <button
                                key={item}
                                className={
                                    filter === item
                                        ? "active"
                                        : ""
                                }
                                onClick={() => setFilter(item)}
                            >
                                {item}
                            </button>
                        ))}

                    </div>

                    {loading ? (

                        <div className="neo-empty">
                            Loading your collection...
                        </div>

                    ) : filteredAssets.length === 0 ? (

                        <div className="neo-empty">
                            <Music2 size={48} />

                            <h3>It's a little quiet here.</h3>

                            <p>No matching audio assets.</p>
                        </div>

                    ) : (

                        <div className="neo-assets">

                            {filteredAssets.map((asset, index) => (
                                <article
                                    className="neo-asset-card"
                                    key={asset._id}
                                >

                                    <div
                                        className="neo-cover"
                                        style={{
                                            background:
                                                colors[index % colors.length]
                                        }}
                                    >

                                        <div className="neo-cover-top">

                                            <span>
                                                NC / {String(index + 1)
                                                    .padStart(2, "0")}
                                            </span>

                                            <span>
                                                {asset.category}
                                            </span>

                                        </div>

                                        <div className="neo-record-art">
                                            <Disc3
                                                size={100}
                                                strokeWidth={1.3}
                                            />
                                        </div>

                                        <button
                                            className="neo-play-button"
                                            onClick={() => playAsset(asset)}
                                            aria-label={`Play ${asset.title}`}
                                        >
                                            <Play
                                                size={25}
                                                fill="currentColor"
                                            />
                                        </button>

                                    </div>

                                    <div className="neo-asset-info">

                                        <h3>{asset.title}</h3>

                                        <p>
                                            By {asset.owner?.name || "Unknown"}
                                        </p>

                                        <div className="neo-asset-meta">

                                            <span>
                                                {formatSize(asset.fileSize)}
                                            </span>

                                            <span>
                                                {asset.playCount || 0} plays
                                            </span>

                                        </div>

                                        <div className="neo-card-actions">

                                            <button
                                                className={
                                                    `neo-verify ${
                                                        verification[asset._id] === "Verified"
                                                            ? "is-verified"
                                                            : ""
                                                    }`
                                                }
                                                onClick={() =>
                                                    verifyAsset(asset._id)
                                                }
                                            >
                                                <ShieldCheck size={17} />

                                                {verification[asset._id] ||
                                                    "Verify"}
                                            </button>

                                            <button
                                                className="neo-details"
                                                onClick={() =>
                                                    setSelectedAsset(asset)
                                                }
                                                title="Asset details"
                                                aria-label="Asset details"
                                            >
                                                <Fingerprint size={19} />
                                            </button>

                                        </div>

                                    </div>

                                </article>
                            ))}

                        </div>

                    )}

                </section>

                <footer className="neo-footer">
                    <strong>novacore.</strong>
                    <span>BUILT FOR THE FUTURE OF SOUND.</span>
                    <span>© 2026</span>
                </footer>

            </main>

            <div className="neo-player">

                <div className="neo-now-playing">

                    <Disc3
                        size={42}
                        className={playing ? "spinning" : ""}
                    />

                    <div>

                        <small>NOW PLAYING</small>

                        <strong>
                            {currentTrack?.title || "Pick a sound!"}
                        </strong>

                    </div>

                </div>

                {audioUrl ? (

                    <audio
                        key={audioUrl}
                        src={audioUrl}
                        controls
                        autoPlay
                        onPlay={recordPlayback}
                        onPause={() => setPlaying(false)}
                        onEnded={() => setPlaying(false)}
                        onError={() => {
                            setPlaying(false);
                            setMessage("Audio format could not be played.");
                        }}
                    />

                ) : (

                    <span className="neo-player-idle">
                        YOUR SOUND GOES HERE ✳
                    </span>

                )}

                <span className="neo-player-brand">NC.</span>

            </div>

            {showUpload && (

                <div className="neo-overlay">

                    <div
                        className="neo-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Import audio"
                    >

                        <div className="neo-modal-header coral">

                            <span>NEW SOUND / 01</span>

                            <button
                                className="neo-icon-button"
                                disabled={uploading}
                                onClick={() => {
                                    setShowUpload(false);
                                    setFile(null);
                                    setMessage("");
                                }}
                                aria-label="Close"
                            >
                                <X size={23} />
                            </button>

                        </div>

                        <div className="neo-modal-body">

                            <h2>Drop the beat.</h2>

                            <p>Register a new audio asset.</p>

                            <form onSubmit={handleUpload}>

                                <label htmlFor="audio-title">
                                    Audio title
                                </label>

                                <input
                                    id="audio-title"
                                    value={title}
                                    onChange={(e) =>
                                        setTitle(e.target.value)
                                    }
                                    placeholder="Give your sound a name"
                                    required
                                />

                                <label htmlFor="audio-description">
                                    Description
                                </label>

                                <textarea
                                    id="audio-description"
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    placeholder="Tell us about this sound..."
                                />

                                <label htmlFor="audio-category">
                                    Category
                                </label>

                                <select
                                    id="audio-category"
                                    value={category}
                                    onChange={(e) =>
                                        setCategory(e.target.value)
                                    }
                                >
                                    {categories
                                        .filter((item) => item !== "All")
                                        .map((item) => (
                                            <option key={item}>
                                                {item}
                                            </option>
                                        ))}
                                </select>

                                <label className="neo-file-drop">

                                    <Upload size={32} />

                                    <strong>
                                        {file
                                            ? file.name
                                            : "Choose your audio"}
                                    </strong>

                                    <small>
                                        MP3, WAV, OGG, M4A — 50 MB MAX
                                    </small>

                                    <input
                                        type="file"
                                        accept=".mp3,.wav,.ogg,.m4a"
                                        onChange={(e) =>
                                            setFile(e.target.files[0])
                                        }
                                        required
                                    />

                                </label>

                                {message && (
                                    <p role="status">{message}</p>
                                )}

                                <button
                                    type="submit"
                                    className="neo-button lime full-width"
                                    disabled={uploading}
                                >
                                    {uploading
                                        ? "Registering..."
                                        : "Upload & Register"}

                                    <ArrowUpRight size={20} />

                                </button>

                            </form>

                        </div>

                    </div>

                </div>

            )}

            {selectedAsset && (

                <div className="neo-overlay">

                    <div
                        className="neo-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Asset information"
                    >

                        <div className="neo-modal-header lavender">

                            <span>ASSET PASSPORT / 02</span>

                            <button
                                className="neo-icon-button"
                                onClick={() => setSelectedAsset(null)}
                                aria-label="Close"
                            >
                                <X size={23} />
                            </button>

                        </div>

                        <div className="neo-modal-body">

                            <h2>{selectedAsset.title}</h2>

                            <p>
                                {selectedAsset.description ||
                                    "No description provided."}
                            </p>

                            <div className="neo-passport">

                                <label>OWNER</label>

                                <p>
                                    {selectedAsset.owner?.name || "Unknown"}
                                </p>

                                <label>CATEGORY</label>

                                <p>{selectedAsset.category}</p>

                                <label>ORIGINAL FILE</label>

                                <p>{selectedAsset.originalName}</p>

                                <label>FILE SIZE</label>

                                <p>
                                    {formatSize(selectedAsset.fileSize)}
                                </p>

                                <label>SHA-256 FINGERPRINT</label>

                                <code>{selectedAsset.fileHash}</code>

                                <label>REGISTRY RECORD HASH</label>

                                <code>{selectedAsset.recordHash}</code>

                                <label>PREVIOUS RECORD HASH</label>

                                <code>
                                    {selectedAsset.previousRecordHash}
                                </code>

                            </div>

                            <button
                                className="neo-button lime full-width"
                                onClick={() =>
                                    verifyAsset(selectedAsset._id)
                                }
                            >
                                <ShieldCheck size={20} />

                                {verification[selectedAsset._id] ||
                                    "Verify integrity"}

                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>
    );
}

export default Dashboard;
