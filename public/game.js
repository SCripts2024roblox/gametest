// Game client
let ws = null;
let canvas, ctx;
let playerId = null;
let players = new Map();
let bullets = [];
let camera = { x: 0, y: 0 };
let worldSize = 3000;
let mouseX = 0;
let mouseY = 0;
let mouseWorldX = 0;
let mouseWorldY = 0;
let kills = 0;
let coins = 0;
let isMobile = false;
let joystickActive = false;
let joystickData = { x: 0, y: 0 };

// Stats
let stats = {
    totalKills: parseInt(localStorage.getItem('totalKills') || '0'),
    totalDeaths: parseInt(localStorage.getItem('totalDeaths') || '0'),
    bestScore: parseInt(localStorage.getItem('bestScore') || '0'),
    gamesPlayed: parseInt(localStorage.getItem('gamesPlayed') || '0'),
    coins: parseInt(localStorage.getItem('coins') || '0')
};

// Shop items
const shopItems = [
    { id: 'speed1', name: 'Speed Boost', price: 100, icon: '⚡', owned: false },
    { id: 'health1', name: 'Max Health', price: 150, icon: '❤️', owned: false },
    { id: 'damage1', name: 'Damage Up', price: 200, icon: '💥', owned: false },
    { id: 'skin1', name: 'Shadow Skin', price: 50, icon: '👤', owned: false },
    { id: 'skin2', name: 'Ghost Skin', price: 75, icon: '👻', owned: false },
    { id: 'skin3', name: 'Skull Skin', price: 100, icon: '💀', owned: false }
];

// Load owned items
let ownedItems = JSON.parse(localStorage.getItem('ownedItems') || '[]');
shopItems.forEach(item => {
    if (ownedItems.includes(item.id)) {
        item.owned = true;
    }
});

const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

// Detect mobile
function detectMobile() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || window.innerWidth < 768;
    return isMobile;
}

// Tab switching
function switchTab(index) {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.tab-panel');
    
    tabs.forEach((tab, i) => {
        if (i === index) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    panels.forEach((panel, i) => {
        if (i === index) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
    
    if (index === 1) {
        updateShop();
    } else if (index === 2) {
        updateStats();
    }
}

// Update shop
function updateShop() {
    document.getElementById('shopCoins').textContent = stats.coins;
    const shopGrid = document.getElementById('shopGrid');
    
    shopGrid.innerHTML = shopItems.map(item => `
        <div class="shop-item ${item.owned ? 'owned' : ''}" onclick="buyItem('${item.id}')">
            <div class="item-icon">${item.icon}</div>
            <div class="item-name">${item.name}</div>
            <div class="item-price">${item.owned ? 'OWNED' : item.price + ' coins'}</div>
        </div>
    `).join('');
}

// Buy item
function buyItem(itemId) {
    const item = shopItems.find(i => i.id === itemId);
    if (!item || item.owned) return;
    
    if (stats.coins >= item.price) {
        stats.coins -= item.price;
        item.owned = true;
        ownedItems.push(itemId);
        
        localStorage.setItem('coins', stats.coins.toString());
        localStorage.setItem('ownedItems', JSON.stringify(ownedItems));
        
        updateShop();
    }
}

// Update stats display
function updateStats() {
    document.getElementById('totalKills').textContent = stats.totalKills;
    document.getElementById('totalDeaths').textContent = stats.totalDeaths;
    document.getElementById('bestScore').textContent = stats.bestScore;
    document.getElementById('gamesPlayed').textContent = stats.gamesPlayed;
}

function startGame() {
    const nameInput = document.getElementById('nameInput');
    const playerName = nameInput.value.trim() || 'Player';
    
    document.getElementById('menuScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    detectMobile();
    resizeCanvas();
    window.addEventListener('resize', () => {
        detectMobile();
        resizeCanvas();
    });
    
    connectWebSocket(playerName);
    setupControls();
    setupChat();
    
    stats.gamesPlayed++;
    localStorage.setItem('gamesPlayed', stats.gamesPlayed.toString());
    
    requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function connectWebSocket(playerName) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        ws.send(JSON.stringify({
            type: 'join',
            id: playerId,
            name: playerName
        }));
        
        document.getElementById('playerName').textContent = playerName;
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        setTimeout(() => connectWebSocket(playerName), 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleServerMessage(data) {
    switch (data.type) {
        case 'init':
            worldSize = data.worldSize;
            break;
            
        case 'gameState':
            const newPlayers = new Map();
            data.players.forEach(p => {
                newPlayers.set(p.id, p);
            });
            players = newPlayers;
            bullets = data.bullets;
            break;
            
        case 'playerDied':
            if (data.killerId === playerId) {
                kills++;
                coins += 10;
                stats.totalKills++;
                stats.coins += 10;
                
                document.getElementById('playerKills').textContent = kills;
                document.getElementById('coinCount').textContent = coins;
                
                localStorage.setItem('totalKills', stats.totalKills.toString());
                localStorage.setItem('coins', stats.coins.toString());
            }
            if (data.playerId === playerId) {
                stats.totalDeaths++;
                localStorage.setItem('totalDeaths', stats.totalDeaths.toString());
            }
            break;
            
        case 'chat':
            addChatMessage(data.playerName, data.message);
            break;
    }
}

function setupControls() {
    if (isMobile) {
        setupMobileControls();
    } else {
        setupDesktopControls();
    }
}

function setupDesktopControls() {
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) {
            keys[key] = true;
            sendInput();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) {
            keys[key] = false;
            sendInput();
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        updateMouseWorld();
    });
    
    canvas.addEventListener('click', () => {
        shoot();
    });
}

function setupMobileControls() {
    // Joystick
    const joystickBase = document.querySelector('.joystick-container');
    const joystickStick = document.getElementById('joystickStick');
    
    joystickBase.addEventListener('touchstart', handleJoystickStart);
    joystickBase.addEventListener('touchmove', handleJoystickMove);
    joystickBase.addEventListener('touchend', handleJoystickEnd);
    
    // Shoot button
    const shootButton = document.getElementById('shootButton');
    shootButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        shoot();
    });
    
    // Auto-aim to center
    setInterval(() => {
        if (isMobile) {
            const player = players.get(playerId);
            if (player) {
                mouseWorldX = player.x + Math.cos(player.angle) * 200;
                mouseWorldY = player.y + Math.sin(player.angle) * 200;
            }
        }
    }, 100);
}

function handleJoystickStart(e) {
    e.preventDefault();
    joystickActive = true;
}

function handleJoystickMove(e) {
    e.preventDefault();
    if (!joystickActive) return;
    
    const touch = e.touches[0];
    const rect = e.target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = rect.width / 2 - 25;
    
    if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
    }
    
    joystickData.x = dx / maxDistance;
    joystickData.y = dy / maxDistance;
    
    const stick = document.getElementById('joystickStick');
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    
    // Update keys based on joystick
    keys.w = joystickData.y < -0.3;
    keys.s = joystickData.y > 0.3;
    keys.a = joystickData.x < -0.3;
    keys.d = joystickData.x > 0.3;
    
    sendInput();
}

function handleJoystickEnd(e) {
    e.preventDefault();
    joystickActive = false;
    joystickData = { x: 0, y: 0 };
    
    const stick = document.getElementById('joystickStick');
    stick.style.transform = 'translate(-50%, -50%)';
    
    keys.w = false;
    keys.s = false;
    keys.a = false;
    keys.d = false;
    
    sendInput();
}

function updateMouseWorld() {
    const player = players.get(playerId);
    if (player) {
        mouseWorldX = mouseX - canvas.width / 2 + player.x;
        mouseWorldY = mouseY - canvas.height / 2 + player.y;
        
        const angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);
        sendInput(angle);
    }
}

function shoot() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'shoot',
            mouseX: mouseWorldX,
            mouseY: mouseWorldY
        }));
    }
}

function sendInput(angle) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const data = {
            type: 'input',
            keys: keys
        };
        
        if (angle !== undefined) {
            data.angle = angle;
        }
        
        ws.send(JSON.stringify(data));
    }
}

// Chat
function setupChat() {
    const chatSend = document.getElementById('chatSend');
    const chatInput = document.getElementById('chatInput');
    
    chatSend.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (message && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chat',
            message: message
        }));
        chatInput.value = '';
    }
}

function addChatMessage(playerName, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.innerHTML = `<span class="chat-player">${playerName}:</span> ${message}`;
    
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Remove old messages
    while (chatMessages.children.length > 20) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

function update() {
    const player = players.get(playerId);
    if (player) {
        camera.x = player.x - canvas.width / 2;
        camera.y = player.y - canvas.height / 2;
        
        document.getElementById('playerScore').textContent = player.score;
        document.getElementById('coinCount').textContent = coins;
        
        const healthPercent = (player.health / player.maxHealth) * 100;
        document.getElementById('healthbar').style.width = healthPercent + '%';
        
        // Update best score
        if (player.score > stats.bestScore) {
            stats.bestScore = player.score;
            localStorage.setItem('bestScore', stats.bestScore.toString());
        }
        
        updateLeaderboard();
    }
}

function updateLeaderboard() {
    const sortedPlayers = Array.from(players.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    
    const leaderboardHtml = sortedPlayers.map((p, index) => {
        const rank = index + 1;
        const highlight = p.id === playerId ? 'style="font-weight: 700;"' : '';
        return `<div class="leaderboard-entry" ${highlight}>${rank}. ${p.name}: ${p.score}</div>`;
    }).join('');
    
    document.getElementById('leaderboardList').innerHTML = leaderboardHtml;
}

function render() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    drawGrid();
    
    // Draw world boundary
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(-camera.x, -camera.y, worldSize, worldSize);
    
    // Draw bullets
    bullets.forEach(bullet => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(
            bullet.x - camera.x,
            bullet.y - camera.y,
            bullet.radius,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });
    
    // Draw players
    players.forEach(player => {
        const screenX = player.x - camera.x;
        const screenY = player.y - camera.y;
        
        // Player body
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(screenX, screenY, player.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Direction indicator
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(
            screenX + Math.cos(player.angle) * (player.radius + 10),
            screenY + Math.sin(player.angle) * (player.radius + 10)
        );
        ctx.stroke();
        
        // Player name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "IBM Plex Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, screenX, screenY - player.radius - 10);
        
        // Health bar
        const barWidth = player.radius * 2;
        const barHeight = 4;
        const barX = screenX - player.radius;
        const barY = screenY + player.radius + 6;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        const healthWidth = (player.health / player.maxHealth) * barWidth;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(barX, barY, healthWidth, barHeight);
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    });
}

function drawGrid() {
    const gridSize = 50;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    for (let x = startX; x < camera.x + canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - camera.x, 0);
        ctx.lineTo(x - camera.x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = startY; y < camera.y + canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y - camera.y);
        ctx.lineTo(canvas.width, y - camera.y);
        ctx.stroke();
    }
}

// Initialize menu
document.addEventListener('DOMContentLoaded', () => {
    updateShop();
    updateStats();
    
    const nameInput = document.getElementById('nameInput');
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startGame();
            }
        });
        nameInput.focus();
    }
});
