// socketService.js - WebSocket Yönetimi ve Mesaj Yönlendirici
const state = require('../state/appState');
const dom = require('../ui/dom');

// Diğer servisler (Döngüsel bağımlılığı önlemek için ihtiyaç duyulduğunda require edilecekler)
// Not: peerService ve chatService gibi modüller aşağıda fonksiyon içinde çağrılacaktır.

let socket = null;

/**
 * Sunucuya bağlantı başlatır
 */
function connect(url) {
    if (!url) {
        if (dom.roomPreviewDiv) dom.roomPreviewDiv.innerText = "Config hatası!";
        return;
    }

    try {
        socket = new WebSocket(url);
    } catch (e) {
        console.error("WebSocket Bağlantı Hatası:", e.message);
        return;
    }

    socket.onopen = () => {
        console.log("Lobiye bağlanıldı.");
        dom.btnConnect.disabled = false;
        dom.btnConnect.innerText = "Katıl";
        
        // UI Yardımı: roomPreview'ı güncelle (Modül 15'te detaylanacak)
        const roomPreview = require('../ui/roomPreview');
        roomPreview.showTemporaryStatus("Sunucu bağlantısı aktif", "#2ecc71");
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            console.error("Mesaj ayrıştırma hatası:", e);
        }
    };

    socket.onerror = () => {
        dom.btnConnect.disabled = true;
        dom.btnConnect.innerText = "Bağlanılamıyor";
    };

    socket.onclose = () => {
        if (state.isConnected) {
            alert("Sunucu bağlantısı koptu!");
            location.reload();
        }
    };
}

/**
 * Gelen mesaj tipine göre ilgili servisi tetikler
 */
function handleMessage(data) {
    const peerService = require('../webrtc/peerService');
    const chatService = require('../chat/chatService');
    const userList = require('../ui/userList');
    const audioEngine = require('../audio/audioEngine');
    const roomPreview = require('../ui/roomPreview');

    switch (data.type) {
        case 'user-list':
            state.allUsers = data.users;
            roomPreview.updateRoomPreview();
            if (state.isConnected) {
                data.users.forEach(u => { 
                    if (u.id !== state.myPeerId) state.userNames[u.id] = u.name; 
                });
            }
            break;

        case 'me':
            state.myPeerId = data.id;
            break;

        case 'user-joined':
            if (data.id === state.myPeerId) return;
            state.userNames[data.id] = data.name;
            userList.addUserUI(data.id, data.name, false);
            audioEngine.playSystemSound('join');
            peerService.createPeer(data.id, data.name, true);
            break;

        case 'user-left':
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

        case 'sound-effect':
            audioEngine.playLocalSound(data.effectName);
            break;

        case 'video-stopped':
            userList.removeVideoElement(data.senderId);
            break;
    }
}

/**
 * Odaya katılma isteği gönderir
 */
function joinRoom(name, room) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    socket.send(JSON.stringify({ 
        type: 'join', 
        name: name,
        room: room,
        key: state.configData.ACCESS_KEY
    }));
}

/**
 * Genel veri gönderme fonksiyonu
 */
function send(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

module.exports = {
    connect,
    joinRoom,
    send
};