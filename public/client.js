const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const minimapCtx = minimap.getContext('2d');

// Элементы UI
const loginPanel = document.getElementById('loginPanel');
const gameInfo = document.getElementById('gameInfo');
const usernameInput = document.getElementById('usernameInput');
const joinButton = document.getElementById('joinButton');
const deathScreen = document.getElementById('deathScreen');
const respawnTimer = document.getElementById('respawnTimer');
const killerName = document.getElementById('killerName');
const playerName = document.getElementById('playerName');
const playerHealth = document.getElementById('playerHealth');
const playerScore = document.getElementById('playerScore');
const playerKills = document.getElementById('playerKills');
const playerDeaths = document.getElementById('playerDeaths');
const playersList = document.getElementById('playersList');
const onlineCount = document.getElementById('onlineCount');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');

// Настройка размеров канваса
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    minimap.width = minimap.parentElement.clientWidth;
    minimap.height = minimap.parentElement.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Состояние игры
let gameConfig = {};
let playerId = null;
let players = {};
let bullets = {};
let currentPlayer = null;
let keys = {};
let mouse = { x: 0, y: 0 };
let lastChatTime = 0;

// Обработчики управления
window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    // Отправка сообщения в чат
    if (e.key === 'Enter' && Date.now() - lastChatTime > 100) {
        chatInput.focus();
        lastChatTime = Date.now();
    }
    
    // Выстрел пробелом
    if (e.key === ' ') {
        e.preventDefault();
        socket.emit('shoot');
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('click', () => {
    socket.emit('shoot');
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Присоединение к игре
joinButton.addEventListener('click', () => {
    const username = usernameInput.value.trim() || 'Игрок';
    socket.emit('join', username);
    loginPanel.style.display = 'none';
    gameInfo.style.display = 'block';
    playerName.textContent = username;
});

// Отправка сообщения
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message && currentPlayer) {
        socket.emit('chat', message);
        chatInput.value = '';
    }
}

sendButton.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

// Socket.io обработчики
socket.on('init', (data) => {
    playerId = data.id;
    gameConfig = data.config;
    players = {};
    bullets = {};
    
    data.players.forEach(player => {
        players[player.id] = player;
    });
    
    data.bullets.forEach(bullet => {
        bullets[bullet.id] = bullet;
    });
    
    currentPlayer = players[playerId];
    updatePlayersList();
});

socket.on('playerJoined', (player) => {
    players[player.id] = player;
    updatePlayersList();
    addChatMessage(`${player.username} присоединился к игре`, 'system');
});

socket.on('playerLeft', (id) => {
    if (players[id]) {
        addChatMessage(`${players[id].username} покинул игру`, 'system');
        delete players[id];
        updatePlayersList();
    }
});

socket.on('playerMoved', (data) => {
    const player = players[data.id];
    if (player) {
        player.x = data.x;
        player.y = data.y;
        player.direction = data.direction;
    }
});

socket.on('bulletShot', (bullet) => {
    bullets[bullet.id] = bullet;
});

socket.on('bulletRemoved', (id) => {
    delete bullets[id];
});

socket.on('playerHit', (data) => {
    const player = players[data.id];
    if (player) {
        player.health = data.health;
        if (data.id === playerId) {
            updatePlayerStats();
        }
    }
});

socket.on('playerKilled', (data) => {
    const killed = players[data.killedId];
    const killer = players[data.killerId];
    
    if (killed) {
        killed.alive = false;
        killed.health = 0;
        killed.deaths = data.player.deaths;
    }
    
    if (killer) {
        killer.score = data.shooter.score;
        killer.kills = data.shooter.kills;
    }
    
    // Обновляем UI если это текущий игрок
    if (data.killedId === playerId) {
        deathScreen.style.display = 'flex';
        if (killer) {
            killerName.textContent = killer.username;
        }
        
        let timeLeft = 3;
        respawnTimer.textContent = timeLeft;
        
        const timer = setInterval(() => {
            timeLeft--;
            respawnTimer.textContent = timeLeft;
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                deathScreen.style.display = 'none';
            }
        }, 1000);
    }
    
    if (data.killedId === playerId || data.killerId === playerId) {
        updatePlayerStats();
    }
    
    addChatMessage(`${killer ? killer.username : 'Unknown'} убил ${killed.username}`, 'kill');
    updatePlayersList();
});

socket.on('playerRespawned', (data) => {
    const player = players[data.id];
    if (player) {
        player.x = data.x;
        player.y = data.y;
        player.health = data.health;
        player.alive = true;
        
        if (data.id === playerId) {
            updatePlayerStats();
        }
    }
});

socket.on('gameUpdate', (gameState) => {
    players = {};
    gameState.players.forEach(player => {
        players[player.id] = player;
        if (player.id === playerId) {
            currentPlayer = player;
        }
    });
    
    bullets = {};
    gameState.bullets.forEach(bullet => {
        bullets[bullet.id] = bullet;
    });
    
    updatePlayersList();
    updatePlayerStats();
});

socket.on('chat', (data) => {
    addChatMessage(`${data.username}: ${data.message}`, 'player');
});

// Функции отрисовки
function drawGame() {
    // Очищаем канвас
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!currentPlayer || !gameConfig.WIDTH) return;
    
    // Центрируем камеру на игроке
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetX = centerX - currentPlayer.x;
    const offsetY = centerY - currentPlayer.y;
    
    // Ограничиваем смещение камеры
    const maxOffsetX = canvas.width - gameConfig.WIDTH;
    const maxOffsetY = canvas.height - gameConfig.HEIGHT;
    
    const cameraX = Math.max(maxOffsetX, Math.min(0, offsetX));
    const cameraY = Math.max(maxOffsetY, Math.min(0, offsetY));
    
    // Рисуем игроков
    Object.values(players).forEach(player => {
        if (!player.alive) return;
        
        const screenX = player.x + cameraX;
        const screenY = player.y + cameraY;
        
        // Игрок
        ctx.beginPath();
        ctx.arc(screenX, screenY, gameConfig.PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Полоска здоровья
        const healthWidth = gameConfig.PLAYER_RADIUS * 2;
        const healthHeight = 4;
        const healthX = screenX - gameConfig.PLAYER_RADIUS;
        const healthY = screenY - gameConfig.PLAYER_RADIUS - 10;
        
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(healthX, healthY, healthWidth, healthHeight);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(healthX, healthY, (player.health / 100) * healthWidth, healthHeight);
        
        // Имя игрока
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, screenX, screenY - gameConfig.PLAYER_RADIUS - 20);
        
        // Направление
        const directionX = screenX + Math.cos(player.direction) * gameConfig.PLAYER_RADIUS;
        const directionY = screenY + Math.sin(player.direction) * gameConfig.PLAYER_RADIUS;
        
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(directionX, directionY);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
    
    // Рисуем пули
    Object.values(bullets).forEach(bullet => {
        const screenX = bullet.x + cameraX;
        const screenY = bullet.y + cameraY;
        
        ctx.beginPath();
        ctx.arc(screenX, screenY, gameConfig.BULLET_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#ffff00';
        ctx.fill();
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    
    // Рисуем границы карты
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(cameraX, cameraY, gameConfig.WIDTH, gameConfig.HEIGHT);
    
    // Рисуем миникарту
    drawMinimap(cameraX, cameraY);
    
    requestAnimationFrame(drawGame);
}

function drawMinimap(cameraX, cameraY) {
    const minimapWidth = minimap.width;
    const minimapHeight = minimap.height;
    
    // Очищаем миникарту
    minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    minimapCtx.fillRect(0, 0, minimapWidth, minimapHeight);
    
    // Масштаб для миникарты
    const scaleX = minimapWidth / gameConfig.WIDTH;
    const scaleY = minimapHeight / gameConfig.HEIGHT;
    
    // Рисуем игроков на миникарте
    Object.values(players).forEach(player => {
        if (!player.alive) return;
        
        const x = player.x * scaleX;
        const y = player.y * scaleY;
        const radius = Math.max(2, gameConfig.PLAYER_RADIUS * scaleX);
        
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, radius, 0, Math.PI * 2);
        minimapCtx.fillStyle = player.color;
        minimapCtx.fill();
        
        // Текущий игрок
        if (player.id === playerId) {
            minimapCtx.strokeStyle = '#ffffff';
            minimapCtx.lineWidth = 2;
            minimapCtx.stroke();
        }
    });
    
    // Рисуем область видимости на миникарте
    const viewportX = -cameraX * scaleX;
    const viewportY = -cameraY * scaleY;
    const viewportWidth = canvas.width * scaleX;
    const viewportHeight = canvas.height * scaleY;
    
    minimapCtx.strokeStyle = '#00ff00';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
}

// Функции UI
function updatePlayerStats() {
    if (currentPlayer) {
        playerHealth.textContent = currentPlayer.health;
        playerHealth.style.color = currentPlayer.health > 50 ? '#00ff88' : 
                                  currentPlayer.health > 25 ? '#ffaa00' : '#ff4444';
        playerScore.textContent = currentPlayer.score;
        playerKills.textContent = currentPlayer.kills;
        playerDeaths.textContent = currentPlayer.deaths;
    }
}

function updatePlayersList() {
    playersList.innerHTML = '';
    let count = 0;
    
    Object.values(players).forEach(player => {
        count++;
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.innerHTML = `
            <span class="player-name" style="color: ${player.color}">${player.username}</span>
            <span class="player-score">${player.score}</span>
        `;
        playersList.appendChild(playerElement);
    });
    
    onlineCount.textContent = count;
}

function addChatMessage(message, type) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    
    let color = '#ffffff';
    if (type === 'system') color = '#00ffff';
    if (type === 'kill') color = '#ff4444';
    
    messageElement.innerHTML = `<span style="color: ${color}">${message}</span>`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Игровой цикл управления
function gameLoop() {
    if (!currentPlayer || !currentPlayer.alive) return;
    
    // Вычисляем направление к курсору
    const rect = canvas.getBoundingClientRect();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    const mouseX = mouse.x;
    const mouseY = mouse.y;
    
    const direction = Math.atan2(mouseY - centerY, mouseX - centerX);
    
    // Обработка движения WASD
    let moveX = 0;
    let moveY = 0;
    
    if (keys['w'] || keys['ц']) moveY -= 1;
    if (keys['s'] || keys['ы']) moveY += 1;
    if (keys['a'] || keys['ф']) moveX -= 1;
    if (keys['d'] || keys['в']) moveX += 1;
    
    // Если есть движение клавишами, обновляем направление
    let moveDirection = direction;
    if (moveX !== 0 || moveY !== 0) {
        moveDirection = Math.atan2(moveY, moveX);
    }
    
    // Отправляем движение на сервер
    socket.emit('move', { direction: moveDirection });
}

// Запуск игры
drawGame();
setInterval(gameLoop, 1000 / 60); // 60 FPS

// Автофокус на поле ввода имени
usernameInput.focus();