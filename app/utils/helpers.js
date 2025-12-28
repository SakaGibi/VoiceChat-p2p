// helpers.js - Yardımcı Fonksiyonlar ve Biçimlendiriciler

/**
 * Mevcut saati "SS:DD" formatında döndürür
 * @returns {string} Örn: "14:25"
 */
function getCurrentTime() {
    return new Date().toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

/**
 * Bayt cinsinden dosya boyutunu okunabilir formata çevirir (MB)
 * @param {number} bytes - Dosya boyutu (byte)
 * @param {number} decimals - Ondalık basamak sayısı
 * @returns {string} Örn: "15.50 MB"
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 MB';
    
    // Uygulama geneli MB üzerinden hesaplama yaptığı için doğrudan dönüşüm yapıyoruz
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(decimals) + ' MB';
}

/**
 * Belirli bir metni HTML içinde güvenle göstermek için temizler (XSS koruması)
 * @param {string} str - Ham metin
 * @returns {string} Temizlenmiş metin
 */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Benzersiz bir Transfer ID oluşturur
 * @returns {string} Örn: "transfer-1703765432100"
 */
function generateTransferId() {
    return "transfer-" + Date.now();
}

module.exports = {
    getCurrentTime,
    formatBytes,
    escapeHTML,
    generateTransferId
};