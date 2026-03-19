// ---------- App Logik ----------

// Globale Variablen
let cards = [];
let currentLang = 'de'; // Default: Deutsch
let voices = {}; // Speichert Stimmen pro Sprache

// TTS-Funktion (unverändert, aber primeTTS unten angepasst)
function speak(text, lang = currentLang) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  if (voices[lang]) {
    utterance.voice = voices[lang][0]; // Erste verfügbare Stimme
  }
  utterance.volume = 0.8;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

// Stimmen laden (unverändert)
function loadVoices() {
  speechSynthesis.onvoiceschanged = () => {
    voices = { de: [], zh: [] }; // Reset
    const allVoices = speechSynthesis.getVoices();
    allVoices.forEach(voice => {
      if (voice.lang.startsWith('de')) voices.de.push(voice);
      if (voice.lang.startsWith('zh')) voices.zh.push(voice);
    });
    // Debug: Console.log nur, falls nötig
    console.log('TTS Voices loaded:', voices);
  };
  // Initial load triggern
  speechSynthesis.getVoices();
}

// Prime-TTS beim Start (GEÄNDERT: Neue Testtexte, leise)
function primeTTS(lang) {
  const testTexts = {
    de: 'Hallo, willkommen',
    zh: 'Ni hao, huanying'
  };
  const utterance = new SpeechSynthesisUtterance(testTexts[lang]);
  utterance.lang = lang;
  if (voices[lang]) utterance.voice = voices[lang][0];
  utterance.volume = 0.3; // Leise für Test
  utterance.rate = 0.8;
  speechSynthesis.speak(utterance);
}

// CSV laden und parsen (unverändert)
async function loadCSV() {
  const response = await fetch('./data/Long-Chinesisch_Lektionen.csv');
  if (!response.ok) throw new Error('CSV nicht gefunden');
  return await response.text();
}

function parseCSV(text) {
  const lines = text.split('\n');
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const rows = lines.map(line => line.split(delimiter).map(cell => cell.trim()));
  return { rows, delimiter };
}

function toCards(rows) {
  return rows.slice(1).map(row => ({
    lesson: row[0],
    pinyin: row[1],
    german: row[2],
    chinese: row[3]
  })).filter(card => card.pinyin && card.german); // Ungültige filtern
}

// Filter bauen (unverändert)
function buildLessonFilters(cards) {
  const lessons = [...new Set(cards.map(c => c.lesson))].sort();
  const select = document.getElementById('lessonSelect');
  lessons.forEach(lesson => {
    const option = document.createElement('option');
    option.value = lesson;
    option.textContent = lesson;
    select.appendChild(option);
  });
}

// Render Cards (unverändert, mit TTS-Button)
function render(cards) {
  const container = document.getElementById('cards');
  container.innerHTML = '';
  cards.forEach((card, index) => {
    const cardEl = document.getElementById('card-template').cloneNode(true);
    cardEl.id = `card-${index}`;
    cardEl.style.display = 'block';
    cardEl.querySelector('.pinyin').textContent = card.pinyin;
    cardEl.querySelector('.german').textContent = card.german;
    cardEl.querySelector('.chinese').textContent = card.chinese;
    
    // TTS-Button
    const ttsBtn = cardEl.querySelector('.tts-btn');
    ttsBtn.addEventListener('click', () => {
      speak(card.chinese, 'zh'); // Chinesisch priorisieren
    });
    
    container.appendChild(cardEl);
  });
}

// Events (unverändert)
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const voiceSelect = document.getElementById('voiceSelect');
  const lessonSelect = document.getElementById('lessonSelect');

  // Stimme ändern
  voiceSelect.addEventListener('change', (e) => {
    currentLang = e.target.value;
    updateLanguageDisplay();
    // Test-TTS nach Wechsel (optional)
    speak('Test', currentLang);
  });

  // Suche
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = cards.filter(card =>
      card.pinyin.toLowerCase().includes(query) ||
      card.german.toLowerCase().includes(query)
    );
    render(filtered);
  });

  // Lektion-Filter
  lessonSelect.addEventListener('change', (e) => {
    const lesson = e.target.value;
    const filtered = lesson === 'all' ? cards : cards.filter(c => c.lesson === lesson);
    render(filtered);
  });

  // Study-Modus (Beispiel, erweiterbar)
  document.getElementById('study-btn').addEventListener('click', () => {
    // Einfacher Random-Study
    const randomCard = cards[Math.floor(Math.random() * cards.length)];
    document.getElementById('study-mode').style.display = 'block';
    document.getElementById('study-cards').innerHTML = `
      <div class="card">
        <h3>${randomCard.pinyin}</h3>
        <p>${randomCard.german}</p>
        <button onclick="speak('${randomCard.chinese}', 'zh')">Hören</button>
      </div>
    `;
  });
});

// Language Display updaten (unverändert, Flags hinzufügen)
function updateLanguageDisplay() {
  const voiceSelect = document.getElementById('voiceSelect');
  voiceSelect.value = currentLang;
  // Flag-Emojis (optional)
  const flag = currentLang === 'de' ? '🇩🇪' : '🇨🇳';
  voiceSelect.parentElement.querySelector('.control-label').textContent += ` ${flag}`;
}

// ---------- App Start ----------
(async function(){
  // PWA: Service Worker registrieren (unverändert)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      console.log('SW registered:', registration.scope);
    } catch (err) {
      console.log('SW registration failed:', err);
    }
  }

  // TTS Stimmen laden
  loadVoices();

  try {
    const t0 = performance.now();
    const text = await loadCSV();
    const { rows, delimiter } = parseCSV(text);
    cards = toCards(rows);
    const t1 = performance.now();

    // GEÄNDERT: Meta-Update nur in Console (da HTML kommentiert)
    console.log(`CSV geladen • Delimiter: "${delimiter==='\t'?'TAB':delimiter}" • Karten: ${cards.length} • ${Math.round(t1 - t0)} ms • PWA: Offline-fähig`);

    buildLessonFilters(cards);
    render(cards);

    // Initialisiere Language Display
    updateLanguageDisplay();

    // Priming TTS beim Start (GEÄNDERT: Neue Testtexte)
    const initialLang = 'zh'; // Default
    primeTTS(initialLang);

  } catch (err) {
    console.error('Fehler beim Laden:', err);
    document.getElementById('cards').innerHTML = '<p>Fehler: CSV konnte nicht geladen werden. Überprüfe Internet oder Datei.</p>';
  }
})();