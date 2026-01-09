// chatService.js - Chat & Messaging Management
const state = require('../state/appState');
const dom = require('../ui/dom');

// Adds a message to the UI (Chat History)
/**
 * @param {string} sender - sender name
 * @param {string} text - context of the message
 * @param {string} type - 'sent' or 'received'
 * @param {string} time - time string (optional)
 */
function addMessageToUI(sender, text, type, time = null) {
    // Get current time if not provided
    if (!time) {
        time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Determine Display Name
    let displayName = sender || "Biri";

    if (type === 'sent') {
        displayName = "Ben";
    } else {
        displayName = displayName.replace(" (Ben)", "");
    }

    const div = document.createElement('div');
    div.className = `message ${type}`;

    // Create HTML structure
    div.innerHTML = `
        <span class="msg-sender">${displayName}</span>
        ${text}
        <span class="msg-time">${time}</span>
    `;

    dom.chatHistory.appendChild(div);

    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
}

// Gets message from input, adds to local UI, and sends to all peers
function sendChat() {
    const text = dom.msgInput.value.trim();

    if (!text) return;

    // --- COMMANDS ---
    if (text.toLowerCase() === '/help') {
        const helpText = `
            <b>Komutlar:</b><br>
            - <b>/help:</b> Yardım
            <br>
            - <b>/clear:</b> Mesaj Geçmişini Temizle
            <br>
            <b>Kısayollar:</b><br>
            - <b>Ctrl+Shift+M:</b> Mikrofonu Aç/Kapat<br>
            - <b>Ctrl+Shift+N:</b> Sağırlaştır/Duy<br>
        `;
        addMessageToUI("Yorick", helpText, 'received');
        dom.msgInput.value = '';
        return;
    }
    if (text.toLowerCase() === '/clear') {
        const children = Array.from(dom.chatHistory.children);
        for (let i = 1; i < children.length; i++) { // start from 1 to skip welcome message and help message
            children[i].remove();
        }
        dom.msgInput.value = '';
        return;
    }

    if (!state.isConnected) return;

    const myName = state.userNames['me'] || "Ben";
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Add to own screen
    addMessageToUI(myName, text, 'sent', time);

    // 2. Prepare message payload
    const cleanSenderName = myName.replace(" (Ben)", "");

    const payload = {
        type: 'chat',
        sender: cleanSenderName,
        text: text,
        time: time
    };

    // 3. Send to all connected peers
    const peerService = require('../webrtc/peerService');
    peerService.broadcast(payload);

    // 4. Clear input field
    dom.msgInput.value = '';
}

module.exports = {
    addMessageToUI,
    sendChat
};