import asyncio
import websockets
import json
import uuid

connected_sockets = set()

users = {}

async def broadcast_user_list():
    """
    Tüm dünyaya (girmemiş olanlara bile) güncel listeyi gönderir.
    Böylece giriş ekranında 'Oyun Odası (3 Kişi)' yazısını güncelleyebiliriz.
    """
    if not connected_sockets:
        return

    full_list = [
        {"id": u["id"], "name": u["name"], "room": u["room"]} 
        for u in users.values()
    ]
    
    message = json.dumps({"type": "user-list", "users": full_list})
    
    for ws in connected_sockets:
        try:
            await ws.send(message)
        except:
            pass

ACCESS_KEY = "your_secret_access_key"

async def handler(websocket):
    connected_sockets.add(websocket)
    try:
        await broadcast_user_list()
        
        async for message in websocket:
            data = json.loads(message)
            
            if data['type'] == 'join':

                if data.get('key') != ACCESS_KEY:
                    print(f"🚫 Yetkisiz erişim denemesi: {data.get('name')}")
                    await websocket.send(json.dumps({"type": "error", "message": "Geçersiz Erişim Anahtarı!"}))
                    await websocket.close()
                    return
                
                user_id = str(uuid.uuid4())
                target_room = data.get('room', 'genel')
                
                users[websocket] = {
                    "id": user_id,
                    "name": data['name'],
                    "room": target_room
                }
                
                await websocket.send(json.dumps({"type": "me", "id": user_id}))
                
                join_msg = json.dumps({
                    "type": "user-joined", 
                    "id": user_id, 
                    "name": data['name'],
                    "room": target_room
                })
                
                for ws, info in users.items():
                    if ws != websocket and info['room'] == target_room:
                        await ws.send(join_msg)
                
                await broadcast_user_list()

            elif websocket in users:
                sender_info = users[websocket]
                current_room = sender_info['room']
                sender_id = sender_info['id']
                
                if data['type'] == 'signal':
                    target_id = data.get('targetId')
                    target_ws = None
                    for ws, u in users.items():
                        if u["id"] == target_id:
                            target_ws = ws
                            break
                    
                    if target_ws and users[target_ws]['room'] == current_room:
                        data['senderId'] = sender_id
                        await target_ws.send(json.dumps(data))

                else:
                    data['senderId'] = sender_id
                    out_msg = json.dumps(data)
                    
                    for ws, info in users.items():
                        if ws != websocket and info['room'] == current_room:
                            await ws.send(out_msg)

    except Exception:
        pass
    finally:
        connected_sockets.discard(websocket)
        if websocket in users:
            leaver = users.pop(websocket)
            leaver_room = leaver['room']
            
            leave_msg = json.dumps({"type": "user-left", "id": leaver["id"]})
            for ws, info in users.items():
                if info['room'] == leaver_room:
                    await ws.send(leave_msg)
            
            await broadcast_user_list()

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8080):
        print("Çoklu Oda Sunucusu (Local) 8080'de çalışıyor...")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())