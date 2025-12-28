// screenShare.js - Ekran Paylaşımı Yönetimi
const state = require('../state/appState');
const dom = require('../ui/dom');

/**
 * Ekran paylaşımını başlatır
 */
async function start() {
    if (state.isSharingScreen) return;

    try {
        // Ekran yakalama isteği
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true, 
            audio: false 
        });
        
        state.screenStream = stream;
        state.isSharingScreen = true;

        // UI Güncelleme
        dom.btnShareScreen.innerText = "🛑 Durdur";
        dom.btnShareScreen.style.backgroundColor = "#e74c3c";

        // Paylaşım manuel olarak (browser üzerinden) durdurulursa
        state.screenStream.getVideoTracks()[0].onended = () => { 
            stop(); 
        };

        // Mevcut tüm bağlantılara ekran akışını ekle
        for (let id in state.peers) { 
            try { 
                state.peers[id].addStream(state.screenStream); 
            } catch (err) {
                console.error(`Peer ${id} akış ekleme hatası:`, err);
            } 
        }
    } catch (err) {
        console.error("Ekran paylaşımı başlatılamadı:", err);
    }
}

/**
 * Ekran paylaşımını durdurur ve diğer kullanıcıları bilgilendirir
 */
function stop() {
    if (!state.screenStream) return;

    // Akış kanallarını kapat
    state.screenStream.getTracks().forEach(track => track.stop());

    // Tüm bağlantılardan akışı çıkar ve bilgilendirme mesajı gönder
    for (let id in state.peers) {
        try {
            state.peers[id].removeStream(state.screenStream);
            state.peers[id].send(JSON.stringify({ 
                type: 'video-stopped', 
                senderId: state.myPeerId 
            }));
        } catch (err) { 
            console.error(`Peer ${id} akış kaldırma hatası:`, err);
        }
    }

    // State ve UI temizliği
    state.screenStream = null;
    state.isSharingScreen = false;
    
    dom.btnShareScreen.innerText = "🖥️ Paylaş";
    dom.btnShareScreen.style.backgroundColor = "#0288d1"; 
}

module.exports = {
    start,
    stop
};