import asyncio
import websockets
import json
import uuid

PORT = 8080

rooms = {
    "main": set()
}

async def handler(ws, path):
    user_id = str(uuid.uuid4())

    client_info = {
        "id": user_id,
        "name": None
    }

    rooms["main"].add(ws)

    try:
        async for message in ws:
            data = json.loads(message)
            data_type = data.get("type")

            if data_type == "join":
                client_info["name"] = data("name")

                await broadcast("main", {
                    "type": "user-joined",
                    "id": client_info["id"],
                    "name": client_info["name"]
                }, except_ws=ws)

                await ws.send(json.dumps({
                    "type": "user-list",
                    "users": [
                        {"id": other.id, "name": other.name}
                        for other in []
                    ]
                }))

            elif data_type == "sdp":
                await broadcast("main", {
                    "type": "sdp",
                    "id": client_info["id"],
                    "sdp": data["sdp"]
                }, except_ws=ws)

            elif data_type == "ice":
                await broadcast("main", {
                    "type": "ice",
                    "id": client_info["id"],
                    "ice": data["ice"]
                }, except_ws=ws)

    except websockets.exceptions.ConnectionClosed:
        pass

    finally:
        rooms["main"].remove(ws)

        await broadcast("main", {
            "type": "user-left",
            "id": client_info["id"]
        })

async def broadcast(room_name, data, except_ws=None):
    message = json.dumps(data)
    for client in rooms[room_name]:
        if client != except_ws:
            await client.send(message)

async def main():
    print(f"Signaling server running on ws://0.0.0.0:{PORT}")
    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())

