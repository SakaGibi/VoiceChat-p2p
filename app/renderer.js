// app/renderer.js

const PORT = 8080;
// sunucu ip adresi: 3.121.233.106
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
let sourceNode; // Canlı değişim için kaynak düğümünü tutmamız lazım
let audioContext;     

let peers = {}; 
let userNames = {};
let isMicMuted = false;
let isDeafened = false;
let isConnected = false;

// --- YENİ EKLENECEK GLOBAL DEĞİŞKENLER ---
let statusTimeout;       // Zamanlayıcıyı tutmak için
let onlineUserCount = 0; // Kişi sayısını hafızada tutmak için

// --- YENİ YARDIMCI FONKSİYON ---
// Bu fonksiyon mesajı gösterir, 3 saniye sonra kişi sayısına döner
function showTemporaryStatus(message) {
    statusDiv.innerText = message;
    
    // Eğer önceden ayarlanmış bir sayaç varsa iptal et (üst üste binmesin)
    if (statusTimeout) clearTimeout(statusTimeout);

    // 3 saniye (3000 ms) sonra varsayılan metne dön
    statusTimeout = setTimeout(() => {
        statusDiv.innerText = `Sohbet Odası (${onlineUserCount} Kişi)`;
    }, 3000);
}

// UI
const inputUsername = document.getElementById('username');
const statusDiv = document.getElementById('status');
const userListDiv = document.getElementById('userList');
const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleSound = document.getElementById('btnToggleSound');
const audioControls = document.getElementById('audioControls');
const btnTheme = document.getElementById('btnTheme');

const micSelect = document.getElementById('micSelect');
const speakerSelect = document.getElementById('speakerSelect'); // YENİ
const micSlider = document.getElementById('micVolume');
const micVal = document.getElementById('micVal');
const masterSlider = document.getElementById('masterVolume');
const masterVal = document.getElementById('masterVal');

// --- BAŞLANGIÇ ---
window.onload = () => {
    if (!window.SimplePeer) document.getElementById('error-log').innerText = "HATA: SimplePeer yüklenemedi.";
    loadSettings();
    getDevices(); // Hem mic hem speaker
};

// --- CİHAZLARI LİSTELE (GİRİŞ VE ÇIKIŞ) ---
async function getDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); // İzin tetikle
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

        // Mikrofonları Doldur
        micSelect.innerHTML = '<option value="">Varsayılan Mikrofon</option>';
        audioInputs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.text = d.label || `Mikrofon ${micSelect.length}`;
            micSelect.appendChild(opt);
        });

        // Hoparlörleri Doldur
        speakerSelect.innerHTML = '<option value="">Varsayılan Hoparlör</option>';
        audioOutputs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.text = d.label || `Hoparlör ${speakerSelect.length}`;
            speakerSelect.appendChild(opt);
        });

        // Kayıtlı Ayarları Geri Yükle
        const savedMic = localStorage.getItem('selectedMicId');
        if (savedMic && audioInputs.some(d => d.deviceId === savedMic)) micSelect.value = savedMic;

        const savedSpeaker = localStorage.getItem('selectedSpeakerId');
        if (savedSpeaker && audioOutputs.some(d => d.deviceId === savedSpeaker)) speakerSelect.value = savedSpeaker;

    } catch (err) { console.error(err); }
}

// --- CANLI CİHAZ DEĞİŞİMLERİ ---

// 1. MİKROFON DEĞİŞİMİ (EN ZOR KISIM)
micSelect.addEventListener('change', async (e) => {
    saveSetting('selectedMicId', e.target.value);
    
    // Eğer sohbete bağlıysak canlı değişim yap (Hot Swap)
    if (isConnected) {
        console.log("Mikrofon canlı değiştiriliyor...");
        await switchMicrophone(e.target.value);
    }
});

async function switchMicrophone(deviceId) {
    try {
        // Eski akışı durdur
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }

        // Yeni akışı al
        const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            video: false
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // AudioContext'teki kaynağı değiştir
        // Önceki kaynağı kopar
        if (sourceNode) sourceNode.disconnect();
        
        // Yeni kaynak oluştur ve GainNode'a bağla
        sourceNode = audioContext.createMediaStreamSource(newStream);
        sourceNode.connect(micGainNode); // GainNode zaten Destination'a bağlı, zincir tamam.
        
        // P2P Bağlantılarını Güncelle (ReplaceTrack)
        // Karşı tarafa giden işlenmiş track'i bulmamız lazım. 
        // processedStream (Destination) değişmedi ama içindeki veri değişti.
        // Ancak SimplePeer'a "eski track yerine bunu kullan" dememiz gerekebilir.
        
        // NOT: AudioContext Destination stream'i otomatik güncellenir mi? Evet.
        // Ama localStream referansını güncellemeliyiz ki "Mute" fonksiyonu çalışsın.
        localStream = newStream;

        // Mute durumu varsa yenisine de uygula
        setMicState(isMicMuted);

    } catch (err) {
        console.error("Mikrofon değiştirilemedi:", err);
        alert("Mikrofon değiştirilemedi: " + err.message);
    }
}

// 2. HOPARLÖR DEĞİŞİMİ
speakerSelect.addEventListener('change', (e) => {
    const deviceId = e.target.value;
    saveSetting('selectedSpeakerId', deviceId);
    changeOutputDevice(deviceId);
});

function changeOutputDevice(deviceId) {
    // Sayfadaki tüm <audio> elementlerini bul ve çıkışını değiştir
    document.querySelectorAll('audio').forEach(async (audio) => {
        if (audio.setSinkId) {
            try {
                await audio.setSinkId(deviceId);
            } catch (err) { console.error("Hoparlör değiştirilemedi:", err); }
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

// --- BAĞLANMA ---
btnConnect.addEventListener('click', async () => {
    const name = inputUsername.value;
    if(!name) return alert("Lütfen bir isim girin!");
    saveSetting('username', name);

    btnConnect.style.display = 'none'; // Bağlan butonunu gizle
    btnDisconnect.style.display = 'flex'; // Ayrıl butonunu göster
    
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
        
        audioControls.style.display = 'flex';
        msgInput.disabled = false;
        btnSend.disabled = false;
        
        userNames["me"] = name + " (Ben)";
        addUserUI("me", userNames["me"], true);
        attachVisualizer(processedStream, "me"); 

        connectSocket(name);
        isConnected = true;
    } catch (err) {
        console.error(err);
        disconnectRoom(); // Hata olursa sıfırla
        statusDiv.innerText = "HATA: " + err.message;
    }
});

// Gönder butonuna tıklandığında
btnSend.addEventListener('click', sendChat);

// Mesaj input alanında Enter'a basıldığında
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

// --- ODADAN AYRILMA (DISCONNECT) ---
btnDisconnect.addEventListener('click', () => {
    disconnectRoom();
});

function disconnectRoom() {
    isConnected = false;
    
    // 1. Socket'i kapat
    if (socket) {
        socket.close();
        socket = null;
    }

    // 2. Peer bağlantılarını kapat
    for (let id in peers) {
        peers[id].destroy();
    }
    peers = {};

    // 3. Mikrofonu ve Ses Motorunu kapat
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    localStream = null;
    audioContext = null;

    // 4. Arayüzü Temizle
    document.getElementById('userList').innerHTML = ''; // Kullanıcı listesini sil
    document.getElementById('audioContainer').innerHTML = ''; // Audio elementlerini sil
    
    // 5. Butonları Eski Haline Getir
    btnConnect.style.display = 'flex';
    btnDisconnect.style.display = 'none';
    audioControls.style.display = 'none';
    inputUsername.disabled = false;
    msgInput.disabled = true;
    btnSend.disabled = true;
    
    statusDiv.innerText = "Odan ayrıldınız. Hazır...";
}

// --- CHAT FONKSİYONLARI ---

// Gelen mesajı ekrana basar (UI Helper)
function addMessageToUI(sender, text, type, time = null) {
    if (!time) time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const cleanName = sender.replace(" (Ben)", "");
    
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<span class="msg-sender">${cleanName}</span>${text}<span class="msg-time">${time}</span>`;
    
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight; // Yeni mesajda aşağı kaydır
}

// Mesajı P2P ile gönderir
function sendChat() {
    const text = msgInput.value.trim();
    if (!text || !isConnected) return;

    // 1. Kendi ekranımıza ekle
    addMessageToUI(userNames['me'], text, 'sent');

    // 2. JSON paketi hazırla
    const payload = JSON.stringify({
        type: 'chat',
        sender: userNames['me'],
        text: text,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    });

    // 3. Tüm bağlı peer'lara gönder
    for (let id in peers) {
        try {
            peers[id].send(payload);
        } catch (e) { console.error("Mesaj gönderilemedi:", e); }
    }

    msgInput.value = '';
}

// PEER DURUM GÜNCELLEMESİ GÖNDERME FONKSİYONU ---
function sendPeerStatusUpdate(payload) {
    if (!isConnected) return;
    
    payload.senderId = 'me';
    
    const jsonPayload = JSON.stringify(payload);

    for (let id in peers) {
        try {
            peers[id].send(jsonPayload);
        } catch (e) { 
            console.error(`Status gönderilemedi (${id}):`, e); 
        }
    }
}

// --- SES KONTROLLERİ ---
function setMicState(mute) {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    isMicMuted = mute;
    track.enabled = !mute; 

    sendPeerStatusUpdate({ type: 'mic-status', isMuted: mute });

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
// --- WEBSOCKET FONKSİYONU GÜNCELLENMİŞ HALİ ---
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
                // 1. LİSTE GELDİĞİNDE (BAŞLANGIÇ)
                // Kendimiz (+1) dahil toplam sayıyı kaydet
                onlineUserCount = data.users.length + 1; 
                statusDiv.innerText = `Sohbet Odası (${onlineUserCount} Kişi)`;
                
                data.users.forEach(user => {
                    userNames[user.id] = user.name;
                    createPeer(user.id, user.name, true);
                });
            } 
            else if (data.type === 'user-joined') {
                // 2. BİRİ KATILDIĞINDA
                onlineUserCount++; // Sayıyı artır
                userNames[data.id] = data.name;
                updateNameUI(data.id, data.name);

                // Bildirim sesi çal
                joinSound.play().catch(e => console.log("Ses çalma hatası (otomatik oynatma izni gerekebilir):", e));                
                
                // Geçici mesajı göster (3 saniye sonra sayıya döner)
                showTemporaryStatus(`${data.name} katıldı 👋`);
            } 
            else if (data.type === 'user-left') {
                // 3. BİRİ AYRILDIĞINDA
                if (peers[data.id]) { // Sadece bizde ekliyse düşelim (Hata önlemi)
                    onlineUserCount--; // Sayıyı azalt
                }
                
                // İsmi al (yoksa 'Biri')
                const leaverName = userNames[data.id] || "Biri";
                removePeer(data.id);
                
                // Geçici mesajı göster
                showTemporaryStatus(`${leaverName} ayrıldı 💨`);
            }
            else if (data.type === 'signal') handleSignal(data.senderId, data.signal);
        } catch (e) { console.error(e); }
    };
    
    socket.onerror = () => {
        statusDiv.innerText = "Sunucu Bağlantı Hatası!";
        disconnectRoom();
    };
    socket.onclose = () => {
         if(isConnected) disconnectRoom();
    };
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
                // Gelen veriyi stringe çevirip JSON'a parse et
                const strData = new TextDecoder("utf-8").decode(data);
                const msg = JSON.parse(strData);
        
                if (msg.type === 'chat') {
                    // Sadece chat mesajlarını ekrana bas
                    addMessageToUI(msg.sender, msg.text, 'received', msg.time);
                }
                else if (msg.type === 'mic-status') {
                    // UI'daki kişinin yanındaki mute ikonunu güncelle
                    updateMicStatusUI(targetId, msg.isMuted); // targetId, createPeer fonksiyonunun argümanıdır
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

// MIKROFON DURUM İKONUNU GÜNCELLE ---
function updateMicStatusUI(id, isMuted) {
    const userCard = document.getElementById(`user-${id}`);
    if (!userCard) return;

    let micIcon = userCard.querySelector('.mic-icon');
    
    if (!micIcon) {
        // Eğer ikon yoksa (HTML'de eklemediysek) oluştur.
        micIcon = document.createElement('span');
        micIcon.className = 'mic-icon';
        userCard.querySelector('.user-info').prepend(micIcon); // Adın önüne ekle
    }

    if (isMuted) {
        micIcon.innerText = '❌'; // Kapalı ikon
        micIcon.style.color = '#ff4757';
    } else {
        micIcon.innerText = '🎤'; // Açık ikon
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
    // Görselleştirici için yeni bir context açmıyoruz, window.AudioContext veya mevcut olanı kullanıyoruz
    // Ancak görselleştirici stream'den bağımsız çalışmalı.
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64; 
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const barElement = document.getElementById(`meter-fill-${id}`);

    function updateMeter() {
        if (!document.getElementById(`user-${id}`)) return; // Eleman yoksa dur
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

    // Seçili hoparlörü uygula
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