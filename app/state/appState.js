// appState.js - Global State Management

module.exports = {
    // General App Info
    currentAppVersion: "Sürüm yükleniyor...",
    configData: null,

    // Connection & Room Info
    isConnected: false,
    myPeerId: null,
    currentRoom: 'genel',
    allUsers: [], // List of all users from server
    userNames: {}, // ID -> Name mapping

    // WebRTC & Peer Management
    peers: {}, // Active P2P connections
    activeRemoteStreams: {}, // Remote screen shares
    activeStreamWindows: {}, // Active screen share popup windows

    // Media States
    isMicMuted: false,
    isDeafened: false,
    isSharingScreen: false,

    // Audio Streams & Web Audio API Objects
    localStream: null, // Raw microphone audio
    screenStream: null, // Screen share stream
    processedStream: null, // Processed audio (gain applied)

    audioContext: null, // Input audio processing context
    outputAudioContext: null, // Output audio processing context

    micGainNode: null, // Own mic volume (Gain) node
    peerGainNodes: {}, // Peer volume nodes

    // Critical Data Objects (Error Fix)
    // Prevents "Cannot set properties of undefined" errors if not initialized.
    peerVolumes: {}, // User ID -> Volume Percentage (0-200%)
    micSensitivity: 100, // Mic gain level (starts as %)

    // File Transfer Tracking
    receivingFiles: {}, // Parts of files being received
    activeTransfers: {}, // Cancellation tracking for sent files
    activeIncomingTransferIds: {}, // SenderId -> TransferId mapping

    // UI Helpers
    statusTimeout: null, // Timer to clear status messages

    // Profile Elements
    myAvatar: null, // User's avatar image data (base64)
    allUsersAvatars: {} // User ID -> Avatar image data (base64)

};