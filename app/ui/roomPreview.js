// roomPreview.js - Oda Önizleme ve Durum Bildirimleri
const state = require('../state/appState');
const dom = require('./dom');

/**
 * Belirli bir süre sonra kaybolan durum mesajları gösterir (Örn: "X katıldı 👋")
 * @param {string} message - Gösterilecek mesaj
 * @param {string} color - Mesajın rengi (Hex veya Renk Adı)
 */
function showTemporaryStatus(message, color = "#4cd137") {
    if (!dom.roomPreviewDiv) return;
    
    // Eğer halihazırda bir zamanlayıcı varsa temizle
    if (state.statusTimeout) clearTimeout(state.statusTimeout);

    dom.roomPreviewDiv.innerText = message;
    dom.roomPreviewDiv.style.color = color;
    dom.roomPreviewDiv.style.fontWeight = "bold";

    // 3 saniye sonra orijinal oda görünümüne geri dön
    state.statusTimeout = setTimeout(() => {
        state.statusTimeout = null; 
        updateRoomPreview();
    }, 3000);
}

/**
 * Seçili odadaki kullanıcı sayısını ve isimlerini UI'da günceller
 */
function updateRoomPreview() {
    if (!dom.roomSelect) return;
    
    // Eğer ekranda geçici bir durum mesajı (status) varsa güncelleme yapma
    if (state.statusTimeout) return;

    const selectedRoom = dom.roomSelect.value;
    const usersInRoom = state.allUsers.filter(u => u.room === selectedRoom);

    if (dom.roomPreviewDiv) {
        dom.roomPreviewDiv.style.fontWeight = "normal";
        
        if (state.isConnected) {
            // Bağlıyken: "📢 Genel (3 Kişi)"
            dom.roomPreviewDiv.innerText = `${getRoomName(state.currentRoom)} (${usersInRoom.length} Kişi)`;
            dom.roomPreviewDiv.style.color = "var(--text-main)";
        } else {
            // Bağlı değilken: Seçili odadaki kullanıcı isimlerini göster
            if (usersInRoom.length === 0) {
                dom.roomPreviewDiv.innerText = `${getRoomName(selectedRoom)}: Boş`;
            } else {
                const names = usersInRoom.map(u => u.name).join(", ");
                dom.roomPreviewDiv.innerText = `${getRoomName(selectedRoom)}: ${names}`;
            }
            dom.roomPreviewDiv.style.color = "#aaa";
        }
    }
}

/**
 * Oda ID'lerini kullanıcı dostu isimlere ve ikonlara dönüştürür
 * @param {string} val - Oda anahtarı (genel, oyun vb.)
 */
function getRoomName(val) {
    if (val === 'genel') return "📢 Genel";
    if (val === 'oyun') return "🎮 Oyun";
    if (val === 'muzik') return "🎵 Müzik";
    if (val === 'ozel') return "🔒 Özel";
    return val;
}

/**
 * Oda seçim kutusu değiştiğinde önizlemeyi anında güncellemek için dinleyici ekle
 */
if (dom.roomSelect) {
    dom.roomSelect.addEventListener('change', () => {
        if (state.statusTimeout) { 
            clearTimeout(state.statusTimeout); 
            state.statusTimeout = null; 
        }
        updateRoomPreview();
    });
}

module.exports = {
    showTemporaryStatus,
    updateRoomPreview,
    getRoomName
};