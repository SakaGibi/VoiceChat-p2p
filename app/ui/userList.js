// userList.js - User Cards & Stream Interface Management
const state = require('../state/appState');
const dom = require('./dom');

/**
 * Adds a new card to the user list or updates an existing one.
 * @param {string} id - Unique identifier for the user.
 * @param {string} name - Display name.
 * @param {boolean} isConnected - Connection status (Live/Connecting).
 * @param {string} avatar - Base64 string or image path.
 */
function addUserUI(id, name, isConnected, avatar = null) {
    let el = document.getElementById(`user-${id}`);
    const avatarSrc = avatar || 'assets/default-avatar.png';
    
    // If card exists, update image and status, then exit
    if (el) {
        const imgEl = el.querySelector('.user-avatar-list');
        if (imgEl && avatar) imgEl.src = avatar;

        updateUserStatusUI(id, isConnected);
        return;
    }
    
    // Initialize a new user card
    el = document.createElement('div'); 
    el.id = `user-${id}`; 
    el.className = 'user-card'; 
    
    // Set initial data states
    el.dataset.isMuted = id === 'me' ? state.isMicMuted : 'false';
    el.dataset.isDeafened = id === 'me' ? state.isDeafened : 'false';
    
    if (dom.userList) {
        dom.userList.appendChild(el);
    } else {
        console.error("ERROR: dom.userList reference not found!");
        return;
    }
    
    // Define initial icons based on current state
    const initialMic = id === 'me' ? (state.isMicMuted ? '❌' : '🎤') : '🎤';
    const initialDeaf = id === 'me' ? (state.isDeafened ? '🔇' : '🔊') : '🔊';

    // Volume control for remote users
    let volHTML = id !== 'me' ? `
    <div class="user-volume-row">
        <input type="range" min="0" max="300" value="100" id="vol-slider-${id}" class="peer-volume-slider">
        <span id="vol-val-${id}" class="vol-label">100%</span>
    </div>` : '<div style="height:12px;"></div>'; 
    
    // Main Card Structure
    el.innerHTML = `
        <img src="${avatarSrc}" class="user-avatar-list">
        <div class="user-details">
            <div class="user-header">
                <span class="user-name">${name}</span>
                <div class="status-indicators">
                    <span id="mic-icon-${id}" class="status-icon">${initialMic}</span>
                    <span id="deaf-icon-${id}" class="status-icon">${initialDeaf}</span>
                    <span class="user-status"></span>
                </div>
            </div>
            <div class="user-controls-centered">
                ${volHTML}
                <div class="meter-bg">
                    <div id="meter-fill-${id}" class="meter-fill"></div>
                </div>
            </div>
        </div>
    `;

    // Apply the initial connection status
    updateUserStatusUI(id, isConnected);

    // Initialize volume slider listener for peers
    if (id !== 'me') {
        const slider = el.querySelector('.peer-volume-slider');
        slider.oninput = (e) => updatePeerVolume(id, e.target.value);
    }

    // Check if user is already sharing screen
    if (state.activeRemoteStreams[id]) {
        addVideoElement(id, state.activeRemoteStreams[id]);
    }
}


// Updates the connection status label (Live / Connecting...)

function updateUserStatusUI(id, isConnected) {
    const el = document.getElementById(`user-${id}`);
    if (!el) return;

    const statusSpan = el.querySelector('.user-status');
    if (statusSpan) {
        statusSpan.innerText = isConnected ? 'Canlı' : 'Bağlanıyor...';
        statusSpan.style.color = isConnected ? '#2ecc71' : '#f1c40f';
    }
}

// Updates status icons based on card datasets.
// Shows only one icon (🔇) when deafened to prevent clutter.
function updateUserIcon(id) {
    const micEl = document.getElementById(`mic-icon-${id}`);
    const deafEl = document.getElementById(`deaf-icon-${id}`);
    const card = document.getElementById(`user-${id}`);
    
    if (!micEl || !deafEl || !card) return;

    const isMuted = card.dataset.isMuted === 'true';
    const isDeafened = card.dataset.isDeafened === 'true';

    if (isDeafened) {
        micEl.innerText = '🔇';
        micEl.style.color = '#ff4757';
        deafEl.innerText = ''; // Hide the second slot
    } else {
        micEl.innerText = isMuted ? '❌' : '🎤';
        micEl.style.color = isMuted ? '#ff4757' : '#2ecc71';

        deafEl.innerText = '🔊';
        deafEl.style.color = '#2ecc71';
    }
}

//Triggered when microphone status changes.
function updateMicStatusUI(id, isMuted) {
    const el = document.getElementById(`user-${id}`); 
    if (el) {
        el.dataset.isMuted = isMuted;
        updateUserIcon(id);
    }
}


// Triggered when deafen/speaker status changes.

function updateDeafenStatusUI(id, isDeafened) {
    const el = document.getElementById(`user-${id}`);
    if (el) {
        el.dataset.isDeafened = isDeafened;
        updateUserIcon(id);
    }
}


// Updates volume for a specific peer and adjusts GainNode.

function updatePeerVolume(id, value) {
    if (!state.peerVolumes) state.peerVolumes = {};
    state.peerVolumes[id] = value;

    // Update UI text
    const textEl = document.getElementById(`vol-val-${id}`);
    if (textEl) textEl.innerText = value + "%";

    // slider blue
    const sliderEl = document.getElementById(`vol-slider-${id}`);
    if (sliderEl) {
        const percentage = (value / sliderEl.max) * 100;
        sliderEl.style.setProperty('--val', percentage + '%');
    }

    // Handle GainNode volume boost
    const gainNode = state.peerGainNodes[id];
    if (gainNode && state.outputAudioContext) {
        const masterVol = dom.masterSlider ? (dom.masterSlider.value / 100) : 1;
        const peerVol = value / 100;
        
        gainNode.gain.setTargetAtTime(
            peerVol * masterVol, 
            state.outputAudioContext.currentTime, 
            0.01
        );
    }
}

// Expose to window for HTML access
window.updatePeerVolume = updatePeerVolume;

//Adds 'WATCH' button to user card when screen sharing starts.
function addVideoElement(id, stream) {
    state.activeRemoteStreams[id] = stream;
    const card = document.getElementById(`user-${id}`);
    
    if (card && !card.querySelector('.stream-icon-btn')) {
        const btn = document.createElement('button'); 
        btn.className = 'stream-icon-btn'; 
        btn.innerHTML = '🖥️ WATCH';
        btn.onclick = () => openStreamModal(id);
        card.appendChild(btn);
    }

    if (stream.getVideoTracks().length > 0) {
        stream.getVideoTracks()[0].onended = () => removeVideoElement(id);
    }
}

//Removes video button and closes modal if active.
function removeVideoElement(id) {
    delete state.activeRemoteStreams[id];
    const card = document.getElementById(`user-${id}`); 
    if (card) { 
        const btn = card.querySelector('.stream-icon-btn'); 
        if (btn) btn.remove();
    }
    
    const streamerLabel = document.getElementById('streamerName');

    if (dom.streamModal && dom.streamModal.style.display !== 'none' && 
        streamerLabel && streamerLabel.getAttribute('data-id') === id) {
        
        dom.streamModal.style.display = 'none';
        if (dom.largeVideoPlayer) dom.largeVideoPlayer.srcObject = null;
    }
}

//Opens the stream watch window (Modal).
function openStreamModal(id) {
    if (!state.activeRemoteStreams[id]) return alert("No active stream found.");
    
    const streamerLabel = document.getElementById('streamerName');

    if (dom.largeVideoPlayer) dom.largeVideoPlayer.srcObject = state.activeRemoteStreams[id];
    
    if (streamerLabel) {
        streamerLabel.innerText = `${state.userNames[id] || 'User'}'s Screen`;
        streamerLabel.setAttribute('data-id', id);
    }
    
    if (dom.streamModal) dom.streamModal.style.display = 'flex';
}

// Removes the user card and related audio elements.
function removeUserUI(id) {
    const el = document.getElementById(`user-${id}`);
    if (el) el.remove();
    
    const audio = document.getElementById(`audio-${id}`);
    if (audio) audio.remove();
}

module.exports = {
    addUserUI,
    removeUserUI,
    updateMicStatusUI,
    updateDeafenStatusUI,
    addVideoElement,
    removeVideoElement,
    openStreamModal,
    updatePeerVolume,
    updateUserStatusUI
};