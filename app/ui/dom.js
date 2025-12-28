// dom.js - HTML Elemanları Merkezi Yönetimi

module.exports = {
    // Sohbet ve Mesajlaşma
    chatHistory: document.getElementById('chatHistory'),
    msgInput: document.getElementById('msgInput'),
    btnSend: document.getElementById('btnSend'),
    fileInput: document.getElementById('fileInput'),
    btnAttach: document.getElementById('btnAttach'),

    // Kullanıcı Giriş ve Liste
    inputUsername: document.getElementById('username'),
    userListDiv: document.getElementById('userList'),
    roomPreviewDiv: document.getElementById('roomPreview'),
    roomSelect: document.getElementById('roomSelect'),

    // Ana Kontroller
    btnConnect: document.getElementById('btnConnect'),
    activeControls: document.getElementById('activeControls'),
    btnDisconnect: document.getElementById('btnDisconnect'),
    btnToggleMic: document.getElementById('btnToggleMic'),
    btnToggleSound: document.getElementById('btnToggleSound'),
    btnShareScreen: document.getElementById('btnShareScreen'),

    // Ayarlar ve Modal
    btnSettings: document.getElementById('btnSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    passwordModal: document.getElementById('passwordModal'),
    serverInput: document.getElementById('serverInput'),
    keyInput: document.getElementById('keyInput'),
    btnSaveKey: document.getElementById('btnSaveKey'),

    // Güncelleme Paneli
    btnCheckUpdate: document.getElementById('btnCheckUpdate'),
    btnInstallUpdate: document.getElementById('btnInstallUpdate'),
    updateStatus: document.getElementById('updateStatus'),

    // Yayın İzleme (Stream) Modalı
    streamModal: document.getElementById('streamModal'),
    largeVideoPlayer: document.getElementById('largeVideoPlayer'),
    btnCloseStream: document.getElementById('btnCloseStream'),
    streamerNameLabel: document.getElementById('streamerName'),

    // Ses Cihazları ve Volüm
    micSelect: document.getElementById('micSelect'),
    speakerSelect: document.getElementById('speakerSelect'),
    micSlider: document.getElementById('micVolume'),
    micVal: document.getElementById('micVal'),
    masterSlider: document.getElementById('masterVolume'),
    masterVal: document.getElementById('masterVal')
};