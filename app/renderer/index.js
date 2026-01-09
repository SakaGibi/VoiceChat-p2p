// index.js - Giriş Noktası
const { ipcRenderer } = require('electron');
const path = require('path');

// --- IMPORTS ---
const dom = require(path.join(__dirname, 'ui/dom'));
const state = require(path.join(__dirname, 'state/appState'));
const configService = require(path.join(__dirname, 'config/configService'));
const mediaDevices = require(path.join(__dirname, 'webrtc/mediaDevices'));
const socketService = require(path.join(__dirname, 'socket/socketService'));
const audioEngine = require(path.join(__dirname, 'audio/audioEngine'));
const chatService = require(path.join(__dirname, 'chat/chatService'));
const screenShare = require(path.join(__dirname, 'webrtc/screenShare'));
const bandwidthManager = require(path.join(__dirname, 'webrtc/bandwidthManager'));
const userList = require(path.join(__dirname, 'ui/userList'));
const visualizer = require(path.join(__dirname, 'audio/visualizer'));
const { initAutoUpdateUI } = require(path.join(__dirname, 'renderer/autoUpdateRenderer'));

// --- INITIAL SETUP ---
window.onload = async () => {
    // 1. Initialize Modals & Soundpad
    try {
        const modals = require(path.join(__dirname, 'ui/modals'));
        modals.initModals();

        const soundEffects = require(path.join(__dirname, 'audio/soundEffects'));
        soundEffects.initSoundpad();

        if (dom.btnResetSoundpad) {
            dom.btnResetSoundpad.addEventListener('click', () => {
                soundEffects.resetSoundMap();
            });
        }
    } catch (err) {
        console.error("❌ Başlatma hatası (Modals/Soundpad):", err);
    }

    // 2. Get Version Info
    try {
        const version = await ipcRenderer.invoke('get-app-version');
        state.currentAppVersion = version;
        if (dom.updateStatus) dom.updateStatus.innerText = "Sürüm: " + version;
    } catch (err) {
        if (dom.updateStatus) dom.updateStatus.innerText = "Sürüm bilgisi alınamadı";
    }

    // 3. Remember Name
    const savedName = localStorage.getItem('username');
    if (savedName && dom.inputUsername) {
        dom.inputUsername.value = savedName;
    }

    // 4. List Devices
    await mediaDevices.getDevices();

    // 5. Load Config & Connect
    const config = configService.loadConfig();
    if (config) {
        socketService.connect(config.SIGNALING_SERVER);
    } else {
        if (dom.passwordModal) dom.passwordModal.style.display = 'flex';
    }

    // 6. Update Service
    initAutoUpdateUI({
        btnCheckUpdate: dom.btnCheckUpdate,
        btnInstallUpdate: dom.btnInstallUpdate,
        updateStatus: dom.updateStatus,
        btnConnect: dom.btnConnect,
        updateNotification: dom.updateNotification,
        btnDismissUpdate: dom.btnDismissUpdate,
        btnSettings: dom.btnSettings, // We need this to attach listener or logic if needed, although autoUpdateRenderer logic might handle it independent of click
        passwordModal: dom.passwordModal // To check if settings are open
    });

    // 7. Master Volume Control
    if (dom.masterSlider) {
        dom.masterSlider.addEventListener('input', () => {
            const value = dom.masterSlider.value;
            const displayEl = document.getElementById('masterVal');
            if (displayEl) displayEl.innerText = value + "%";

            for (let id in state.peerGainNodes) {
                const gainNode = state.peerGainNodes[id];
                const peerVol = (state.peerVolumes[id] || 100) / 100;
                if (gainNode && state.outputAudioContext) {
                    gainNode.gain.setTargetAtTime((value / 100) * peerVol, state.outputAudioContext.currentTime, 0.01);
                }
            }
        });
    }

    // 8. Microphone Gain
    if (dom.micSlider) {
        dom.micSlider.addEventListener('input', () => {
            const val = dom.micSlider.value;
            const displayEl = document.getElementById('micVal');
            if (displayEl) displayEl.innerText = val + "%";
            if (state.micGainNode) state.micGainNode.gain.setTargetAtTime(val / 100, 0, 0.01);
        });
    }

    // 9. Device Selection Changes
    if (dom.micSelect) {
        dom.micSelect.addEventListener('change', async () => {
            const deviceId = dom.micSelect.value;
            localStorage.setItem('selectedMic', deviceId);
            if (state.isConnected && state.localStream) {
                state.localStream.getTracks().forEach(track => track.stop());
                await audioEngine.initLocalStream(deviceId);
            }
        });
    }

    if (dom.speakerSelect) {
        dom.speakerSelect.addEventListener('change', () => {
            const deviceId = dom.speakerSelect.value;
            localStorage.setItem('selectedSpeaker', deviceId);
            audioEngine.setAudioOutputDevice(deviceId);
        });
    }

    // 10. Profile Photo (Avatar) Settings
    const savedAvatar = localStorage.getItem('userAvatar');
    if (savedAvatar) {
        state.myAvatar = savedAvatar;
        if (dom.myAvatarDisplay) dom.myAvatarDisplay.src = savedAvatar;
    }

    if (dom.myAvatarDisplay) {
        dom.myAvatarDisplay.onclick = () => dom.avatarInput.click();
    }

    if (dom.avatarInput) {
        dom.avatarInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 500 * 1024) return alert("Fotoğraf 500KB'dan büyük olamaz.");
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target.result;
                    state.myAvatar = base64;
                    dom.myAvatarDisplay.src = base64;
                    localStorage.setItem('userAvatar', base64);
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // 11. Network Stats & Bandwidth Manager
    window.updateNetworkStats = (data) => {
        const el = document.getElementById('networkStats');
        if (el) {
            const lossText = data.packetLoss !== undefined ? ` | Loss: %${data.packetLoss.toFixed(1)}` : '';
            el.innerText = `Bitrate: ${(data.bitrate / 1000).toFixed(0)} kbps | Ping: ${data.rtt.toFixed(0)} ms${lossText} | Peers: ${data.peers}`;
        }
    };
    bandwidthManager.startMonitoring();

    // [OPTIMIZED]: Start watchdog removed.
    // Run once at startup (delayed) to ensure context wakes up.
    setTimeout(() => {
        audioEngine.nudgeAllPeers();
    }, 3000);
};

// --- JOIN BUTTON ---
dom.btnConnect.addEventListener('click', async () => {
    const name = dom.inputUsername.value.trim();
    if (!name) return alert("Lütfen bir isim girin!");

    const success = await audioEngine.initLocalStream();
    if (success) {
        state.isConnected = true;
        state.currentRoom = dom.roomSelect.value;

        localStorage.setItem('username', name);
        configService.saveSetting('username', name);

        dom.btnConnect.style.display = 'none';
        dom.activeControls.style.display = 'flex';
        dom.roomSelect.disabled = true;
        dom.inputUsername.disabled = true;
        dom.msgInput.disabled = false;
        dom.btnSend.disabled = false;
        dom.btnShareScreen.disabled = false;

        state.userNames["me"] = name;
        userList.addUserUI("me", name + " (Ben)", true, state.myAvatar);

        visualizer.attachVisualizer(state.processedStream, "me");

        socketService.joinRoom(name, state.currentRoom, state.myAvatar);


    }
});

// --- IPC EVENTS FROM MAIN ---
ipcRenderer.on('toggle-mic', () => {
    if (!state.isConnected) return;
    audioEngine.setMicState(!state.isMicMuted);
});

ipcRenderer.on('toggle-deafen', () => {
    if (!state.isConnected) return;
    audioEngine.toggleDeafen();
});

// --- OTHER EVENTS ---
dom.btnToggleMic.addEventListener('click', () => {
    if (state.isDeafened) return alert("Hoparlör kapalı!");
    audioEngine.setMicState(!state.isMicMuted);
});

dom.btnToggleSound.addEventListener('click', () => {
    audioEngine.toggleDeafen();
});

dom.btnShareScreen.addEventListener('click', () => {
    if (!state.isSharingScreen) screenShare.start();
    else screenShare.stop();
});

dom.btnSend.addEventListener('click', () => chatService.sendChat());
dom.msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') chatService.sendChat();
});

dom.btnAttach.addEventListener('click', () => {
    if (!state.isConnected) return alert("Önce bir odaya bağlanmalısınız!");
    dom.fileInput.click();
});

dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    if (file.size > MAX_SIZE) return alert("Dosya 2GB'dan büyük olamaz.");

    const fileTransfer = require(path.join(__dirname, 'files/fileTransfer'));
    const tId = "transfer-" + Date.now();
    fileTransfer.addFileSentUI(file, tId);
    for (let id in state.peers) {
        fileTransfer.sendFile(state.peers[id], file, tId);
    }
    e.target.value = '';
});

dom.btnSettings.addEventListener('click', () => {
    const config = configService.getConfig();
    if (config) {
        dom.serverInput.value = config.SIGNALING_SERVER || "";
        dom.keyInput.value = config.ACCESS_KEY || "";
    }
    dom.passwordModal.style.display = 'flex';
});

dom.btnSaveKey.addEventListener('click', () => configService.handleSaveSettings());
dom.btnDisconnect.addEventListener('click', () => location.reload());