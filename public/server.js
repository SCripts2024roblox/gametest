const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const players = new Map();
const bullets = new Map();
const WORLD_SIZE = 3000;
const TICK_RATE = 60;
let bulletIdCounter = 0;

// Player class
class Player {
  constructor(id, name, skin = 'default') {
    this.id = id;
    this.name = name;
    this.skin = skin;
    this.x = Math.random() * WORLD_SIZE;
    this.y = Math.random() * WORLD_SIZE;
    this.angle = 0;
    this.speed = 3;
    this.radius = 20;
    this.health = 100;
    this.maxHealth = 100;
    this.score = 0;
    this.keys = { w: false, a: false, s: false, d: false };
    this.lastShot = Date.now();
  }

  update() {
    let dx = 0;
    let dy = 0;

    if (this.keys.w) dy -= 1;
    if (this.keys.s) dy += 1;
    if (this.keys.a) dx -= 1;
    if (this.keys.d) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;

      this.x += dx * this.speed;
      this.y += dy * this.speed;

      // Boundary check
      this.x = Math.max(this.radius, Math.min(WORLD_SIZE - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(WORLD_SIZE - this.radius, this.y));
    }
  }

  shoot(mouseX, mouseY) {
    const now = Date.now();
    if (now - this.lastShot < 250) return null; // Fire rate limit
    
    this.lastShot = now;
    
    const angle = Math.atan2(mouseY - this.y, mouseX - this.x);
    const bulletId = `bullet_${bulletIdCounter++}`;
    
    return new Bullet(bulletId, this.id, this.x, this.y, angle);
  }

  takeDamage(damage) {
    this.health -= damage;
    return this.health <= 0;
  }
}

// Bullet class
class Bullet {
  constructor(id, playerId, x, y, angle) {
    this.id = id;
    this.playerId = playerId;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 8;
    this.radius = 5;
    this.damage = 15;
    this.distance = 0;
    this.maxDistance = 600;
  }

  update() {
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
    this.distance += this.speed;

    return this.distance >= this.maxDistance || 
           this.x < 0 || this.x > WORLD_SIZE || 
           this.y < 0 || this.y > WORLD_SIZE;
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join':
          playerId = data.id;
          const player = new Player(playerId, data.name || 'Player', data.skin || 'default');
          players.set(playerId, player);
          
          ws.send(JSON.stringify({
            type: 'init',
            playerId: playerId,
            worldSize: WORLD_SIZE
          }));
          
          broadcast({
            type: 'playerJoined',
            player: getPlayerData(player)
          });
          break;

        case 'input':
          if (players.has(playerId)) {
            const player = players.get(playerId);
            if (data.keys) {
              player.keys = data.keys;
            }
            if (data.angle !== undefined) {
              player.angle = data.angle;
            }
          }
          break;

        case 'shoot':
          if (players.has(playerId)) {
            const player = players.get(playerId);
            const bullet = player.shoot(data.mouseX, data.mouseY);
            if (bullet) {
              bullets.set(bullet.id, bullet);
            }
          }
          break;

        case 'chat':
          if (players.has(playerId)) {
            const player = players.get(playerId);
            broadcast({
              type: 'chat',
              playerId: playerId,
              playerName: player.name,
              message: data.message
            });
          }
          break;

        case 'chat':
          if (players.has(playerId)) {
            const player = players.get(playerId);
            broadcast({
              type: 'chat',
              playerId: playerId,
              playerName: player.name,
              message: data.message
            });
          }
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    if (playerId && players.has(playerId)) {
      players.delete(playerId);
      broadcast({
        type: 'playerLeft',
        playerId: playerId
      });
    }
  });
});

// Game loop
setInterval(() => {
  // Update players
  players.forEach(player => {
    player.update();
  });

  // Update bullets
  const bulletsToRemove = [];
  bullets.forEach(bullet => {
    const shouldRemove = bullet.update();
    
    if (!shouldRemove) {
      // Check collision with players
      players.forEach(player => {
        if (player.id !== bullet.playerId) {
          const dx = player.x - bullet.x;
          const dy = player.y - bullet.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < player.radius + bullet.radius) {
            const died = player.takeDamage(bullet.damage);
            bulletsToRemove.push(bullet.id);

            if (died) {
              // Award points to shooter
              if (players.has(bullet.playerId)) {
                const shooter = players.get(bullet.playerId);
                shooter.score += 100;
              }

              // Respawn player
              player.x = Math.random() * WORLD_SIZE;
              player.y = Math.random() * WORLD_SIZE;
              player.health = player.maxHealth;
              player.score = Math.max(0, player.score - 50);

              broadcast({
                type: 'playerDied',
                playerId: player.id,
                killerId: bullet.playerId
              });
            }
          }
        }
      });
    } else {
      bulletsToRemove.push(bullet.id);
    }
  });

  // Remove dead bullets
  bulletsToRemove.forEach(id => bullets.delete(id));

  // Send game state to all clients
  broadcast({
    type: 'gameState',
    players: Array.from(players.values()).map(p => getPlayerData(p)),
    bullets: Array.from(bullets.values()).map(b => ({
      id: b.id,
      x: b.x,
      y: b.y,
      radius: b.radius
    }))
  });
}, 1000 / TICK_RATE);

function getPlayerData(player) {
  return {
    id: player.id,
    name: player.name,
    skin: player.skin,
    x: player.x,
    y: player.y,
    angle: player.angle,
    radius: player.radius,
    health: player.health,
    maxHealth: player.maxHealth,
    score: player.score
  };
}

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

server.listen(PORT, () => {
  console.log(`🎮 Game server running on port ${PORT}`);
  console.log(`🌐 Visit http://localhost:${PORT} to play`);
});
