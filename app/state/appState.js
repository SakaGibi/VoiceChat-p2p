// appState.js - Uygulamanın Global Durum Yönetimi

module.exports = {
    // Uygulama Genel Bilgileri
    currentAppVersion: "Sürüm yükleniyor...",
    configData: null,
    
    // Bağlantı ve Oda Bilgileri
    isConnected: false,
    myPeerId: null,
    currentRoom: 'genel',
    allUsers: [], // Sunucudan gelen tüm kullanıcıların listesi
    userNames: {}, // ID -> Name eşleşmesi
    
    // WebRTC ve Peer Yönetimi
    peers: {}, // Aktif P2P bağlantıları
    activeRemoteStreams: {}, // Diğer kullanıcılardan gelen ekran paylaşımları
    
    // Medya Durumları
    isMicMuted: false,
    isDeafened: false,
    isSharingScreen: false,
    
    // Ses Akışları ve Web Audio API Nesneleri
    localStream: null, // Mikrofon ham sesi
    screenStream: null, // Ekran paylaşım akışı
    processedStream: null, // İşlenmiş (gain uygulanmış) ses
    
    audioContext: null, // Giriş ses işleme bağlamı
    outputAudioContext: null, // Çıkış ses işleme bağlamı
    
    micGainNode: null, // Kendi mikrofon ses seviyesi düğümü
    peerGainNodes: {}, // Diğer kullanıcıların ses seviyesi düğümleri
    
    // Dosya Transferi Takibi
    receivingFiles: {}, // Alınmakta olan dosyaların parçaları
    activeTransfers: {}, // Gönderilen dosyaların iptal takibi
    activeIncomingTransferIds: {}, // SenderId -> TransferId eşleşmesi
    
    // UI Yardımcıları
    statusTimeout: null // Durum mesajlarını temizlemek için kullanılan zamanlayıcı
};