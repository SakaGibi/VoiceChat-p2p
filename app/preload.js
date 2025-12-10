const { contextBridge } = require('electron');

let audioContext;
let analyser;
let source;
let micStream;

contextBridge.exposeInMainWorld('electronAPI', {
    getUserName: async () => {
        return prompt("Lütfen adını gir:");
    }
});

contextBridge.exposeInMainWorld('audioAPI', {
    startMicTest: async () => {
        if (micStream) return; // Zaten açıksa yeniden açma
        console.log("🟦 Preload: Mikrofon testi başlatılıyor...");
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("🎤 Preload: Mikrofon stream hazır");

            audioContext = new AudioContext();
            source = audioContext.createMediaStreamSource(micStream);

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;

            source.connect(analyser);
            analyser.connect(audioContext.destination);

            console.log("🟢 Preload: Mikrofon sesi hoparlöre yönlendirildi.");
        } catch (err) {
            console.error("❌ Preload: Mikrofon alınamadı:", err);
        }
    },

    stopMicTest: () => {
        if (!micStream) return;

        console.log("🟡 Preload: Mikrofon testi durduruluyor...");
        source.disconnect();
        analyser.disconnect();

        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
        source = null;
        analyser = null;
        audioContext.close();
        audioContext = null;

        console.log("🔴 Preload: Mikrofon kapatıldı.");
    },

    getAudioData: () => {
        if (!analyser) return null;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }
});
