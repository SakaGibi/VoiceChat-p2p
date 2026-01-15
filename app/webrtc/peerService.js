// peerService.js - WebRTC P2P Connection Management
const SimplePeer = require('simple-peer');
const state = require('../state/appState');
const dom = require('../ui/dom');

/**
 * @param {string} targetId - user to be connected
 * @param {string} name - user name
 * @param {boolean} initiator - is it the initiator of the connection
 */
// Creates a new P2P connection
function createPeer(targetId, name, initiator) {
    if (targetId === state.myPeerId || state.peers[targetId]) return;

    const socketService = require('../socket/socketService');
    const audioEngine = require('../audio/audioEngine');
    const userList = require('../ui/userList');
    const chatService = require('../chat/chatService');
    const fileTransfer = require('../files/fileTransfer');

    try {
        const peer = new SimplePeer({
            initiator: initiator,
            stream: state.processedStream,
            trickle: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        // Signaling
        peer.on('signal', signal => {
            socketService.send({
                type: 'signal',
                targetId: targetId,
                signal: signal
            });
        });

        // Connection Status
        peer.on('connect', () => {
            const userList = require('../ui/userList');
            userList.updateUserStatusUI(targetId, true);
            // Re-send my status to ensure sync (mic/deafen)
            // This helps if they connected AFTER I set my status
            if (state.peers[targetId]) {
                state.peers[targetId].send(JSON.stringify({ type: 'mic-status', isMuted: state.isMicMuted }));
                state.peers[targetId].send(JSON.stringify({ type: 'deafen-status', isDeafened: state.isDeafened }));
            }
        });

        // Media Stream
        peer.on('stream', stream => {
            // Force UI update to "Live" immediately when stream is received
            const userList = require('../ui/userList');
            userList.updateUserStatusUI(targetId, true);

            if (stream.getVideoTracks().length > 0) {
                // screen share stream
                userList.addVideoElement(targetId, stream);
            } else {
                // microphone audio stream
                const visualizer = require('../audio/visualizer');
                const audioEngine = require('../audio/audioEngine');

                // 1. Output audio to speaker
                audioEngine.addAudioElement(targetId, stream);

                // 2. Create or update UI card
                userList.addUserUI(targetId, state.userNames[targetId] || "Biri", true);

                // 3. Attach visualizer to stream
                visualizer.attachVisualizer(stream, targetId);
            }
        });

        // Data Channel (Chat, File, Status)
        peer.on('data', data => {
            try {
                const strData = new TextDecoder("utf-8").decode(data);
                const msg = JSON.parse(strData);

                // Route to service based on message type
                if (msg.type === 'file-metadata' || msg.type === 'file-end' || msg.type === 'file-cancel') {
                    fileTransfer.handleIncomingFileData(targetId, data);
                }
                else if (msg.type === 'chat') {
                    chatService.addMessageToUI(msg.sender, msg.text, 'received', msg.time);
                    audioEngine.playSystemSound('notification');
                }
                else if (msg.type === 'mic-status') {
                    userList.updateMicStatusUI(targetId, msg.isMuted);
                }
                else if (msg.type === 'deafen-status') {
                    userList.updateDeafenStatusUI(targetId, msg.isDeafened);
                }
                else if (msg.type === 'sound-effect') {
                    audioEngine.playLocalSound(msg.effectName);
                }
                else if (msg.type === 'video-stopped') {
                    userList.removeVideoElement(targetId);
                }
            } catch (e) {
                // If not JSON, it is raw file data
                fileTransfer.handleIncomingFileData(targetId, data);
            }
        });

        // Handle Clean Close
        peer.on('close', () => removePeer(targetId));

        // Handle Errors (Connection Failed etc.)
        peer.on('error', err => {
            console.error(`Peer ${targetId} hatası:`, err);

            if (state.peers[targetId]) {
                chatService.addMessageToUI("Sistem", `${name} ile bağlantı koptu! (${err.message})`, 'system', new Date().toLocaleTimeString());
                audioEngine.playSystemSound('leave');
            }
        });

        state.peers[targetId] = peer;
    } catch (e) {
        console.error("Peer oluşturma hatası:", e);
    }
}

// Forwards incoming signal data to existing peer
function handleSignal(senderId, signal) {
    if (!state.peers[senderId]) {
        const userName = state.userNames[senderId] || "Bilinmeyen";
        createPeer(senderId, userName, false);
    }
    if (state.peers[senderId]) {
        state.peers[senderId].signal(signal);
    }
}

// Clears peer connection and related UI elements
function removePeer(id) {
    if (state.peers[id]) {
        state.peers[id].destroy();
        delete state.peers[id];
    }

    if (state.peerGainNodes[id]) delete state.peerGainNodes[id];
    if (state.activeRemoteStreams[id]) delete state.activeRemoteStreams[id];

    const userList = require('../ui/userList');
    userList.removeUserUI(id);
}

// Sends data to all connected peers
function broadcast(payload) {
    const jsonPayload = JSON.stringify(payload);
    for (let id in state.peers) {
        try {
            // SADECE kanal açıksa gönder (Kritik hata düzeltmesi)
            if (state.peers[id] && state.peers[id].connected) {
                state.peers[id].send(jsonPayload);
            }
        } catch (e) {
            console.error(`Broadcast error (${id}):`, e);
        }
    }
}

module.exports = {
    createPeer,
    handleSignal,
    removePeer,
    broadcast
};