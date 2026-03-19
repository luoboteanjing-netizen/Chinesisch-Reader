// ---------- App Logik ----------

// Globale Variablen
let cards = [];
let currentLang = 'de'; // Default: Deutsch
let voices = {}; // Speichert Stimmen pro Sprache

// TTS-Funktion
function speak(text, lang = currentLang) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  if (voices[lang] && voices[lang].length > 0) {
    utterance.voice = voices[lang][0]; // Erste verfügbare Stimme
  }
  utterance.volume = 0.8;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

// Stimmen laden
function loadVoices() {
  const onVoicesChanged = () => {
    voices = { de: [], zh: [] }; // Reset
    const allVoices = speechSynthesis.getVoices();
    allVoices.forEach(voice => {
      if (voice.lang.startsWith('de')) voices.de.push(voice);
      if (voice.lang.startsWith('zh-CN') || voice.lang.startsWith('zh')) voices.zh.push(voice);
    });
    console.log('TTS Voices loaded:', Object.keys(voices).map(lang => `${lang}: ${voices[lang].length}`));
  };
  
  speechSynthesis.onvoiceschanged = onVoicesChanged;
  // Initial load triggern (manchmal verzögert)
  setTimeout(() => speechSynthesis.getVoices(), 100);
}

// Prime-TTS beim Start (mit gewünschten Testtexten, leise)
function primeTTS(lang) {
  const testTexts = {
    de: 'Hallo, willkommen',
    zh: 'Ni hao, huanying'
  };
  if (!testTexts[lang]) return;
  
  const utterance = new SpeechSynthesisUtterance(testTexts[lang]);
  utterance.lang = lang;
  if (voices[lang] && voices[lang].length > 0) {
    utterance.voice = voices[lang][0];
  }
  utterance.volume = 0.3; // Leise für Test
  utterance.rate = 0.8;
  speechSynthesis.speak(utterance);
}

// CSV laden
async function loadCSV() {
  // FIX: Pfad anpassen, falls CSV in data/ ist
  const response = await fetch('./data/Long-Chinesisch_Lektionen.csv');
  if (!response.ok) {
    // Fallback: Versuche Root-Pfad (falls umgezogen)
    const fallback = await fetch('./Long-Chinesisch_Lektionen.csv');
    if (fallback.ok) return await fallback.text();
    throw new Error('CSV nicht gefunden (überprüfe Pfad: data/ oder root)');
  }
  return await response.text();
}

// CSV parsen
function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim());
  // Delimiter auto-detect (Komma oder TAB, aus deinem Log: ",")
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const rows = lines.map(line => 
    line.split(delimiter).map(cell => cell.trim().replace(/"/g, '')) // Quotes entfernen
  );
  return { rows, delimiter };
}

// Zu Karten konvertieren
function toCards(rows) {
  return rows.slice(1) // Header skip
    .map(row => ({
      lesson: row[0] || 'Unbekannt',
      pinyin: row[1] || '',
      german: row[2] || '',
      chinese: row[3] || ''
    }))
    .filter(card => card.pinyin && card.german && card.chinese) // Nur vollständige Karten
    .sort((a, b) => a.lesson.localeCompare(b.lesson)); // Sortiert
}

// Lektion-Filter bauen
function buildLessonFilters(cards) {
  const lessons = [...new Set(cards.map(c => c.lesson))].sort();
  const select = document.getElementById('lessonSelect');
  if (!select) return console.error('lessonSelect nicht gefunden');
  
  select.innerHTML = '<option value="all">Alle Lektionen</option>';
  lessons.forEach(lesson => {
    const option = document.createElement('option');
    option.value = lesson;
    option.textContent = lesson;
    select.appendChild(option);
  });
}

// Render Cards (FIX: Mit Checks gegen null/undefined)
function render(cardsToShow) {
  const container = document.getElementById('cards');
  if (!container) {
    console.error('Cards-Container (#cards) nicht gefunden!');
    return;
  }
  
  const template = document.getElementById('card-template');
  if (!template) {
    console.error('Template (#card-template) fehlt im HTML!');
    container.innerHTML = '<p style="text-align: center; color: red;">Fehler: Karte-Template nicht geladen. Überprüfe index.html.</p>';
    return;
  }
  
  container.innerHTML = ''; // Alte Karten löschen (Template bleibt, da nicht geklont)
  
  if (cardsToShow.length === 0) {
    container.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Keine Karten gefunden. Versuche eine andere Suche oder Lektion.</p>';
    return;
  }
  
  cardsToShow.forEach((card, index) => {
    const cardEl = template.cloneNode(true);
    cardEl.id = `card-${index}`;
    cardEl.style.display = 'block'; // Sichtbar machen
    
    // Inhalte setzen
    cardEl.querySelector('.pinyin').textContent = card.pinyin;
    cardEl.querySelector('.german').textContent = card.german;
    cardEl.querySelector('.chinese').textContent = card.chinese;
    
    // TTS-Button
    const ttsBtn = cardEl.querySelector('.tts-btn');
    ttsBtn.addEventListener('click', () => speak(card.chinese, 'zh')); // Chinesisch für Chinese
    
    container.appendChild(cardEl);
  });
  
  console.log(`Gerendert: ${cardsToShow.length} Karten`);
}

// Events (nach DOM-Ready)
function setupEvents() {
  const searchInput = document.getElementById('searchInput');
  const voiceSelect = document.getElementById('voiceSelect');
  const lessonSelect = document.getElementById('lessonSelect');
  const studyBtn = document.getElementById('study-btn');

  if (!searchInput || !voiceSelect || !lessonSelect || !studyBtn) {
    console.error('Ein oder mehrere Elements nicht gefunden (IDs prüfen)');
    return;
  }

  // Stimme ändern
  voiceSelect.addEventListener('change', (e) => {
    currentLang = e.target.value;
    // Flag-Emoji hinzufügen (optional, visuell)
    const label = voiceSelect.parentElement.querySelector('.control-label');
    if (label) {
      label.innerHTML = `Stimme ändern: ${currentLang === 'de' ? '🇩🇪' : '🇨🇳'}`;
    }
    speak('Test', currentLang); // Kurzer Test
    primeTTS(currentLang); // Vollständiger Test
  });

  // Suche (Töne ignoriert implizit, da toLowerCase)
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

  // Study-Modus (einfach random)
  studyBtn.addEventListener('click', () => {
    if (cards.length === 0) return;
    const randomCard = cards[Math.floor(Math.random() * cards.length)];
    const studySection = document.getElementById('study-mode');
    const studyContainer = document.getElementById('study-cards');
    studySection.style.display = 'block';
    studyContainer.innerHTML = `
      <div class="card">
        <div class="card-front">
          <h3 class="pinyin">${randomCard.pinyin}</h3>
          <p class="german">${randomCard.german}</p>
        </div>
        <div class="card-back" style="display: block;">
          <h3 class="chinese">${randomCard.chinese}</h3>
          <button class="tts-btn" onclick="speak('${randomCard.chinese}', 'zh')">Hören</button>
        </div>
      </div>
    `;
  });
}

// ---------- App Start ----------
(async function() {
  // PWA: Service Worker registrieren
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      console.log('SW registered:', registration.scope);
    } catch (err) {
      console.log('SW registration failed:', err);
    }
  }

  // TTS initialisieren
  loadVoices();

  try {
    const t0 = performance.now();
    const csvText = await loadCSV();
    const { rows, delimiter } = parseCSV(csvText);
    cards = toCards(rows);
    const t1 = performance.now();

    // Debug in Console (da HTML kommentiert)
    console.log(`CSV geladen • Delimiter: "${delimiter}" • Karten: ${cards.length} • ${Math.round(t1 - t0)} ms • PWA: Offline-fähig`);

    if (cards.length === 0) {
      throw new Error('Keine gültigen Karten in CSV gefunden');
    }

    // UI aufbauen
    buildLessonFilters(cards);
    render(cards); // Initial alle zeigen

    // Events nach DOM-Ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupEvents);
    } else {
      setupEvents();
    }

    // Initial TTS-Test (Chinesisch default)
    setTimeout(() => primeTTS('zh'), 500); // Nach Stimmen-Load

  } catch (err) {
    console.error('Fehler beim Laden:', err);
    const cardsSection = document.getElementById('cards');
    if (cardsSection) {
      cardsSection.innerHTML = `<p style="text-align: center; color: red;">Fehler: ${err.message}<br>Überprüfe die CSV-Datei oder Internet-Verbindung (Offline: SW-Cache prüfen).</p>`;
    }
  }
})();