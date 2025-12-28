// index.js - Giriş Noktası
const { ipcRenderer } = require('electron');
const dom = require('./ui/dom');
const state = require('./state/appState');
const configService = require('./config/configService');
const mediaDevices = require('./webrtc/mediaDevices');
const socketService = require('./socket/socketService');
const audioEngine = require('./audio/audioEngine');
const chatService = require('./chat/chatService');
const screenShare = require('./webrtc/screenShare');
const { initAutoUpdateUI } = require('../autoUpdateRenderer'); // Mevcut dosyanız

// --- BAŞLANGIÇ AYARLARI ---
window.onload = async () => {
    // 1. Sürüm Bilgisini Al
    try {
        const version = await ipcRenderer.invoke('get-app-version');
        state.currentAppVersion = version;
        dom.updateStatus.innerText = "Sürüm: " + version;
    } catch (err) {
        dom.updateStatus.innerText = "Sürüm bilgisi alınamadı";
    }

    // 2. Cihazları Listele
    await mediaDevices.getDevices();

    // 3. Mevcut Config'i Yükle ve Bağlanmayı Dene
    const config = configService.loadConfig();
    if (config) {
        socketService.connect(config.SIGNALING_SERVER);
    } else {
        dom.passwordModal.style.display = 'flex';
    }

    // 4. Güncelleme UI'ını Başlat
    initAutoUpdateUI({
        btnCheckUpdate: dom.btnCheckUpdate,
        btnInstallUpdate: dom.btnInstallUpdate,
        updateStatus: dom.updateStatus,
        btnConnect: dom.btnConnect
    });
};

// --- UI EVENT LISTENERS (BAĞLANTILAR) ---

// Katıl Butonu
dom.btnConnect.addEventListener('click', async () => {
    const name = dom.inputUsername.value.trim();
    if (!name) return alert("Lütfen bir isim girin!");

    const success = await audioEngine.initLocalStream();
    if (success) {
        state.isConnected = true;
        state.currentRoom = dom.roomSelect.value;
        configService.saveSetting('username', name);
        
        // UI Güncelle
        dom.btnConnect.style.display = 'none';
        dom.activeControls.style.display = 'flex';
        dom.roomSelect.disabled = true;

        socketService.joinRoom(name, state.currentRoom);
    }
});

// Mikrofon Kapat/Aç
dom.btnToggleMic.addEventListener('click', () => {
    if (state.isDeafened) return alert("Hoparlör kapalı!");
    const newState = !state.isMicMuted;
    audioEngine.setMicState(newState);
});

// Ses Kapat/Aç (Deafen)
dom.btnToggleSound.addEventListener('click', () => {
    audioEngine.toggleDeafen();
});

// Ekran Paylaşımı
dom.btnShareScreen.addEventListener('click', () => {
    if (!state.isSharingScreen) {
        screenShare.start();
    } else {
        screenShare.stop();
    }
});

// Mesaj Gönderme
dom.btnSend.addEventListener('click', () => chatService.sendChat());
dom.msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') chatService.sendChat();
});

// Dosya Eki Butonu
dom.btnAttach.addEventListener('click', () => {
    if (!state.isConnected) return alert("Önce bir odaya bağlanmalısınız!");
    dom.fileInput.click();
});

// Ayarlar Butonları
dom.btnSettings.addEventListener('click', () => {
    const config = configService.getConfig();
    if (config) {
        dom.serverInput.value = config.SIGNALING_SERVER || "";
        dom.keyInput.value = config.ACCESS_KEY || "";
    }
    dom.passwordModal.style.display = 'flex';
});

dom.btnCloseSettings.addEventListener('click', () => {
    dom.passwordModal.style.display = 'none';
});

dom.btnSaveKey.addEventListener('click', () => {
    configService.handleSaveSettings();
});

// Bağlantıyı Kes
dom.btnDisconnect.addEventListener('click', () => {
    location.reload(); 
});