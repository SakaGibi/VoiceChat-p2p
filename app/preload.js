const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getUserName: async () => {
        return prompt("Lütfen adını gir:");
    }
});

contextBridge.exposeInMainWorld('audioAPI', {
    startMicTest: async () => {
        console.log("🟦 Preload: Mikrofon testi başlatılıyor...");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("🎤 Preload: Mikrofon stream hazır");

            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(audioContext.destination);

            console.log("🟢 Preload: Mikrofon sesi hoparlöre yönlendirildi.");
        } catch (err) {
            console.error("❌ Preload: Mikrofon alınamadı:", err);
        }
    }
});
