// app/audio/audioEngine.js
const path = require('path');
const dom = require('../ui/dom');
const state = require('../state/appState');

// --- DOSYA YOLU BULUCU ---
function getAssetPath(fileName) {    
    let assetPath = path.join(__dirname, '..', 'assets', fileName);

    if (assetPath.includes('app.asar')) {
        assetPath = assetPath.replace('app.asar', 'app.asar.unpacked');
    }

    return assetPath;
}

// --- SİSTEM SESLERİ ---
function playSystemSound(type) {
    if (state.isDeafened) return;

    let fileName = '';
    if (type === 'join') fileName = 'RIZZ_effect.mp3';
    else if (type === 'leave') fileName = 'cikis_effect.mp3';
    else if (type === 'notification') fileName = 'notification_effect.mp3';

    try {
        const soundPath = getAssetPath(fileName);
        const audio = new Audio(soundPath);
        
        audio.volume = dom.masterSlider ? (dom.masterSlider.value / 100) : 1.0;
        
        if (dom.speakerSelect && dom.speakerSelect.value && typeof audio.setSinkId === 'function') {
            audio.setSinkId(dom.speakerSelect.value).catch(e => {});
        }
        
        audio.play().catch(() => {});
    } catch (e) { console.error(e); }
}

// --- YEREL EFEKT SESLERİ (Soundpad) ---
function playLocalSound(effectName) {
    if (state.isDeafened) return;
    try {
        const fileName = effectName.endsWith('.mp3') ? effectName : `${effectName}.mp3`;
        const soundPath = getAssetPath(fileName);
        
        const audio = new Audio(soundPath);
        audio.volume = dom.masterSlider ? (dom.masterSlider.value / 100) : 1.0;
        
        if (dom.speakerSelect && dom.speakerSelect.value && typeof audio.setSinkId === 'function') {
            audio.setSinkId(dom.speakerSelect.value).catch(e => {});
        }

        audio.play().catch(() => {});
    } catch (e) { }
}

// --- MİKROFONU BAŞLAT (Local Stream) ---
async function initLocalStream(deviceId = null) {
    try {
        if (!deviceId && dom.micSelect && dom.micSelect.value) {
            deviceId = dom.micSelect.value;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false 
            }, 
            video: false 
        });
        
        state.localStream = stream;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.audioContext = new AudioContext();
        
        if (state.audioContext.state === 'suspended') {
            await state.audioContext.resume();
        }

        const source = state.audioContext.createMediaStreamSource(stream);
        const gainNode = state.audioContext.createGain();
        
        const initialGain = dom.micSlider ? (dom.micSlider.value / 100) : 1.0;
        gainNode.gain.value = initialGain;
        state.micGainNode = gainNode;

        const destination = state.audioContext.createMediaStreamDestination();
        
        source.connect(gainNode);
        gainNode.connect(destination);

        state.processedStream = destination.stream;
        return true;
    } catch (e) {
        alert("Mikrofon başlatılamadı!");
        return false;
    }
}

// --- UZAK KULLANICI SESİNİ EKLE ---
function addAudioElement(id, stream) {
    let audioEl = document.getElementById(`audio-${id}`);
    if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-${id}`;
        audioEl.autoplay = true; 
        document.body.appendChild(audioEl);
    }

    const anchorAudio = document.createElement('audio');
    anchorAudio.srcObject = stream;
    anchorAudio.muted = true; 
    anchorAudio.play().catch(() => {});
    audioEl._anchor = anchorAudio; 

    if (!state.outputAudioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.outputAudioContext = new AudioContext();
    }

    if (state.outputAudioContext.state === 'suspended') {
        state.outputAudioContext.resume();
    }

    try {
        const source = state.outputAudioContext.createMediaStreamSource(stream);
        const gainNode = state.outputAudioContext.createGain();
        const destination = state.outputAudioContext.createMediaStreamDestination();

        source.connect(gainNode);
        gainNode.connect(destination);

        const masterVol = dom.masterSlider ? (dom.masterSlider.value / 100) : 1.0;
        const peerVol = (state.peerVolumes && state.peerVolumes[id]) ? (state.peerVolumes[id] / 100) : 1.0;
        
        gainNode.gain.value = masterVol * peerVol;
        state.peerGainNodes[id] = gainNode;

        audioEl.srcObject = destination.stream;
        audioEl.volume = 1.0; 

        if (dom.speakerSelect && dom.speakerSelect.value && typeof audioEl.setSinkId === 'function') {
            audioEl.setSinkId(dom.speakerSelect.value).catch(() => {});
        }

        audioEl.play().catch(() => {});

    } catch (err) {
        audioEl.srcObject = stream;
        audioEl.play();
    }
}

// --- SES ELEMENTİNİ SİL ---
function removeAudioElement(id) {
    const el = document.getElementById(`audio-${id}`);
    if (el) {
        if (el._anchor) {
            el._anchor.srcObject = null;
            el._anchor = null;
        }
        el.srcObject = null;
        el.remove();
    }
    if (state.peerGainNodes[id]) {
        delete state.peerGainNodes[id];
    }
}

// --- HOPARLÖR DEĞİŞTİRME ---
async function setAudioOutputDevice(deviceId) {
    if (!deviceId) return;
    const allAudios = document.querySelectorAll('audio');
    allAudios.forEach(audio => {
        if (typeof audio.setSinkId === 'function') {
            audio.setSinkId(deviceId).catch(() => {});
        }
    });

    if (state.outputAudioContext && typeof state.outputAudioContext.setSinkId === 'function') {
        state.outputAudioContext.setSinkId(deviceId).catch(() => {});
    }
}

// --- MİKROFON DURUMUNU DEĞİŞTİR ---
function setMicState(muted) {
    state.isMicMuted = muted;

    if (state.localStream) {
        state.localStream.getAudioTracks().forEach(track => {
            track.enabled = !muted;
        });
    }

    if (dom.btnToggleMic) {
        dom.btnToggleMic.innerText = muted ? '❌' : '🎤';
        dom.btnToggleMic.style.backgroundColor = muted ? '#ff4757' : ''; 
        dom.btnToggleMic.title = muted ? "Mikrofon Kapalı" : "Mikrofon Açık";
    }

    try {
        const socketService = require('../socket/socketService');
        if (state.isConnected) {
            socketService.send({
                type: 'mic-status',
                isMuted: muted
            });
        }
    } catch (e) { }
    
    const userList = require('../ui/userList');
    userList.updateMicStatusUI("me", muted);
}

// --- SAĞIRLAŞTIRMA (DEAFEN) ---
function toggleDeafen() {
    state.isDeafened = !state.isDeafened;
    const isDeaf = state.isDeafened;

    if (dom.btnToggleSound) {
        dom.btnToggleSound.innerText = isDeaf ? '🔇' : '🔊';
        dom.btnToggleSound.style.backgroundColor = isDeaf ? '#ff4757' : ''; 
        dom.btnToggleSound.title = isDeaf ? "Ses Kapalı" : "Ses Açık";
    }

    const allAudios = document.querySelectorAll('audio');
    allAudios.forEach(audio => {
        audio.muted = isDeaf; 
    });
    
    if (isDeaf && !state.isMicMuted) {
        setMicState(true); 
    }
}

module.exports = {
    playSystemSound,
    playLocalSound,
    initLocalStream,
    addAudioElement,
    removeAudioElement,
    setAudioOutputDevice,
    setMicState,
    toggleDeafen
};