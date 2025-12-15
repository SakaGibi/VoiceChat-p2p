import asyncio
import websockets
import json
import uuid

# 1. connected_sockets: Uygulamayı açan HERKES (Lobi + Odadakiler)
#    Bunu, "Oda sayıları değişti" bilgisini herkese yaymak için kullanacağız.
connected_sockets = set()

# 2. users: Sadece "Katıl" butonuna basıp içeri girmiş olanlar.
#    Artık içinde 'room' bilgisi de tutuyoruz.
#    Format: {websocket: {"id": "...", "name": "...", "room": "..."}}
users = {}

async def broadcast_user_list():
    """
    Tüm dünyaya (girmemiş olanlara bile) güncel listeyi gönderir.
    Böylece giriş ekranında 'Oyun Odası (3 Kişi)' yazısını güncelleyebiliriz.
    """
    if not connected_sockets:
        return

    # Listeyi oluştururken kimin hangi odada olduğunu da ekliyoruz
    full_list = [
        {"id": u["id"], "name": u["name"], "room": u["room"]} 
        for u in users.values()
    ]
    
    message = json.dumps({"type": "user-list", "users": full_list})
    
    # Herkese gönder
    for ws in connected_sockets:
        try:
            await ws.send(message)
        except:
            pass

async def handler(websocket):
    connected_sockets.add(websocket)
    try:
        # A) LOBİ AŞAMASI
        # Bağlanır bağlanmaz durumu gönder (Henüz odaya girmediler ama görsünler)
        await broadcast_user_list()
        
        async for message in websocket:
            data = json.loads(message)
            
            # B) ODAYA GİRİŞ AŞAMASI
            if data['type'] == 'join':
                user_id = str(uuid.uuid4())
                # İstemciden gelen 'room' bilgisini al (Yoksa 'genel' yap)
                target_room = data.get('room', 'genel')
                
                users[websocket] = {
                    "id": user_id,
                    "name": data['name'],
                    "room": target_room  # <--- KRİTİK NOKTA: Odayı kaydettik
                }
                
                # 1. Kullanıcıya kendi kimliğini ver
                await websocket.send(json.dumps({"type": "me", "id": user_id}))
                
                # 2. SADECE AYNI ODADAKİLERE "Biri geldi" de
                #    (Yan odadakinin haberi olmasına gerek yok)
                join_msg = json.dumps({
                    "type": "user-joined", 
                    "id": user_id, 
                    "name": data['name'],
                    "room": target_room
                })
                
                for ws, info in users.items():
                    if ws != websocket and info['room'] == target_room:
                        await ws.send(join_msg)
                
                # 3. Ama "Sayılar değişti" diye HERKESE genel listeyi güncelle
                await broadcast_user_list()

            # C) ODA İÇİ İLETİŞİM (Ses, Chat, Görüntü)
            elif websocket in users:
                sender_info = users[websocket]
                current_room = sender_info['room']
                sender_id = sender_info['id']
                
                # Sinyal (P2P Bağlantısı için özel mesaj)
                if data['type'] == 'signal':
                    target_id = data.get('targetId')
                    # Hedefi bul
                    target_ws = None
                    for ws, u in users.items():
                        if u["id"] == target_id:
                            target_ws = ws
                            break
                    
                    # Hedef varsa ve AYNI ODADAYSA ilet (Güvenlik önlemi)
                    if target_ws and users[target_ws]['room'] == current_room:
                        data['senderId'] = sender_id
                        await target_ws.send(json.dumps(data))

                # Diğer Her Şey (Chat, Mic Durumu, Ses Efekti)
                else:
                    data['senderId'] = sender_id
                    out_msg = json.dumps(data)
                    
                    # Sadece AYNI ODADAKİLERE yay
                    for ws, info in users.items():
                        if ws != websocket and info['room'] == current_room:
                            await ws.send(out_msg)

    except Exception:
        pass
    finally:
        # Temizlik Zamanı
        connected_sockets.discard(websocket)
        if websocket in users:
            leaver = users.pop(websocket)
            leaver_room = leaver['room']
            
            # Sadece o odadakilere "Ayrıldı" de
            leave_msg = json.dumps({"type": "user-left", "id": leaver["id"]})
            for ws, info in users.items():
                if info['room'] == leaver_room:
                    await ws.send(leave_msg)
            
            # Herkese güncel sayıları bildir
            await broadcast_user_list()

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8080):
        print("Çoklu Oda Sunucusu (Local) 8080'de çalışıyor...")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())