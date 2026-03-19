// --- Konfiguration ---
const CSV_PATH = './data/Long-Chinesisch_Lektionen.csv';

// Globale Variablen für TTS
let voices = []; // Geladene Stimmen

// ---------- Hilfsfunktionen ----------
function detectDelimiter(sample){
  const first = (sample.split(/\r?\n/)[0] || '');
  const countSplit = (line, delim) => (line.length ? line.split(delim).length - 1 : 0);
  const candidates = [
    { d: ',', n: countSplit(first, ',') },
    { d: ';', n: countSplit(first, ';') },
    { d: '\t', n: countSplit(first, '\t') },
    { d: '|', n: countSplit(first, '|') }
  ];
  candidates.sort((a,b)=>b.n-a.n);
  return (candidates[0].n>0 ? candidates[0].d : ';');
}

function parseCSV(text){
  const delimiter = detectDelimiter(text);
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const rows = [];
  for (let li=0; li<lines.length; li++){
    let line = lines[li];
    if (!line.trim()) { rows.push([]); continue; }
    const out = [];
    let cur = '';
    let i = 0;
    let inQuotes = false;
    while (i < line.length){
      const ch = line[i];
      if (inQuotes){
        if (ch === '"'){
          if (i+1 < line.length && line[i+1] === '"'){ cur += '"'; i += 2; continue; }
          else { inQuotes = false; i++; continue; }
        } else { cur += ch; i++; continue; }
      } else {
        if (ch === '"'){ inQuotes = true; i++; continue; }
        const isDelim = (delimiter === '\t' ? ch === '\t' : ch === delimiter);
        if (isDelim){ out.push(cur); cur=''; i++; continue; }
        cur += ch; i++;
      }
    }
    out.push(cur);
    rows.push(out);
  }
  return { rows, delimiter };
}

async function loadCSV(){
  const res = await fetch(CSV_PATH);
  if (!res.ok) throw new Error('CSV nicht gefunden: ' + CSV_PATH);
  const text = await res.text();
  return text;
}

function isHeaderRow(cells){
  const h = cells.join(' ').toLowerCase();
  return /(deutsch|pinyin|wortart|hanzi|satz|id)/.test(h);
}

function stripToneMarks(s){
  if (!s) return s;
  try {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch { return s; }
}

function highlightToneInsensitive(originalText, query){
  if (!query) return originalText;
  const qNorm = stripToneMarks(query).toLowerCase();
  const o = String(originalText);
  let norm = ''; const map = [];
  for (let i=0; i<o.length; i++){
    const ch = o[i];
    const stripped = stripToneMarks(ch);
    if (!stripped) continue;
    for (let k=0; k<stripped.length; k++){ norm += stripped[k]; map.push(i); }
  }
  const idx = norm.toLowerCase().indexOf(qNorm);
  if (idx < 0) return originalText;
  const endIdx = idx + qNorm.length - 1;
  const startOrig = map[idx];
  const endOrig = map[endIdx] + 1;
  return (
    o.slice(0, startOrig) +
    '<mark>' + o.slice(startOrig, endOrig) + '</mark>' +
    o.slice(endOrig)
  );
}

// ---------- TTS-Funktionen ----------
function loadVoices() {
  if ('speechSynthesis' in window) {
    voices = speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => {
      voices = speechSynthesis.getVoices();
      // Aktualisiere Modal, falls offen
      const modal = document.getElementById('ttsModal');
      if (modal.style.display !== 'none') {
        updateTTSModal(document.getElementById('side').value);
      }
    };
  }
}

function getVoicesForLang(lang) {
  const langCode = lang === 'zh' ? 'zh-CN' : 'de-DE';
  return voices.filter(voice => voice.lang.startsWith(lang === 'zh' ? 'zh' : 'de'));
}

function getTTSSettings(lang) {
  const voiceKey = `tts_voice_${lang}`;
  const pitchKey = `tts_pitch_${lang}`;
  const rateKey = `tts_rate_${lang}`;
  return {
    voiceName: localStorage.getItem(voiceKey) || null,
    pitch: parseFloat(localStorage.getItem(pitchKey)) || 1.0,
    rate: parseFloat(localStorage.getItem(rateKey)) || (lang === 'zh' ? 0.8 : 0.8)
  };
}

function saveTTSSettings(lang) {
  const voiceSelect = document.getElementById('voiceSelect');
  const pitchSlider = document.getElementById('pitchSlider');
  const rateSlider = document.getElementById('rateSlider');
  const voiceKey = `tts_voice_${lang}`;
  const pitchKey = `tts_pitch_${lang}`;
  const rateKey = `tts_rate_${lang}`;
  localStorage.setItem(voiceKey, voiceSelect.value || '');
  localStorage.setItem(pitchKey, pitchSlider.value);
  localStorage.setItem(rateKey, rateSlider.value);
}

function updateTTSModal(lang) {
  const select = document.getElementById('voiceSelect');
  const voicesForLang = getVoicesForLang(lang);
  select.innerHTML = '';
  if (voicesForLang.length === 0) {
    select.innerHTML = '<option value="">Keine Stimmen verfügbar (lade Seite neu)</option>';
    return;
  }
  voicesForLang.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    select.appendChild(option);
  });
  // Setze gespeicherte Voice
  const settings = getTTSSettings(lang);
  select.value = settings.voiceName || voicesForLang[0].name; // Default: Erste Stimme
  document.getElementById('pitchSlider').value = settings.pitch;
  document.getElementById('pitchValue').textContent = settings.pitch;
  document.getElementById('rateSlider').value = settings.rate;
  document.getElementById('rateValue').textContent = settings.rate;
}

function showTTSSettings() {
  const lang = document.getElementById('side').value;
  loadVoices(); // Sicherstellen, dass Stimmen geladen sind
  updateTTSModal(lang);
  document.getElementById('ttsModal').style.display = 'flex';
}

function testVoice() {
  if (!('speechSynthesis' in window)) return;
  const lang = document.getElementById('side').value;
  const testText = lang === 'zh' ? 'Nǐ hǎo' : 'Hallo';
  speechSynthesis.cancel(); // Alte Speech stoppen
  const utterance = new SpeechSynthesisUtterance(testText);
  utterance.lang = lang === 'zh' ? 'zh-CN' : 'de-DE';
  const voicesForLang = getVoicesForLang(lang);
  const voiceSelect = document.getElementById('voiceSelect');
  const pitchSlider = document.getElementById('pitchSlider');
  const rateSlider = document.getElementById('rateSlider');
  if (voiceSelect.value && voicesForLang.length > 0) {
    const selectedVoice = voicesForLang.find(voice => voice.name === voiceSelect.value);
    if (selectedVoice) utterance.voice = selectedVoice;
  }
  utterance.pitch = parseFloat(pitchSlider.value);
  utterance.rate = parseFloat(rateSlider.value);
  utterance.volume = 0.5; // Mittelstark für Test
  speechSynthesis.speak(utterance);
  // console.log('Testing voice with:', testText, 'pitch:', utterance.pitch, 'rate:', utterance.rate); // Debug
}

function speak(text, lang, volume = 1.0) {
  if (!text || !('speechSynthesis' in window)) return; // Fallback, wenn API nicht verfügbar
  // Vorherige Sprachsynthese stoppen
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'zh' ? 'zh-CN' : 'de-DE';

  // TTS-Settings laden und anwenden
  const settings = getTTSSettings(lang);
  const voicesForLang = getVoicesForLang(lang);
  if (settings.voiceName && voicesForLang.length > 0) {
    const selectedVoice = voicesForLang.find(voice => voice.name === settings.voiceName);
    if (selectedVoice) utterance.voice = selectedVoice;
  }
  utterance.pitch = settings.pitch;
  utterance.rate = settings.rate;
  utterance.volume = volume;

  speechSynthesis.speak(utterance);
  // console.log('Speaking:', text, 'in', lang, 'with voice:', utterance.voice?.name, 'pitch:', utterance.pitch, 'rate:', utterance.rate); // Debug
}

function primeTTS(initialLang) {
  if (!('speechSynthesis' in window)) return; // Kein Priming, wenn nicht verfügbar
  setTimeout(() => {
    let primeText = 'Hallo';
    let speakLang = 'de';
    if (initialLang === 'zh') {
      primeText = 'Nǐ hǎo'; // Hallo auf Chinesisch
      speakLang = 'zh';
    }
    // Nutze Settings für Priming
    const settings = getTTSSettings(speakLang);
    const voicesForLang = getVoicesForLang(speakLang);
    const utterance = new SpeechSynthesisUtterance(primeText);
    utterance.lang = speakLang === 'zh' ? 'zh-CN' : 'de-DE';
    if (settings.voiceName && voicesForLang.length > 0) {
      const selectedVoice = voicesForLang.find(voice => voice.name === settings.voiceName);
      if (selectedVoice) utterance.voice = selectedVoice;
    }
    utterance.pitch = settings.pitch;
    utterance.rate = settings.rate;
    utterance.volume = 0.3; // Leise
    speechSynthesis.speak(utterance);
    // console.log('Priming TTS with:', primeText, 'in', speakLang); // Debug
  }, 500); // 500ms nach App-Start
}

function speakCard(c, current) {
  let wordText, sentenceText, lang;
  if (current === 'zh') {
    // Fix: Hanzi forcieren für natürliche Aussprache
    wordText = c.word.hanzi || ''; // Immer Hanzi (Fallback leer)
    sentenceText = c.sentence.hanzi || ''; // Immer Hanzi (Fallback leer)
    lang = 'zh';
    fullLang = 'zh-CN'; // Für utterance.lang
  } else {
    wordText = c.word.de;
    sentenceText = c.sentence.de;
    lang = 'de';
    fullLang = 'de-DE'; // Für utterance.lang
  }

  if (!('speechSynthesis' in window)) return; // API nicht verfügbar

  // TTS-Settings laden (global für Sequenz)
  const settings = getTTSSettings(lang);
  const voicesForLang = getVoicesForLang(lang);
  const selectedVoice = settings.voiceName && voicesForLang.length > 0 ? voicesForLang.find(voice => voice.name === settings.voiceName) : null;

  // Wort mit Delay starten (API primen)
  if (wordText) {
    setTimeout(() => {
      speechSynthesis.cancel(); // Vorheriges stoppen
      const wordUtterance = new SpeechSynthesisUtterance(wordText);
      wordUtterance.lang = fullLang;
      if (selectedVoice) wordUtterance.voice = selectedVoice;
      wordUtterance.pitch = settings.pitch;
      wordUtterance.rate = settings.rate;
      wordUtterance.volume = 1.0;

      // Event: Wenn Wort fertig, starte Satz mit Buffer (Atempause)
      wordUtterance.onend = () => {
        setTimeout(() => {
          if (sentenceText) {
            speak(sentenceText, lang); // Nutze bestehende speak() für Satz
            // console.log('Word ended, starting sentence after buffer'); // Debug
          }
        }, 200); // 200ms Buffer – passe bei Bedarf an (z.B. 300-500ms)
      };

      speechSynthesis.speak(wordUtterance);
      // console.log('Started word:', wordText, 'in', lang); // Debug
    }, 200); // 200ms Start-Delay für Wort
  } else if (sentenceText) {
    // Fallback: Kein Wort → Satz direkt starten
    setTimeout(() => {
      speak(sentenceText, lang);
      // console.log('No word, starting sentence directly'); // Debug
    }, 200);
  }
}

// ---------- Datenaufbereitung ----------
function toCards(rows){
  const cards = [];
  let start = 0;
  if (rows.length && isHeaderRow(rows[0])) start = 1; // Daten ab Zeile 2
  for (let i=start; i<rows.length; i++){
    const r = rows[i] || [];
    const c = (idx)=> (r[idx]||'').trim();

    // Skip-Markierung: erste Zelle enthält '*'
    const firstCell = c(0);
    if (firstCell.includes('*')) continue;

    const de_word = c(0);
    const py_word = c(1);
    const pos     = c(2);
    const py_sent = c(3);
    const de_sent = c(4);
    const hz_word = c(5);
    const hz_sent = c(6);
    const id_raw  = c(7); // ID aus Spalte H
    const lesson_raw = c(8); // Lektionsname aus Spalte I

    if (!(de_word || py_word || pos || py_sent || de_sent || hz_word || hz_sent)) continue;

    const id = id_raw || `row${i+1}`;
    const lesson = lesson_raw || `Lektion ${i - start + 1}`; // Lektionsname direkt aus Spalte I, oder Fallback

    // Lines werden beim Rendern zusammengesetzt (damit POS direkt am Wort hängt)
    cards.push({
      id, lesson,
      word: { de: de_word, pinyin: py_word, hanzi: hz_word, pos },
      sentence: { de: de_sent, pinyin: py_sent, hanzi: hz_sent }
    });
  }
  return cards;
}

// ---------- UI Listenansicht ----------
function buildLessonFilters(cards){
  const box = document.getElementById('lessonFilters');
  box.innerHTML = '';
  // Lektionen in der Reihenfolge ihres ersten Auftretens in der CSV sammeln (natürliche Reihenfolge)
  const lessons = [];
  const seen = new Set();
  cards.forEach(c => {
    if (c.lesson && !seen.has(c.lesson)) {
      seen.add(c.lesson);
      lessons.push(c.lesson);
    }
  });
  lessons.forEach(lesson => {
    const id = `lesson_${lesson.replace(/\s+/g, '_')}`; // ID sicher machen, Leerzeichen ersetzen
    const lbl = document.createElement('label');
    lbl.className = 'chip';
    lbl.innerHTML = `<input type="checkbox" id="${id}" data-lesson="${lesson}" checked> Lektion ${lesson}`;
    box.appendChild(lbl);
  });
  const allCb = document.getElementById('lesson_all');
  const cbs = lessons.map(l => document.getElementById(`lesson_${l.replace(/\s+/g, '_')}`));
  function setAll(state){ allCb.checked = state; cbs.forEach(cb => cb.checked = state); }
  function refreshAll(){ allCb.checked = cbs.every(cb => cb.checked); }
  allCb.addEventListener('change', () => setAll(allCb.checked));
  cbs.forEach(cb => cb.addEventListener('change', refreshAll));
}

function getSelectedLessons(){
  const chips = document.querySelectorAll('#lessonFilters input[type="checkbox"][data-lesson]');
  const selected = [];
  chips.forEach(cb => { if (cb.checked) selected.push(cb.getAttribute('data-lesson')); });
  return selected;
}

function getSearchHaystack(card, side){
  const fields = [card.word.pos].filter(Boolean);
  if (side === 'zh') {
    fields.push(card.word.hanzi, card.word.pinyin, card.sentence.hanzi, card.sentence.pinyin);
  } else {
    fields.push(card.word.de, card.sentence.de);
  }
  return fields.filter(Boolean).join(' ');
}

function render(cards){
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const sideSel = document.getElementById('side');
  const qRaw = document.getElementById('q').value.trim();

  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const selectedLessons = getSelectedLessons();
  const restrictByLesson = selectedLessons.length > 0;
  const currentSide = sideSel.value;

  const filtered = cards.filter(c => {
    if (restrictByLesson && !selectedLessons.includes(c.lesson)) return false;
    if (!qNorm) return true;
    const hay = getSearchHaystack(c, currentSide);
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });

  document.getElementById('count').textContent = `${filtered.length} Karten`;
  grid.innerHTML = '';

  if (filtered.length === 0){
    empty.style.display = 'block';
    return;
  } else {
    empty.style.display = 'none';
  }

  filtered.forEach(c => {
    const el = document.createElement('div');
    el.className = 'card';

    let current = sideSel.value; // 'zh' oder 'de'

    const idDiv = document.createElement('div');
    idDiv.className = 'id';
    idDiv.textContent = `ID: ${c.id}`;

    const linesDiv = document.createElement('div');
    linesDiv.className = 'lines';

    function makeLines(){
      const posSpan = c.word.pos ? `<span class="pos">(${c.word.pos})</span>` : '';
      if(current==='zh'){
        // Chinesisch: Hanzi (erste Line), Pinyin + 3 Leerzeichen + POS (zweite Line), Satz-Hanzi, Satz-Pinyin
        const l1 = c.word.hanzi || '';
        const l2 = (c.word.pinyin || '') + (c.word.pos ? '   ' + posSpan : '');
        const l3 = c.sentence.hanzi || '';
        const l4 = c.sentence.pinyin || '';
        return [l1, l2, l3, l4].filter(Boolean);
      } else {
        // Deutsch: Wort (erste Line), POS (separate zweite Line), Satz (dritte Line)
        const l1 = c.word.de || '';
        const l2 = posSpan;
        const l3 = c.sentence.de || '';
        return [l1, l2, l3].filter(Boolean);
      }
    }

    function draw(){
      linesDiv.innerHTML = '';
      const lines = makeLines();
      lines.forEach((line, idx) => {
        const div = document.createElement('div');
        let className = 'line';
        if (idx === 0) {
          className += ' wordline';
          if (current === 'zh') className += ' zh';
        }
        div.className = className;
        div.innerHTML = highlightToneInsensitive(line, qRaw);
        linesDiv.appendChild(div);
      });
    }

    draw();

    const actions = document.createElement('div');
    actions.className = 'actions';

    // Umdrehen-Button
    const flip = document.createElement('button');
    flip.className = 'btn';
    flip.textContent = 'Umdrehen';
    flip.addEventListener('click', () => { 
      current = (current === 'zh' ? 'de' : 'zh'); 
      draw(); 
    });

    // Speak-Button (Symbol: Lautsprecher-Emoji)
    const speak = document.createElement('button');
    speak.className = 'speak-btn';
    speak.innerHTML = '🔊'; // Emoji für Lautsprecher
    speak.title = 'Vorlesen (Wort, dann Satz)';
    speak.addEventListener('click', () => speakCard(c, current));

    actions.appendChild(flip);
    actions.appendChild(speak);

    el.appendChild(idDiv);
    el.appendChild(linesDiv);
    el.appendChild(actions);

    grid.appendChild(el);
  });
}

// ---------- Lernmodus (einfach) ----------
let study = { queue:[], idx:0, side:'zh' };

function shuffleArray(a){
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function enterStudy(cards){
  const selectedLessons = getSelectedLessons();
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const restrict = selectedLessons.length>0;
  const currentSide = document.getElementById('side').value;
  let pool = cards.filter(c=>{
    if(restrict && !selectedLessons.includes(c.lesson)) return false;
    if(!qNorm) return true;
    const hay = getSearchHaystack(c, currentSide);
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });
  pool = shuffleArray(pool.slice());
  if(pool.length===0){ alert('Keine Karten in der Auswahl.'); return; }

  study.queue = pool; study.idx = 0; study.side = currentSide;
  document.getElementById('listView').style.display='none';
  document.getElementById('studyView').style.display='block';
  drawStudy();
}

function exitStudy(){
  document.getElementById('studyView').style.display='none';
  document.getElementById('listView').style.display='block';
}

function drawStudy(){
  const c = study.queue[study.idx];
  const idEl = document.getElementById('studyId');
  idEl.textContent = `ID: ${c.id}`;
  const linesEl = document.getElementById('studyLines');
  linesEl.innerHTML='';

  const posSpan = c.word.pos ? ` <span class="pos">(${c.word.pos})</span>` : '';
  let lines;
  if(study.side==='zh'){
    // Chinesisch: Hanzi (erste Line), Pinyin + 3 Leerzeichen + POS (zweite Line), Satz-Hanzi, Satz-Pinyin
    const l1 = c.word.hanzi || '';
    const l2 = (c.word.pinyin || '') + (c.word.pos ? '   ' + posSpan : '');
    const l3 = c.sentence.hanzi || '';
    const l4 = c.sentence.pinyin || '';
    lines = [l1, l2, l3, l4].filter(Boolean);
  } else {
    // Deutsch: Wort (erste Line), POS (separate zweite Line), Satz (dritte Line)
    const l1 = c.word.de || '';
    const l2 = posSpan;
    const l3 = c.sentence.de || '';
    lines = [l1, l2, l3].filter(Boolean);
  }
  lines.forEach((line, i)=>{
    const div=document.createElement('div');
    let className = 'line' + (i===0? ' wordline':'' );
    if (study.side === 'zh' && i === 0) className += ' zh';
    div.className = className;
    div.innerHTML = line;
    linesEl.appendChild(div);
  });

  // Study-Actions dynamisch rendern
  const actionsEl = document.getElementById('studyActions');
  actionsEl.innerHTML = '';

  // Umdrehen-Button
  const flipBtn = document.createElement('button');
  flipBtn.className = 'btn';
  flipBtn.textContent = 'Umdrehen';
  flipBtn.addEventListener('click', flipStudy);
  actionsEl.appendChild(flipBtn);

  // Nächste Karte-Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn';
  nextBtn.textContent = 'Nächste Karte';
  nextBtn.addEventListener('click', nextStudy);
  actionsEl.appendChild(nextBtn);

  // Speak-Button
  const speakBtn = document.createElement('button');
  speakBtn.className = 'speak-btn';
  speakBtn.innerHTML = '🔊';
  speakBtn.title = 'Vorlesen (Wort, dann Satz)';
  speakBtn.addEventListener('click', () => speakCard(c, study.side));
  actionsEl.appendChild(speakBtn);

  document.getElementById('counter').textContent = `${study.idx+1} / ${study.queue.length}`;
}

function nextStudy(){ if(study.queue.length===0) return; study.idx = (study.idx + 1) % study.queue.length; drawStudy(); }
function flipStudy(){ study.side = (study.side==='zh' ? 'de' : 'zh'); drawStudy(); }
function reshuffleStudy(){ if(study.queue.length<=1) return; const current = study.queue[study.idx]; shuffleArray(study.queue); const idx = study.queue.findIndex(x=>x.id===current.id); if(idx>0){ const [item]=study.queue.splice(idx,1); study.queue.unshift(item); study.idx=0; } drawStudy(); }

// ---------- App Start ----------
(async function(){
  // TTS Stimmen laden (asynchron)
  loadVoices();

  try{
    const t0 = performance.now();
    const text = await loadCSV();
    const { rows, delimiter } = parseCSV(text);
    let cards = toCards(rows);
    const t1 = performance.now();

    const meta = document.getElementById('meta');
    meta.textContent = `CSV geladen • Delimiter: "${delimiter==='\t'?'TAB':delimiter}" • Karten: ${cards.length} • ${Math.round(t1 - t0)} ms`;

    buildLessonFilters(cards);
    render(cards);

    // Priming TTS beim Start (leises "Hallo" in initialer Sprache 'zh')
    const initialLang = 'zh'; // Default-Seite
    primeTTS(initialLang);

    // TTS Modal Events
    document.getElementById('ttsSettingsBtn').addEventListener('click', showTTSSettings);
    document.getElementById('closeTTSModal').addEventListener('click', () => {
      document.getElementById('ttsModal').style.display = 'none';
    });
    document.getElementById('testVoiceBtn').addEventListener('click', testVoice);
    document.getElementById('saveTTSSettings').addEventListener('click', () => {
      const lang = document.getElementById('side').value;
      saveTTSSettings(lang);
      document.getElementById('ttsModal').style.display = 'none';
    });
    // Slider Value-Updates
    document.getElementById('pitchSlider').addEventListener('input', (e) => {
      document.getElementById('pitchValue').textContent = e.target.value;
    });
    document.getElementById('rateSlider').addEventListener('input', (e) => {
      document.getElementById('rateValue').textContent = e.target.value;
    });

    // Events
    const sideSel = document.getElementById('side');
    const q = document.getElementById('q');
    sideSel.addEventListener('change', () => {
      render(cards);
      // Update Modal bei Sprache-Wechsel (falls offen)
      if (document.getElementById('ttsModal').style.display !== 'none') {
        updateTTSModal(sideSel.value);
      }
    });
    q.addEventListener('input', () => render(cards));
    document.getElementById('lesson_all').addEventListener('change', () => render(cards));
    document.getElementById('lessonFilters').addEventListener('change', () => render(cards));

    // Study-Events (externe Buttons)
    document.getElementById('startStudy').addEventListener('click', () => enterStudy(cards));
    document.getElementById('exitStudy').addEventListener('click', () => exitStudy());
    document.getElementById('reshuffle').addEventListener('click', () => reshuffleStudy());

    // Modal schließen bei Klick außerhalb
    document.getElementById('ttsModal').addEventListener('click', (e) => {
      if (e.target.id === 'ttsModal') {
        e.target.style.display = 'none';
      }
    });

  } catch (err){
    document.getElementById('meta').textContent = 'Fehler: ' + err.message;
    console.error(err);
  }
})();