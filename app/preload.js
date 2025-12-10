// --- YENİ EKLENEN KISIM (BAŞLANGIÇ) ---
const SimplePeer = require('simple-peer');
window.SimplePeer = SimplePeer; // HTML tarafına aktarıyoruz
// --- YENİ EKLENEN KISIM (BİTİŞ) ---

const { contextBridge } = require("electron");

let audioContext;
let analyser;
let source;
let microphoneStream;

contextBridge.exposeInMainWorld("audioAPI", {
    startMicTest: async () => {
        console.log("🟦 Preload: Mikrofon testi başlatılıyor...");
        if (!audioContext) audioContext = new AudioContext();

        microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("🎤 Preload: Mikrofon stream hazır");

        source = audioContext.createMediaStreamSource(microphoneStream);

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        console.log("🟢 Preload: Mikrofon sesi hoparlöre yönlendirildi");
    },

    stopMicTest: async () => {
        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }
        if (source) source.disconnect();
        if (analyser) analyser.disconnect();
        console.log("🔴 Preload: Mikrofon testi durduruldu");
    },

    getAudioLevel: () => {
        if (!analyser) return 0;
        const dataArray = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        return rms;
    }
});