// app/renderer.js - SON SÜRÜM (Kompakt Tasarım & Emojili & Soundpad)

const PORT = 8080;
// Sunucu IP adresi (Değişirse burayı güncelleyin)
const WS_URL = `ws://3.121.233.106:8080`; 

const joinSound = new Audio('assets/gazmaliyim.mp3');
joinSound.volume = 0.2;

const chatHistory = document.getElementById('chatHistory');
const msgInput = document.getElementById('msgInput');
const btnSend = document.getElementById('btnSend');

let socket;
let localStream;      
let processedStream;  
let micGainNode;
let sourceNode; 
let audioContext;     

let peers = {}; 
let userNames = {};
let isMicMuted = false;
let isDeafened = false;
let isConnected = false;

// --- GLOBAL VARIABLES ---
let statusTimeout;       
let onlineUserCount = 0; 
let myPeerId = null;

// UI Elements
const inputUsername = document.getElementById('username');
const statusDiv = document.getElementById('status');
const userListDiv = document.getElementById('userList');

const btnConnect = document.getElementById('btnConnect');
// btnDisconnect artık activeControls içinde, dinamik alacağız veya aşağıda tanımlayacağız
const activeControls = document.getElementById('activeControls');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleSound = document.getElementById('btnToggleSound');

const btnTheme = document.getElementById('btnTheme');

const micSelect = document.getElementById('micSelect');
const speakerSelect = document.getElementById('speakerSelect'); 
const micSlider = document.getElementById('micVolume');
const micVal = document.getElementById('micVal');
const masterSlider = document.getElementById('masterVolume');
const masterVal = document.getElementById('masterVal');


// --- YARDIMCI FONKSİYON: GEÇİCİ BİLDİRİM ---
function showTemporaryStatus(message) {
    statusDiv.innerText = message;
    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
        statusDiv.innerText = `Sohbet Odası (${onlineUserCount} Kişi)`;
    }, 3000);
}

// --- BAŞLANGIÇ ---
window.onload = () => {
    if (!window.SimplePeer) document.getElementById('error-log').innerText = "HATA: SimplePeer yüklenemedi.";
    loadSettings();
    getDevices(); 
};

// --- CİHAZLARI LİSTELE ---
async function getDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); 
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

        micSelect.innerHTML = '<option value="">Varsayılan Mikrofon</option>';
        audioInputs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.text = d.label || `Mikrofon ${micSelect.length}`;
            micSelect.appendChild(opt);
        });

        speakerSelect.innerHTML = '<option value="">Varsayılan Hoparlör</option>';
        audioOutputs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.text = d.label || `Hoparlör ${speakerSelect.length}`;
            speakerSelect.appendChild(opt);
        });

        const savedMic = localStorage.getItem('selectedMicId');
        if (savedMic && audioInputs.some(d => d.deviceId === savedMic)) micSelect.value = savedMic;

        const savedSpeaker = localStorage.getItem('selectedSpeakerId');
        if (savedSpeaker && audioOutputs.some(d => d.deviceId === savedSpeaker)) speakerSelect.value = savedSpeaker;

    } catch (err) { console.error(err); }
}

// --- CİHAZ DEĞİŞİMLERİ ---
micSelect.addEventListener('change', async (e) => {
    saveSetting('selectedMicId', e.target.value);
    if (isConnected) await switchMicrophone(e.target.value);
});

async function switchMicrophone(deviceId) {
    try {
        if (localStream) localStream.getTracks().forEach(t => t.stop());

        const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            video: false
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (sourceNode) sourceNode.disconnect();
        
        sourceNode = audioContext.createMediaStreamSource(newStream);
        sourceNode.connect(micGainNode); 
        
        localStream = newStream;
        setMicState(isMicMuted); // Eski mute durumunu koru

    } catch (err) {
        console.error("Mikrofon değiştirilemedi:", err);
        alert("Mikrofon değiştirilemedi: " + err.message);
    }
}

speakerSelect.addEventListener('change', (e) => {
    const deviceId = e.target.value;
    saveSetting('selectedSpeakerId', deviceId);
    changeOutputDevice(deviceId);
});

function changeOutputDevice(deviceId) {
    document.querySelectorAll('audio').forEach(async (audio) => {
        if (audio.setSinkId) {
            try { await audio.setSinkId(deviceId); } catch (err) { console.error(err); }
        }
    });
}

// --- LOCAL STORAGE & TEMA ---
function saveSetting(key, value) { localStorage.setItem(key, value); }
function loadSettings() {
    const savedName = localStorage.getItem('username');
    if (savedName) inputUsername.value = savedName;
    else inputUsername.value = "User_" + Math.floor(Math.random() * 1000); 

    const savedMicVol = localStorage.getItem('micVolume');
    if (savedMicVol) { micSlider.value = savedMicVol; micVal.innerText = savedMicVol + "%"; }

    const savedMasterVol = localStorage.getItem('masterVolume');
    if (savedMasterVol) { masterSlider.value = savedMasterVol; masterVal.innerText = savedMasterVol + "%"; }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        btnTheme.innerText = '🌙';
    } else {
        btnTheme.innerText = '☀️';
    }
}
btnTheme.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    btnTheme.innerText = isLight ? '🌙' : '☀️';
    saveSetting('theme', isLight ? 'light' : 'dark');
});
inputUsername.addEventListener('input', (e) => saveSetting('username', e.target.value));

// --- SES AYARLARI ---
micSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    micVal.innerText = val + "%";
    if (micGainNode) micGainNode.gain.value = val / 100; 
    saveSetting('micVolume', val); 
});
masterSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    masterVal.innerText = val + "%";
    document.querySelectorAll('audio').forEach(audio => audio.volume = val / 100);
    saveSetting('masterVolume', val); 
});

// --- BAĞLANMA (BTNCONNECT) ---
btnConnect.addEventListener('click', async () => {
    const name = inputUsername.value;
    if(!name) return alert("Lütfen bir isim girin!");
    saveSetting('username', name);

    // GÖRÜNÜRLÜK AYARLARI (YENİ)
    btnConnect.style.display = 'none'; 
    activeControls.style.display = 'flex'; // Kare butonları aç
    inputUsername.disabled = true;
    
    statusDiv.innerText = "Ses motoru başlatılıyor...";
    try {
        const selectedMicId = micSelect.value;
        const constraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
            video: false
        };

        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioContext.createMediaStreamSource(rawStream);
        
        micGainNode = audioContext.createGain();
        micGainNode.gain.value = micSlider.value / 100; 
        
        const destination = audioContext.createMediaStreamDestination();
        
        sourceNode.connect(micGainNode);
        micGainNode.connect(destination);
        
        localStream = rawStream; 
        processedStream = destination.stream; 

        statusDiv.innerText = "Sunucuya bağlanılıyor...";
        
        msgInput.disabled = false;
        btnSend.disabled = false;
        
        userNames["me"] = name + " (Ben)";
        myPeerId = 'me';
        addUserUI("me", userNames["me"], true);
        attachVisualizer(processedStream, "me"); 

        connectSocket(name);
        isConnected = true;
    } catch (err) {
        console.error(err);
        disconnectRoom(); 
        statusDiv.innerText = "HATA: " + err.message;
    }
});

btnSend.addEventListener('click', sendChat);
msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

// --- ODADAN AYRILMA ---
btnDisconnect.addEventListener('click', () => {
    disconnectRoom();
});

function disconnectRoom() {
    isConnected = false;
    
    if (socket) { socket.close(); socket = null; }

    for (let id in peers) { peers[id].destroy(); }
    peers = {};

    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    localStream = null;
    audioContext = null;

    document.getElementById('userList').innerHTML = ''; 
    document.getElementById('audioContainer').innerHTML = ''; 
    
    // GÖRÜNÜRLÜK AYARLARI (YENİ)
    btnConnect.style.display = 'block';     // Katıl butonunu geri getir
    activeControls.style.display = 'none';  // Kare butonları gizle
    
    inputUsername.disabled = false;
    msgInput.disabled = true;
    btnSend.disabled = true;
    
    statusDiv.innerText = "Odan ayrıldınız. Hazır...";
}

// --- CHAT FONKSİYONLARI ---
function addMessageToUI(sender, text, type, time = null) {
    if (!time) time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const cleanName = sender.replace(" (Ben)", "");
    
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

    const payload = JSON.stringify({
        type: 'chat',
        sender: userNames['me'],
        text: text,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    });

    for (let id in peers) {
        try { peers[id].send(payload); } catch (e) { console.error("Mesaj gönderilemedi:", e); }
    }
    msgInput.value = '';
}

function sendPeerStatusUpdate(payload) {
    if (!isConnected) return;
    payload.senderId = 'me'; 
    const jsonPayload = JSON.stringify(payload);
    for (let id in peers) {
        try { peers[id].send(jsonPayload); } catch (e) { console.error(`Status gönderilemedi (${id}):`, e); }
    }
}

// --- SES KONTROLLERİ VE EMOJİLER ---
function setMicState(mute) {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    isMicMuted = mute;
    track.enabled = !mute; 

    sendPeerStatusUpdate({ type: 'mic-status', isMuted: mute });

    // YENİ EMOJİ AYARLARI
    if (isMicMuted) {
        btnToggleMic.innerText = "🎤✖"; // Kapalı Emoji
        btnToggleMic.style.backgroundColor = "#57160fff"; // Kırmızı
    } else {
        btnToggleMic.innerText = "🎤";   // Açık Emoji
        btnToggleMic.style.backgroundColor = "#397251ff"; // Yeşil
    }
}

btnToggleMic.addEventListener('click', () => {
    if (isDeafened) return alert("Hoparlör kapalıyken mikrofonu açamazsınız!");
    setMicState(!isMicMuted);
});

btnToggleSound.addEventListener('click', () => {
    isDeafened = !isDeafened;
    document.querySelectorAll('audio').forEach(audio => audio.muted = isDeafened);
    
    // YENİ EMOJİ AYARLARI
    if (isDeafened) {
        btnToggleSound.innerText = "🔇";  // Ses Kapalı
        btnToggleSound.style.backgroundColor = "#57160fff";
        if (!isMicMuted) setMicState(true); // Sağır olunca mikrofonu da kapat
    } else {
        btnToggleSound.innerText = "🔊";  // Ses Açık
        btnToggleSound.style.backgroundColor = "#397251ff";
    }
});

// --- SOUNDPAD (GÜNCELLENMİŞ) ---
const soundEffects = [
    { file: 'fahh_effect', title: 'Fahh Efekti' },  
    { file: 'effect_2',    title: 'Alkış Sesi' },   
    { file: 'effect_3',    title: 'Zil Sesi' },     
    { file: 'effect_4',    title: 'Gülme Efekti' }, 
    // ... 16'ya kadar doldurun
];

document.querySelectorAll('.soundpad-btn').forEach((btn, index) => {
    const soundId = index + 1;
    const effectInfo = soundEffects[index] || { 
        file: `effect_${soundId}`, 
        title: `Ses Efekti ${soundId}` 
    };

    btn.innerText = soundId.toString();
    btn.title = effectInfo.title; 

    btn.addEventListener('click', () => {
        if (!isConnected) return; // Bağlı değilsek çalma
        
        sendPeerStatusUpdate({ type: 'sound-effect', effectName: effectInfo.file });
        playLocalSound(effectInfo.file);
    });
});

function playLocalSound(effectName) {
    try {
        const audio = new Audio(`assets/${effectName}.mp3`); 
        const masterVol = document.getElementById('masterVolume').value;
        audio.volume = masterVol / 100;
        
        if (isDeafened) return; 

        audio.play().catch(e => console.warn("Ses çalma hatası:", e));
    } catch (e) { console.error("Ses dosyası hatası:", e); }
}

// --- WEBSOCKET ---
function connectSocket(name) {
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        statusDiv.innerText = "Odaya giriliyor...";
        socket.send(JSON.stringify({ type: 'join', name: name }));
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'user-list') {
                onlineUserCount = data.users.length + 1; 
                statusDiv.innerText = `Sohbet Odası (${onlineUserCount} Kişi)`;
                data.users.forEach(user => {
                    userNames[user.id] = user.name;
                    createPeer(user.id, user.name, true);
                });
            } 
            else if (data.type === 'user-joined') {
                onlineUserCount++; 
                userNames[data.id] = data.name;
                updateNameUI(data.id, data.name);
                joinSound.play().catch(e => {});                
                showTemporaryStatus(`${data.name} katıldı 👋`);
            } 
            else if (data.type === 'user-left') {
                if (peers[data.id]) { onlineUserCount--; }
                const leaverName = userNames[data.id] || "Biri";
                removePeer(data.id);
                showTemporaryStatus(`${leaverName} ayrıldı 💨`);
            }
            else if (data.type === 'signal') handleSignal(data.senderId, data.signal);
        } catch (e) { console.error(e); }
    };
    
    socket.onerror = () => { statusDiv.innerText = "Sunucu Bağlantı Hatası!"; disconnectRoom(); };
    socket.onclose = () => { if(isConnected) disconnectRoom(); };
}

// --- P2P ---
function createPeer(targetId, name, initiator) {
    try {
        const peer = new window.SimplePeer({
            initiator: initiator,
            stream: processedStream,
            trickle: false,
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
        });

        peer.on('signal', signal => {
            if(socket && socket.readyState === WebSocket.OPEN)
                socket.send(JSON.stringify({ type: 'signal', targetId: targetId, signal: signal }));
        });

        peer.on('stream', stream => {
            addAudioElement(targetId, stream);
            const finalName = userNames[targetId] || name || "Bilinmeyen";
            addUserUI(targetId, finalName, true);
            attachVisualizer(stream, targetId);
        });

        peer.on('data', data => {
            try {
                const strData = new TextDecoder("utf-8").decode(data);
                const msg = JSON.parse(strData);
        
                if (msg.type === 'chat') {
                    addMessageToUI(msg.sender, msg.text, 'received', msg.time);
                } 
                else if (msg.type === 'mic-status') {
                    updateMicStatusUI(targetId, msg.isMuted);
                }
                else if (msg.type === 'sound-effect') {
                    playLocalSound(msg.effectName);
                }
            } catch (e) { console.error("Gelen P2P Data hatası:", e); }
        });

        peer.on('close', () => removePeer(targetId));
        peer.on('error', err => console.error("Peer hatası:", err));

        peers[targetId] = peer;
        if(!document.getElementById(`user-${targetId}`)) {
            const finalName = userNames[targetId] || name || "Bilinmeyen";
            addUserUI(targetId, finalName, false);
        }
    } catch (e) { console.error(e); }
}

function handleSignal(senderId, signal) {
    if (!peers[senderId]) {
        const storedName = userNames[senderId] || "Bilinmeyen";
        createPeer(senderId, storedName, false);
    }
    if (peers[senderId]) peers[senderId].signal(signal);
}

// --- UI HELPERS ---
function addUserUI(id, name, isConnected) {
    let el = document.getElementById(`user-${id}`);
    const statusText = isConnected ? 'Canlı' : 'Bağlanıyor...';
    
    if (!el) {
        el = document.createElement('div');
        el.id = `user-${id}`;
        el.className = 'user-card';
        userListDiv.appendChild(el);
    }
        
    let volumeControlHTML = '';
    if (id !== 'me') {
        volumeControlHTML = `
            <div class="user-volume">
                <label>🔊</label>
                <input type="range" min="0" max="100" value="100" 
                        oninput="
                           document.getElementById('audio-${id}').volume = this.value/100;
                           document.getElementById('vol-val-${id}').innerText = this.value + '%';
                        ">
                <span id="vol-val-${id}">100%</span>
            </div>
        `;
    }

    el.innerHTML = `
        <div class="user-info">
            ${id !== 'me' ? '<span class="mic-icon">🎤</span>' : ''} 
            <span class="user-name">${name}</span>
            <span class="user-status">${statusText}</span>
        </div>
        ${volumeControlHTML}
        <div class="meter-bg">
            <div id="meter-fill-${id}" class="meter-fill"></div>
        </div>
    `;
}

function updateMicStatusUI(id, isMuted) {
    const userCard = document.getElementById(`user-${id}`);
    if (!userCard) return;

    let micIcon = userCard.querySelector('.mic-icon');
    if (!micIcon) {
        micIcon = document.createElement('span');
        micIcon.className = 'mic-icon';
        userCard.querySelector('.user-info').prepend(micIcon); 
    }

    if (isMuted) {
        micIcon.innerText = '❌'; 
        micIcon.style.color = '#ff4757';
    } else {
        micIcon.innerText = '🎤'; 
        micIcon.style.color = '#2ecc71';
    }
}

function updateNameUI(id, newName) {
    const el = document.getElementById(`user-${id}`);
    if (el) {
        const nameSpan = el.querySelector('.user-name');
        if (nameSpan) nameSpan.innerText = newName;
    }
}

function attachVisualizer(stream, id) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64; 
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const barElement = document.getElementById(`meter-fill-${id}`);

    function updateMeter() {
        if (!document.getElementById(`user-${id}`)) return; 
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        const percent = Math.min(100, average * 2.5); 
        if(barElement) barElement.style.width = percent + "%";
        requestAnimationFrame(updateMeter);
    }
    updateMeter();
}

function addAudioElement(id, stream) {
    if (document.getElementById(`audio-${id}`)) return;
    const audio = document.createElement('audio');
    audio.id = `audio-${id}`;
    audio.srcObject = stream;
    audio.autoplay = true;
    
    const masterVol = document.getElementById('masterVolume').value;
    audio.volume = masterVol / 100;

    const selectedSpeaker = document.getElementById('speakerSelect').value;
    if (selectedSpeaker && audio.setSinkId) {
        audio.setSinkId(selectedSpeaker).catch(e => console.error(e));
    }

    if (isDeafened) audio.muted = true;
    document.getElementById('audioContainer').appendChild(audio);
}

function removePeer(id) {
    if(peers[id]) { peers[id].destroy(); delete peers[id]; }
    const el = document.getElementById(`user-${id}`); if(el) el.remove();
    const aud = document.getElementById(`audio-${id}`); if(aud) aud.remove();
    delete userNames[id];
}