// Canvas und Kontext einrichten
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// HUD-Bereich: Höhe reduziert auf 16
const offset = 16;

// Startspielfeld: Wieder zurück auf die ursprüngliche kleine Größe (80x80)
let gameFieldWidth = 80;
let gameFieldHeight = 80;

// Mindestbreite für das gesamte Canvas – größer, um Überlappungen der HUD-Elemente zu vermeiden
const fixedHudWidth = 320;

// Variable für die Spielfelderweiterungsrichtung
let expansionDirection = 'top'; // Startet mit Erweiterung nach oben

// Zähler für gefressene Mäuse seit der letzten goldenen Maus
let miceEatenSinceLastGolden = 0;

// Tracking der Spielfelderposition relativ zum Viewport
let fieldOffsetX = 0;

// Variable für den Pausenzustand
let gamePaused = false;

// Variable für Schnellmodus (Space-Taste)
let fastMode = false;
let normalSpeed = 250; // Startgeschwindigkeit auf 250 ms pro Schritt

// Funktion, um die maximale Spielfeldhöhe basierend auf der Fensterhöhe zu berechnen
function calculateMaxGameFieldHeight() {
    const maxAvailableHeight = window.innerHeight - offset - 20;
    return Math.floor(maxAvailableHeight / 10) * 10;
}

gameFieldHeight = Math.min(gameFieldHeight, calculateMaxGameFieldHeight());
canvas.width = Math.max(gameFieldWidth, fixedHudWidth);
canvas.height = gameFieldHeight + offset;

// Spielvariablen
let snake = [{ x: 0, y: gameFieldHeight - 10 }];
let direction = { x: 10, y: 0 };
let mice = [];
let initialMouseLife = 10;
let gameOver = false;
let score = 0;
let gameStarted = false;
let gameInterval;
let nextGoldenMousePoints = 1;
let mouseCounter = 1; // Aktuelle Anzahl der Mäuse
let mouseLifeInterval = null;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);
let uniqueSnakePositions = new Set();
let directionQueue = [];

/* Dynamischer Mice-Cap:
   - Anfangs ist der Cap 10.
   - Er erhöht sich alle 100 Längeneinheiten der Schlange um 1.
   Beispiel: Bei einer Länge von 100 wird der Cap zu 11, bei 200 zu 12, usw.
*/
function getMiceCap() {
    return 10 + Math.floor(snake.length / 100);
}

/* Berechnet die aktuelle Fast‑Speed,
   sodass der Boost (mouseCounter * 10 %) als prozentuale Geschwindigkeitssteigerung einfließt.
   Beispiel: Bei normalSpeed = 250 und mouseCounter = 1 (Boost 10%) ergibt sich
   fastSpeed = 250 / (1 + 0.1) ≈ 227 ms.
*/
function getFastSpeed() {
    return normalSpeed / (1 + mouseCounter * 0.1);
}

function playSound() {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator.connect(gainNode);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.05);
}

function calculateUniqueSnakePositions() {
    uniqueSnakePositions.clear();
    snake.forEach(part => uniqueSnakePositions.add(`${part.x},${part.y}`));
    return uniqueSnakePositions.size;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // HUD-Bereich: Vier Elemente (Length, Time, Boost, Mice)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, offset);
    ctx.fillStyle = 'white';
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    
    ctx.fillText('Length: ' + snake.length, canvas.width * 1/5, offset - 4);
    
    let minLife = initialMouseLife;
    if (mice.length > 0) {
        minLife = Math.min(...mice.map(m => m.life));
    }
    ctx.fillText('Time: ' + minLife + 's', canvas.width * 2/5, offset - 4);
    
    // Boost: mouseCounter * 10%
    ctx.fillText('Boost: ' + (mouseCounter * 10) + '%', canvas.width * 3/5, offset - 4);
    
    ctx.fillText('Mice: ' + mouseCounter + ' (' + getMiceCap() + ')', canvas.width * 4/5, offset - 4);
    ctx.textAlign = "left";

    ctx.fillStyle = 'black';
    ctx.fillRect(fieldOffsetX, offset, gameFieldWidth, gameFieldHeight);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(fieldOffsetX, offset, gameFieldWidth, gameFieldHeight);
    
    // Schlange zeichnen: Im Fast‑Mode wird nur der Kopf in hellgrün gezeichnet
    if (fastMode) {
        let head = snake[0];
        ctx.fillStyle = 'lightgreen';
        ctx.fillRect(head.x + fieldOffsetX, head.y + offset, 10, 10);
        ctx.fillStyle = 'green';
        snake.slice(1).forEach(part => {
            ctx.fillRect(part.x + fieldOffsetX, part.y + offset, 10, 10);
        });
    } else {
        ctx.fillStyle = 'green';
        snake.forEach(part => {
            ctx.fillRect(part.x + fieldOffsetX, part.y + offset, 10, 10);
        });
    }

    mice.forEach(m => drawMouse(m, fieldOffsetX));
    
    if (gamePaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(fieldOffsetX, offset, gameFieldWidth, gameFieldHeight);
        ctx.fillStyle = 'white';
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PAUSED", fieldOffsetX + gameFieldWidth / 2, offset + gameFieldHeight / 2);
        ctx.font = "12px Arial";
        ctx.fillText("Press PAUSE or END to resume", fieldOffsetX + gameFieldWidth / 2, offset + gameFieldHeight / 2 + 25);
        ctx.textAlign = "left";
    }
}

function drawMouse(m, xOffset) {
    ctx.fillStyle = m.isGolden ? 'gold' : 'white';
    ctx.fillRect(m.x + xOffset, m.y + offset, 10, 10);
    ctx.fillStyle = 'red';
    ctx.fillRect(m.x + xOffset, m.y + offset - 3, 10 * (m.life / initialMouseLife), 2);
    ctx.fillStyle = 'black';
    ctx.font = "8px Arial";
    ctx.fillText(m.points, m.x + xOffset + 2, m.y + offset + 8);
}

function generateMousePosition() {
    let pos;
    do {
        pos = {
            x: Math.floor(Math.random() * (gameFieldWidth / 10)) * 10,
            y: Math.floor(Math.random() * (gameFieldHeight / 10)) * 10
        };
    } while (
        snake.some(segment => segment.x === pos.x && segment.y === pos.y) ||
        mice.some(m => m.x === pos.x && m.y === pos.y) ||
        (snake[0].x + direction.x === pos.x && snake[0].y + direction.y === pos.y) ||
        (directionQueue.length > 0 &&
         snake[0].x + directionQueue[0].x === pos.x &&
         snake[0].y + directionQueue[0].y === pos.y)
    );
    return pos;
}

function createMouse() {
    const pos = generateMousePosition();
    const isGolden = miceEatenSinceLastGolden >= 4;
    if (isGolden) {
        miceEatenSinceLastGolden = 0;
    }
    const points = Math.min(nextGoldenMousePoints, 10);
    return {
        x: pos.x,
        y: pos.y,
        life: initialMouseLife,
        points: points,
        isGolden: isGolden
    };
}

function startGame() {
    if (!gameStarted) {
        if (mice.length === 0) {
            mice.push(createMouse());
        }
        clearInterval(gameInterval);
        gameInterval = setInterval(gameLoop, normalSpeed);
        gameStarted = true;
        gamePaused = false;

        if (mouseLifeInterval === null) {
            mouseLifeInterval = setInterval(() => {
                if (gamePaused) return;
                const oldLength = mice.length;
                mice.forEach(m => m.life--);
                mice = mice.filter(m => m.life > 0);

                if (mice.length < oldLength) {
                    nextGoldenMousePoints = 1;
                    mouseCounter = Math.ceil(mouseCounter / 2);
                    if (fastMode) {
                        clearInterval(gameInterval);
                        gameInterval = setInterval(gameLoop, getFastSpeed());
                    }
                }

                while (mice.length < mouseCounter) {
                    mice.push(createMouse());
                }
            }, 1000);
        }
    }
}

function togglePause() {
    if (!gameStarted) return;
    gamePaused = !gamePaused;
    if (!gamePaused) {
        draw();
    }
}

function setFastMode(active) {
    if (fastMode === active) return;
    fastMode = active;
    if (gameStarted && !gamePaused) {
        clearInterval(gameInterval);
        if (fastMode) {
            gameInterval = setInterval(gameLoop, getFastSpeed());
        } else {
            gameInterval = setInterval(gameLoop, normalSpeed);
        }
    }
}

function resetGame() {
    gameFieldWidth = 80;
    gameFieldHeight = Math.min(80, calculateMaxGameFieldHeight());
    canvas.width = Math.max(gameFieldWidth, fixedHudWidth);
    canvas.height = gameFieldHeight + offset;
    fieldOffsetX = Math.max(0, (canvas.width - gameFieldWidth) / 2);
    snake = [{ x: 0, y: gameFieldHeight - 10 }];
    direction = { x: 10, y: 0 };

    mouseCounter = 1;
    nextGoldenMousePoints = 1;
    initialMouseLife = 10;
    score = 0;
    gameOver = false;
    gamePaused = false;
    fastMode = false;
    directionQueue = [];
    uniqueSnakePositions.clear();
    expansionDirection = 'top';
    miceEatenSinceLastGolden = 0;
    mice = [createMouse()];

    clearInterval(mouseLifeInterval);
    mouseLifeInterval = null;
    clearInterval(gameInterval);
    gameStarted = false;
    draw();
}

// Verwenden des ursprünglichen Browser-Alerts für Game Over,
// welcher standardmäßig nicht über die Leertaste, sondern nur per Enter oder Klick geschlossen wird.
function gameLoop() {
    if (gameOver) {
        clearInterval(gameInterval);
        gameStarted = false;
        alert("Game Over! Länge: " + snake.length);
        resetGame();
        return;
    }
    
    if (gamePaused) {
        draw();
        return;
    }
    
    update();
    draw();
}

function update() {
    if (directionQueue.length > 0) {
        let nextDirection = directionQueue.shift();
        if (!(direction.x === -nextDirection.x && direction.y === -nextDirection.y)) {
            direction = nextDirection;
        }
    }
    
    const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
    };

    if (head.x < 0 || head.x >= gameFieldWidth || head.y < 0 || head.y >= gameFieldHeight || collisionWithSelf(head)) {
        gameOver = true;
        return;
    }

    const eatenIndex = mice.findIndex(m => head.x === m.x && head.y === m.y);
    if (eatenIndex >= 0) {
        const eatenMouse = mice.splice(eatenIndex, 1)[0];
        let points = eatenMouse.points;
        score += points;
        for (let i = 0; i < points - 1; i++) {
            snake.push({ ...snake[snake.length - 1] });
        }
        nextGoldenMousePoints++;

        if (eatenMouse.isGolden) {
            mouseCounter = Math.min(mouseCounter + 1, getMiceCap());
            initialMouseLife++;
        } else {
            miceEatenSinceLastGolden++;
        }
        mice.forEach(m => m.life = initialMouseLife);
        while (mice.length < mouseCounter) {
            mice.push(createMouse());
        }
        playSound();

        if (fastMode) {
            clearInterval(gameInterval);
            gameInterval = setInterval(gameLoop, getFastSpeed());
        }
    } else {
        snake.pop();
    }

    snake.unshift(head);

    const uniqueSnakeCells = calculateUniqueSnakePositions();
    const totalCells = (gameFieldWidth / 10) * (gameFieldHeight / 10);
    let thresholdPercentage = 0.25;
    if (score >= 1000) {
        thresholdPercentage = 0.75;
    } else if (score >= 500) {
        thresholdPercentage = 0.5;
    }
    
    if (uniqueSnakeCells >= totalCells * thresholdPercentage) {
        expandGameField();
        rotateExpansionDirection();
        if (gameFieldWidth > window.innerWidth - 20) {
            gameFieldWidth = window.innerWidth - 20;
        }
        const maxHeight = calculateMaxGameFieldHeight();
        if (gameFieldHeight > maxHeight) {
            gameFieldHeight = maxHeight;
        }
        canvas.width = Math.max(gameFieldWidth, fixedHudWidth);
        canvas.height = gameFieldHeight + offset;
    }
}

function expandGameField() {
    switch (expansionDirection) {
        case 'top':
            gameFieldHeight += 10;
            snake.forEach(part => part.y += 10);
            mice.forEach(m => m.y += 10);
            break;
        case 'right':
            gameFieldWidth += 10;
            break;
        case 'bottom':
            gameFieldHeight += 10;
            break;
        case 'left':
            gameFieldWidth += 10;
            snake.forEach(part => part.x += 10);
            mice.forEach(m => m.x += 10);
            fieldOffsetX -= 10;
            break;
    }
    if (fieldOffsetX < 0) {
        fieldOffsetX = 0;
    } else if (fieldOffsetX + gameFieldWidth > canvas.width) {
        fieldOffsetX = Math.max(0, canvas.width - gameFieldWidth);
    }
}

function rotateExpansionDirection() {
    switch (expansionDirection) {
        case 'top':
            expansionDirection = 'right';
            break;
        case 'right':
            expansionDirection = 'bottom';
            break;
        case 'bottom':
            expansionDirection = 'left';
            break;
        case 'left':
            expansionDirection = 'top';
            break;
    }
}

function collisionWithSelf(head) {
    return snake.some((part, index) => index !== 0 && part.x === head.x && part.y === head.y);
}

function changeDirection(event) {
    if (!gameStarted) return;
    const keys = {
        37: { x: -10, y: 0 },
        38: { x: 0, y: -10 },
        39: { x: 10, y: 0 },
        40: { x: 0, y: 10 }
    };
    if (keys[event.keyCode]) {
        event.preventDefault();
        const newDirection = keys[event.keyCode];
        const baseDirection = directionQueue.length > 0 ? directionQueue[directionQueue.length - 1] : direction;
        if (!(baseDirection.x === -newDirection.x && baseDirection.y === -newDirection.y)) {
            directionQueue.push(newDirection);
        }
    }
}

window.addEventListener('resize', () => {
    const maxHeight = calculateMaxGameFieldHeight();
    if (gameFieldHeight > maxHeight) {
        gameFieldHeight = maxHeight;
        canvas.height = gameFieldHeight + offset;
    }
    draw();
});

window.addEventListener('keydown', (event) => {
    if (event.keyCode === 19 || event.keyCode === 35) { // Pause oder Ende
        event.preventDefault();
        togglePause();
        return;
    }
    if (event.keyCode === 32) { // Leertaste
        event.preventDefault();
        setFastMode(true);
        return;
    }
    if (gamePaused) return;
    if ([37, 38, 39, 40].includes(event.keyCode)) {
        event.preventDefault();
        if (!gameStarted) {
            startGame();
        }
        changeDirection(event);
    }
    if (!gameStarted && audioContext.state !== 'running') {
        audioContext.resume();
    }
});

window.addEventListener('keyup', (event) => {
    if (event.keyCode === 32) { // Leertaste losgelassen
        event.preventDefault();
        setFastMode(false);
    }
});

fieldOffsetX = Math.max(0, (canvas.width - gameFieldWidth) / 2);

draw();
