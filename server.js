const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Настройка статической папки
app.use(express.static(path.join(__dirname, 'public')));

// Конфигурация игры
const CONFIG = {
  WIDTH: 2000,
  HEIGHT: 2000,
  PLAYER_SPEED: 5,
  BULLET_SPEED: 10,
  PLAYER_RADIUS: 20,
  BULLET_RADIUS: 5,
  FIRE_RATE: 300, // мс
  RESPAWN_TIME: 3000 // мс
};

let players = new Map();
let bullets = new Map();
let bulletId = 0;

class Player {
  constructor(id, username) {
    this.id = id;
    this.username = username || `Player${Math.floor(Math.random() * 1000)}`;
    this.x = Math.random() * CONFIG.WIDTH;
    this.y = Math.random() * CONFIG.HEIGHT;
    this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    this.direction = 0;
    this.health = 100;
    this.score = 0;
    this.kills = 0;
    this.deaths = 0;
    this.lastShot = 0;
    this.alive = true;
    this.respawnTime = 0;
  }
}

class Bullet {
  constructor(id, playerId, x, y, direction) {
    this.id = id;
    this.playerId = playerId;
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.damage = 25;
  }
}

// Обработчик подключения
io.on('connection', (socket) => {
  console.log(`Новый игрок подключился: ${socket.id}`);
  
  // Создание игрока
  socket.on('join', (username) => {
    const player = new Player(socket.id, username);
    players.set(socket.id, player);
    
    // Отправляем данные игрока
    socket.emit('init', {
      id: socket.id,
      config: CONFIG,
      players: Array.from(players.values()).filter(p => p.alive),
      bullets: Array.from(bullets.values())
    });
    
    // Уведомляем других игроков
    socket.broadcast.emit('playerJoined', player);
  });
  
  // Движение игрока
  socket.on('move', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;
    
    // Обновляем направление
    player.direction = data.direction;
    
    // Вычисляем новую позицию
    const newX = player.x + Math.cos(data.direction) * CONFIG.PLAYER_SPEED;
    const newY = player.y + Math.sin(data.direction) * CONFIG.PLAYER_SPEED;
    
    // Проверка границ
    if (newX >= 0 && newX <= CONFIG.WIDTH) player.x = newX;
    if (newY >= 0 && newY <= CONFIG.HEIGHT) player.y = newY;
    
    // Отправляем обновление всем
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      direction: player.direction
    });
  });
  
  // Выстрел
  socket.on('shoot', () => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;
    
    const now = Date.now();
    if (now - player.lastShot < CONFIG.FIRE_RATE) return;
    
    player.lastShot = now;
    
    // Создаем пулю
    const bulletIdStr = `${socket.id}_${bulletId++}`;
    const bullet = new Bullet(
      bulletIdStr,
      socket.id,
      player.x + Math.cos(player.direction) * (CONFIG.PLAYER_RADIUS + 5),
      player.y + Math.sin(player.direction) * (CONFIG.PLAYER_RADIUS + 5),
      player.direction
    );
    
    bullets.set(bulletIdStr, bullet);
    
    // Отправляем всем
    io.emit('bulletShot', bullet);
  });
  
  // Отключение игрока
  socket.on('disconnect', () => {
    console.log(`Игрок отключился: ${socket.id}`);
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

// Игровой цикл
function gameLoop() {
  // Обновление позиций пуль
  for (const [id, bullet] of bullets.entries()) {
    bullet.x += Math.cos(bullet.direction) * CONFIG.BULLET_SPEED;
    bullet.y += Math.sin(bullet.direction) * CONFIG.BULLET_SPEED;
    
    // Проверка выхода за границы
    if (bullet.x < 0 || bullet.x > CONFIG.WIDTH || 
        bullet.y < 0 || bullet.y > CONFIG.HEIGHT) {
      bullets.delete(id);
      io.emit('bulletRemoved', id);
      continue;
    }
    
    // Проверка столкновений
    for (const [playerId, player] of players.entries()) {
      if (!player.alive || playerId === bullet.playerId) continue;
      
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < CONFIG.PLAYER_RADIUS + CONFIG.BULLET_RADIUS) {
        // Попадание!
        player.health -= bullet.damage;
        
        if (player.health <= 0) {
          player.alive = false;
          player.deaths++;
          player.respawnTime = Date.now() + CONFIG.RESPAWN_TIME;
          
          // Увеличиваем счет убийце
          const shooter = players.get(bullet.playerId);
          if (shooter) {
            shooter.score += 100;
            shooter.kills++;
          }
          
          io.emit('playerKilled', {
            killedId: playerId,
            killerId: bullet.playerId,
            player: player,
            shooter: shooter
          });
        } else {
          io.emit('playerHit', {
            id: playerId,
            health: player.health,
            damage: bullet.damage
          });
        }
        
        // Удаляем пулю
        bullets.delete(id);
        io.emit('bulletRemoved', id);
        break;
      }
    }
  }
  
  // Проверка респавна
  const now = Date.now();
  for (const player of players.values()) {
    if (!player.alive && player.respawnTime && now > player.respawnTime) {
      player.alive = true;
      player.health = 100;
      player.x = Math.random() * CONFIG.WIDTH;
      player.y = Math.random() * CONFIG.HEIGHT;
      player.respawnTime = 0;
      
      io.emit('playerRespawned', {
        id: player.id,
        x: player.x,
        y: player.y,
        health: player.health
      });
    }
  }
  
  // Отправка обновлений состояния
  const gameState = {
    players: Array.from(players.values()),
    bullets: Array.from(bullets.values())
  };
  
  io.emit('gameUpdate', gameState);
}

// Запуск игрового цикла (60 FPS)
setInterval(gameLoop, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});