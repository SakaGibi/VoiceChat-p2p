import asyncio
import websockets
import json
import uuid

PORT = 8080

# Odalar: "main": {ws1, ws2...}
rooms = { "main": set() }

# Client detayları: ws -> { id, name }
clients = {}

async def handler(ws):
    # Yeni bağlantı geldiğinde ID oluştur
    user_id = str(uuid.uuid4())
    clients[ws] = { "id": user_id, "name": None }
    rooms["main"].add(ws)
    
    print(f" [+] Yeni Baglanti: {user_id}")

    try:
        async for message in ws:
            try:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "join":
                    # 1. İsmi kaydet
                    client_name = data.get("name", "Anonim")
                    clients[ws]["name"] = client_name
                    print(f" -> JOIN: {client_name} ({user_id})")

                    # 2. Odaya yeni biri geldiğini diğerlerine duyur
                    await broadcast("main", {
                        "type": "user-joined",
                        "id": user_id,
                        "name": client_name
                    }, except_ws=ws)

                    # 3. Yeni gelene ODADAKİ MEVCUT kişileri gönder
                    existing_users = []
                    for client_ws in rooms["main"]:
                        if client_ws != ws: # Kendisi hariç
                            info = clients.get(client_ws)
                            if info and info["name"]: # Sadece ismi olanları (join olmuşları) ekle
                                existing_users.append({
                                    "id": info["id"],
                                    "name": info["name"]
                                })
                    
                    print(f" -> {client_name} kullanıcısına {len(existing_users)} kişi gönderiliyor.")
                    
                    # Listeyi gönder
                    await ws.send(json.dumps({
                        "type": "user-list",
                        "users": existing_users
                    }))

                elif msg_type == "signal":
                    # P2P Sinyalleşmesi (Offer/Answer/Ice)
                    target_id = data.get("targetId")
                    payload = data.get("signal")
                    
                    # Hedefi bul ve ilet
                    target_ws = None
                    for c_ws, info in clients.items():
                        if info["id"] == target_id:
                            target_ws = c_ws
                            break
                    
                    if target_ws:
                        print(f" -> SIGNAL: {clients[ws]['name']} -> {info['name']}")
                        await target_ws.send(json.dumps({
                            "type": "signal",
                            "senderId": user_id,
                            "signal": payload
                        }))
                    else:
                        print(f" ! HATA: Hedef kullanıcı bulunamadı: {target_id}")

            except json.JSONDecodeError:
                print(" ! HATA: Bozuk JSON verisi")
            except Exception as e:
                print(f" ! HATA (Mesaj İşleme): {e}")

    except websockets.exceptions.ConnectionClosed:
        print(f" [-] Baglanti Koptu: {user_id}")
    finally:
        # Temizlik
        rooms["main"].discard(ws)
        if ws in clients:
            del clients[ws]
        
        # Çıkanı haber ver
        await broadcast("main", {
            "type": "user-left",
            "id": user_id
        })

async def broadcast(room_name, data, except_ws=None):
    if room_name not in rooms: return
    message = json.dumps(data)
    
    # Kopyasını alarak döngü kuralım (RuntimeError önlemek için)
    current_users = list(rooms[room_name])
    
    for client in current_users:
        if client != except_ws:
            try:
                await client.send(message)
            except:
                pass # Gönderim hatası olursa yoksay

async def main():
    print(f"🚀 Signaling Sunucusu Baslatildi: ws://0.0.0.0:{PORT}")
    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Kapatılıyor...")