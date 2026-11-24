const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            default: ""
        },

        category: {
            type: String,
            enum: [
                "Music",
                "Sound Effects",
                "Ambient",
                "Voice",
                "Other"
            ],
            default: "Other"
        },

        originalName: {
            type: String,
            required: true
        },

        fileName: {
            type: String,
            required: true
        },

        filePath: {
            type: String,
            required: true
        },

        fileSize: {
            type: Number,
            required: true
        },

        mimeType: {
            type: String,
            required: true
        },

        fileHash: {
            type: String,
            required: true
        },

        previousRecordHash: {
            type: String,
            default: "GENESIS"
        },

        recordHash: {
            type: String,
            required: true
        },

        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        playCount: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Asset", assetSchema);