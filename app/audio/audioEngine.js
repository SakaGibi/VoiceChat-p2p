// audioEngine.js - Manages Audio Streams and Effects
const path = require('path');
const dom = require('../ui/dom');
const state = require('../state/appState');
const { ipcRenderer } = require('electron');


// --- FILE PATH FINDER ---
function getAssetPath(fileName) {
    let assetPath = path.join(__dirname, '..', 'assets', fileName);
    if (assetPath.includes('app.asar')) {
        assetPath = assetPath.replace('app.asar', 'app.asar.unpacked');
    }
    return assetPath;
}

// --- SYSTEM SOUNDS ---
function playSystemSound(type) {
    if (state.isDeafened) return;
    let fileName = '';
    if (type === 'join') fileName = 'RIZZ_effect.mp3';
    else if (type === 'leave') fileName = 'cikis_effect.mp3';
    else if (type === 'notification') fileName = 'notification_effect.mp3';

    try {
        const soundPath = getAssetPath(fileName);
        const audio = new Audio(soundPath);
        // [FIX]: Cap volume at 1.0 (HTMLMediaElement limit)
        const rawVol = dom.masterSlider ? (dom.masterSlider.value / 100) : 1.0;
        audio.volume = Math.min(1.0, rawVol);
        if (dom.speakerSelect && dom.speakerSelect.value && typeof audio.setSinkId === 'function') {
            audio.setSinkId(dom.speakerSelect.value).catch(e => { });
        }
        audio.play().catch(() => { });
    } catch (e) { console.error(e); }
}

// --- LOCAL SOUND EFFECTS ---
function playLocalSound(effectName, isCustomPath = false) {
    if (state.isDeafened) return;
    try {
        let soundPath;
        if (isCustomPath) {
            soundPath = effectName;
        } else {
            const fileName = effectName.endsWith('.mp3') ? effectName : `${effectName}.mp3`;
            soundPath = getAssetPath(fileName);
        }
        const audio = new Audio(soundPath);
        // [FIX]: Cap volume at 1.0 (HTMLMediaElement limit)
        const rawVol = dom.masterSlider ? (dom.masterSlider.value / 100) : 1.0;
        audio.volume = Math.min(1.0, rawVol);

        if (dom.speakerSelect && dom.speakerSelect.value && typeof audio.setSinkId === 'function') {
            audio.setSinkId(dom.speakerSelect.value).catch(e => { });
        }

        if (state.audioContext && state.streamDestination) {
            try {
                const source = state.audioContext.createMediaElementSource(audio);
                const gain = state.audioContext.createGain();
                gain.gain.value = 1.0;
                source.connect(gain);
                gain.connect(state.streamDestination);
                source.connect(state.audioContext.destination);
            } catch (err) {
                console.error("Audio mixing error:", err);
            }
        }
        audio.play().catch(e => console.error("Play error:", e));
    } catch (e) {
        console.error("Soundpad error:", e);
    }
}

// --- INITIALIZE MICROPHONE (Forced Mono) ---
async function initLocalStream(deviceId = null) {
    try {
        if (!deviceId && dom.micSelect && dom.micSelect.value) {
            deviceId = dom.micSelect.value;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                channelCount: 1, // FORCE MONO
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
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
        state.streamDestination = destination;

        source.connect(gainNode);
        gainNode.connect(destination);

        state.processedStream = destination.stream;
        return true;
    } catch (e) {
        alert("Mikrofon başlatılamadı!");
        console.error(e);
        return false;
    }
}

// --- ADD REMOTE USER AUDIO ---
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
    anchorAudio.play().catch(() => { });
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
        gainNode.gain.value = state.isDeafened ? 0 : (masterVol * peerVol);

        state.peerGainNodes[id] = gainNode;
        audioEl.srcObject = destination.stream;
        audioEl.volume = 1.0;

        if (dom.speakerSelect && dom.speakerSelect.value && typeof audioEl.setSinkId === 'function') {
            audioEl.setSinkId(dom.speakerSelect.value).catch(() => { });
        }
        audioEl.play().catch(() => { });
    } catch (err) {
        audioEl.srcObject = stream;
        audioEl.play().catch(() => { });
    }
}

function removeAudioElement(id) {
    const el = document.getElementById(`audio-${id}`);
    if (el) {
        if (el._anchor) { el._anchor.srcObject = null; el._anchor = null; }
        el.srcObject = null;
        el.remove();
    }
    if (state.peerGainNodes[id]) delete state.peerGainNodes[id];
}

async function setAudioOutputDevice(deviceId) {
    if (!deviceId) return;
    const allAudios = document.querySelectorAll('audio');
    allAudios.forEach(audio => {
        if (typeof audio.setSinkId === 'function') audio.setSinkId(deviceId).catch(() => { });
    });
    if (state.outputAudioContext && typeof state.outputAudioContext.setSinkId === 'function') {
        state.outputAudioContext.setSinkId(deviceId).catch(() => { });
    }
}

function setMicState(muted) {
    state.isMicMuted = muted;
    if (state.localStream) {
        state.localStream.getAudioTracks().forEach(track => track.enabled = !muted);
    }
    if (dom.btnToggleMic) {
        dom.btnToggleMic.innerText = muted ? '🎤✖' : '🎤';
        dom.btnToggleMic.classList.toggle('btn-closed', muted);
    }
    try {
        const socketService = require('../socket/socketService');
        const peerService = require('../webrtc/peerService');
        if (state.isConnected) {
            const payload = { type: 'mic-status', isMuted: muted };
            socketService.send(payload);
            peerService.broadcast(payload);
        }
        ipcRenderer.send('sync-mic-state', muted);
    } catch (e) { }
    const userList = require('../ui/userList');
    userList.updateMicStatusUI("me", muted);
}

function toggleDeafen() {
    state.isDeafened = !state.isDeafened;
    const isDeaf = state.isDeafened;

    if (dom.btnToggleSound) {
        dom.btnToggleSound.innerText = isDeaf ? '🔇' : '🔊';
        dom.btnToggleSound.classList.toggle('btn-closed', isDeaf);
    }

    const allAudios = document.querySelectorAll('audio');
    allAudios.forEach(audio => { audio.muted = isDeaf; });

    // Auto-mute if deafened. DO NOT auto-unmute (Manual action required).
    if (isDeaf && !state.isMicMuted) {
        setMicState(true);
    }

    const userList = require('../ui/userList');
    userList.updateDeafenStatusUI("me", isDeaf);
    try {
        const socketService = require('../socket/socketService');
        const peerService = require('../webrtc/peerService');
        if (state.isConnected) {
            const payload = { type: 'deafen-status', isDeafened: isDeaf };
            socketService.send(payload);
            peerService.broadcast(payload);
        }
        ipcRenderer.send('sync-deafen-state', isDeaf);
    } catch (e) { }
}

function nudgeAllPeers() {
    if (!state.outputAudioContext || !state.peerGainNodes) return;
    if (state.outputAudioContext.state === 'suspended') state.outputAudioContext.resume();

    for (const id in state.peerGainNodes) {
        const gainNode = state.peerGainNodes[id];
        if (!gainNode) continue;
        const currentVal = gainNode.gain.value;
        const now = state.outputAudioContext.currentTime;
        gainNode.gain.setValueAtTime(currentVal, now);
        gainNode.gain.linearRampToValueAtTime(currentVal + 0.001, now + 0.05);
        gainNode.gain.linearRampToValueAtTime(currentVal, now + 0.1);
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
    toggleDeafen,
    nudgeAllPeers
};