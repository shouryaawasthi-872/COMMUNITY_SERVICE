const crypto = require("crypto");
const fs = require("fs");

const generateFileHash = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);

        stream.on("data", (chunk) => {
            hash.update(chunk);
        });

        stream.on("end", () => {
            resolve(hash.digest("hex"));
        });

        stream.on("error", reject);
    });
};

const generateRecordHash = (data) => {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
};

module.exports = {
    generateFileHash,
    generateRecordHash
};