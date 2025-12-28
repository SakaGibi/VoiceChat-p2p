// audioEngine.js - Ses İşleme Motoru
const path = require('path');
const state = require('../state/appState');
const dom = require('../ui/dom');
const mediaDevices = require('../webrtc/mediaDevices');

/**
 * Yerel mikrofon akışını başlatır ve işleme zincirini kurar
 */
async function initLocalStream() {
    try {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        state.outputAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (state.outputAudioContext.state === 'suspended') {
            await state.outputAudioContext.resume();
        }
        
        // Hoparlör seçili ise ayarla
        const selectedSpeakerId = mediaDevices.getSelectedSpeakerId();
        if (selectedSpeakerId && state.outputAudioContext.setSinkId) {
            state.outputAudioContext.setSinkId(selectedSpeakerId).catch(() => {});
        }

        const selectedMicId = mediaDevices.getSelectedMicId();
        const constraints = { 
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true, 
            video: false 
        };

        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        state.localStream = rawStream;

        // Ses İşleme Zinciri: Source -> Gain -> Destination
        const sourceNode = state.audioContext.createMediaStreamSource(rawStream);
        state.micGainNode = state.audioContext.createGain();
        state.micGainNode.gain.value = dom.micSlider.value / 100;

        const destination = state.audioContext.createMediaStreamDestination();
        sourceNode.connect(state.micGainNode);
        state.micGainNode.connect(destination);

        state.processedStream = destination.stream;

        // Kendi visualizer'ını başlat
        const visualizer = require('./visualizer');
        visualizer.attachVisualizer(state.processedStream, "me");

        return true;
    } catch (err) {
        console.error("Mikrofon başlatma hatası:", err);
        return false;
    }
}

/**
 * Uzaktaki kullanıcıdan gelen ses akışını işler ve compressor uygular
 */
function addAudioElement(id, stream) {
    if (document.getElementById(`audio-${id}`)) return;

    const audioEl = document.createElement('audio');
    audioEl.id = `audio-${id}`;
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);

    const ctx = state.outputAudioContext;
    const source = ctx.createMediaStreamSource(stream);

    // Kazanım Düğümü (Gain)
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;
    state.peerGainNodes[id] = gainNode;

    // Kompresör Ayarları (Orijinal Kodundaki Değerler)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 20;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    // Zincirleme: Source -> Gain -> Compressor -> Destination
    source.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(ctx.destination);

    audioEl.play().catch(() => {});
}

/**
 * Mikrofonu kapatır/açar ve diğer kullanıcıları bilgilendirir
 */
function setMicState(mute) {
    if (!state.localStream) return;
    const track = state.localStream.getAudioTracks()[0];
    state.isMicMuted = mute;
    track.enabled = !mute;

    // Diğer kullanıcılara bildir
    const peerService = require('../webrtc/peerService');
    peerService.broadcast({ type: 'mic-status', isMuted: mute });

    // UI Güncelle
    if (state.isMicMuted) {
        dom.btnToggleMic.innerText = "🎤✖";
        dom.btnToggleMic.style.backgroundColor = "#8b281d";
    } else {
        dom.btnToggleMic.innerText = "🎤";
        dom.btnToggleMic.style.backgroundColor = "#397251";
    }
}

/**
 * Tüm çıkış seslerini kapatır/açar (Sağırlaştırma)
 */
function toggleDeafen() {
    state.isDeafened = !state.isDeafened;
    
    document.querySelectorAll('audio').forEach(audio => audio.muted = state.isDeafened);
    
    if (state.outputAudioContext) {
        state.isDeafened ? state.outputAudioContext.suspend() : state.outputAudioContext.resume();
    }

    if (state.isDeafened) {
        dom.btnToggleSound.innerText = "🔇";
        dom.btnToggleSound.style.backgroundColor = "#8b281d";
        if (!state.isMicMuted) setMicState(true);
    } else {
        dom.btnToggleSound.innerText = "🔊";
        dom.btnToggleSound.style.backgroundColor = "#397251";
    }
}

/**
 * Sistem seslerini çalar (Katılma, ayrılma vb.)
 */
function playSystemSound(type) {
    if (state.isDeafened) return;
    
    let fileName = '';
    switch(type) {
        case 'join': fileName = 'RIZZ_effect.mp3'; break;
        case 'leave': fileName = 'cikis_effect.mp3'; break;
        case 'notification': fileName = 'notification_effect.mp3'; break;
    }

    if (!fileName) return;

    try {
        const soundPath = path.join(__dirname, '..', '..', 'assets', fileName).replace('app.asar', 'app.asar.unpacked');
        const audio = new Audio(soundPath);
        audio.volume = (type === 'notification') ? (dom.masterSlider.value / 200) : (dom.masterSlider.value / 100);
        audio.play().catch(() => {});
    } catch (e) {
        console.error("Sistem sesi çalınamadı:", e);
    }
}

/**
 * Soundpad efektlerini çalar
 */
function playLocalSound(effectName) {
    if (state.isDeafened) return;
    try {
        const soundPath = path.join(__dirname, '..', '..', 'assets', `${effectName}.mp3`).replace('app.asar', 'app.asar.unpacked');
        const audio = new Audio(soundPath);
        audio.volume = dom.masterSlider.value / 100;
        
        const selectedSpeakerId = mediaDevices.getSelectedSpeakerId();
        if (selectedSpeakerId && audio.setSinkId) {
            audio.setSinkId(selectedSpeakerId).catch(() => {});
        }
        
        audio.play().catch(() => {});
    } catch (e) {
        console.error("Efekt çalınamadı:", e);
    }
}

module.exports = {
    initLocalStream,
    addAudioElement,
    setMicState,
    toggleDeafen,
    playSystemSound,
    playLocalSound
};