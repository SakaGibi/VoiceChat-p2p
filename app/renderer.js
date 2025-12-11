// app/renderer.js

// --- GLOBAL DEĞİŞKENLER ---
const PORT = 8080;
// Ngrok veya Localhost ayarını buradan yapabilirsin
// const WS_URL = `wss://SENIN-NGROK-ADRESIN.ngrok-free.app`; 
const WS_URL = `ws://localhost:${PORT}`; 

let socket;
let localStream;      
let processedStream;  
let micGainNode;      
let audioContext;     

let peers = {}; 
let userNames = {};
let isMicMuted = false;
let isDeafened = false;

// UI Elementleri
const inputUsername = document.getElementById('username');
const statusDiv = document.getElementById('status');
const userListDiv = document.getElementById('userList');
const btnConnect = document.getElementById('btnConnect');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleSound = document.getElementById('btnToggleSound');
const audioControls = document.getElementById('audioControls');
const btnTheme = document.getElementById('btnTheme');

const micSelect = document.getElementById('micSelect'); // YENİ
const micSlider = document.getElementById('micVolume');
const micVal = document.getElementById('micVal');
const masterSlider = document.getElementById('masterVolume');
const masterVal = document.getElementById('masterVal');

// --- BAŞLANGIÇ ---
window.onload = () => {
    if (!window.SimplePeer) document.getElementById('error-log').innerText = "HATA: SimplePeer yüklenemedi. Preload ayarlarını kontrol et.";
    loadSettings();
    getMicrophones(); // YENİ: Mikrofonları listele
    console.log("✅ Renderer.js yüklendi ve hazır.");
};

// --- YENİ: MİKROFONLARI LİSTELEME ---
async function getMicrophones() {
    try {
        // İsimleri görebilmek için önce izin isteyip kapatıyoruz
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        micSelect.innerHTML = ''; // Temizle
        
        // Varsayılan seçenek
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.text = "Varsayılan Mikrofon";
        micSelect.appendChild(defaultOpt);

        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            // Eğer etiketi boşsa 'Mikrofon 1, 2' diye adlandır
            option.text = device.label || `Mikrofon ${micSelect.length}`;
            micSelect.appendChild(option);
        });

        // Kayıtlı mikrofonu geri seç
        const savedMicId = localStorage.getItem('selectedMicId');
        if (savedMicId) {
            // Eğer kayıtlı mikrofon hala takılıysa onu seç
            const exists = audioInputs.some(d => d.deviceId === savedMicId);
            if (exists) micSelect.value = savedMicId;
        }

    } catch (err) {
        console.error("Mikrofon listesi hatası:", err);
    }
}

// Mikrofon değişince kaydet
micSelect.addEventListener('change', (e) => {
    saveSetting('selectedMicId', e.target.value);
});

// --- LOCAL STORAGE & TEMA ---
function saveSetting(key, value) {
    localStorage.setItem(key, value);
}

function loadSettings() {
    const savedName = localStorage.getItem('username');
    if (savedName) inputUsername.value = savedName;
    else inputUsername.value = "User_" + Math.floor(Math.random() * 1000); 

    const savedMicVol = localStorage.getItem('micVolume');
    if (savedMicVol) {
        micSlider.value = savedMicVol;
        micVal.innerText = savedMicVol + "%";
    }

    const savedMasterVol = localStorage.getItem('masterVolume');
    if (savedMasterVol) {
        masterSlider.value = savedMasterVol;
        masterVal.innerText = savedMasterVol + "%";
    }

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
    document.querySelectorAll('audio').forEach(audio => {
        audio.volume = val / 100;
    });
    saveSetting('masterVolume', val); 
});

// --- BAĞLANMA ---
btnConnect.addEventListener('click', async () => {
    const name = inputUsername.value;
    if(!name) return alert("Lütfen bir isim girin!");
    
    saveSetting('username', name);

    btnConnect.disabled = true;
    inputUsername.disabled = true;
    micSelect.disabled = true; // Bağlanınca seçimi kilitle
    
    statusDiv.innerText = "Ses motoru başlatılıyor...";
    try {
        // --- YENİ: SEÇİLEN MİKROFONU KULLAN ---
        const selectedMicId = micSelect.value;
        const constraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
            video: false
        };

        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        // ----------------------------------------
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(rawStream);
        
        micGainNode = audioContext.createGain();
        micGainNode.gain.value = micSlider.value / 100; 
        
        const destination = audioContext.createMediaStreamDestination();
        
        source.connect(micGainNode);
        micGainNode.connect(destination);
        
        localStream = rawStream; 
        processedStream = destination.stream; 

        statusDiv.innerText = "Sunucuya bağlanılıyor...";
        
        btnConnect.style.display = 'none';
        audioControls.style.display = 'flex';
        
        userNames["me"] = name + " (Ben)";
        addUserUI("me", userNames["me"], true);
        attachVisualizer(processedStream, "me"); 

        connectSocket(name);
    } catch (err) {
        console.error(err);
        statusDiv.innerText = "HATA: " + err.message;
        btnConnect.disabled = false;
        micSelect.disabled = false;
    }
});

// --- SES KONTROLLERİ ---
function setMicState(mute) {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    isMicMuted = mute;
    track.enabled = !mute; 

    if (isMicMuted) {
        btnToggleMic.innerText = "🔇 Mikrofon Kapalı";
        btnToggleMic.style.backgroundColor = "#ff4757";
        const bar = document.getElementById('meter-fill-me');
        if(bar) bar.style.backgroundColor = "#555"; 
    } else {
        btnToggleMic.innerText = "🎤 Mikrofon Açık";
        btnToggleMic.style.backgroundColor = "#2ecc71";
        const bar = document.getElementById('meter-fill-me');
        if(bar) bar.style.backgroundColor = "#2ecc71";
    }
}

btnToggleMic.addEventListener('click', () => {
    if (isDeafened) return alert("Hoparlör kapalıyken mikrofonu açamazsınız!");
    setMicState(!isMicMuted);
});

btnToggleSound.addEventListener('click', () => {
    isDeafened = !isDeafened;
    document.querySelectorAll('audio').forEach(audio => audio.muted = isDeafened);

    if (isDeafened) {
        btnToggleSound.innerText = "🔇 Ses Kapalı";
        btnToggleSound.style.backgroundColor = "#ff4757";
        if (!isMicMuted) setMicState(true);
    } else {
        btnToggleSound.innerText = "🔊 Ses Duyuluyor";
        btnToggleSound.style.backgroundColor = "#2ecc71";
    }
});

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
                statusDiv.innerText = `Sohbet Odası (${data.users.length + 1} Kişi)`;
                data.users.forEach(user => {
                    userNames[user.id] = user.name;
                    createPeer(user.id, user.name, true);
                });
            } 
            else if (data.type === 'user-joined') {
                statusDiv.innerText = `${data.name} katıldı.`;
                userNames[data.id] = data.name;
                updateNameUI(data.id, data.name);
            } 
            else if (data.type === 'signal') handleSignal(data.senderId, data.signal);
            else if (data.type === 'user-left') removePeer(data.id);
        } catch (e) { console.error(e); }
    };
    socket.onerror = () => statusDiv.innerText = "Sunucu Bağlantı Hatası!";
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
            socket.send(JSON.stringify({ type: 'signal', targetId: targetId, signal: signal }));
        });

        peer.on('stream', stream => {
            addAudioElement(targetId, stream);
            const finalName = userNames[targetId] || name || "Bilinmeyen";
            addUserUI(targetId, finalName, true);
            attachVisualizer(stream, targetId);
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
    
    const bgColor = isConnected ? 'var(--user-connected)' : 'var(--user-connecting)';
    el.style.backgroundColor = bgColor;
    
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
            <span class="user-name">${name}</span>
            <span class="user-status">${statusText}</span>
        </div>
        ${volumeControlHTML}
        <div class="meter-bg">
            <div id="meter-fill-${id}" class="meter-fill"></div>
        </div>
    `;
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
        if (!barElement) return; 
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        const percent = Math.min(100, average * 2.5); 
        barElement.style.width = percent + "%";
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

    if (isDeafened) audio.muted = true;
    document.getElementById('audioContainer').appendChild(audio);
}

function removePeer(id) {
    if(peers[id]) { peers[id].destroy(); delete peers[id]; }
    const el = document.getElementById(`user-${id}`); if(el) el.remove();
    const aud = document.getElementById(`audio-${id}`); if(aud) aud.remove();
    delete userNames[id];
}