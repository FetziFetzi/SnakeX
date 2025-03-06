// Canvas und Kontext einrichten
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// HUD-Bereich: Höhe reduziert auf 16
const offset = 16;

// Startspielfeld: Wieder zurück auf die ursprüngliche kleine Größe (80x80)
let gameFieldWidth = 80;
let gameFieldHeight = 80;

// Mindestbreite für das gesamte Canvas - größer, um Überlappungen der HUD-Elemente zu vermeiden
const fixedHudWidth = 320;

// Variable für die Spielfelderweiterungsrichtung
let expansionDirection = 'top'; // Startet mit Erweiterung nach oben

// Zähler für gefressene Mäuse seit der letzten goldenen Maus
let miceEatenSinceLastGolden = 0;

// Maximale Anzahl der Mäuse festlegen
const MAX_MICE = 10;

// Tracking der Spielfeldposition relativ zum Viewport
let fieldOffsetX = 0;

// Variable für den Pausenzustand
let gamePaused = false;

// Funktion, um die maximale Spielfeldhöhe basierend auf der Fensterhöhe zu berechnen
function calculateMaxGameFieldHeight() {
    // Berechne die maximale Höhe, die verfügbar ist
    // 20px Puffer am unteren Rand um Scrollbalken zu vermeiden
    const maxAvailableHeight = window.innerHeight - offset - 20;
    
    // Da wir in 10er-Schritten arbeiten (Schlangensegmente sind 10x10), 
    // runden wir auf das nächste Vielfache von 10 ab
    return Math.floor(maxAvailableHeight / 10) * 10;
}

// Initialisierung mit verfügbarer Höhe
gameFieldHeight = Math.min(gameFieldHeight, calculateMaxGameFieldHeight());

// Canvas-Größe ist entweder die Spielfeldgröße oder die fixe HUD-Breite, je nachdem, was größer ist
canvas.width = Math.max(gameFieldWidth, fixedHudWidth);
canvas.height = gameFieldHeight + offset;

// Spielvariablen
let snake = [{ x: 0, y: gameFieldHeight - 10 }]; // Schlange startet ganz unten, ganz links
let direction = { x: 10, y: 0 };
let mice = []; // Array für alle Maus-Objekte
let initialMouseLife = 10; // Maximale Lebenszeit (Cooldown) einer Maus - startet bei 10 Sekunden
let gameOver = false;
let score = 0;
let gameStarted = false;
let gameInterval;
let nextGoldenMousePoints = 1; // Punktewert für die nächste Maus
let mouseCounter = 1; // Anzahl der angezeigten Mäuse (startet bei 1)
let mouseLifeInterval = null;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);

// Set für die eindeutigen Positionen der Schlange (zur Berechnung der tatsächlichen Größe)
let uniqueSnakePositions = new Set();

// Warteschlange für Richtungsänderungen
let directionQueue = [];

function playSound() {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator.connect(gainNode);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.05);
}

// Funktion zur Berechnung der tatsächlich eingenommenen Positionen der Schlange
function calculateUniqueSnakePositions() {
    uniqueSnakePositions.clear();
    snake.forEach(part => {
        uniqueSnakePositions.add(`${part.x},${part.y}`);
    });
    return uniqueSnakePositions.size;
}

function draw() {
    // Gesamtes Canvas löschen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // HUD-Bereich - immer in voller Breite des Canvas aber minimaler Höhe
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, offset);
    ctx.fillStyle = 'white';
    ctx.font = "11px Arial"; // Kleinere Schriftgröße für kompakteren HUD
    
    // Links: Schlangenlänge 
    ctx.textAlign = "center";
    ctx.fillText('Length: ' + snake.length, canvas.width / 6, offset - 4);
    
    // Mitte: Mauszeit
    let minLife = initialMouseLife;
    if (mice.length > 0) {
        minLife = Math.min(...mice.map(m => m.life));
    }
    ctx.fillText('Time: ' + minLife + 's', canvas.width / 2, offset - 4);
    
    // Rechts: Anzahl der Mäuse
    ctx.fillText('Mice: ' + mouseCounter, 5 * canvas.width / 6, offset - 4);

    // Zurücksetzen der Textausrichtung
    ctx.textAlign = "left";

    // Spielfeld - Position über fieldOffsetX gesteuert
    ctx.fillStyle = 'black';
    ctx.fillRect(fieldOffsetX, offset, gameFieldWidth, gameFieldHeight);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(fieldOffsetX, offset, gameFieldWidth, gameFieldHeight);

    // Schlange zeichnen - mit fieldOffsetX anstelle von berechnetem horizontalem Offset
    ctx.fillStyle = 'green';
    snake.forEach(part => {
        ctx.fillRect(part.x + fieldOffsetX, part.y + offset, 10, 10);
    });

    // Alle Mäuse zeichnen - mit fieldOffsetX anstelle von berechnetem horizontalem Offset
    mice.forEach(m => drawMouse(m, fieldOffsetX));
    
    // Wenn das Spiel pausiert ist, zeige eine Pausenmeldung an
    if (gamePaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Halbtransparenter schwarzer Hintergrund
        ctx.fillRect(fieldOffsetX, offset, gameFieldWidth, gameFieldHeight);
        
        ctx.fillStyle = 'white';
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PAUSED", fieldOffsetX + gameFieldWidth / 2, offset + gameFieldHeight / 2);
        ctx.font = "12px Arial";
        ctx.fillText("Press END or SPACE to resume", fieldOffsetX + gameFieldWidth / 2, offset + gameFieldHeight / 2 + 25);
        
        // Zurücksetzen der Textausrichtung
        ctx.textAlign = "left";
    }
}

function drawMouse(m, xOffset) {
    // Maus ist golden, wenn isGolden-Flag gesetzt ist
    ctx.fillStyle = m.isGolden ? 'gold' : 'white';
    ctx.fillRect(m.x + xOffset, m.y + offset, 10, 10);
    // Oberhalb der Maus als Balken die verbleibende Lebenszeit anzeigen
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
        mice.some(m => m.x === pos.x && m.y === pos.y)
    );
    return pos;
}

function createMouse() {
    const pos = generateMousePosition();
    // Prüfen, ob diese Maus golden sein soll (nach 4 gegessenen normalen Mäusen)
    const isGolden = miceEatenSinceLastGolden >= 4;
    
    // Wenn die Maus golden ist, resetten wir den Zähler
    if (isGolden) {
        miceEatenSinceLastGolden = 0;
    }
    
    // Begrenze den Punktewert auf maximal 10
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
        gameInterval = setInterval(gameLoop, 187);
        gameStarted = true;
        gamePaused = false;

        if (mouseLifeInterval === null) {
            mouseLifeInterval = setInterval(() => {
                // Wenn das Spiel pausiert ist, keine Maus-Updates
                if (gamePaused) return;
                
                const oldLength = mice.length;
                // Lebenszeit aller Mäuse reduzieren
                mice.forEach(m => m.life--);
                // Entferne abgelaufene Mäuse
                mice = mice.filter(m => m.life > 0);
                
                // Wenn mindestens eine Maus abgelaufen ist
                if (mice.length < oldLength) {
                    // Resette nextGoldenMousePoints auf 1
                    nextGoldenMousePoints = 1;
                    
                    // Bei 6 bis 10 Mäusen wird der Mäusezähler auf 5 zurückgesetzt
                    if (mouseCounter > 5) {
                        mouseCounter = 5;
                    }
                }
                
                // Stelle sicher, dass stets "mouseCounter" Mäuse vorhanden sind
                while (mice.length < mouseCounter) {
                    mice.push(createMouse());
                }
            }, 1000);
        }
    }
}

// Funktion zum Umschalten des Pausenstatus
function togglePause() {
    if (!gameStarted) return; // Wenn das Spiel noch nicht gestartet ist, nichts tun
    
    gamePaused = !gamePaused;
    
    // Wenn das Spiel nun fortgesetzt wird, aktualisiere das Canvas
    if (!gamePaused) {
        draw();
    }
}

function resetGame() {
    // Spielfeld zurücksetzen
    gameFieldWidth = 80;
    // Spielfeldhöhe an verfügbaren Platz anpassen
    gameFieldHeight = Math.min(80, calculateMaxGameFieldHeight());
    
    // Canvas-Größe aktualisieren
    canvas.width = Math.max(gameFieldWidth, fixedHudWidth);
    canvas.height = gameFieldHeight + offset;
    
    // Zentriere das Spielfeld am Anfang
    fieldOffsetX = Math.max(0, (canvas.width - gameFieldWidth) / 2);

    // Schlange startet immer ganz unten, ganz links
    snake = [{ x: 0, y: gameFieldHeight - 10 }];
    direction = { x: 10, y: 0 };

    // Globale Variablen zurücksetzen – wichtig: vor Erzeugen neuer Maus!
    mouseCounter = 1;            // Mauscounter zurücksetzen
    nextGoldenMousePoints = 1;   // Nächster Punktewert wieder 1
    initialMouseLife = 10;       // Zurücksetzen auf 10 Sekunden am Start
    score = 0;
    gameOver = false;
    gamePaused = false;
    directionQueue = [];
    uniqueSnakePositions.clear(); // Zurücksetzen des Sets
    expansionDirection = 'top';  // Erweiterungsrichtung zurücksetzen
    miceEatenSinceLastGolden = 0; // Zähler für goldene Mäuse zurücksetzen

    // Maus-Array zurücksetzen
    mice = [createMouse()];

    clearInterval(mouseLifeInterval);
    mouseLifeInterval = null;

    clearInterval(gameInterval);
    gameStarted = false;

    draw();
}

function gameLoop() {
    if (gameOver) {
        clearInterval(gameInterval);
        gameStarted = false;
        
        // Zeige den Alert an und entferne sämtliche Event-Listener
        alert("Game Over! Deine Punktzahl: " + score);
        
        // Starte sofort ein neues Spiel nach dem Bestätigen des Alerts
        resetGame();
        
        return;
    }
    
    // Wenn das Spiel pausiert ist, zeichne nur das Spielfeld neu mit Pause-Overlay
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
    
    // Kopfposition berechnen (ohne Offset-Anpassung)
    const head = { 
        x: snake[0].x + direction.x, 
        y: snake[0].y + direction.y 
    };

    if (head.x < 0 || head.x >= gameFieldWidth || head.y < 0 || head.y >= gameFieldHeight || collisionWithSelf(head)) {
        gameOver = true;
        return;
    }

    // Prüfe, ob der Schlangenkopf mit einer Maus kollidiert:
    const eatenIndex = mice.findIndex(m => head.x === m.x && head.y === m.y);
    if (eatenIndex >= 0) {
        const eatenMouse = mice.splice(eatenIndex, 1)[0];
        let points = eatenMouse.points;
        score += points;
        for (let i = 0; i < points - 1; i++) {
            snake.push({ ...snake[snake.length - 1] });
        }
        nextGoldenMousePoints++;

        // Falls die gefressene Maus golden war
        if (eatenMouse.isGolden) {
            // Erhöhe den Mauscounter aber begrenzt auf MAX_MICE
            mouseCounter = Math.min(mouseCounter + 1, MAX_MICE);
            // Erhöhe die Lebenszeit der Mäuse um 1 Sekunde
            initialMouseLife++;
        } else {
            // Wenn eine normale Maus gegessen wurde, zählen wir hoch für die goldene Maus-Logik
            miceEatenSinceLastGolden++;
        }

        // Setze den Cooldown (die Lebenszeit) aller verbleibenden Mäuse zurück
        mice.forEach(m => m.life = initialMouseLife);

        // Stelle sicher, dass stets "mouseCounter" Mäuse vorhanden sind
        while (mice.length < mouseCounter) {
            mice.push(createMouse());
        }
        playSound();
    } else {
        snake.pop();
    }

    snake.unshift(head);

    // Berechne die Anzahl der tatsächlich belegten Positionen
    const uniqueSnakeCells = calculateUniqueSnakePositions();
    
    // Spielfeld vergrößern, wenn die Schlange einen bestimmten Prozentsatz des Spielfelds einnimmt
    const totalCells = (gameFieldWidth / 10) * (gameFieldHeight / 10);
    
    // Der Schwellenwert für die Spielfeldvergrößerung hängt vom Score ab
    let thresholdPercentage = 0.25; // Standardmäßig 25% zu Beginn des Spiels
    
    if (score >= 1000) {
        thresholdPercentage = 0.75; // 75% ab 1000 Punkten
    } else if (score >= 500) {
        thresholdPercentage = 0.5;  // 50% ab 500 Punkten
    }
    
    if (uniqueSnakeCells >= totalCells * thresholdPercentage) {
        // Spielfeld gemäß der aktuellen Richtung erweitern
        // Je nach Richtung müssen wir die Feldposition und Schlangenposition anpassen
        expandGameField();
        
        // Drehe die Erweiterungsrichtung im Uhrzeigersinn
        rotateExpansionDirection();
        
        // Begrenzungen prüfen
        if (gameFieldWidth > window.innerWidth - 20) { // 20px Puffer für horizontalen Scrollbar
            gameFieldWidth = window.innerWidth - 20;
        }
        
        // Überprüfe, ob die neue Spielfeldhöhe in den verfügbaren Platz passt
        const maxHeight = calculateMaxGameFieldHeight();
        if (gameFieldHeight > maxHeight) {
            gameFieldHeight = maxHeight;
        }
        
        // Canvas-Größe aktualisieren - mindestens so breit wie das fixe HUD
        canvas.width = Math.max(gameFieldWidth, fixedHudWidth);
        canvas.height = gameFieldHeight + offset;
    }
}

// Neue Funktion zum Erweitern des Spielfelds je nach Richtung
function expandGameField() {
    const oldWidth = gameFieldWidth;
    const oldHeight = gameFieldHeight;
    
    switch (expansionDirection) {
        case 'top':
            // Wenn nach oben erweitert wird, bleibt die horizontale Position gleich
            gameFieldHeight += 10;
            // Verschiebe alle Objekte nach unten, da oben Platz dazukommt
            snake.forEach(part => part.y += 10);
            mice.forEach(m => m.y += 10);
            break;
            
        case 'right':
            // Wenn nach rechts erweitert wird, bleibt die vertikale Position gleich
            gameFieldWidth += 10;
            // Keine Anpassung der Positionen nötig
            break;
            
        case 'bottom':
            // Wenn nach unten erweitert wird, bleibt die horizontale Position gleich
            gameFieldHeight += 10;
            // Keine Anpassung der Positionen nötig
            break;
            
        case 'left':
            // Wenn nach links erweitert wird, müssen alle Objekte nach rechts verschoben werden
            gameFieldWidth += 10;
            // Verschiebe alle Objekte nach rechts, da links Platz dazukommt
            snake.forEach(part => part.x += 10);
            mice.forEach(m => m.x += 10);
            // Verschiebe auch das Spielfeld, um die visuelle Position beizubehalten
            fieldOffsetX -= 10;
            break;
    }
    
    // Stellen wir sicher, dass das Feld nicht aus dem Canvas fällt
    if (fieldOffsetX < 0) {
        fieldOffsetX = 0;
    } else if (fieldOffsetX + gameFieldWidth > canvas.width) {
        fieldOffsetX = Math.max(0, canvas.width - gameFieldWidth);
    }
}

// Funktion zum Rotieren der Erweiterungsrichtung im Uhrzeigersinn
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
        37: { x: -10, y: 0 },  // Links
        38: { x: 0, y: -10 },   // Oben
        39: { x: 10, y: 0 },    // Rechts
        40: { x: 0, y: 10 }     // Unten
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

// Event-Listener für Fenstergröße
window.addEventListener('resize', () => {
    // Spielfeldhöhe an neuen verfügbaren Platz anpassen
    const maxHeight = calculateMaxGameFieldHeight();
    if (gameFieldHeight > maxHeight) {
        gameFieldHeight = maxHeight;
        canvas.height = gameFieldHeight + offset;
    }
    draw();
});

window.addEventListener('keydown', (event) => {
    // Tastencodes: 37=Links, 38=Oben, 39=Rechts, 40=Unten, 35=Ende, 32=Space
    
    // Wenn die Ende-Taste oder Leertaste gedrückt wird, Spiel pausieren/fortsetzen
    if (event.keyCode === 35 || event.keyCode === 32) { // Ende-Taste oder Leertaste
        event.preventDefault();
        togglePause();
        return;
    }
    
    // Wenn das Spiel pausiert ist, keine anderen Tasten außer Ende und Space erlauben
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

// Initiale Zentrierung des Spielfelds
fieldOffsetX = Math.max(0, (canvas.width - gameFieldWidth) / 2);

// Initiales Zeichnen
draw();
