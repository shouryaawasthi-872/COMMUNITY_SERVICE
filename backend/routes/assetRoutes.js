const express = require("express");
const fs = require("fs");
const Asset = require("../models/Asset");
const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const {
    generateFileHash,
    generateRecordHash
} = require("../utils/hash");

const router = express.Router();
const MAX_AUDIO_SIZE = 50 * 1024 * 1024;

// Serialize uploads within this server process
let registryQueue = Promise.resolve();

// Upload audio
router.post(
    "/upload",
    protect,
    upload.single("audio"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    message: "Please upload an audio file"
                });
            }

            const { title, description, category } = req.body;

            if (!title || !title.trim()) {
                await fs.promises.unlink(req.file.path);

                return res.status(400).json({
                    message: "Title is required"
                });
            }

            const fileHash = await generateFileHash(
                req.file.path
            );

            const task = registryQueue.then(async () => {
                const previousAsset = await Asset.findOne()
                    .sort({ createdAt: -1, _id: -1 });

                const previousRecordHash = previousAsset
                    ? previousAsset.recordHash
                    : "GENESIS";

                const recordData = {
                    title: title.trim(),
                    fileHash,
                    owner: req.user._id.toString(),
                    previousRecordHash
                };

                const recordHash = generateRecordHash(recordData);

                return Asset.create({
                    title: title.trim(),
                    description: description || "",
                    category: category || "Other",
                    originalName: req.file.originalname,
                    fileName: req.file.filename,
                    filePath: req.file.path,
                    fileSize: req.file.size,
                    mimeType: req.file.mimetype,
                    fileHash,
                    previousRecordHash,
                    recordHash,
                    owner: req.user._id
                });
            });

            registryQueue = task.catch(() => {});

            const asset = await task;

            const result = asset.toObject();
            delete result.filePath;

            res.status(201).json({
                message: "Audio uploaded successfully",
                asset: result
            });

        } catch (error) {
            if (req.file) {
                await fs.promises.unlink(req.file.path)
                    .catch(() => {});
            }

            res.status(500).json({
                message: "Audio upload failed"
            });
        }
    }
);

// Get all audio assets
router.get("/", protect, async (req, res) => {
    try {
        const assets = await Asset.find()
            .select("-filePath")
            .populate("owner", "name")
            .sort({ createdAt: -1 });

        res.json(assets);

    } catch (error) {
        res.status(500).json({
            message: "Unable to fetch audio assets"
        });
    }
});

// Verify audio integrity
router.get("/:id/verify", protect, async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id);

        if (!asset) {
            return res.status(404).json({
                message: "Audio asset not found"
            });
        }

        const currentHash = await generateFileHash(
            asset.filePath
        );

        const verified = currentHash === asset.fileHash;

        res.json({
            verified,
            originalHash: asset.fileHash,
            currentHash,
            message: verified
                ? "Audio integrity verified"
                : "Audio file has been modified"
        });

    } catch (error) {
        res.status(500).json({
            message: "Verification failed"
        });
    }
});
// Stream audio
router.get("/:id/stream", protect, async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id);

        if (!asset) {
            return res.status(404).json({
                message: "Audio asset not found"
            });
        }

        if (!fs.existsSync(asset.filePath)) {
            return res.status(404).json({
                message: "Audio file not found"
            });
        }

        const stats = await fs.promises.stat(asset.filePath);
        if (
            stats.size > MAX_AUDIO_SIZE ||
            stats.size !== asset.fileSize
        ) {
            return res.status(413).json({
                message: "Audio file size is invalid or exceeds 50 MB"
            });
        }

        res.setHeader("Content-Type", asset.mimeType);
        res.setHeader("Cache-Control", "private, no-store");

        res.sendFile(asset.filePath);

    } catch (error) {
        res.status(500).json({
            message: "Audio streaming failed"
        });
    }
});

// Track audio playback
router.post("/:id/play", protect, async (req, res) => {
    try {
        const asset = await Asset.findByIdAndUpdate(
            req.params.id,
            { $inc: { playCount: 1 } },
            { new: true }
        );

        if (!asset) {
            return res.status(404).json({
                message: "Audio asset not found"
            });
        }

        res.json({
            message: "Playback recorded",
            playCount: asset.playCount
        });

    } catch (error) {
        res.status(500).json({
            message: "Unable to record playback"
        });
    }
});
module.exports = router;