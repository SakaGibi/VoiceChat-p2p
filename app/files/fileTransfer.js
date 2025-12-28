// fileTransfer.js - Dosya Transfer Yönetimi (P2P)
const state = require('../state/appState');
const dom = require('../ui/dom');

/**
 * Dosya transferini durdurur ve karşı tarafı bilgilendirir
 * @param {string} tId - Transfer ID
 * @param {boolean} isSender - İptal eden gönderen mi?
 */
function cancelTransfer(tId, isSender = true) {
    if (state.activeTransfers[tId]) {
        state.activeTransfers[tId].cancelled = true;
    }

    if (isSender) {
        const peerService = require('../webrtc/peerService');
        peerService.broadcast({ 
            type: 'file-cancel', 
            payload: { tId: tId } 
        });
        
        const statusSpan = document.querySelector(`#card-${tId} .transfer-status`);
        const cancelBtn = document.getElementById(`cancel-btn-${tId}`);
        if (statusSpan) {
            statusSpan.innerText = "İPTAL EDİLDİ ❌";
            statusSpan.style.color = "#ff4757";
        }
        if (cancelBtn) cancelBtn.remove();
    }
}

/**
 * Gönderilen dosya için UI kartı oluşturur ve önizleme ekler
 */
function addFileSentUI(file, tId) {
    const div = document.createElement('div');
    div.id = `card-${tId}`;
    div.className = 'message sent file-message';
    
    // HTML yapısını oluştur (İptal butonu ve Progress Bar dahil)
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="transfer-status" style="font-size:11px; font-weight:bold; opacity:0.8;">GÖNDERİLİYOR</span>
            <button id="cancel-btn-${tId}" class="cancel-file-btn" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size:16px; padding:0;">✖</button>
        </div>
        <div id="preview-cont-${tId}" class="preview-container" style="display:none;">
            <img id="preview-img-${tId}" class="preview-thumb">
        </div>
        <div style="font-size:14px; margin-bottom:5px; word-break:break-all;"><strong>${file.name}</strong></div>
        <div style="font-size:11px; opacity:0.7;">Boyut: ${(file.size / (1024 * 1024)).toFixed(2)} MB</div>
        <div class="meter-bg">
            <div id="prog-${tId}" class="meter-fill" style="width: 0%; background: #2ecc71;"></div>
        </div>
    `;

    dom.chatHistory.appendChild(div);
    
    // İptal butonuna olay ekle
    div.querySelector('.cancel-file-btn').onclick = () => cancelTransfer(tId, true);

    // Resim dosyasıysa önizleme oluştur
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById(`preview-img-${tId}`);
            const cont = document.getElementById(`preview-cont-${tId}`);
            if (img && cont) {
                img.src = e.target.result;
                cont.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
}

/**
 * Dosyayı parçalara ayırarak P2P kanalından gönderir
 */
function sendFile(peer, file, tId) {
    if (!peer || !peer.connected) return;
    if (!state.activeTransfers[tId]) state.activeTransfers[tId] = { cancelled: false };

    const chunkSize = 16 * 1024; // 16KB dilimler
    let offset = 0;

    // Önce metadata gönder
    peer.send(JSON.stringify({ 
        type: 'file-metadata', 
        payload: { name: file.name, size: file.size, type: file.type, tId: tId } 
    }));

    const readAndSend = () => {
        if (state.activeTransfers[tId]?.cancelled) return;
        
        // Kanal yoğunsa bekle
        if (peer._channel && peer._channel.bufferedAmount > 64 * 1024) {
            setTimeout(readAndSend, 50);
            return;
        }

        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        reader.onload = (e) => {
            if (state.activeTransfers[tId]?.cancelled) return;
            
            peer.send(e.target.result);
            offset += e.target.result.byteLength;
            
            const bar = document.getElementById(`prog-${tId}`);
            if (bar) bar.style.width = (offset / file.size * 100) + "%";

            if (offset < file.size) {
                readAndSend();
            } else {
                // Gönderim tamamlandı
                peer.send(JSON.stringify({ type: 'file-end', payload: { tId: tId } }));
                
                const audioEngine = require('../audio/audioEngine');
                audioEngine.playSystemSound('notification');

                const statusSpan = document.querySelector(`#card-${tId} .transfer-status`);
                const cancelBtn = document.getElementById(`cancel-btn-${tId}`);
                if (statusSpan) {
                    statusSpan.innerText = "GÖNDERİLDİ ✅";
                    statusSpan.style.color = "#2ecc71";
                }
                if (cancelBtn) cancelBtn.remove();
            }
        };
        reader.readAsArrayBuffer(slice);
    };
    readAndSend();
}

/**
 * Gelen ham veriyi veya transfer kontrol mesajlarını işler
 */
function handleIncomingFileData(senderId, data) {
    let message = null;
    let isJson = false;

    // Verinin JSON olup olmadığını kontrol et
    try {
        if (typeof data === 'string') {
            message = JSON.parse(data);
            isJson = true;
        } else if (data instanceof Uint8Array && data[0] === 123) {
            message = JSON.parse(new TextDecoder().decode(data));
            isJson = true;
        }
    } catch (e) { isJson = false; }

    if (isJson && message?.type) {
        // Kontrol mesajlarını işle
        const tId = message.payload?.tId;

        if (message.type === 'file-metadata') {
            state.activeIncomingTransferIds[senderId] = tId;
            state.receivingFiles[tId] = { metadata: message.payload, receivedChunks: [], receivedSize: 0 };
            displayIncomingFile(senderId, message.payload.name, message.payload.size, tId, message.payload.type);
        } 
        else if (message.type === 'file-end') {
            const fData = state.receivingFiles[tId];
            if (fData) {
                const blob = new Blob(fData.receivedChunks, { type: fData.metadata.type });
                const url = URL.createObjectURL(blob);
                
                // Resim önizlemesi güncelle
                if (fData.metadata.type?.startsWith('image/')) {
                    const imgEl = document.getElementById(`preview-img-rec-${tId}`);
                    const contEl = document.getElementById(`preview-cont-rec-${tId}`);
                    if (imgEl && contEl) {
                        imgEl.src = url;
                        contEl.style.display = 'block';
                    }
                }

                // İndirme linkini aktif et
                const link = document.getElementById(`link-${tId}`);
                if (link) { link.href = url; link.download = fData.metadata.name; link.style.display = 'block'; }
                
                const barCont = document.getElementById(`cont-${tId}`);
                if (barCont) barCont.style.display = 'none';

                const statusDiv = document.querySelector(`#card-rec-${tId} .transfer-status`);
                if (statusDiv) {
                    statusDiv.innerText = "ALINDI ✅";
                    statusDiv.style.color = "#2ecc71";
                }

                const audioEngine = require('../audio/audioEngine');
                audioEngine.playSystemSound('notification');
                
                delete state.receivingFiles[tId];
                delete state.activeIncomingTransferIds[senderId];
            }
        }
        else if (message.type === 'file-cancel') {
            const statusDiv = document.querySelector(`#card-rec-${tId} .transfer-status`);
            const senderName = state.userNames[senderId] || "Bir Kullanıcı";
            
            if (statusDiv) {
                statusDiv.innerText = `${senderName.toUpperCase()} İPTAL ETTİ ❌`;
                statusDiv.style.color = "#ff4757";
            }
            delete state.receivingFiles[tId];
            delete state.activeIncomingTransferIds[senderId];
        }
    } else {
        // Ham veri parçası (Chunk)
        const tId = state.activeIncomingTransferIds[senderId];
        const fData = state.receivingFiles[tId];
        if (fData) {
            fData.receivedChunks.push(data);
            fData.receivedSize += data.byteLength;
            const bar = document.getElementById(`prog-${tId}`);
            if (bar) bar.style.width = (fData.receivedSize / fData.metadata.size * 100) + "%";
        }
    }
}

/**
 * Gelen dosya için alıcı tarafında UI kartı oluşturur
 */
function displayIncomingFile(senderId, fileName, fileSize, tId, fileType) {
    const div = document.createElement('div');
    div.id = `card-rec-${tId}`;
    div.className = 'message received file-message';
    const name = state.userNames[senderId] || "Bir Kullanıcı";
    
    div.innerHTML = `
        <div class="transfer-status" style="font-size:11px; color:#aaa; margin-bottom:8px; font-weight:bold;">${name.toUpperCase()} GÖNDERİYOR</div>
        <div id="preview-cont-rec-${tId}" class="preview-container" style="display:none;">
            <img id="preview-img-rec-${tId}" class="preview-thumb">
        </div>
        <div style="font-size:14px; margin-bottom:5px; word-break:break-all;"><strong>${fileName}</strong></div>
        <div style="font-size:11px; opacity:0.7;">Boyut: ${(fileSize / (1024 * 1024)).toFixed(2)} MB</div>
        <div class="meter-bg" id="cont-${tId}">
            <div id="prog-${tId}" class="meter-fill" style="width: 0%; background: #3498db;"></div>
        </div>
        <a id="link-${tId}" class="download-btn" style="display:none; margin-top:10px; text-decoration:none; color:#2ecc71; font-weight:bold; font-size:13px;">⬇ İndir (Hazır)</a>
    `;
    dom.chatHistory.appendChild(div);
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
}

module.exports = {
    cancelTransfer,
    addFileSentUI,
    sendFile,
    handleIncomingFileData
};