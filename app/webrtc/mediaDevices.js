// mediaDevices.js - Cihaz Listeleme ve Yönetimi
const dom = require('../ui/dom');


// Mevcut ses giriş ve çıkış cihazlarını listeler ve UI'ı günceller

async function getDevices() {
    try {
        // İzinleri tetiklemek için geçici bir akış başlat ve hemen durdur
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(e => {
            console.warn("Mikrofon izni verilmedi veya cihaz bulunamadı.");
        });
        if (stream) stream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

        // Mikrofon listesini güncelle
        if (dom.micSelect) {
            dom.micSelect.innerHTML = '<option value="">Varsayılan Mikrofon</option>';
            audioInputs.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.text = d.label || `Mikrofon ${dom.micSelect.length}`;
                dom.micSelect.appendChild(opt);
            });
            
            // Kayıtlı tercihi yükle
            const savedMic = localStorage.getItem('selectedMicId');
            if (savedMic) dom.micSelect.value = savedMic;

            // Seçim değiştiğinde kaydet
            dom.micSelect.onchange = () => {
                localStorage.setItem('selectedMicId', dom.micSelect.value);
            };
        }

        // Hoparlör listesini güncelle
        if (dom.speakerSelect) {
            dom.speakerSelect.innerHTML = '<option value="">Varsayılan Hoparlör</option>';
            audioOutputs.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.text = d.label || `Hoparlör ${dom.speakerSelect.length}`;
                dom.speakerSelect.appendChild(opt);
            });

            // Kayıtlı tercihi yükle
            const savedSpeaker = localStorage.getItem('selectedSpeakerId');
            if (savedSpeaker) dom.speakerSelect.value = savedSpeaker;

            // Seçim değiştiğinde kaydet
            dom.speakerSelect.onchange = () => {
                localStorage.setItem('selectedSpeakerId', dom.speakerSelect.value);
                // Eğer aktif bir çıkış bağlamı varsa hoparlörü değiştir
                const state = require('../state/appState');
                if (state.outputAudioContext && state.outputAudioContext.setSinkId) {
                    state.outputAudioContext.setSinkId(dom.speakerSelect.value).catch(e => {
                        console.error("Hoparlör değiştirme hatası:", e);
                    });
                }
            };
        }
    } catch (err) {
        console.error("Cihazlar listelenirken hata:", err);
    }
}


// Seçili mikrofonun ID'sini döndürür
 
function getSelectedMicId() {
    return dom.micSelect ? dom.micSelect.value : null;
}


// Seçili hoparlörün ID'sini döndürür

function getSelectedSpeakerId() {
    return dom.speakerSelect ? dom.speakerSelect.value : null;
}

module.exports = {
    getDevices,
    getSelectedMicId,
    getSelectedSpeakerId
};