// visualizer.js - Ses Görselleştirme (VU Meter)

/**
 * Bir ses akışını analiz eder ve ilgili kullanıcının UI barını günceller
 * @param {MediaStream} stream - Analiz edilecek ses akışı
 * @param {string} id - Kullanıcının ID'si ("me" veya peerId)
 */
function attachVisualizer(stream, id) {
    // Her kullanıcı için yeni bir analiz bağlamı oluşturulur
    const ac = new (window.AudioContext || window.webkitAudioContext)(); 
    const src = ac.createMediaStreamSource(stream); 
    const an = ac.createAnalyser(); 
    
    // Orijinal ayarlara göre FFT boyutu 64 olarak belirlenir
    an.fftSize = 64; 
    src.connect(an);
    
    const data = new Uint8Array(an.frequencyBinCount); 
    const bar = document.getElementById(`meter-fill-${id}`);
    
    /**
     * Sürekli çalışan çizim döngüsü
     */
    function draw() { 
        // Eğer kullanıcının kartı UI'dan silindiyse döngüyü durdur
        if (!document.getElementById(`user-${id}`)) {
            ac.close(); // Kaynakları serbest bırak
            return;
        }

        an.getByteFrequencyData(data); 
        
        // Frekans verilerinin toplamını hesapla
        let sum = 0; 
        for (let i of data) sum += i; 
        
        // Hesaplanan değeri bar genişliğine (%) dönüştür
        // Formül: (Toplam / Uzunluk) * 2.5 katsayısı (Max 100)
        if (bar) {
            bar.style.width = Math.min(100, (sum / data.length) * 2.5) + "%"; 
        }

        // Bir sonraki ekran yenilemesinde tekrar çalıştır
        requestAnimationFrame(draw); 
    } 

    draw();
}

module.exports = {
    attachVisualizer
};