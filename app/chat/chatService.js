// chatService.js - Sohbet ve Mesajlaşma Yönetimi
const state = require('../state/appState');
const dom = require('../ui/dom');

/**
 * Bir mesajı kullanıcı arayüzüne (Chat History) ekler
 * @param {string} sender - Gönderen kişinin adı
 * @param {string} text - Mesaj içeriği
 * @param {string} type - 'sent' (bizim gönderdiğimiz) veya 'received' (gelen)
 * @param {string} time - Mesajın zaman damgası (isteğe bağlı)
 */
function addMessageToUI(sender, text, type, time = null) {
    // Eğer zaman belirtilmemişse o anki saati al (Örn: 14:25)
    if (!time) {
        time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Gönderen ismindeki "(Ben)" takısını temizle
    const cleanName = sender ? sender.replace(" (Ben)", "") : "Biri";

    const div = document.createElement('div');
    div.className = `message ${type}`;
    
    // HTML yapısını oluştur
    div.innerHTML = `
        <span class="msg-sender">${cleanName}</span>
        ${text}
        <span class="msg-time">${time}</span>
    `;

    dom.chatHistory.appendChild(div);
    
    // Yeni mesaj gelince en aşağı kaydır
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
}

/**
 * Giriş alanındaki mesajı alır, yerel UI'a ekler ve tüm bağlı kullanıcılara gönderir
 */
function sendChat() {
    const text = dom.msgInput.value.trim();
    
    // Mesaj boşsa veya bağlı değilsek işlem yapma
    if (!text || !state.isConnected) return;

    const myName = state.userNames['me'] || "Ben";
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Kendi ekranına ekle
    addMessageToUI(myName, text, 'sent', time);

    // 2. Mesaj paketini hazırla
    const payload = { 
        type: 'chat', 
        sender: myName, 
        text: text, 
        time: time 
    };

    // 3. Tüm bağlı peer'lara gönder
    const peerService = require('../webrtc/peerService');
    peerService.broadcast(payload);

    // 4. Input alanını temizle
    dom.msgInput.value = '';
}

module.exports = {
    addMessageToUI,
    sendChat
};