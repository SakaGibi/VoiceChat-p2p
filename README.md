# Electron P2P Voice Chat

# TR
Bu proje, WebRTC ve WebSocket kullanarak insanların sesli sohbet edebildiği basit bir masaüstü uygulamasıdır. Electron üzerinde çalışır ve yerel ağda ya da internet üzerinden düşük gecikmeli P2P (eşler arası) ses aktarımı yapar.

## Özellikler
- P2P ses iletimi (sunucuya yük binmez)
- Mikrofon ve hoparlör cihazlarını seçebilme
- Mikrofon hassasiyeti (gain) ve genel ses seviyesi ayarı
- Mikrofon kapatma (Mute) ve sesi tamamen susturma (Deafen)
- Karanlık / aydınlık tema desteği
- Bağlı kullanıcı listesi ve konuşma göstergesi (visualizer)
- Sade ve anlaşılır arayüz

## Kullanılan Teknolojiler
- Electron  
- HTML / CSS / JavaScript  
- Simple-Peer (WebRTC)  
- Python WebSocket sinyal sunucusu  

## Nasıl Çalıştırılır

### 1. Gereksinimleri kur
```bash
cd app
npm install
```

### 2. Sinyal sunucusunu başlat
```bash
python server/server.py
```

### 3. Uygulamayı çalıştır
```bash
cd app
npm start
```

### 4. Kurulum dosyası (.exe) oluşturmak istersen
```bash
npm run dist
```

## Notlar
Bu uygulama farklı ağlar üzerinden de kullanılabilir. Bunun için sinyal sunucusunu bir bulut platformuna taşıyabilir veya Ngrok gibi araçlarla dış erişime açabilirsin.  
Ayrıca projede Google STUN sunucuları tanımlı olduğu için NAT arkasından bağlantılar da sorunsuz şekilde çalışır.

Bu projeyi yaparken ChatGPT ve Google Gemini'den çokça destek aldım. Kodların çoğunu birlikte düşünerek, bazılarını da doğrudan onların yardımıyla yazdım.


# EN
This project is a simple desktop application that allows people to voice chat using WebRTC and WebSocket. It runs on Electron and performs low-latency P2P (peer-to-peer) audio transmission over a local network or the internet.

## Features
- P2P audio transmission (reduces server load)
- Ability to select microphone and speaker devices
- Microphone sensitivity (gain) and master volume adjustment
- Mute microphone and Deafen (mute all incoming sound)
- Dark / Light theme support
- Connected user list and voice visualizer
- Simple and clean interface

## Technologies Used
- Electron
- HTML / CSS / JavaScript
- Simple-Peer (WebRTC)
- Python WebSocket signaling server

## How to Run

### 1. Install dependencies
```bash
cd app
npm install
```

### 2. Start the signaling server
```bash
python server/server.py
```

### 3. Run the application
```bash
cd app
npm start
```

### 4. If you want to create an installer (.exe)
```bash
npm run dist
```

## Notes
This application can also be used across different networks. To do this, you can deploy the signaling server to a cloud platform or expose it using tools like Ngrok. Additionally, since Google STUN servers are configured in the project, connections behind NAT work smoothly.

I received significant support from ChatGPT and Google Gemini while developing this project. We brainstormed most of the code logic together, and some parts were written directly with their assistance.
