// Globale Variablen
let lektionen = []; // Array von {name: '', flashcards: []}
let selectedLessons = []; // Ausgewählte Lektionen-IDs
let currentSession = []; // Aktuelle Karten-Array (randomisiert)
let currentCardIndex = 0;
let mode = 'DE'; // 'DE' oder 'ZH'
let pauseTime = 2; // Sekunden
let maxKarten = 50;
let trainingsZeit = 10; // Minuten
let timerInterval;
let sessionTimer;
let isFlipped = false;
let errorModal = document.getElementById('error-modal');
let errorMessage = document.getElementById('error-message');

// Initialisierung
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    setupEventListeners();
    loadExcel();
    switchTab('lektionen'); // Starte mit Lektionen-Tab
});

// Event Listeners
function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });

    // Sliders
    document.getElementById('pause-slider').addEventListener('input', (e) => {
        pauseTime = e.target.value;
        document.getElementById('pause-value').textContent = pauseTime;
        saveSettings();
    });
    document.getElementById('karten-slider').addEventListener('input', (e) => {
        maxKarten = parseInt(e.target.value);
        document.getElementById('karten-value').textContent = maxKarten === 50 ? 'Alle' : maxKarten;
        saveSettings();
    });
    document.getElementById('zeit-slider').addEventListener('input', (e) => {
        trainingsZeit = parseInt(e.target.value);
        document.getElementById('zeit-value').textContent = trainingsZeit;
        saveSettings();
    });

    // Modus-Buttons
    document.getElementById('de-btn').addEventListener('click', () => switchMode('DE'));
    document.getElementById('zh-btn').addEventListener('click', () => switchMode('ZH'));

    // Session-Start
    document.getElementById('start-session').addEventListener('click', startSession);

    // Karte-Navigation
    document.getElementById('next-btn').addEventListener('click', nextCard);
    document.getElementById('skip-btn').addEventListener('click', skipCard);
    document.getElementById('pause-btn').addEventListener('click', pauseSession);

    // Error-Modal
    document.getElementById('close-error').addEventListener('click', () => {
        errorModal.classList.add('hidden');
    });

    // Karte-Flip (Auto und manuell)
    const karte = document.getElementById('karte');
    karte.addEventListener('click', flipCard);
}

// Excel laden und parsen
function loadExcel() {
    const url = './lektionen.xlsx';
    fetch(url)
        .then(response => response.arrayBuffer())
        .then(data => {
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets['Sheet1'];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            parseLektionen(rows);
            renderLektionenList();
        })
        .catch(err => {
            showError('Excel-Datei konnte nicht geladen werden. Stelle sicher, dass "lektionen.xlsx" im Repo liegt.');
            console.error(err);
        });
}

function parseLektionen(rows) {
    lektionen = [];
    let currentLektion = null;

    rows.forEach((row, index) => {
        if (!row || row.length === 0) return;

        const markerCell = row[0] ? row[0].toString().trim() : '';
        if (markerCell.startsWith('*')) {
            // Neue Lektion
            if (currentLektion) lektionen.push(currentLektion);
            const name = markerCell.substring(1).trim();
            currentLektion = { name, flashcards: [] };
        } else if (currentLektion && row.length >= 7) {
            // Karte hinzufügen (Spalten 0-6: A-G)
            currentLektion.flashcards.push({
                deutschWort: row[0] || '',
                pinyinWort: row[1] || '',
                wortart: row[2] || '',
                satzPinyin: row[3] || '',
                satzDeutsch: row[4] || '',
                hansiWort: row[5] || '',
                hansiSatz: row[6] || ''
            });
        }
    });
    if (currentLektion) lektionen.push(currentLektion);

    if (lektionen.length === 0) {
        lektionen = [{ name: 'Standard-Lektion', flashcards: [] }];
    }
}

// Lektionen-Liste rendern
function renderLektionenList() {
    const list = document.getElementById('lektionen-list');
    list.innerHTML = '';
    lektionen.forEach((lekt, index) => {
        const div = document.createElement('div');
        div.className = 'lektionen-item';
        div.innerHTML = `
            <input type="checkbox" id="lekt-${index}" data-index="${index}">
            <label for="lekt-${index}">${lekt.name} (${lekt.flashcards.length} Karten)</label>
        `;
        list.appendChild(div);
        div.querySelector('input').addEventListener('change', updateSelection);
    });
    updateKartenAnzahl();
}

function updateSelection(e) {
    const index = parseInt(e.target.dataset.index);
    if (e.target.checked) {
        selectedLessons.push(index);
    } else {
        selectedLessons = selectedLessons.filter(i => i !== index);
    }
    updateKartenAnzahl();
}

function updateKartenAnzahl() {
    let total = 0;
    selectedLessons.forEach(idx => {
        total += lektionen[idx].flashcards.length;
    });
    document.getElementById('karten-anzahl').textContent = `Ausgewählte Karten: ${total}`;
}

// Session starten
function startSession() {
    if (selectedLessons.length === 0) {
        showError('Bitte wähle mindestens eine Lektion aus.');
        return;
    }

    // Sammle Karten
    currentSession = [];
    selectedLessons.forEach(idx => {
        currentSession = currentSession.concat(lektionen[idx].flashcards);
    });

    // Randomisieren und begrenzen
    currentSession = shuffle(currentSession).slice(0, maxKarten);
    if (currentSession.length === 0) {
        showError('Keine Karten verfügbar.');
        return;
    }

    currentCardIndex = 0;
    switchTab('einfuehrung'); // Oder verstecke Tabs
    document.querySelector('.main-container').classList.add('hidden');
    document.getElementById('karte-container').classList.remove('hidden');
    startTimer();
    showCard();
}

// Karte anzeigen
function showCard() {
    if (currentCardIndex >= currentSession.length) {
        endSession();
        return;
    }

    const card = currentSession[currentCardIndex];
    isFlipped = false;
    document.getElementById('karte').classList.remove('flipped');

    if (mode === 'DE') {
        document.getElementById('front-title').textContent = card.deutschWort || card.satzDeutsch;
        document.getElementById('front-subtitle').textContent = card.wortart;
        document.getElementById('back-title').textContent = card.pinyinWort || card.satzPinyin;
        document.getElementById('back-subtitle').textContent = card.hansiWort || card.hansiSatz;
    } else {
        document.getElementById('front-title').textContent = card.hansiWort || card.hansiSatz;
        document.getElementById('front-subtitle').textContent = card.wortart;
        document.getElementById('back-title').textContent = card.pinyinWort || card.satzPinyin;
        document.getElementById('back-subtitle').textContent = card.deutschWort || card.satzDeutsch;
    }

    document.getElementById('karten-status').textContent = `Karte ${currentCardIndex + 1}/${currentSession.length}`;
    flipAfterPause();
}

// Flip nach Pause
function flipAfterPause() {
    setTimeout(() => {
        if (!isPaused && currentCardIndex < currentSession.length) {
            flipCard();
        }
    }, pauseTime * 1000);
}

function flipCard() {
    const karte = document.getElementById('karte');
    karte.classList.toggle('flipped');
    isFlipped = !isFlipped;
    if (isFlipped) {
        nextAfterFlip();
    }
}

function nextAfterFlip() {
    setTimeout(() => {
        if (!isPaused) nextCard();
    }, 1000); // Kurze Pause nach Flip
}

function nextCard() {
    currentCardIndex++;
    showCard();
}

function skipCard() {
    currentCardIndex++;
    showCard();
}

let isPaused = false;
function pauseSession() {
    isPaused = !isPaused;
    if (isPaused) {
        clearInterval(timerInterval);
        document.getElementById('pause-btn').textContent = 'Fortsetzen';
    } else {
        startTimer();
        document.getElementById('pause-btn').textContent = 'X';
    }
}

// Timer für Trainingszeit
function startTimer() {
    let timeLeft = trainingsZeit * 60;
    const bar = document.getElementById('timer-bar');
    timerInterval = setInterval(() => {
        timeLeft--;
        const progress = (1 - timeLeft / (trainingsZeit * 60)) * 100;
        bar.style.width = progress + '%';
        bar.style.backgroundColor = progress > 50 ? '#ffc107' : '#dc3545';
        if (timeLeft <= 0) {
            endSession();
        }
    }, 1000);
}

function endSession() {
    clearInterval(timerInterval);
    showError('Session beendet! Du hast ' + currentSession.length + ' Karten trainiert.');
    resetToLektionen();
}

function resetToLektionen() {
    document.querySelector('.main-container').classList.remove('hidden');
    document.getElementById('karte-container').classList.add('hidden');
    currentSession = [];
    currentCardIndex = 0;
    switchTab('lektionen');
}

// Hilfsfunktionen
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

function switchMode(newMode) {
    mode = newMode;
    document.getElementById('de-btn').classList.toggle('active', mode === 'DE');
    document.getElementById('zh-btn').classList.toggle('active', mode === 'ZH');
    if (currentSession.length > 0) {
        showCard(); // Neu anzeigen
    }
    saveSettings();
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function saveSettings() {
    localStorage.setItem('flashcards-settings', JSON.stringify({
        mode, pauseTime, maxKarten, trainingsZeit
    }));
}

function loadSettings() {
    const saved = localStorage.getItem('flashcards-settings');
    if (saved) {
        const settings = JSON.parse(saved);
        mode = settings.mode || 'DE';
        pauseTime = settings.pauseTime || 2;
        maxKarten = settings.maxKarten || 50;
        trainingsZeit = settings.trainingsZeit || 10;
        document.getElementById('pause-slider').value = pauseTime;
        document.getElementById('karten-slider').value = maxKarten;
        document.getElementById('zeit-slider').value = trainingsZeit;
        document.getElementById('pause-value').textContent = pauseTime;
        document.getElementById('karten-value').textContent = maxKarten === 50 ? 'Alle' : maxKarten;
        document.getElementById('zeit-value').textContent = trainingsZeit;
        switchMode(mode);
    }
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorModal.classList.remove('hidden');
}