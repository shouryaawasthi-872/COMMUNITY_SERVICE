
const express = require("express");

const Asset = require("../models/Asset");
const protect = require("../middleware/authMiddleware");

const {
    generateFileHash,
    generateRecordHash
} = require("../utils/hash");

const router = express.Router();

router.get("/", protect, async (req, res) => {
    try {
        const records = await Asset.find()
            .select("-filePath")
            .populate("owner", "name")
            .sort({
                createdAt: 1,
                _id: 1
            });

        res.json(records);

    } catch (error) {
        res.status(500).json({
            message: "Unable to retrieve registry."
        });
    }
});

router.get("/verify", protect, async (req, res) => {
    try {
        const records = await Asset.find()
            .sort({
                createdAt: 1,
                _id: 1
            });

        let expectedPreviousHash = "GENESIS";

        const results = [];

        for (const record of records) {

            const linkValid =
                record.previousRecordHash ===
                expectedPreviousHash;

            const calculatedRecordHash =
                generateRecordHash({
                    title: record.title,
                    fileHash: record.fileHash,
                    owner: record.owner.toString(),
                    previousRecordHash:
                        record.previousRecordHash
                });

            const recordValid =
                calculatedRecordHash ===
                record.recordHash;

            let fileValid = false;
            let fileError = null;

            try {
                const currentFileHash =
                    await generateFileHash(
                        record.filePath
                    );

                fileValid =
                    currentFileHash ===
                    record.fileHash;

            } catch (error) {
                fileError =
                    "Audio file missing or unreadable.";
            }

            results.push({
                assetId: record._id,
                title: record.title,
                linkValid,
                recordValid,
                fileValid,
                fileError,
                valid:
                    linkValid &&
                    recordValid &&
                    fileValid
            });

            expectedPreviousHash =
                record.recordHash;
        }

        const validRecords = results.filter(
            (record) => record.valid
        ).length;

        res.json({
            chainValid: results.every(
                (record) =>
                    record.linkValid &&
                    record.recordValid
            ),

            filesValid: results.every(
                (record) => record.fileValid
            ),

            totalRecords: records.length,

            validRecords,

            invalidRecords:
                records.length - validRecords,

            checkedAt: new Date(),

            results
        });

    } catch (error) {
        res.status(500).json({
            message: "Registry verification failed."
        });
    }
});

module.exports = router;
