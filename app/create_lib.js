const fs = require('fs');
const browserify = require('browserify');

console.log("🛠️  Standalone Dosya üretiliyor...");

// DÜZELTME BURADA: Ayarı (standalone) en başa koyduk
const b = browserify({
    standalone: 'SimplePeer'
});

// simple-peer kütüphanesini ekle
b.add(require.resolve('simple-peer'));

// Dosyayı yazacağımız yer
const output = fs.createWriteStream('simplepeer.min.js');

// İşlemi başlat (artık içi boş)
b.bundle()
 .on('error', err => console.error("❌ HATA:", err.message))
 .pipe(output);

output.on('finish', () => {
     console.log("✅ simplepeer.min.js BAŞARIYLA OLUŞTURULDU!");
     const stats = fs.statSync('simplepeer.min.js');
     console.log(`📦 Dosya Boyutu: ${(stats.size / 1024).toFixed(2)} KB`);
     console.log("👉 Bu dosya artık doğrudan window.SimplePeer olarak çalışır.");
});