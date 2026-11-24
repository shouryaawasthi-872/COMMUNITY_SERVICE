
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import {
    AudioLines,
    ArrowLeft,
    ArrowDown,
    ShieldCheck,
    ShieldAlert,
    Database,
    Fingerprint,
    Link2,
    Copy,
    RefreshCw,
    CheckCircle,
    XCircle,
    ChevronDown,
    ChevronUp
} from "lucide-react";

import api from "../services/api";
import "../Registry.css";

function Registry() {
    const [records, setRecords] = useState([]);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [expanded, setExpanded] = useState({});
    const [message, setMessage] = useState("");

    const fetchRecords = async () => {
        setLoading(true);
        setReport(null);
        setMessage("");

        try {
            const response = await api.get("/registry");
            setRecords(response.data);

        } catch {
            setMessage("Unable to load registry.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, []);

    const verifyRegistry = async () => {
        setVerifying(true);
        setMessage("");
        setReport(null);

        try {
            const response = await api.get(
                "/registry/verify"
            );

            setReport(response.data);

            setMessage(
                response.data.totalRecords === 0
                    ? "The registry is empty."
                    : response.data.chainValid &&
                      response.data.filesValid
                        ? "All registry records and audio files are intact."
                        : "Integrity issues detected. Inspect the records below."
            );

        } catch {
            setMessage("Registry verification failed.");
        } finally {
            setVerifying(false);
        }
    };

    const copyHash = async (hash) => {
        try {
            await navigator.clipboard.writeText(hash);
            setMessage("Hash copied to clipboard.");
        } catch {
            setMessage("Unable to copy hash.");
        }
    };

    const toggleRecord = (id) => {
        setExpanded((previous) => ({
            ...previous,
            [id]: !previous[id]
        }));
    };

    const shortenHash = (hash) => {
        if (!hash) return "Unavailable";

        if (hash.length <= 20) return hash;

        return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
    };

    const getResult = (id) => {
        return report?.results.find(
            (item) => item.assetId === id
        );
    };

    const chainStatus = !report
        ? "Unchecked"
        : report.totalRecords === 0
            ? "Empty"
            : report.chainValid
                ? "Intact"
                : "Broken";

    const fileStatus = !report
        ? "Unchecked"
        : report.totalRecords === 0
            ? "Empty"
            : report.filesValid
                ? "Intact"
                : "Issues found";

    const colors = [
        "#c4b5fd",
        "#ff795d",
        "#d4ed91",
        "#ffd65a"
    ];

    return (
        <div className="registry-page">

            <header className="registry-nav">

                <Link
                    to="/dashboard"
                    className="registry-logo"
                >
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

            <main className="registry-main">

                <section className="registry-hero">

                    <div>
                        <span className="registry-kicker">
                            NC / TRUST INFRASTRUCTURE
                        </span>

                        <h1>Trust the sound.</h1>

                        <p>
                            Every sound has a fingerprint.
                            Every record has a history.
                        </p>
                    </div>

                    <div className="registry-hero-art">
                        <Fingerprint
                            size={120}
                            strokeWidth={1.2}
                        />

                        <strong>SHA-256</strong>
                    </div>

                </section>

                <section className="registry-stats">

                    <div className="registry-stat lavender">
                        <Database size={25} />
                        <span>TOTAL RECORDS</span>
                        <strong>{records.length}</strong>
                    </div>

                    <div className={
                        `registry-stat ${
                            report && !report.chainValid
                                ? "coral"
                                : "lime"
                        }`
                    }>
                        <Link2 size={25} />
                        <span>CHAIN STATUS</span>
                        <strong>{chainStatus}</strong>
                    </div>

                    <div className={
                        `registry-stat ${
                            report && !report.filesValid
                                ? "coral"
                                : "yellow"
                        }`
                    }>
                        <ShieldCheck size={25} />
                        <span>FILE INTEGRITY</span>
                        <strong>{fileStatus}</strong>
                    </div>

                </section>

                <section className="registry-actions">

                    <div>
                        <h2>Registry explorer.</h2>

                        <p>
                            Inspect and validate linked
                            audio asset records.
                        </p>
                    </div>

                    <div className="registry-buttons">

                        <button
                            className="neo-icon-button"
                            onClick={fetchRecords}
                            disabled={loading || verifying}
                            aria-label="Refresh registry"
                        >
                            <RefreshCw size={20} />
                        </button>

                        <button
                            className="neo-button coral"
                            onClick={verifyRegistry}
                            disabled={verifying || loading}
                        >
                            <ShieldCheck size={20} />

                            {verifying
                                ? "Checking registry..."
                                : "Verify entire registry"}
                        </button>

                    </div>

                </section>

                {message && (
                    <div
                        className="registry-message"
                        role="status"
                    >
                        {message}
                    </div>
                )}

                {report && (
                    <div className={
                        `registry-report ${
                            report.chainValid &&
                            report.filesValid
                                ? "lime"
                                : "coral"
                        }`
                    }>

                        {report.chainValid &&
                         report.filesValid
                            ? <ShieldCheck size={35} />
                            : <ShieldAlert size={35} />
                        }

                        <div>
                            <h3>
                                {report.validRecords} of{" "}
                                {report.totalRecords} records
                                passed verification
                            </h3>

                            <p>
                                Checked at{" "}
                                {new Date(
                                    report.checkedAt
                                ).toLocaleString()}
                            </p>
                        </div>

                    </div>
                )}

                {loading ? (

                    <p>Loading registry records...</p>

                ) : (

                    <div className="registry-chain">

                        <article className="genesis-block">

                            <div className="block-number">
                                00
                            </div>

                            <div>
                                <span>REGISTRY ORIGIN</span>
                                <h2>GENESIS</h2>

                                <p>
                                    Starting point of the
                                    audio asset registry.
                                </p>
                            </div>

                            <Database size={35} />

                        </article>

                        {records.length === 0 && (
                            <div className="registry-empty">
                                No registry records to display.
                            </div>
                        )}

                        {records.map((record, index) => {

                            const result =
                                getResult(record._id);

                            return (
                                <div key={record._id}>

                                    <div className="chain-connector">

                                        <ArrowDown size={28} />

                                        <span>
                                            PREVIOUS HASH LINK
                                        </span>

                                    </div>

                                    <article className="registry-block">

                                        <div
                                            className="registry-block-header"
                                            style={{
                                                background:
                                                    colors[
                                                        index %
                                                        colors.length
                                                    ]
                                            }}
                                        >

                                            <div className="block-number">
                                                {String(index + 1)
                                                    .padStart(2, "0")}
                                            </div>

                                            <div className="block-title">

                                                <span>
                                                    AUDIO ASSET RECORD
                                                </span>

                                                <h2>{record.title}</h2>

                                            </div>

                                            {result ? (
                                                result.valid ? (
                                                    <CheckCircle size={28} />
                                                ) : (
                                                    <XCircle size={28} />
                                                )
                                            ) : (
                                                <Fingerprint size={28} />
                                            )}

                                        </div>

                                        <div className="registry-block-body">

                                            <div className="registry-meta">

                                                <div>
                                                    <label>OWNER</label>

                                                    <strong>
                                                        {record.owner?.name ||
                                                            "Unknown"}
                                                    </strong>
                                                </div>

                                                <div>
                                                    <label>CATEGORY</label>

                                                    <strong>
                                                        {record.category}
                                                    </strong>
                                                </div>

                                                <div>
                                                    <label>REGISTERED</label>

                                                    <strong>
                                                        {new Date(
                                                            record.createdAt
                                                        ).toLocaleDateString()}
                                                    </strong>
                                                </div>

                                            </div>

                                            <div className="registry-hash">

                                                <label>RECORD HASH</label>

                                                <div>
                                                    <code>
                                                        {shortenHash(
                                                            record.recordHash
                                                        )}
                                                    </code>

                                                    <button
                                                        onClick={() =>
                                                            copyHash(
                                                                record.recordHash
                                                            )
                                                        }
                                                        aria-label="Copy record hash"
                                                    >
                                                        <Copy size={17} />
                                                    </button>
                                                </div>

                                            </div>

                                            <div className="registry-hash">

                                                <label>
                                                    PREVIOUS RECORD HASH
                                                </label>

                                                <div>
                                                    <code>
                                                        {shortenHash(
                                                            record.previousRecordHash
                                                        )}
                                                    </code>

                                                    <button
                                                        onClick={() =>
                                                            copyHash(
                                                                record.previousRecordHash
                                                            )
                                                        }
                                                        aria-label="Copy previous hash"
                                                    >
                                                        <Copy size={17} />
                                                    </button>
                                                </div>

                                            </div>

                                            {result && (
                                                <div className="registry-checks">

                                                    {[
                                                        {
                                                            label: "Chain link",
                                                            valid: result.linkValid
                                                        },
                                                        {
                                                            label: "Record hash",
                                                            valid: result.recordValid
                                                        },
                                                        {
                                                            label: "Audio file",
                                                            valid: result.fileValid
                                                        }
                                                    ].map((check) => (
                                                        <div
                                                            key={check.label}
                                                            className={
                                                                check.valid
                                                                    ? "check-pass"
                                                                    : "check-fail"
                                                            }
                                                        >

                                                            {check.valid
                                                                ? <CheckCircle size={16} />
                                                                : <XCircle size={16} />
                                                            }

                                                            {check.label}

                                                        </div>
                                                    ))}

                                                </div>
                                            )}

                                            {result?.fileError && (
                                                <p className="registry-file-error">
                                                    {result.fileError}
                                                </p>
                                            )}

                                            <button
                                                className="registry-expand"
                                                onClick={() =>
                                                    toggleRecord(record._id)
                                                }
                                                aria-expanded={
                                                    !!expanded[record._id]
                                                }
                                            >

                                                {expanded[record._id]
                                                    ? "Hide full details"
                                                    : "Inspect full record"}

                                                {expanded[record._id]
                                                    ? <ChevronUp size={18} />
                                                    : <ChevronDown size={18} />
                                                }

                                            </button>

                                            {expanded[record._id] && (

                                                <div className="registry-details">

                                                    {[
                                                        [
                                                            "ASSET ID",
                                                            record._id
                                                        ],
                                                        [
                                                            "FILE FINGERPRINT",
                                                            record.fileHash
                                                        ],
                                                        [
                                                            "RECORD HASH",
                                                            record.recordHash
                                                        ],
                                                        [
                                                            "PREVIOUS HASH",
                                                            record.previousRecordHash
                                                        ],
                                                        [
                                                            "ORIGINAL FILE",
                                                            record.originalName
                                                        ]
                                                    ].map(([label, value]) => (

                                                        <div key={label}>
                                                            <label>{label}</label>
                                                            <code>{value}</code>
                                                        </div>

                                                    ))}

                                                </div>

                                            )}

                                        </div>

                                    </article>

                                </div>
                            );
                        })}

                    </div>

                )}

                <footer className="registry-footer">
                    NOVACORE / HASH-LINKED ASSET REGISTRY
                </footer>

            </main>

        </div>
    );
}

export default Registry;
