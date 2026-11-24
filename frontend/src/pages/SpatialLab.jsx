
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
    AudioLines,
    ArrowLeft,
    Play,
    Pause,
    Headphones,
    RotateCcw,
    Volume2
} from "lucide-react";

import api from "../services/api";
import "../SpatialLab.css";

function SpatialLab() {
    const [assets, setAssets] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [x, setX] = useState(0);
    const [y, setY] = useState(0);
    const [z, setZ] = useState(-2);
    const [volume, setVolume] = useState(0.8);
    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const audioRef = useRef(null);
    const contextRef = useRef(null);
    const pannerRef = useRef(null);
    const gainRef = useRef(null);
    const urlRef = useRef(null);
    const loadedIdRef = useRef("");
    const requestRef = useRef(0);

    useEffect(() => {
        let active = true;

        api.get("/assets")
            .then((response) => {
                if (!active) return;

                setAssets(response.data);

                if (response.data.length > 0) {
                    setSelectedId(response.data[0]._id);
                }
            })
            .catch(() => {
                if (active) {
                    setMessage("Unable to load audio assets.");
                }
            });

        return () => {
            active = false;
            requestRef.current++;

            if (urlRef.current) {
                URL.revokeObjectURL(urlRef.current);
            }

            if (contextRef.current) {
                contextRef.current.close().catch(() => {});
            }
        };
    }, []);

    const initializeAudio = async () => {
        if (!contextRef.current) {
            const AudioContext =
                window.AudioContext ||
                window.webkitAudioContext;

            const context = new AudioContext();

            const source =
                context.createMediaElementSource(
                    audioRef.current
                );

            const panner = context.createPanner();

            panner.panningModel = "HRTF";
            panner.distanceModel = "inverse";
            panner.refDistance = 1;
            panner.maxDistance = 100;
            panner.rolloffFactor = 1;

            const gain = context.createGain();

            panner.positionX.value = x;
            panner.positionY.value = y;
            panner.positionZ.value = z;

            gain.gain.value = volume;

            source.connect(panner);
            panner.connect(gain);
            gain.connect(context.destination);

            contextRef.current = context;
            pannerRef.current = panner;
            gainRef.current = gain;
        }

        if (contextRef.current.state === "suspended") {
            await contextRef.current.resume();
        }
    };

    useEffect(() => {
        if (!pannerRef.current || !contextRef.current) {
            return;
        }

        const time = contextRef.current.currentTime;

        pannerRef.current.positionX.setTargetAtTime(
            x, time, 0.05
        );

        pannerRef.current.positionY.setTargetAtTime(
            y, time, 0.05
        );

        pannerRef.current.positionZ.setTargetAtTime(
            z, time, 0.05
        );

    }, [x, y, z]);

    useEffect(() => {
        if (gainRef.current && contextRef.current) {
            gainRef.current.gain.setTargetAtTime(
                volume,
                contextRef.current.currentTime,
                0.05
            );
        }
    }, [volume]);

    const handlePlay = async () => {
        if (!selectedId) {
            setMessage("Select an audio asset first.");
            return;
        }

        if (playing) {
            audioRef.current.pause();
            return;
        }

        const requestId = ++requestRef.current;

        setLoading(true);
        setMessage("");

        try {
            await initializeAudio();

            if (loadedIdRef.current !== selectedId) {
                const response = await api.get(
                    `/assets/${selectedId}/stream`,
                    { responseType: "blob" }
                );

                if (requestId !== requestRef.current) {
                    return;
                }

                if (urlRef.current) {
                    URL.revokeObjectURL(urlRef.current);
                }

                const url = URL.createObjectURL(
                    response.data
                );

                urlRef.current = url;
                audioRef.current.src = url;
                loadedIdRef.current = selectedId;
            }

            if (requestId !== requestRef.current) return;

            await audioRef.current.play();

        } catch {
            if (requestId === requestRef.current) {
                setMessage("Unable to play audio.");
            }
        } finally {
            if (requestId === requestRef.current) {
                setLoading(false);
            }
        }
    };

    const changeAsset = (id) => {
        requestRef.current++;

        audioRef.current.pause();

        setSelectedId(id);
        setPlaying(false);
        setLoading(false);
        setMessage("");
    };

    const resetPosition = () => {
        setX(0);
        setY(0);
        setZ(-2);
    };

    const moveSource = (event) => {
        const bounds =
            event.currentTarget.getBoundingClientRect();

        const newX =
            ((event.clientX - bounds.left) /
                bounds.width) * 10 - 5;

        const newZ =
            ((event.clientY - bounds.top) /
                bounds.height) * 10 - 5;

        setX(Math.max(-5, Math.min(5, newX)));
        setZ(Math.max(-5, Math.min(5, newZ)));
    };

    const distance = Math.sqrt(
        x * x + y * y + z * z
    );

    const selectedAsset = assets.find(
        (asset) => asset._id === selectedId
    );

    return (
        <div className="spatial-page">

            <header className="spatial-nav">
                <Link to="/dashboard" className="spatial-logo">
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

            <main className="spatial-main">

                <div className="spatial-heading">
                    <span>NC / EXPERIMENT 01</span>

                    <h1>Sound in space.</h1>

                    <p>
                        Explore how sound behaves in a
                        three-dimensional environment.
                    </p>
                </div>

                <div className="headphone-notice">
                    <Headphones size={25} />

                    <span>
                        Use stereo headphones for the
                        best spatial audio experience.
                    </span>
                </div>

                <div className="spatial-layout">

                    <section className="spatial-stage">

                        <div className="stage-header">
                            <strong>01 / VIRTUAL SOUND FIELD</strong>
                            <span>TOP VIEW</span>
                        </div>

                        <div
                            className="sound-field"
                            onPointerDown={(event) => {
                                event.currentTarget
                                    .setPointerCapture(event.pointerId);

                                moveSource(event);
                            }}
                            onPointerMove={(event) => {
                                if (
                                    event.currentTarget
                                        .hasPointerCapture(event.pointerId)
                                ) {
                                    moveSource(event);
                                }
                            }}
                        >

                            <div className="field-ring ring-one" />
                            <div className="field-ring ring-two" />
                            <div className="field-ring ring-three" />

                            <span className="field-front">FRONT</span>
                            <span className="field-back">BACK</span>
                            <span className="field-left">L</span>
                            <span className="field-right">R</span>

                            <svg
                                className="field-connection"
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                            >
                                <line
                                    x1="50"
                                    y1="50"
                                    x2={(x + 5) * 10}
                                    y2={(z + 5) * 10}
                                    stroke="#161616"
                                    strokeWidth="0.5"
                                    strokeDasharray="2 2"
                                />
                            </svg>

                            <div className="listener">
                                <Headphones size={25} />
                                <span>YOU</span>
                            </div>

                            <div
                                className={
                                    `sound-source ${
                                        playing ? "source-active" : ""
                                    }`
                                }
                                style={{
                                    left: `${(x + 5) * 10}%`,
                                    top: `${(z + 5) * 10}%`
                                }}
                            >
                                <Volume2 size={25} />
                            </div>

                        </div>

                        <div className="stage-footer">
                            Click or drag to move the sound source.
                        </div>

                    </section>

                    <section className="spatial-controls">

                        <div className="control-header">
                            02 / AUDIO CONTROLS
                        </div>

                        <div className="control-body">

                            <label>Audio asset</label>

                            <select
                                value={selectedId}
                                onChange={(e) =>
                                    changeAsset(e.target.value)
                                }
                            >
                                {assets.length === 0 && (
                                    <option value="">
                                        No audio assets available
                                    </option>
                                )}

                                {assets.map((asset) => (
                                    <option
                                        key={asset._id}
                                        value={asset._id}
                                    >
                                        {asset.title}
                                    </option>
                                ))}
                            </select>

                            <div className="spatial-range">
                                <label>
                                    X — Left / Right
                                    <strong>{x.toFixed(1)} m</strong>
                                </label>

                                <input
                                    type="range"
                                    min="-5"
                                    max="5"
                                    step="0.1"
                                    value={x}
                                    onChange={(e) =>
                                        setX(Number(e.target.value))
                                    }
                                />
                            </div>

                            <div className="spatial-range">
                                <label>
                                    Y — Height
                                    <strong>{y.toFixed(1)} m</strong>
                                </label>

                                <input
                                    type="range"
                                    min="-5"
                                    max="5"
                                    step="0.1"
                                    value={y}
                                    onChange={(e) =>
                                        setY(Number(e.target.value))
                                    }
                                />
                            </div>

                            <div className="spatial-range">
                                <label>
                                    Z — Front / Back
                                    <strong>{z.toFixed(1)} m</strong>
                                </label>

                                <input
                                    type="range"
                                    min="-5"
                                    max="5"
                                    step="0.1"
                                    value={z}
                                    onChange={(e) =>
                                        setZ(Number(e.target.value))
                                    }
                                />
                            </div>

                            <div className="spatial-range">
                                <label>
                                    Volume
                                    <strong>
                                        {Math.round(volume * 100)}%
                                    </strong>
                                </label>

                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={volume}
                                    onChange={(e) =>
                                        setVolume(Number(e.target.value))
                                    }
                                />
                            </div>

                            <button
                                className="neo-button coral full-width"
                                onClick={handlePlay}
                                disabled={loading || !selectedId}
                            >
                                {playing
                                    ? <Pause size={20} />
                                    : <Play size={20} />
                                }

                                {loading
                                    ? "Loading audio..."
                                    : playing
                                        ? "Pause simulation"
                                        : "Play spatial audio"
                                }
                            </button>

                            <button
                                className="neo-button yellow full-width"
                                onClick={resetPosition}
                            >
                                <RotateCcw size={18} />
                                Reset position
                            </button>

                            {message && (
                                <p role="status">{message}</p>
                            )}

                        </div>

                    </section>

                </div>

                <section className="spatial-metrics">

                    <div className="spatial-stat lime">
                        <span>DISTANCE FROM LISTENER</span>
                        <strong>{distance.toFixed(2)} m</strong>
                    </div>

                    <div className="spatial-stat yellow">
                        <span>SOURCE DIRECTION</span>

                        <strong>
                            {x < 0
                                ? "Left"
                                : x > 0
                                    ? "Right"
                                    : "Centre"
                            }
                            {" / "}
                            {z < 0
                                ? "Front"
                                : z > 0
                                    ? "Back"
                                    : "Level"
                            }
                        </strong>
                    </div>

                    <div className="spatial-stat lavender">
                        <span>SPATIAL AUDIO ENGINE</span>
                        <strong>HRTF</strong>
                    </div>

                </section>

                <div className="spatial-track">
                    <AudioLines size={24} />

                    <span>
                        Selected asset:{" "}
                        <strong>
                            {selectedAsset?.title || "None"}
                        </strong>
                    </span>
                </div>

                <audio
                    ref={audioRef}
                    loop
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onError={() => {
                        setPlaying(false);
                        setMessage("Audio playback error.");
                    }}
                />

            </main>

        </div>
    );
}

export default SpatialLab;
