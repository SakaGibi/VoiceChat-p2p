// fileTransfer.js - Tam sürüm (Önizleme + İptal + Stabil Akış)

window.receivingFiles = {}; 
window.activeTransfers = {};
window.activeIncomingTransferIds = {}; // senderId -> tId eşleşmesi

// 1. İPTAL FONKSİYONU
window.cancelTransfer = function(tId, isSender = true) {
    if (window.activeTransfers[tId]) {
        window.activeTransfers[tId].cancelled = true; 
        if (isSender) {
            for (let pId in peers) {
                try { 
                    peers[pId].send(JSON.stringify({ type: 'file-cancel', payload: { tId: tId } })); 
                } catch(e) {}
            }
        }
    }
    const card = document.getElementById(isSender ? `card-${tId}` : `card-rec-${tId}`);
    if (card) card.remove();
};

// 2. GÖNDERİCİ UI (Yerel Önizlemeli)
window.addFileSentUI = function(file, tId) {
    const div = document.createElement('div');
    div.id = `card-${tId}`;
    div.className = 'message sent file-message';
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:11px; font-weight:bold; opacity:0.8;">GÖNDERİLİYOR</span>
            <button onclick="cancelTransfer('${tId}', true)" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size:16px; padding:0;">✖</button>
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
    document.getElementById('chatHistory').appendChild(div);
    
    // Resim Önizleme İşlemi
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById(`preview-img-${tId}`);
            if (img) {
                img.src = e.target.result;
                document.getElementById(`preview-cont-${tId}`).style.display = 'block';
                document.getElementById('chatHistory').scrollTop = document.getElementById('chatHistory').scrollHeight;
            }
        };
        reader.readAsDataURL(file);
    }
    document.getElementById('chatHistory').scrollTop = document.getElementById('chatHistory').scrollHeight;
};

// 3. GÖNDERME MOTORU
window.sendFile = function(peer, file, tId) {
    if (!peer || !peer.connected) return;
    if (!window.activeTransfers[tId]) window.activeTransfers[tId] = { cancelled: false, fileName: file.name };

    const chunkSize = 16 * 1024;
    let offset = 0;

    peer.send(JSON.stringify({ 
        type: 'file-metadata', 
        payload: { name: file.name, size: file.size, type: file.type, tId: tId } 
    }));

    const readAndSend = () => {
        if (window.activeTransfers[tId]?.cancelled) return;
        if (peer._channel && peer._channel.bufferedAmount > 64 * 1024) {
            setTimeout(readAndSend, 50);
            return;
        }

        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        reader.onload = (e) => {
            if (window.activeTransfers[tId]?.cancelled) return;
            peer.send(e.target.result);
            offset += e.target.result.byteLength;
            
            const bar = document.getElementById(`prog-${tId}`);
            if (bar) bar.style.width = (offset / file.size * 100) + "%";

            if (offset < file.size) readAndSend();
            else peer.send(JSON.stringify({ type: 'file-end', payload: { tId: tId } }));
        };
        reader.readAsArrayBuffer(slice);
    };
    readAndSend();
};

// 4. ALICI VERİ İŞLEME (Önizleme Dahil)
window.handleIncomingFileData = function(senderId, data) {
    let message = null;
    let isJson = false;

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
        if (message.type === 'file-metadata') {
            const info = message.payload;
            const tId = info.tId;
            window.activeIncomingTransferIds[senderId] = tId;
            window.receivingFiles[tId] = { metadata: info, receivedChunks: [], receivedSize: 0 };
            displayIncomingFile(senderId, info.name, info.size, tId, info.type);
        } 
        else if (message.type === 'file-end') {
            const tId = message.payload.tId;
            const fData = window.receivingFiles[tId];
            if (fData) {
                const blob = new Blob(fData.receivedChunks, { type: fData.metadata.type });
                const url = URL.createObjectURL(blob);
                
                // Alıcı için Resim Önizlemesi
                if (fData.metadata.type && fData.metadata.type.startsWith('image/')) {
                    const imgEl = document.getElementById(`preview-img-rec-${tId}`);
                    const contEl = document.getElementById(`preview-cont-rec-${tId}`);
                    if (imgEl && contEl) {
                        imgEl.src = url;
                        contEl.style.display = 'block';
                    }
                }

                const link = document.getElementById(`link-${tId}`);
                if (link) {
                    link.href = url;
                    link.download = fData.metadata.name;
                    link.style.display = 'block';
                }
                const cont = document.getElementById(`cont-${tId}`);
                if (cont) cont.style.display = 'none';
                
                delete window.receivingFiles[tId];
                delete window.activeIncomingTransferIds[senderId];
                document.getElementById('chatHistory').scrollTop = document.getElementById('chatHistory').scrollHeight;
            }
        }
        else if (message.type === 'file-cancel') {
            const tId = window.activeIncomingTransferIds[senderId];
            const card = document.getElementById(`card-rec-${tId}`);
            if (card) card.remove();
            delete window.receivingFiles[tId];
            delete window.activeIncomingTransferIds[senderId];
        }
    } else {
        const tId = window.activeIncomingTransferIds[senderId];
        const fData = window.receivingFiles[tId];
        if (fData) {
            fData.receivedChunks.push(data);
            fData.receivedSize += data.byteLength;
            const bar = document.getElementById(`prog-${tId}`);
            if (bar) bar.style.width = (fData.receivedSize / fData.metadata.size * 100) + "%";
        }
    }
};

// 5. ALICI UI KARTI
function displayIncomingFile(senderId, fileName, fileSize, tId, fileType) {
    const div = document.createElement('div');
    div.id = `card-rec-${tId}`;
    div.className = 'message received file-message';
    div.innerHTML = `
        <div style="font-size:11px; color:#aaa; margin-bottom:8px; font-weight:bold;">${userNames[senderId] || "Biri"} GÖNDERİYOR</div>
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
    document.getElementById('chatHistory').appendChild(div);
    document.getElementById('chatHistory').scrollTop = document.getElementById('chatHistory').scrollHeight;
}