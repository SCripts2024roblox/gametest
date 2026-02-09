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

const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

function startGame() {
    const nameInput = document.getElementById('nameInput');
    const playerName = nameInput.value.trim() || 'Player';
    
    document.getElementById('menuScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    connectWebSocket(playerName);
    setupControls();
    
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
            // Update players
            const newPlayers = new Map();
            data.players.forEach(p => {
                newPlayers.set(p.id, p);
            });
            players = newPlayers;
            
            // Update bullets
            bullets = data.bullets;
            break;
            
        case 'playerDied':
            if (data.killerId === playerId) {
                kills++;
                document.getElementById('playerKills').textContent = kills;
            }
            break;
    }
}

function setupControls() {
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
        
        const player = players.get(playerId);
        if (player) {
            mouseWorldX = mouseX - canvas.width / 2 + player.x;
            mouseWorldY = mouseY - canvas.height / 2 + player.y;
            
            const angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);
            sendInput(angle);
        }
    });
    
    canvas.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'shoot',
                mouseX: mouseWorldX,
                mouseY: mouseWorldY
            }));
        }
    });
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
        
        // Update HUD
        document.getElementById('playerScore').textContent = player.score;
        
        const healthPercent = (player.health / player.maxHealth) * 100;
        document.getElementById('healthbar').style.width = healthPercent + '%';
        
        // Update leaderboard
        updateLeaderboard();
    }
}

function updateLeaderboard() {
    const sortedPlayers = Array.from(players.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    
    const leaderboardHtml = sortedPlayers.map((p, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
        const highlight = p.id === playerId ? 'style="color: #ffff00;"' : '';
        return `<div class="leaderboard-entry" ${highlight}>${medal} ${p.name}: ${p.score}</div>`;
    }).join('');
    
    document.getElementById('leaderboardList').innerHTML = leaderboardHtml;
}

function render() {
    // Clear canvas
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    drawGrid();
    
    // Draw world boundary
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
    ctx.lineWidth = 5;
    ctx.strokeRect(-camera.x, -camera.y, worldSize, worldSize);
    
    // Draw bullets
    bullets.forEach(bullet => {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = bullet.color;
        ctx.fillStyle = bullet.color;
        ctx.beginPath();
        ctx.arc(
            bullet.x - camera.x,
            bullet.y - camera.y,
            bullet.radius,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
    });
    
    // Draw players
    players.forEach(player => {
        const screenX = player.x - camera.x;
        const screenY = player.y - camera.y;
        
        // Player body with glow
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = player.color;
        
        // Main circle
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, player.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner glow
        const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, player.radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, player.color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, player.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Direction indicator
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(
            screenX + Math.cos(player.angle) * (player.radius + 10),
            screenY + Math.sin(player.angle) * (player.radius + 10)
        );
        ctx.stroke();
        
        ctx.restore();
        
        // Player name
        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 14px Rajdhani';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#00f3ff';
        ctx.fillText(player.name, screenX, screenY - player.radius - 10);
        
        // Health bar
        const barWidth = player.radius * 2;
        const barHeight = 6;
        const barX = screenX - player.radius;
        const barY = screenY + player.radius + 8;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health
        const healthWidth = (player.health / player.maxHealth) * barWidth;
        const healthGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
        healthGradient.addColorStop(0, '#ff0000');
        healthGradient.addColorStop(0.5, '#ff00ff');
        healthGradient.addColorStop(1, '#00f3ff');
        ctx.fillStyle = healthGradient;
        ctx.fillRect(barX, barY, healthWidth, barHeight);
        
        // Border
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        ctx.shadowBlur = 0;
    });
    
    // Draw crosshair
    const player = players.get(playerId);
    if (player) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffff00';
        
        const crosshairSize = 20;
        const gap = 10;
        
        // Top
        ctx.beginPath();
        ctx.moveTo(mouseX, mouseY - gap);
        ctx.lineTo(mouseX, mouseY - gap - crosshairSize);
        ctx.stroke();
        
        // Bottom
        ctx.beginPath();
        ctx.moveTo(mouseX, mouseY + gap);
        ctx.lineTo(mouseX, mouseY + gap + crosshairSize);
        ctx.stroke();
        
        // Left
        ctx.beginPath();
        ctx.moveTo(mouseX - gap, mouseY);
        ctx.lineTo(mouseX - gap - crosshairSize, mouseY);
        ctx.stroke();
        
        // Right
        ctx.beginPath();
        ctx.moveTo(mouseX + gap, mouseY);
        ctx.lineTo(mouseX + gap + crosshairSize, mouseY);
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
    }
}

function drawGrid() {
    const gridSize = 100;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = startX; x < camera.x + canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - camera.x, 0);
        ctx.lineTo(x - camera.x, canvas.height);
        ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = startY; y < camera.y + canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y - camera.y);
        ctx.lineTo(canvas.width, y - camera.y);
        ctx.stroke();
    }
}

// Handle enter key on name input
document.addEventListener('DOMContentLoaded', () => {
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
