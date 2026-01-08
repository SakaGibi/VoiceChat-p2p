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
        <div class="avatar-wrapper" style="position: relative; width: 75px; height: 75px; flex-shrink:0;">
            <img src="${avatarSrc}" class="user-avatar-list" style="width: 100%; height: 100%; border:none;">
            <div class="poke-overlay" data-id="${id}">
                <span>👉🏻</span>
            </div>
        </div>
        <div class="user-details">
            <div class="user-header">
                <div class="user-name-container user-name">
                    <span class="user-name-text">${name}</span>
                </div>
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
        if (slider) slider.oninput = (e) => updatePeerVolume(id, e.target.value);

        // Poke Click Handler
        const pokeOverlay = el.querySelector('.poke-overlay');
        if (pokeOverlay) {
            pokeOverlay.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click if any
                const targetId = pokeOverlay.getAttribute('data-id');
                // Lazy require to avoid circular dependency with socketService
                const socketService = require('../socket/socketService');
                socketService.sendPoke(targetId);
            });
        }
    }

    // SCROLL CHECK: Check if name is too long
    // We must wait for render or text availability. 
    // Since we appended 'el' to DOM before setting innerHTML (wait, no, previous code did innerHTML THEN append? No.)
    // Let's check logic:
    // Code says: el = document.createElement... dom.userList.appendChild(el)... el.innerHTML = ...
    // So it IS in the DOM. We can check immediately.
    setTimeout(() => {
        const nameContainer = el.querySelector('.user-name-container');
        const nameText = el.querySelector('.user-name-text');
        if (nameContainer && nameText) {
            if (nameText.scrollWidth > nameContainer.clientWidth) {
                nameContainer.classList.add('should-scroll');
                // Adjust animation speed based on length? Optional.
                const duration = Math.max(3, nameText.scrollWidth / 20); // roughly 20px per second
                nameContainer.style.setProperty('--scroll-duration', duration + 's');
            }
        }
    }, 0);

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

        const header = card.querySelector('.user-header');
        const nameEl = header ? header.querySelector('.user-name') : null;

        if (header && nameEl) {
            let wrapper = nameEl.parentNode;
            if (!wrapper.classList.contains('name-btn-wrapper')) {
                wrapper = document.createElement('div');
                wrapper.className = 'name-btn-wrapper';
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';

                nameEl.parentNode.insertBefore(wrapper, nameEl);
                wrapper.appendChild(nameEl);
            }

            btn.style.marginLeft = '8px';
            btn.style.marginRight = '0';

            wrapper.appendChild(btn);
        } else {
            card.appendChild(btn);
        }
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

    // Close the popup window if it exists
    if (state.activeStreamWindows && state.activeStreamWindows[id]) {
        try {
            state.activeStreamWindows[id].close();
        } catch (e) {
            console.error("Pencere kapatılamadı:", e);
        }
        delete state.activeStreamWindows[id];
    }

    if (dom.streamModal && dom.streamModal.style.display !== 'none' &&
        streamerLabel && streamerLabel.getAttribute('data-id') === id) {

        dom.streamModal.style.display = 'none';
        if (dom.largeVideoPlayer) dom.largeVideoPlayer.srcObject = null;
    }
}

//Opens the stream watch window (Modal).
//Opens the stream watch window (Popup).
function openStreamModal(id) {
    if (!state.activeRemoteStreams[id]) return alert("No active stream found.");

    // Check if window is already open
    if (state.activeStreamWindows && state.activeStreamWindows[id] && !state.activeStreamWindows[id].closed) {
        state.activeStreamWindows[id].focus();
        return;
    }

    const userName = state.userNames[id] || 'Kullanıcı';
    const width = 1200;
    const height = 800;

    // Open new popup window
    // Note: We use a relative path. Since index.html is in 'app/', video_player.html should also be in 'app/'
    const streamWindow = window.open('video_player.html', `NatlaLive-${id}`, `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`);

    if (!streamWindow) {
        return alert("Pencere açılamadı! Lütfen izin verin.");
    }

    // Save reference
    if (!state.activeStreamWindows) state.activeStreamWindows = {};
    state.activeStreamWindows[id] = streamWindow;

    // Inject stream once loaded
    streamWindow.onload = () => {
        const vid = streamWindow.document.getElementById('remoteVideo');
        const title = streamWindow.document.getElementById('pageTitle');

        if (vid) {
            vid.srcObject = state.activeRemoteStreams[id];
            // Ensure audio output device preference is respected if possible, 
            // though Electron popup might use default device.
            // .setSinkId is not always supported in all contexts easily without secure context, 
            // but Electron usually supports it.
            // if (vid.setSinkId && localStorage.getItem('selectedSpeaker')) {
            //     vid.setSinkId(localStorage.getItem('selectedSpeaker')).catch(e => console.error(e));
            // }
        }

        if (title) {
            title.innerText = `${userName} - Ekran Paylaşımı`;
            streamWindow.document.title = `${userName} - Canlı`;
        }

        // Window close handler to clean up reference
        streamWindow.onbeforeunload = () => {
            delete state.activeStreamWindows[id];
        };
    };
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