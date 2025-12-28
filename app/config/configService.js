// configService.js - Ayar Yönetimi (Okuma/Yazma)
const fs = require('fs');
const path = require('path');
const state = require('../state/appState');
const dom = require('../ui/dom');

// --- YOL TANIMLAMALARI ---
const isDev = !require('electron').remote ? !require('electron').app.isPackaged : false; 
// Not: renderer tarafında isPackaged kontrolü için alternatif bir yöntem
const isActuallyDev = !__dirname.includes('app.asar');

let CONFIG_PATH;

if (isActuallyDev) {
    // Geliştirme aşamasında proje klasöründeki config.json
    CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');
} else {
    // Paketlendiğinde kullanıcı verileri klasörü (AppData/Roaming/Natla)
    const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
    const appDir = path.join(appData, 'Natla'); 
    
    if (!fs.existsSync(appDir)){
        try { fs.mkdirSync(appDir, { recursive: true }); } catch(e) { console.error("Klasör oluşturulamadı", e); }
    }
    
    CONFIG_PATH = path.join(appDir, 'config.json');
}

/**
 * Mevcut konfigürasyonu döndürür
 */
function getConfig() {
    return state.configData;
}

/**
 * Dosya sisteminden config.json'ı okur ve state'e yükler
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            state.configData = data;
            console.log("✅ Config yüklendi:", data.SIGNALING_SERVER);
            return data;
        }
    } catch (error) {
        console.error("Config okunurken hata oluştu:", error);
    }
    return null;
}

/**
 * Kullanıcı arayüzünden gelen verileri config.json olarak kaydeder
 */
function handleSaveSettings() {
    const enteredServer = dom.serverInput.value.trim();
    const enteredKey = dom.keyInput.value.trim();

    if (!enteredServer || !enteredKey) {
        return alert("Lütfen tüm alanları doldurun!");
    }

    const newConfig = { 
        SIGNALING_SERVER: enteredServer, 
        ACCESS_KEY: enteredKey 
    };

    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
        state.configData = newConfig;
        dom.passwordModal.style.display = 'none';
        alert("Ayarlar kaydedildi. Yeniden bağlanılıyor...");
        location.reload(); 
    } catch (e) {
        alert("Dosya yazma hatası: " + e.message);
    }
}

/**
 * Basit localStorage ayarlarını kaydeder (Kullanıcı adı vb.)
 */
function saveSetting(key, value) {
    localStorage.setItem(key, value);
}

module.exports = {
    getConfig,
    loadConfig,
    handleSaveSettings,
    saveSetting
};