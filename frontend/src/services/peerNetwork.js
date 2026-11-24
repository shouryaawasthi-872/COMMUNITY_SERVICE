const MAX_FILE_SIZE = 50 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;
const HIGH_WATER_MARK = 1024 * 1024;
const LOW_WATER_MARK = 256 * 1024;

const hashBlob = async (blob) => {
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
};

class PeerNetwork {
    constructor(socket, onPeers, onTransfer) {
        this.socket = socket;
        this.onPeers = onPeers;
        this.onTransfer = onTransfer;
        this.peers = new Map();
        this.localAssets = new Map();
        this.pendingRequests = new Map();
        this.outgoingTransfers = new Map();
        this.roomCode = null;
        this.destroyed = false;
        this.handleSignal = this.handleSignal.bind(this);
        this.socket.on("p2p-signal", this.handleSignal);
    }

    updateRoom(room) {
        const code = room?.code || null;
        const participantIds = new Set(
            (room?.participants || [])
                .map((participant) => participant.socketId)
                .filter((id) => id && id !== this.socket.id)
        );

        if (code !== this.roomCode) {
            this.localAssets.clear();
            this.roomCode = code;
        }

        for (const [peerId, peer] of this.peers) {
            if (!participantIds.has(peerId)) {
                this.closePeer(peer);
                this.peers.delete(peerId);
            }
        }

        if (!code) {
            this.localAssets.clear();
            this._publishPeers();
            return;
        }

        for (const participant of room.participants || []) {
            if (participant.socketId === this.socket.id) continue;

            const peer = this._ensurePeer(
                participant.socketId,
                participant.name
            );

            if (
                this.socket.id < participant.socketId &&
                !peer.offerStarted
            ) {
                peer.offerStarted = true;
                this._createOffer(peer);
            }
        }

        this._publishPeers();
    }

    setLocalAsset(assetId, blob, metadata) {
        if (
            !assetId ||
            !(blob instanceof Blob) ||
            blob.size > MAX_FILE_SIZE ||
            blob.size !== metadata.fileSize
        ) {
            return;
        }

        this.localAssets.set(assetId, {
            blob,
            fileHash: metadata.fileHash,
            fileSize: blob.size,
            mimeType: metadata.mimeType || blob.type || "audio/mpeg"
        });

        this._broadcastInventory();
    }

    clearLocalAsset(assetId) {
        if (assetId) {
            this.localAssets.delete(assetId);
        } else {
            this.localAssets.clear();
        }

        this._broadcastInventory();
    }

    requestAsset(asset, onProgress, discoveryTimeoutMs = 15000) {
        if (
            this.destroyed ||
            !asset?._id ||
            !/^[a-f0-9]{64}$/i.test(asset.fileHash) ||
            !Number.isSafeInteger(asset.fileSize) ||
            asset.fileSize < 1 ||
            asset.fileSize > MAX_FILE_SIZE
        ) {
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            const pending = {
                asset,
                onProgress,
                resolve,
                peerId: null,
                transfer: null,
                timer: null
            };

            pending.timer = setTimeout(() => {
                this._finishRequest(asset._id, null, {
                    status: "unavailable",
                    source: "P2P",
                    bytes: pending.transfer?.received || 0,
                    total: asset.fileSize,
                    verified: false
                });
            }, discoveryTimeoutMs);

            this.pendingRequests.set(asset._id, pending);
            this._dispatchRequest(pending);
        });
    }

    cancelRequest(assetId) {
        const pending = this.pendingRequests.get(assetId);
        if (!pending) return;

        if (pending.transfer && pending.peerId) {
            const peer = this.peers.get(pending.peerId);
            this._sendControl(peer, {
                type: "transfer-cancel",
                assetId,
                transferId: pending.transfer.transferId
            });
        }

        this._finishRequest(assetId, null, {
            status: "cancelled",
            source: "P2P",
            bytes: pending.transfer?.received || 0,
            total: pending.asset.fileSize,
            verified: false
        });
    }

    destroy() {
        this.destroyed = true;
        this.socket.off("p2p-signal", this.handleSignal);

        for (const assetId of this.pendingRequests.keys()) {
            this._finishRequest(assetId, null, {
                status: "cancelled",
                source: "P2P",
                verified: false
            });
        }

        for (const peer of this.peers.values()) {
            this.closePeer(peer);
        }

        this.peers.clear();
        this.localAssets.clear();
        this._publishPeers();
    }

    closePeer(peer) {
        peer.channel?.close();
        peer.pc.close();
    }

    handleSignal({ fromSocketId, fromName, signal, roomCode } = {}) {
        if (
            this.destroyed ||
            !fromSocketId ||
            roomCode !== this.roomCode ||
            !signal
        ) {
            return;
        }

        const peer = this._ensurePeer(fromSocketId, fromName);
        this._applySignal(peer, signal);
    }

    _ensurePeer(socketId, name) {
        let peer = this.peers.get(socketId);
        if (peer) {
            if (name) peer.name = name;
            return peer;
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        peer = {
            socketId,
            name: name || "Room peer",
            pc,
            channel: null,
            inventory: [],
            candidateQueue: [],
            offerStarted: false,
            status: "connecting",
            transferredBytes: 0
        };

        this.peers.set(socketId, peer);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this._sendSignal(peer, {
                    type: "candidate",
                    candidate: event.candidate.toJSON()
                });
            }
        };

        pc.ondatachannel = (event) => {
            this._setupChannel(peer, event.channel);
        };

        pc.onconnectionstatechange = () => {
            if (!this.peers.has(socketId)) return;

            peer.status = pc.connectionState;
            this._publishPeers();

            if (["failed", "closed"].includes(pc.connectionState)) {
                this._failPeerRequests(socketId);
            }
        };

        this._publishPeers();
        return peer;
    }

    async _createOffer(peer) {
        try {
            peer.channel = peer.pc.createDataChannel(
                "novacore-audio",
                { ordered: true }
            );
            this._setupChannel(peer, peer.channel);

            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            this._sendSignal(peer, peer.pc.localDescription);
        } catch {
            peer.status = "failed";
            this._publishPeers();
            this._failPeerRequests(peer.socketId);
        }
    }

    async _applySignal(peer, signal) {
        try {
            if (signal.type === "offer" || signal.type === "answer") {
                await peer.pc.setRemoteDescription(signal);

                for (const candidate of peer.candidateQueue.splice(0)) {
                    await peer.pc.addIceCandidate(candidate);
                }

                if (signal.type === "offer") {
                    const answer = await peer.pc.createAnswer();
                    await peer.pc.setLocalDescription(answer);
                    this._sendSignal(peer, peer.pc.localDescription);
                }
                return;
            }

            if (signal.type === "candidate") {
                if (peer.pc.remoteDescription) {
                    await peer.pc.addIceCandidate(signal.candidate);
                } else {
                    peer.candidateQueue.push(signal.candidate);
                }
            }
        } catch {
            peer.status = "failed";
            this._publishPeers();
            this._failPeerRequests(peer.socketId);
        }
    }

    _sendSignal(peer, signal) {
        if (!this.socket.connected || !this.roomCode) return;

        this.socket.emit(
            "p2p-signal",
            {
                targetSocketId: peer.socketId,
                signal
            },
            (response) => {
                if (!response?.success) {
                    peer.status = "failed";
                    this._publishPeers();
                    this._failPeerRequests(peer.socketId);
                }
            }
        );
    }

    _setupChannel(peer, channel) {
        peer.channel = channel;
        channel.binaryType = "arraybuffer";
        channel.bufferedAmountLowThreshold = LOW_WATER_MARK;

        channel.onopen = () => {
            peer.status = "connected";
            this._sendInventory(peer);
            this._publishPeers();

            for (const pending of this.pendingRequests.values()) {
                this._dispatchRequest(pending);
            }
        };

        channel.onclose = () => {
            if (peer.channel === channel) {
                peer.status = peer.pc.connectionState;
                this._publishPeers();
                this._failPeerRequests(peer.socketId);
            }
        };

        channel.onerror = () => {
            peer.status = "failed";
            this._publishPeers();
            this._failPeerRequests(peer.socketId);
        };

        channel.onmessage = (event) => {
            this._handleData(peer, event.data).catch(() => {
                this._failPeerRequests(peer.socketId);
            });
        };
    }

    _sendInventory(peer) {
        this._sendControl(peer, {
            type: "inventory",
            assets: Array.from(this.localAssets, ([assetId, asset]) => ({
                assetId,
                fileHash: asset.fileHash,
                fileSize: asset.fileSize
            }))
        });
    }

    _broadcastInventory() {
        for (const peer of this.peers.values()) {
            this._sendInventory(peer);
        }

        for (const pending of this.pendingRequests.values()) {
            this._dispatchRequest(pending);
        }
    }

    _dispatchRequest(pending) {
        if (pending.peerId || this.destroyed) return;

        const peer = Array.from(this.peers.values()).find(
            (candidate) =>
                candidate.channel?.readyState === "open" &&
                candidate.inventory.some((asset) =>
                    asset.assetId === pending.asset._id &&
                    asset.fileHash === pending.asset.fileHash &&
                    asset.fileSize === pending.asset.fileSize
                )
        );

        if (!peer) return;

        pending.peerId = peer.socketId;
        const sent = this._sendControl(peer, {
            type: "asset-request",
            assetId: pending.asset._id,
            fileHash: pending.asset.fileHash,
            fileSize: pending.asset.fileSize
        });
        if (!sent) {
            pending.peerId = null;
            return;
        }

        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => {
            this._finishRequest(pending.asset._id, null, {
                status: "failed",
                source: "P2P",
                bytes: pending.transfer?.received || 0,
                total: pending.asset.fileSize,
                verified: false
            });
        }, 60000);

        this._emitTransfer(pending, {
            status: "requesting",
            source: "P2P",
            peerName: peer.name,
            bytes: 0,
            total: pending.asset.fileSize,
            verified: null
        });
    }

    _sendControl(peer, message) {
        if (peer?.channel?.readyState !== "open") return false;

        try {
            peer.channel.send(JSON.stringify(message));
            return true;
        } catch {
            return false;
        }
    }

    async _handleData(peer, data) {
        if (typeof data !== "string") {
            await this._handleChunk(peer, data);
            return;
        }

        if (data.length > 8192) return;

        let message;
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }

        if (message.type === "inventory" && Array.isArray(message.assets)) {
            peer.inventory = message.assets
                .filter((asset) =>
                    asset &&
                    typeof asset.assetId === "string" &&
                    typeof asset.fileHash === "string" &&
                    Number.isSafeInteger(asset.fileSize) &&
                    asset.fileSize > 0 &&
                    asset.fileSize <= MAX_FILE_SIZE
                )
                .slice(0, 100);

            for (const pending of this.pendingRequests.values()) {
                this._dispatchRequest(pending);
            }
            return;
        }

        if (message.type === "asset-request") {
            await this._sendAsset(peer, message);
            return;
        }

        if (message.type === "transfer-cancel") {
            const outgoing = this.outgoingTransfers.get(message.transferId);
            if (outgoing) outgoing.cancelled = true;
            return;
        }

        const pending = this.pendingRequests.get(message.assetId);
        if (!pending || pending.peerId !== peer.socketId) return;

        if (message.type === "transfer-start") {
            if (
                pending.transfer ||
                typeof message.transferId !== "string" ||
                message.fileHash !== pending.asset.fileHash ||
                message.fileSize !== pending.asset.fileSize ||
                (
                    pending.asset.mimeType &&
                    message.mimeType !== pending.asset.mimeType
                ) ||
                message.fileSize > MAX_FILE_SIZE
            ) {
                this._finishRequest(message.assetId, null, {
                    status: "failed",
                    source: "P2P",
                    bytes: 0,
                    total: pending.asset.fileSize,
                    verified: false
                });
                return;
            }

            pending.transfer = {
                transferId: message.transferId,
                chunks: [],
                received: 0,
                mimeType: message.mimeType
            };

            this._emitTransfer(pending, {
                status: "receiving",
                source: "P2P",
                peerName: peer.name,
                bytes: 0,
                total: pending.asset.fileSize,
                verified: null
            });
            return;
        }

        if (
            message.transferId !== pending.transfer?.transferId
        ) {
            return;
        }

        if (message.type === "transfer-end") {
            await this._completeTransfer(peer, pending);
        } else if (message.type === "transfer-error") {
            this._finishRequest(message.assetId, null, {
                status: "failed",
                source: "P2P",
                bytes: pending.transfer.received,
                total: pending.asset.fileSize,
                verified: false
            });
        }
    }

    async _handleChunk(peer, data) {
        const pending = Array.from(this.pendingRequests.values())
            .find((request) =>
                request.peerId === peer.socketId && request.transfer
            );
        if (!pending) return;

        const chunk = data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : ArrayBuffer.isView(data)
                ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
                : null;

        if (
            !chunk ||
            chunk.byteLength < 1 ||
            chunk.byteLength > CHUNK_SIZE ||
            pending.transfer.received + chunk.byteLength >
                pending.asset.fileSize
        ) {
            this._finishRequest(pending.asset._id, null, {
                status: "failed",
                source: "P2P",
                bytes: pending.transfer.received,
                total: pending.asset.fileSize,
                verified: false
            });
            return;
        }

        pending.transfer.chunks.push(chunk);
        pending.transfer.received += chunk.byteLength;
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => {
            this._finishRequest(pending.asset._id, null, {
                status: "failed",
                source: "P2P",
                bytes: pending.transfer?.received || 0,
                total: pending.asset.fileSize,
                verified: false
            });
        }, 30000);
        peer.transferredBytes += chunk.byteLength;
        this._publishPeers();

        this._emitTransfer(pending, {
            status: "receiving",
            source: "P2P",
            peerName: peer.name,
            bytes: pending.transfer.received,
            total: pending.asset.fileSize,
            verified: null
        });
    }

    async _completeTransfer(peer, pending) {
        const transfer = pending.transfer;
        if (
            !transfer ||
            transfer.received !== pending.asset.fileSize
        ) {
            this._finishRequest(pending.asset._id, null, {
                status: "failed",
                source: "P2P",
                bytes: transfer?.received || 0,
                total: pending.asset.fileSize,
                verified: false
            });
            return;
        }

        const chunks = transfer.chunks;
        transfer.chunks = [];
        const blob = new Blob(chunks, {
            type: pending.asset.mimeType || transfer.mimeType || "audio/mpeg"
        });
        chunks.length = 0;
        const actualHash = await hashBlob(blob);
        const verified = actualHash === pending.asset.fileHash;

        if (!verified) {
            this._finishRequest(pending.asset._id, null, {
                status: "failed",
                source: "P2P",
                bytes: transfer.received,
                total: pending.asset.fileSize,
                verified: false
            });
            return;
        }

        this.setLocalAsset(pending.asset._id, blob, {
            fileHash: actualHash,
            fileSize: blob.size,
            mimeType: blob.type
        });

        this._finishRequest(pending.asset._id, blob, {
            status: "verified",
            source: "P2P",
            peerName: peer.name,
            bytes: transfer.received,
            total: pending.asset.fileSize,
            verified: true,
            hash: actualHash
        });
    }

    async _sendAsset(peer, request) {
        const asset = this.localAssets.get(request.assetId);
        if (
            !asset ||
            request.fileHash !== asset.fileHash ||
            request.fileSize !== asset.fileSize ||
            asset.fileSize > MAX_FILE_SIZE ||
            peer.sending ||
            peer.channel?.readyState !== "open"
        ) {
            return;
        }

        const transferId = crypto.randomUUID();
        const outgoing = { cancelled: false };
        let sent = 0;

        if (!this._sendControl(peer, {
            type: "transfer-start",
            assetId: request.assetId,
            transferId,
            fileHash: asset.fileHash,
            fileSize: asset.fileSize,
            mimeType: asset.mimeType
        })) {
            return;
        }

        peer.sending = true;
        this.outgoingTransfers.set(transferId, outgoing);
        this._emitTransfer(null, {
            status: "sending",
            source: "P2P",
            peerName: peer.name,
            assetId: request.assetId,
            bytes: 0,
            total: asset.fileSize,
            verified: null
        });

        try {
            for (let offset = 0; offset < asset.fileSize; offset += CHUNK_SIZE) {
                if (
                    outgoing.cancelled ||
                    peer.channel?.readyState !== "open"
                ) {
                    throw new Error("Peer disconnected");
                }

                await this._waitForDrain(peer.channel);
                const chunk = await asset.blob
                    .slice(offset, offset + CHUNK_SIZE)
                    .arrayBuffer();

                peer.channel.send(chunk);
                sent += chunk.byteLength;
                peer.transferredBytes += chunk.byteLength;
                this._publishPeers();

                this._emitTransfer(null, {
                    status: "sending",
                    source: "P2P",
                    peerName: peer.name,
                    assetId: request.assetId,
                    bytes: sent,
                    total: asset.fileSize,
                    verified: null
                });
            }

            this._sendControl(peer, {
                type: "transfer-end",
                assetId: request.assetId,
                transferId
            });

            this._emitTransfer(null, {
                status: "sent",
                source: "P2P",
                peerName: peer.name,
                assetId: request.assetId,
                bytes: sent,
                total: asset.fileSize,
                verified: null
            });
        } catch {
            if (!outgoing.cancelled) {
                this._sendControl(peer, {
                    type: "transfer-error",
                    assetId: request.assetId,
                    transferId
                });
                this._emitTransfer(null, {
                    status: "failed",
                    source: "P2P",
                    peerName: peer.name,
                    assetId: request.assetId,
                    bytes: sent,
                    total: asset.fileSize,
                    verified: false
                });
            }
        } finally {
            this.outgoingTransfers.delete(transferId);
            peer.sending = false;
        }
    }

    _waitForDrain(channel) {
        if (
            channel.readyState !== "open" ||
            channel.bufferedAmount <= HIGH_WATER_MARK
        ) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timeout);
                channel.removeEventListener(
                    "bufferedamountlow",
                    onLow
                );
                channel.removeEventListener("close", onClose);
            };
            const onLow = () => {
                cleanup();
                resolve();
            };
            const onClose = () => {
                cleanup();
                reject(new Error("Peer disconnected"));
            };
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("Data channel backpressure timeout"));
            }, 15000);

            channel.addEventListener("bufferedamountlow", onLow);
            channel.addEventListener("close", onClose);

            if (channel.bufferedAmount <= LOW_WATER_MARK) {
                onLow();
            }
        });
    }

    _failPeerRequests(peerId) {
        for (const [assetId, pending] of this.pendingRequests) {
            if (pending.peerId !== peerId) continue;

            pending.peerId = null;
            pending.transfer = null;
            this._dispatchRequest(pending);

            if (!pending.peerId && pending.timer) {
                clearTimeout(pending.timer);
                pending.timer = setTimeout(() => {
                    this._finishRequest(assetId, null, {
                        status: "failed",
                        source: "P2P",
                        verified: false
                    });
                }, 3000);
            }
        }
    }

    _finishRequest(assetId, blob, result) {
        const pending = this.pendingRequests.get(assetId);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pendingRequests.delete(assetId);
        this._emitTransfer(pending, result);
        pending.resolve(blob);
    }

    _emitTransfer(pending, result) {
        const detail = {
            ...result,
            assetId: result.assetId || pending?.asset._id
        };

        this.onTransfer?.(detail);
        pending?.onProgress?.(detail);
    }

    _publishPeers() {
        this.onPeers?.(
            Array.from(this.peers.values(), (peer) => ({
                socketId: peer.socketId,
                name: peer.name,
                status: peer.status,
                transferredBytes: peer.transferredBytes
            }))
        );
    }
}

export default PeerNetwork;
