// server.js
// Minimal WebSocket room server for "Hand Pong" friend mode
// Run: npm i ws
// Then: node server.js

const WebSocket = require("ws");
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

/**
 * rooms: {
 *   CODE: { host: ws|null, join: ws|null }
 * }
 */
const rooms = new Map();

function safeSend(ws, obj){
  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify(obj));
  }
}

function otherPeer(role, room){
  const r = rooms.get(room);
  if(!r) return null;
  return role === "host" ? r.join : r.host;
}

wss.on("connection", (ws) => {
  ws._room = null;
  ws._role = null;

  ws.on("message", (buf) => {
    let msg;
    try{ msg = JSON.parse(buf.toString()); } catch { return; }

    // First hello binds socket to room+role
    if(msg.t === "hello"){
      const room = String(msg.room || "").toUpperCase().trim();
      const role = msg.role === "host" ? "host" : "join";

      if(!room || room.length > 10){
        safeSend(ws, {t:"err", m:"bad room"});
        return;
      }

      ws._room = room;
      ws._role = role;

      if(!rooms.has(room)) rooms.set(room, {host:null, join:null});
      const r = rooms.get(room);

      // only 1 host & 1 join allowed
      if(role === "host"){
        if(r.host && r.host.readyState === WebSocket.OPEN){
          safeSend(ws, {t:"err", m:"host already exists"});
          ws.close();
          return;
        }
        r.host = ws;
      } else {
        if(r.join && r.join.readyState === WebSocket.OPEN){
          safeSend(ws, {t:"err", m:"join already exists"});
          ws.close();
          return;
        }
        r.join = ws;
      }

      // If both present -> ok both
      if(r.host && r.join && r.host.readyState === WebSocket.OPEN && r.join.readyState === WebSocket.OPEN){
        safeSend(r.host, {t:"ok"});
        safeSend(r.join, {t:"ok"});
      } else {
        safeSend(ws, {t:"ok_wait"});
      }
      return;
    }

    // Relay any other message to the other peer in same room
    if(!ws._room || !ws._role) return;
    const peer = otherPeer(ws._role, ws._room);
    if(peer){
      safeSend(peer, msg);
    }
  });

  ws.on("close", () => {
    const room = ws._room;
    const role = ws._role;
    if(!room || !rooms.has(room)) return;

    const r = rooms.get(room);
    if(role === "host" && r.host === ws) r.host = null;
    if(role === "join" && r.join === ws) r.join = null;

    // notify remaining peer
    const peer = role === "host" ? r.join : r.host;
    safeSend(peer, {t:"peer_left"});

    // cleanup empty room
    if(!r.host && !r.join) rooms.delete(room);
  });
});

console.log("✅ Hand Pong signaling server running on ws://localhost:8080");
