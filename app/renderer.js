const SimplePeer = require('simple-peer'); 
const chatHistory = document.getElementById('chatHistory');
const msgInput = document.getElementById('msgInput');
const btnSend = document.getElementById('btnSend');
const path = require('path');
const fileInput = document.getElementById('fileInput');
const btnAttach = document.getElementById('btnAttach');
const fs = require('fs');

// Uygulama Sesleri
let joinPath = path.join(__dirname, 'assets', 'RIZZ_effect.mp3');
joinPath = joinPath.replace('app.asar', 'app.asar.unpacked');
const joinSound = new Audio(joinPath);
joinSound.volume = 1;
const leaveSound = new Audio(path.join(__dirname, 'assets', 'cikis_effect.mp3').replace('app.asar', 'app.asar.unpacked'));
leaveSound.volume = 1;
const notificationSound = new Audio(path.join(__dirname, 'assets', 'notification_effect.mp3').replace('app.asar', 'app.asar.unpacked'));
notificationSound.volume = 0.5;

let socket;
let configData = null;
let CONFIG_PATH;
let localStream;
let screenStream;
let processedStream;  
let micGainNode;
let sourceNode; 
let audioContext;
let outputAudioContext; 
let peerGainNodes = {}; 

window.peers = {};
window.userNames = {}; 
let allUsers = []; 
let isMicMuted = false;
let isDeafened = false;
let isConnected = false; 
let isSharingScreen = false;
let currentRoom = 'genel'; 
let myPeerId = null;

let statusTimeout; 

// UI Elements
const inputUsername = document.getElementById('username');
const userListDiv = document.getElementById('userList');
const roomPreviewDiv = document.getElementById('roomPreview'); 
const roomSelect = document.getElementById('roomSelect'); 

const btnConnect = document.getElementById('btnConnect');
const activeControls = document.getElementById('activeControls');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleSound = document.getElementById('btnToggleSound');
const btnShareScreen = document.getElementById('btnShareScreen'); 

const streamModal = document.getElementById('streamModal');
const largeVideoPlayer = document.getElementById('largeVideoPlayer');
const btnCloseStream = document.getElementById('btnCloseStream');
const streamerNameLabel = document.getElementById('streamerName');

btnCloseStream.addEventListener('click', () => {
    streamModal.style.display = 'none';
    largeVideoPlayer.srcObject = null;
});

const btnTheme = document.getElementById('btnTheme');
const micSelect = document.getElementById('micSelect');
const speakerSelect = document.getElementById('speakerSelect'); 
const micSlider = document.getElementById('micVolume');
const micVal = document.getElementById('micVal');
const masterSlider = document.getElementById('masterVolume');
const masterVal = document.getElementById('masterVal');
const isDev = !__dirname.includes('app.asar');

if (isDev) {
    CONFIG_PATH = path.join(__dirname, 'config.json');
} else {
    CONFIG_PATH = path.join(process.resourcesPath, '..', 'config.json');
}

function connectWithConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            // Dosya varsa oku ve bağlan
            configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            console.log("✅ Config yüklendi:", configData.SIGNALING_SERVER);
            initSocketConnection(); 
        } else {
            // Dosya yoksa MODAL'ı aç
            const modal = document.getElementById('passwordModal');
            const serverInput = document.getElementById('serverInput'); // Yeni input
            const keyInput = document.getElementById('keyInput');
            const btnSave = document.getElementById('btnSaveKey');

            if (modal) {
                modal.style.display = 'flex';
                
                btnSave.onclick = () => {
                    const enteredServer = serverInput.value.trim();
                    const enteredKey = keyInput.value.trim();

                    if (!enteredServer || !enteredKey) {
                        return alert("Lütfen sunucu adresi ve anahtarı eksiksiz girin!");
                    }

                    // Kullanıcının girdiği bilgilerle config oluştur
                    const defaultConfig = { 
                        SIGNALING_SERVER: enteredServer, 
                        ACCESS_KEY: enteredKey 
                    };

                    try {
                        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
                        configData = defaultConfig;
                        
                        modal.style.display = 'none';
                        alert("Ayarlar kaydedildi. Bağlanılıyor...");
                        initSocketConnection();
                    } catch (e) {
                        alert("Dosya yazma hatası: " + e.message);
                    }
                };
            }
        }
    } catch (error) {
        console.error("Config hatası:", error);
    }
}

// --- BAŞLANGIÇ ---
window.onload = () => {
    loadSettings();
    getDevices(); 
    connectWithConfig(); // initSocketConnection'ı buradan sildik, çünkü yukarıda çağırıyoruz
};

// --- BİLDİRİM SİSTEMİ ---
function showTemporaryStatus(message, color = "#4cd137") {
    if (!roomPreviewDiv) return;
    if (statusTimeout) clearTimeout(statusTimeout);
    roomPreviewDiv.innerText = message;
    roomPreviewDiv.style.color = color;
    roomPreviewDiv.style.fontWeight = "bold";
    statusTimeout = setTimeout(() => {
        statusTimeout = null; 
        updateRoomPreview();  
    }, 3000);
}

// --- ODA ÖNİZLEME ---
function updateRoomPreview() {
    if (!roomSelect) return;
    if (statusTimeout) return;
    const selectedRoom = roomSelect.value;
    const usersInRoom = allUsers.filter(u => u.room === selectedRoom);
    if(roomPreviewDiv) {
        roomPreviewDiv.style.fontWeight = "normal";
        if (isConnected) {
            roomPreviewDiv.innerText = `${getRoomName(currentRoom)} (${usersInRoom.length} Kişi)`;
            roomPreviewDiv.style.color = "var(--text-main)";
        } else {
            if (usersInRoom.length === 0) {
                roomPreviewDiv.innerText = `${getRoomName(selectedRoom)}: Boş`;
            } else {
                const names = usersInRoom.map(u => u.name).join(", ");
                roomPreviewDiv.innerText = `${getRoomName(selectedRoom)}: ${names}`;
            }
            roomPreviewDiv.style.color = "#aaa";
        }
    }
}

function getRoomName(val) {
    if (val === 'genel') return "📢 Genel";
    if (val === 'oyun') return "🎮 Oyun";
    if (val === 'muzik') return "🎵 Müzik";
    if (val === 'ozel') return "🔒 Özel";
    return val;
}

if(roomSelect) {
    roomSelect.addEventListener('change', () => {
        if(statusTimeout) { clearTimeout(statusTimeout); statusTimeout = null; }
        updateRoomPreview();
    });
}

// --- WEBSOCKET ---
function initSocketConnection() {
    if (!configData || !configData.SIGNALING_SERVER) {
        if(roomPreviewDiv) roomPreviewDiv.innerText = "Config hatası!";
        return;
    }
    if(roomPreviewDiv) roomPreviewDiv.innerText = "Sunucuya bağlanılıyor...";
    socket = new WebSocket(configData.SIGNALING_SERVER);
    socket.onopen = () => { console.log("Lobiye bağlanıldı."); };
    socket.onerror = () => { 
        if(roomPreviewDiv) roomPreviewDiv.innerText = "Sunucuya ulaşılamadı!";
        // Hata durumunda 2 saniye sonra config'i sil ve reload at (Kullanıcı düzeltebilsin diye)
        setTimeout(() => {
            if(confirm("Sunucuya bağlanılamadı. Ayarları sıfırlayıp tekrar denemek ister misiniz?")) {
                try { fs.unlinkSync(CONFIG_PATH); location.reload(); } catch(e){}
            }
        }, 2000);
    };
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'user-list') {
                allUsers = data.users; 
                updateRoomPreview(); 
                if (isConnected) {
                   data.users.forEach(u => { if(u.id !== myPeerId) userNames[u.id] = u.name; });
                }
            } 
            else if (data.type === 'me') { myPeerId = data.id; }
            if (!isConnected) return;
            if (data.type === 'user-joined') {
                if (data.id === myPeerId) return; 
                userNames[data.id] = data.name;
                updateNameUI(data.id, data.name);
                joinSound.play().catch(e => {});                
                showTemporaryStatus(`${data.name} katıldı 👋`, "#c1d3beff");
                addUserUI(data.id, data.name, false); 
                createPeer(data.id, data.name, true);
            } 
            else if (data.type === 'user-left') {
                try {
                    leaveSound.currentTime = 0;
                    leaveSound.play().catch(e => {});
                } catch (e) {}
                const leaverName = userNames[data.id] || "Biri";
                showTemporaryStatus(`${leaverName} ayrıldı 💨`, "#dbc9c9ff"); 
                removePeer(data.id);
            }
            else if (data.type === 'signal') { handleSignal(data.senderId, data.signal); }
            else if (data.type === 'chat') {
                addMessageToUI(data.sender, data.text, 'received', data.time);
                if (!isDeafened) notificationSound.play().catch(e => {});
            }
            else if (data.type === 'mic-status') updateMicStatusUI(data.senderId, data.isMuted); 
            else if (data.type === 'sound-effect') playLocalSound(data.effectName);
            else if (data.type === 'video-stopped') removeVideoElement(data.senderId); 
        } catch (e) { console.error(e); }
    };
    socket.onerror = () => { if(roomPreviewDiv) roomPreviewDiv.innerText = "Sunucu hatası!"; };
    socket.onclose = () => { 
        if(roomPreviewDiv) roomPreviewDiv.innerText = "Bağlantı koptu.";
        if(isConnected) disconnectRoom(); 
    };
}

// --- CİHAZLARI LİSTELE ---
async function getDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(e => {});
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        if(micSelect) {
            micSelect.innerHTML = '<option value="">Varsayılan Mikrofon</option>';
            audioInputs.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.text = d.label || `Mikrofon ${micSelect.length}`;
                micSelect.appendChild(opt);
            });
            const savedMic = localStorage.getItem('selectedMicId');
            if (savedMic) micSelect.value = savedMic;
        }
        if(speakerSelect) {
            speakerSelect.innerHTML = '<option value="">Varsayılan Hoparlör</option>';
            audioOutputs.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.text = d.label || `Hoparlör ${speakerSelect.length}`;
                speakerSelect.appendChild(opt);
            });
            const savedSpeaker = localStorage.getItem('selectedSpeakerId');
            if (savedSpeaker) speakerSelect.value = savedSpeaker;
        }
    } catch (err) { console.error(err); }
}

// --- BAĞLANMA ---
btnConnect.addEventListener('click', async () => {
    const name = inputUsername.value;
    if(!name) {
        alert("Lütfen bir isim girin!");
        setTimeout(() => { inputUsername.disabled = false; inputUsername.focus(); }, 100);
        return;
    }
    currentRoom = roomSelect.value;
    saveSetting('username', name);
    btnConnect.style.display = 'none'; 
    roomSelect.disabled = true;
    activeControls.style.display = 'flex';
    inputUsername.disabled = true;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    outputAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (outputAudioContext.state === 'suspended') await outputAudioContext.resume();
    if (speakerSelect && speakerSelect.value && outputAudioContext.setSinkId) {
            outputAudioContext.setSinkId(speakerSelect.value).catch(e => {});
    }

    try {
        const selectedMicId = micSelect ? micSelect.value : null;
        const constraints = { audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true, video: false };
        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        sourceNode = audioContext.createMediaStreamSource(rawStream);
        micGainNode = audioContext.createGain();
        micGainNode.gain.value = micSlider.value / 100; 
        const destination = audioContext.createMediaStreamDestination();
        sourceNode.connect(micGainNode);
        micGainNode.connect(destination);
        localStream = rawStream; 
        processedStream = destination.stream; 
        msgInput.disabled = false;
        btnSend.disabled = false;
        btnShareScreen.disabled = false;
        userNames["me"] = name + " (Ben)";
        addUserUI("me", userNames["me"], true);
        attachVisualizer(processedStream, "me"); 

        socket.send(JSON.stringify({ 
            type: 'join', 
            name: name,
            room: currentRoom,
            key: configData.ACCESS_KEY
        }));
        isConnected = true;
        updateRoomPreview();
    } catch (err) {
        console.error(err);
        disconnectRoom(); 
        alert("Mikrofon hatası: " + err.message);
    }
});

// --- DİĞER FONKSİYONLAR ---
btnSend.addEventListener('click', sendChat);
msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

function saveSetting(key, value) { localStorage.setItem(key, value); }
function loadSettings() {
    const savedName = localStorage.getItem('username');
    if (savedName && inputUsername) inputUsername.value = savedName;
    loadTheme();
}
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') { document.body.classList.add('light-theme'); btnTheme.innerText = '🌙'; }
    else { btnTheme.innerText = '☀️'; }
}
btnTheme.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    btnTheme.innerText = isLight ? '🌙' : '☀️';
    saveSetting('theme', isLight ? 'light' : 'dark');
});

micSlider.addEventListener('input', (e) => {
    micVal.innerText = e.target.value + "%";
    if (micGainNode) micGainNode.gain.value = e.target.value / 100; 
});
masterSlider.addEventListener('input', (e) => {
    masterVal.innerText = e.target.value + "%";
    document.querySelectorAll('audio').forEach(audio => audio.volume = e.target.value / 100);
    notificationSound.volume = e.target.value / 100;
});

btnShareScreen.addEventListener('click', async () => {
    if (!isSharingScreen) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            isSharingScreen = true;
            btnShareScreen.innerText = "🛑 Durdur";
            btnShareScreen.style.backgroundColor = "#e74c3c";
            screenStream.getVideoTracks()[0].onended = () => { stopScreenShare(); };
            for (let id in peers) { try { peers[id].addStream(screenStream); } catch (err) {} }
        } catch (err) {}
    } else { stopScreenShare(); }
});

function stopScreenShare() {
    if (!screenStream) return;
    screenStream.getTracks().forEach(track => track.stop());
    for (let id in peers) {
        try {
            peers[id].removeStream(screenStream);
            peers[id].send(JSON.stringify({ type: 'video-stopped', senderId: myPeerId }));
        } catch (err) { }
    }
    screenStream = null;
    isSharingScreen = false;
    btnShareScreen.innerText = "🖥️ Paylaş";
    btnShareScreen.style.backgroundColor = "#0288d1"; 
}

btnDisconnect.addEventListener('click', () => { disconnectRoom(); });
function disconnectRoom() {
    isConnected = false;
    if (isSharingScreen) stopScreenShare();
    btnShareScreen.disabled = true;
    location.reload(); 
}

function addMessageToUI(sender, text, type, time = null) {
    if (!time) time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const cleanName = sender ? sender.replace(" (Ben)", "") : "Biri";
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<span class="msg-sender">${cleanName}</span>${text}<span class="msg-time">${time}</span>`;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight; 
}
function sendChat() {
    const text = msgInput.value.trim();
    if (!text || !isConnected) return;
    addMessageToUI(userNames['me'], text, 'sent');
    const payload = JSON.stringify({ type: 'chat', sender: userNames['me'], text: text, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
    for (let id in peers) { try { peers[id].send(payload); } catch (e) { } }
    msgInput.value = '';
}

function sendPeerStatusUpdate(payload) {
    if (!isConnected) return;
    payload.senderId = myPeerId; 
    const jsonPayload = JSON.stringify(payload);
    for (let id in peers) { try { peers[id].send(jsonPayload); } catch (e) { } }
}

function setMicState(mute) {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    isMicMuted = mute;
    track.enabled = !mute; 
    sendPeerStatusUpdate({ type: 'mic-status', isMuted: mute });
    if (isMicMuted) { btnToggleMic.innerText = "🎤✖"; btnToggleMic.style.backgroundColor = "#8b281d"; } 
    else { btnToggleMic.innerText = "🎤"; btnToggleMic.style.backgroundColor = "#397251"; }
}
btnToggleMic.addEventListener('click', () => { if (isDeafened) return alert("Hoparlör kapalı!"); setMicState(!isMicMuted); });
btnToggleSound.addEventListener('click', () => {
    isDeafened = !isDeafened;
    document.querySelectorAll('audio').forEach(audio => audio.muted = isDeafened);
    if (outputAudioContext) { isDeafened ? outputAudioContext.suspend() : outputAudioContext.resume(); }
    if (isDeafened) { btnToggleSound.innerText = "🔇"; btnToggleSound.style.backgroundColor = "#8b281d"; if (!isMicMuted) setMicState(true); } 
    else { btnToggleSound.innerText = "🔊"; btnToggleSound.style.backgroundColor = "#397251"; }
});

const soundEffects = [
    { file: 'fahh_effect', title: 'Fahh Efekti', short: 'fahh'},  
    { file: 'ahhhhhhh_effect', title: 'Ahhhhhhh Efekti', short: 'aaah'},    
    { file: 'besili_camis_effect', title: 'besili camış', short: 'besili camış' },     
    { file: 'denyo_dangalak_effect', title: 'denyo mu dangalak mı?', short: 'denyo' },
    { file: 'deplasman_yasağı_effect', title: 'deplasman yarağı', short: 'dep. yasak' },
    { file: 'levo_rage_effect', title: 'harika bir oyun', short: 'işte bu' },
    { file: 'masaj_salonu_effect', title: 'mecidiyeköy masaj salonu', short: 'masaj salonu' },
    { file: 'neden_ben_effect', title: 'Neden dede neden beni seçtin', short: 'neden dede' },
    { file: 'samsun_anlık_effect', title: 'adalet mahallesinde gaza', short: 'Samsun Anlık' },
    { file: 'simdi_hoca_effect', title: 'şimdi hocam, position is obvious', short: 'Şimdi Hoca' },
    { file: 'soru_yanlısmıs_effect', title: 'Yauv sen yanlış yapmadın, soru yanlışmış yauv', short: 'Soru Yanlışmış Yauv' },
    { file: 'çok_zor_ya_effect', title: 'çok zor ya', short: 'çok zor ya' },
    { file: 'sus_artık_effect', title: 'yeter be sus artık', short: 'sus artık' },
    { file: 'buz_bira_effect', title: 'buz gibi bira var mı?', short: 'buz bira' },
    { file: 'osu_effect', title: 'yankılı osuruk', short: 'osuruk' },
    { file: 'aglama_oyna_Effect', title: 'ağlama hade oyna', short: 'ağlama oyna' }
];

document.querySelectorAll('.soundpad-btn').forEach((btn, index) => {
    const effectInfo = soundEffects[index] || { file: `effect_${index+1}`, title: `${index+1}` };
    btn.innerText = effectInfo.short || (index + 1);
    btn.title = effectInfo.title;
    btn.addEventListener('click', () => {
        if (!isConnected) return; 
        sendPeerStatusUpdate({ type: 'sound-effect', effectName: effectInfo.file });
        playLocalSound(effectInfo.file);
    });
});

function playLocalSound(effectName) {
    try {
        let soundPath = path.join(__dirname, 'assets', `${effectName}.mp3`).replace('app.asar', 'app.asar.unpacked');
        const audio = new Audio(soundPath); 
        audio.volume = masterSlider.value / 100;
        if (speakerSelect.value && audio.setSinkId) audio.setSinkId(speakerSelect.value).catch(e => {});
        if (!isDeafened) audio.play().catch(e => {});
    } catch (e) { }
}

// --- P2P MANTIĞI ---
function createPeer(targetId, name, initiator) {
    if (targetId === myPeerId) return;
    if (!window.peers) window.peers = {}; 
    if (window.peers[targetId]) return; 

    try {
        const peer = new SimplePeer({ 
            initiator: initiator, 
            stream: processedStream, 
            trickle: false, 
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } 
        });
        
        peer.on('signal', signal => { 
            if(socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'signal', targetId: targetId, signal: signal })); 
            }
        });
        
        peer.on('stream', stream => {
            if (stream.getVideoTracks().length > 0) { addVideoElement(targetId, stream); } 
            else { 
                addAudioElement(targetId, stream); 
                addUserUI(targetId, userNames[targetId] || name, true); 
                attachVisualizer(stream, targetId); 
            }
        });
        
        peer.on('data', data => { 
            try {
                const strData = new TextDecoder("utf-8").decode(data);
                const msg = JSON.parse(strData);
                if (msg.type === 'file-metadata' || msg.type === 'file-end' || msg.type === 'file-cancel') {
                    handleIncomingFileData(targetId, data);
                    return;
                }
                if (msg.type === 'chat') { addMessageToUI(msg.sender, msg.text, 'received', msg.time); } 
                else if (msg.type === 'mic-status') { updateMicStatusUI(targetId, msg.isMuted); } 
                else if (msg.type === 'sound-effect') { playLocalSound(msg.effectName); } 
                else if (msg.type === 'video-stopped') { removeVideoElement(targetId); }
            } catch (e) { handleIncomingFileData(targetId, data); }
        });
        
        peer.on('close', () => removePeer(targetId));
        peer.on('error', err => { console.error(`Peer ${targetId} hatası:`, err); }); 
        window.peers[targetId] = peer;
    } catch (e) { console.error("Peer oluşturma hatası:", e); }
}

function handleSignal(senderId, signal) {
    if (!peers[senderId]) {
        const userName = userNames[senderId] || "Bilinmeyen";
        createPeer(senderId, userName, false);
    }
    if (peers[senderId]) { peers[senderId].signal(signal); }
}

let activeRemoteStreams = {}; 

function addUserUI(id, name, isConnected) {
    let el = document.getElementById(`user-${id}`);
    const statusText = isConnected ? 'Canlı' : 'Bağlanıyor...';
    const statusColor = isConnected ? '#2ecc71' : '#f1c40f'; 
    
    if (el) {
        const statusSpan = el.querySelector('.user-status');
        if (statusSpan) {
            statusSpan.innerText = statusText;
            statusSpan.style.color = statusColor;
        }
        return;
    }
    
    el = document.createElement('div'); 
    el.id = `user-${id}`; 
    el.className = 'user-card'; 
    userListDiv.appendChild(el);
    
    let volHTML = id !== 'me' ? `
    <div class="user-volume" style="display:flex; width:100%; align-items:center; gap:5px;">
        <label>🔊</label>
        <input type="range" style="flex:1; width:100%; cursor:pointer;" min="0" max="300" value="100" oninput="document.getElementById('vol-val-${id}').innerText=this.value+'%'; if(peerGainNodes['${id}']) peerGainNodes['${id}'].gain.value=this.value/100;">
        <span id="vol-val-${id}" style="font-size:11px; width:35px; text-align:right;">100%</span>
    </div>` : '';
    
    el.innerHTML = `<div class="user-info">${id !== 'me' ? '<span class="mic-icon">🎤</span>' : ''}<span class="user-name">${name}</span><span class="user-status" style="color:${statusColor}">${statusText}</span></div>${volHTML}<div class="meter-bg"><div id="meter-fill-${id}" class="meter-fill"></div></div>`;
    if(activeRemoteStreams[id]) addVideoElement(id, activeRemoteStreams[id]); 
}

function updateMicStatusUI(id, isMuted) {
    const el = document.getElementById(`user-${id}`); if (!el) return;
    let mic = el.querySelector('.mic-icon');
    if (!mic) { mic = document.createElement('span'); mic.className='mic-icon'; el.querySelector('.user-info').prepend(mic); }
    mic.innerText = isMuted ? '❌' : '🎤'; mic.style.color = isMuted ? '#ff4757' : '#2ecc71';
}

function updateNameUI(id, name) { const el = document.getElementById(`user-${id}`); if(el) el.querySelector('.user-name').innerText = name; }

function attachVisualizer(stream, id) {
    const ac = new (window.AudioContext || window.webkitAudioContext)(); 
    const src = ac.createMediaStreamSource(stream); 
    const an = ac.createAnalyser(); an.fftSize = 64; src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount); const bar = document.getElementById(`meter-fill-${id}`);
    function draw() { if(!document.getElementById(`user-${id}`)) return; an.getByteFrequencyData(data); let sum=0; for(let i of data) sum+=i; 
    if(bar) bar.style.width = Math.min(100, (sum/data.length)*2.5) + "%"; requestAnimationFrame(draw); } draw();
}

function addAudioElement(id, stream) {
    if (document.getElementById(`audio-${id}`)) return;
    const aud = document.createElement('audio'); aud.id=`audio-${id}`; aud.srcObject=stream; aud.autoplay=true; aud.muted=true; document.getElementById('audioContainer').appendChild(aud);
    if(outputAudioContext) { try { const src=outputAudioContext.createMediaStreamSource(stream); const gn=outputAudioContext.createGain(); src.connect(gn); gn.connect(outputAudioContext.destination); peerGainNodes[id]=gn; } catch(e){ aud.muted=false; } }
}

function addVideoElement(id, stream) {
    activeRemoteStreams[id] = stream;
    const card = document.getElementById(`user-${id}`);
    if (card && !card.querySelector('.stream-icon-btn')) {
        const btn = document.createElement('button'); btn.className='stream-icon-btn'; btn.innerHTML='🖥️ İZLE'; btn.onclick=()=>openStreamModal(id); card.appendChild(btn);
    }
    stream.getVideoTracks()[0].onended = () => removeVideoElement(id);
}

function removeVideoElement(id) {
    delete activeRemoteStreams[id];
    const card = document.getElementById(`user-${id}`); if(card) { const b=card.querySelector('.stream-icon-btn'); if(b) b.remove(); }
    if(streamModal.style.display!=='none' && streamerNameLabel.getAttribute('data-id')===id) { streamModal.style.display='none'; largeVideoPlayer.srcObject=null; }
}

function removePeer(id) {
    if(peers[id]) { peers[id].destroy(); delete peers[id]; }
    if(peerGainNodes[id]) delete peerGainNodes[id];
    if(activeRemoteStreams[id]) removeVideoElement(id);
    const u = document.getElementById(`user-${id}`); if(u) u.remove();
    const a = document.getElementById(`audio-${id}`); if(a) a.remove();
}

function openStreamModal(id) {
    if(!activeRemoteStreams[id]) return alert("Yayın yok");
    largeVideoPlayer.srcObject = activeRemoteStreams[id];
    streamerNameLabel.innerText = `${userNames[id]||'Biri'} Ekranı`;
    streamerNameLabel.setAttribute('data-id', id);
    streamModal.style.display = 'flex';
}

if (btnAttach && fileInput) {
    btnAttach.addEventListener('click', () => {
        if (!isConnected) return alert("Önce bir odaya bağlanmalısınız!");
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const MAX_SIZE = 2 * 1024 * 1024 * 1024; 
        if (file.size > MAX_SIZE) {
            alert(`Dosya çok büyük (${(file.size / (1024 * 1024)).toFixed(2)} MB)! Maksimum 2GB gönderebilirsiniz.`);
            e.target.value = '';
            return;
        }
        if (typeof window.addFileSentUI === 'function') {
            const tId = "transfer-" + Date.now();
            window.addFileSentUI(file, tId);
            for (let id in peers) { window.sendFile(peers[id], file, tId); }
        }
        e.target.value = ''; 
    });
}