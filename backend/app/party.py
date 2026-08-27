import time
import uuid
from typing import Dict, List, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from pydantic import BaseModel

router = APIRouter(prefix="/party", tags=["party"])


class ChatMessage(BaseModel):
    id: str
    user: str
    text: str
    timestamp: float
    is_system: bool = False


class RoomState(BaseModel):
    room_id: str
    movie_id: int
    host_name: str
    current_time: float
    is_playing: bool
    last_sync: float
    messages: List[ChatMessage] = []


class PartyManager:
    def __init__(self):
        self.rooms: Dict[str, RoomState] = {}
        self.connections: Dict[str, Set[WebSocket]] = {}

    def create_room(self, movie_id: int, host_name: str) -> RoomState:
        room_id = str(uuid.uuid4())[:8]
        room = RoomState(
            room_id=room_id,
            movie_id=movie_id,
            host_name=host_name,
            current_time=0.0,
            is_playing=False,
            last_sync=time.time(),
            messages=[
                ChatMessage(
                    id=str(uuid.uuid4())[:6],
                    user="Sistema",
                    text=f"Sala de Watch Party criada por {host_name}! Convide a família com o link da sala.",
                    timestamp=time.time(),
                    is_system=True,
                )
            ],
        )
        self.rooms[room_id] = room
        self.connections[room_id] = set()
        return room

    def get_room(self, room_id: str) -> RoomState:
        if room_id not in self.rooms:
            raise HTTPException(status_code=404, detail="Sala não encontrada")
        return self.rooms[room_id]

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.connections:
            self.connections[room_id] = set()
        self.connections[room_id].add(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.connections:
            self.connections[room_id].discard(websocket)

    async def broadcast(self, room_id: str, message: dict):
        if room_id not in self.connections:
            return
        dead = []
        for ws in self.connections[room_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.connections[room_id].discard(d)


party_manager = PartyManager()


class CreateRoomRequest(BaseModel):
    movie_id: int
    host_name: str = "Família"


@router.post("/rooms", response_model=RoomState)
def create_room(payload: CreateRoomRequest):
    return party_manager.create_room(payload.movie_id, payload.host_name)


@router.get("/rooms/{room_id}", response_model=RoomState)
def get_room(room_id: str):
    return party_manager.get_room(room_id)


@router.websocket("/ws/{room_id}")
async def party_websocket(websocket: WebSocket, room_id: str):
    if room_id not in party_manager.rooms:
        await websocket.close(code=4004)
        return

    await party_manager.connect(room_id, websocket)
    room = party_manager.rooms[room_id]

    # Envia estado inicial da sala
    await websocket.send_json({
        "type": "INIT_STATE",
        "room": room.model_dump(),
    })

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")

            if event_type == "PLAY":
                room.is_playing = True
                room.current_time = float(data.get("time", room.current_time))
                room.last_sync = time.time()
                await party_manager.broadcast(room_id, {
                    "type": "PLAY",
                    "time": room.current_time,
                    "user": data.get("user", "Alguém"),
                })

            elif event_type == "PAUSE":
                room.is_playing = False
                room.current_time = float(data.get("time", room.current_time))
                room.last_sync = time.time()
                await party_manager.broadcast(room_id, {
                    "type": "PAUSE",
                    "time": room.current_time,
                    "user": data.get("user", "Alguém"),
                })

            elif event_type == "SEEK":
                room.current_time = float(data.get("time", 0.0))
                room.last_sync = time.time()
                await party_manager.broadcast(room_id, {
                    "type": "SEEK",
                    "time": room.current_time,
                    "user": data.get("user", "Alguém"),
                })

            elif event_type == "CHAT":
                msg = ChatMessage(
                    id=str(uuid.uuid4())[:6],
                    user=data.get("user", "Familiar"),
                    text=data.get("text", ""),
                    timestamp=time.time(),
                )
                room.messages.append(msg)
                if len(room.messages) > 100:
                    room.messages.pop(0)
                await party_manager.broadcast(room_id, {
                    "type": "CHAT",
                    "message": msg.model_dump(),
                })

    except WebSocketDisconnect:
        party_manager.disconnect(room_id, websocket)
    except Exception:
        party_manager.disconnect(room_id, websocket)

