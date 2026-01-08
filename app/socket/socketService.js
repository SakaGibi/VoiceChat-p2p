// socketService.js - WebSocket Management & Message Router
const state = require('../state/appState');
const dom = require('../ui/dom');

let socket = null;
let messageQueue = [];

// --- CONNECTION LOGIC ---

// Connect to Server
function connect(url) {
    if (!url) {
        if (dom.roomPreviewDiv) dom.roomPreviewDiv.innerText = "Config hatası!";
        return;
    }

    // Check existing connection
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    try {
        socket = new WebSocket(url);
    } catch (e) {
        console.error("❌ WebSocket Başlatma Hatası:", e.message);
        return;
    }

    socket.onopen = () => {
        // Update UI
        if (dom.btnConnect) {
            dom.btnConnect.disabled = false;
            dom.btnConnect.innerText = "Katıl";
        }

        // Send queued messages
        if (messageQueue.length > 0) {
            while (messageQueue.length > 0) {
                const msg = messageQueue.shift();
                send(msg);
            }
        }

        // Update Preview
        try {
            const roomPreview = require('../ui/roomPreview');
            roomPreview.showTemporaryStatus("Sunucu bağlantısı aktif", "#2ecc71");
        } catch (e) { }
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            console.error("⚠️ Mesaj ayrıştırma hatası:", e);
        }
    };

    socket.onerror = (err) => {
        console.error("❌ WebSocket Hatası:", err);
        if (dom.btnConnect) {
            dom.btnConnect.disabled = true;
            dom.btnConnect.innerText = "Bağlanılamıyor";
        }
    };

    socket.onclose = (event) => {
        console.warn(`🔌 Sunucu bağlantısı kesildi. Kod: ${event.code}`);
        state.isConnected = false;
    };
}

// --- MESSAGE HANDLING ---

// Handle Incoming Messages
function handleMessage(data) {
    const peerService = require('../webrtc/peerService');
    const chatService = require('../chat/chatService');
    const userList = require('../ui/userList');
    const audioEngine = require('../audio/audioEngine');

    let roomPreview = null;
    try { roomPreview = require('../ui/roomPreview'); } catch (e) { }

    // Handle Message Types
    switch (data.type) {
        case 'error':
            alert("Sunucu Hatası: " + data.message);
            break;

        case 'me':
            state.myPeerId = data.id;
            break;

        case 'room-users':
        case 'user-list':
            if (data.room && data.room !== state.currentRoom) {
                return;
            }

            state.allUsers = data.users;
            if (roomPreview) roomPreview.updateRoomPreview();

            if (state.isConnected) {
                data.users.forEach(u => {
                    if (u.room && u.room !== state.currentRoom) return;

                    if (u.id !== state.myPeerId) {
                        state.userNames[u.id] = u.name;

                        // [FIX]: Don't overwrite status if already connected!
                        const isAlreadyConnected = state.peers[u.id] && state.peers[u.id].connected;

                        // Only force to 'false' if NOT connected. If connected, keep it true (or update to true).
                        userList.addUserUI(u.id, u.name, isAlreadyConnected, u.avatar);

                        if (!state.peers[u.id] && shouldIInitiate(state.myPeerId, u.id)) {
                            peerService.createPeer(u.id, u.name, true);
                        }
                    }
                });
            }
            break;

        case 'user-joined':
            if (data.id === state.myPeerId) return;

            if (data.room && data.room !== state.currentRoom) {
                return;
            }

            state.userNames[data.id] = data.name;
            userList.addUserUI(data.id, data.name, false, data.avatar);
            audioEngine.playSystemSound('join');

            if (!state.peers[data.id] && shouldIInitiate(state.myPeerId, data.id)) {
                peerService.createPeer(data.id, data.name, true, data.avatar);
            }
            break;

        case 'user-left':
            // Removing is safe even if different room (it just won't be found)
            audioEngine.playSystemSound('leave');
            peerService.removePeer(data.id);
            break;

        case 'signal':
            peerService.handleSignal(data.senderId, data.signal);
            break;

        case 'chat':
            chatService.addMessageToUI(data.sender, data.text, 'received', data.time);
            audioEngine.playSystemSound('notification');
            break;

        case 'mic-status':
            userList.updateMicStatusUI(data.senderId, data.isMuted);
            break;

        case 'deafen-status':
            userList.updateDeafenStatusUI(data.senderId, data.isDeafened);
            break;

        case 'sound-effect':
            if (data.senderId !== state.myPeerId) {
                audioEngine.playLocalSound(data.effectName);
            }
            break;

        case 'video-stopped':
            userList.removeVideoElement(data.senderId);
            break;

        case 'poke':
            // Only the target triggers a notification
            if (data.targetId === state.myPeerId) {
                const senderName = state.userNames[data.senderId] || "Biri";
                audioEngine.playSystemSound('notification'); // Or a specific poke sound if we had one

                // System Notification
                if (Notification.permission === "granted") {
                    new Notification("Dikkat!", {
                        body: `${senderName} seni dürttü`,
                        icon: 'assets/gazmaliyim.ico' // or default
                    });
                } else if (Notification.permission !== "denied") {
                    Notification.requestPermission().then(permission => {
                        if (permission === "granted") {
                            new Notification("Dikkat!", {
                                body: `${senderName} seni dürttü`
                            });
                        }
                    });
                }
            }
            break;

        default:
            console.warn("⚠️ Bilinmeyen Mesaj Tipi:", data.type);
            break;
    }
}

// --- HELPER FUNCTIONS ---

// [FIX]: Collision Avoidance Logic
function shouldIInitiate(myId, targetId) {
    if (!myId || !targetId) return false;
    return myId > targetId;
}

// Join Room Request
function joinRoom(name, room, avatar) {
    // [CLEANUP]: Ensure we start fresh when joining a room
    cleanupAllPeers();

    const accessKey = state.configData && state.configData.ACCESS_KEY
        ? state.configData.ACCESS_KEY.trim()
        : null;

    const payload = {
        type: 'join',
        name: name,
        room: room,
        key: accessKey,
        avatar: avatar
    };

    send(payload);
}

// Safe Send Function
function send(payload) {
    if (!socket) {
        messageQueue.push(payload);
        return;
    }
    if (socket.readyState === WebSocket.CONNECTING) {
        messageQueue.push(payload);
        return;
    }
    if (socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify(payload));
        } catch (e) {
            console.error("Mesaj gönderme hatası:", e);
        }
    } else {
        console.error("❌ Soket kapalı, mesaj gönderilemedi:", payload.type);
    }
}

// Cleanup all peers (used when switching rooms or disconnecting)
function cleanupAllPeers() {
    const peerService = require('../webrtc/peerService');
    const userList = require('../ui/userList');

    // Remove all peers
    for (let id in state.peers) {
        peerService.removePeer(id);
    }

    // Clear State
    state.peers = {};
    state.peerGainNodes = {};
    state.activeRemoteStreams = {};

    // [FIX]: Preserve 'me' so we don't lose our own identity
    const myName = state.userNames["me"];
    state.userNames = {};
    if (myName) state.userNames["me"] = myName;

    // Clear UI (except me)
    if (userList && state.myPeerId) {
        const container = document.getElementById('userList');
        if (container) {
            const kids = Array.from(container.children);
            kids.forEach(child => {
                if (child.id !== 'user-me' && child.id !== `user-${state.myPeerId}`) {
                    child.remove();
                }
            });
        }
    }
}

// Send Poke
function sendPoke(targetId) {
    send({
        type: 'poke',
        targetId: targetId
    });
}

module.exports = {
    connect,
    joinRoom,
    send,
    cleanupAllPeers,
    sendPoke
};