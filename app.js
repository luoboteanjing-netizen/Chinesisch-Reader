// --- Konfiguration ---
const CSV_PATH = './data/Long-Chinesisch_Lektionen.csv';
// Spalten (1..8):
// 1 Wort Deutsch, 2 Wort Pinyin, 3 Wortart, 4 Satz Pinyin,
// 5 Satz Deutsch, 6 Wort Hanzi, 7 Satz Hanzi, 8 ID

// ---------- Hilfsfunktionen ----------

// Delimiter-Autodetect (, ; \t |)
function detectDelimiter(sample){
  const first = sample.split(/\r?\n/)[0] || '';
  const count = ch => (first.match(new RegExp(`\\${ch}`, 'g')) || []).length;
  const candidates = [{d:',',n:count(',')},{d:';',n:count(';')},{d:'\t',n:count('\t')},{d:'|',n:count('|')}];
  candidates.sort((a,b)=>b.n-a.n);
  return (candidates[0].n>0 ? candidates[0].d : ';'); // Fallback ; (DACH-typisch)
}

// Minimaler CSV-Parser mit Quotes und obigem Delimiter
function parseCSV(text){
  const delimiter = detectDelimiter(text);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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

// CSV laden
async function loadCSV(){
  const res = await fetch(CSV_PATH);
  if (!res.ok) throw new Error('CSV nicht gefunden: ' + CSV_PATH);
  return await res.text();
}

// Kopfzeile erkennen
function isHeaderRow(cells){
  const h = cells.join(' ').toLowerCase();
  return /(deutsch|pinyin|wortart|hanzi|satz|id)/.test(h);
}

// Töne entfernen (Pinyin: diakritische Zeichen raus)
// NFD zerlegt, danach Combining Marks entfernen.
function stripToneMarks(s){
  if (!s) return s;
  try {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return s; // Fallback, falls normalize nicht verfügbar
  }
}

// Text-Hervorhebung (mit Ton-ignorierender Suche)
// Markiert das erste Vorkommen der (normalisierten) Query im (normalisierten) Text.
// Mappt die Fundstelle zurück in den Originaltext, damit die Anzeige schön bleibt.
function highlightToneInsensitive(originalText, query){
  if (!query) return originalText;
  const qNorm = stripToneMarks(query).toLowerCase();
  const o = String(originalText);

  // Mapping von normalisierter Position -> Originalindex
  let norm = '';
  const map = []; // map[normIndex] = originalIndex
  for (let i=0; i<o.length; i++){
    const ch = o[i];
    const stripped = stripToneMarks(ch);
    if (!stripped) continue;
    for (let k=0; k<stripped.length; k++){
      norm += stripped[k];
      map.push(i);
    }
  }

  const idx = norm.toLowerCase().indexOf(qNorm);
  if (idx < 0) return originalText;

  const endIdx = idx + qNorm.length - 1;
  const startOrig = map[idx];
  const endOrig = map[endIdx] + 1; // exklusiv

  return (
    o.slice(0, startOrig) +
    '<mark>' + o.slice(startOrig, endOrig) + '</mark>' +
    o.slice(endOrig)
  );
}

// ---------- Datenaufbereitung ----------

function toCards(rows){
  const cards = [];
  let start = 0;
  if (rows.length && isHeaderRow(rows[0])) start = 1; // Daten ab Zeile 2

  for (let i=start; i<rows.length; i++){
    const r = rows[i] || [];
    const c = idx => (r[idx] || '').trim();

    // NEU 1: Zeilen-Skip, wenn erste Zelle ein "*" enthält
    const firstCell = c(0);
    if (firstCell.includes('*')) continue;

    const de_word = c(0);
    const py_word = c(1);
    const pos     = c(2);
    const py_sent = c(3);
    const de_sent = c(4);
    const hz_word = c(5);
    const hz_sent = c(6);
    const id_raw  = c(7);

    // leere Zeilen überspringen
    if (!(de_word || py_word || pos || py_sent || de_sent || hz_word || hz_sent)) continue;

    const zh = [hz_word, py_word, pos, hz_sent, py_sent].filter(Boolean);
    const de = [de_word, pos, de_sent].filter(Boolean);
    const id = id_raw || `row${i+1}`;

    // NEU 2: Lektionsnummer = erste 3 Zeichen der ID
    const lesson = String(id).slice(0, 3);

    cards.push({
      id, lesson, zh, de,
      word:{de:de_word,pinyin:py_word,hanzi:hz_word,pos},
      sentence:{de:de_sent,pinyin:py_sent,hanzi:hz_sent}
    });
  }
  return cards;
}

// ---------- UI ----------

function buildLessonFilters(cards){
  const box = document.getElementById('lessonFilters');
  box.innerHTML = '';

  // Eindeutige Lektionen sammeln
  const lessons = Array.from(new Set(cards.map(c => c.lesson))).filter(Boolean).sort();

  // "Alle" Chip
  const allId = 'lesson_all';
  const allChip = document.createElement('label');
  allChip.className = 'chip';
  allChip.innerHTML = `<input type="checkbox" id="${allId}" checked> Alle`;
  box.appendChild(allChip);

  // Einzel-Lektionen
  lessons.forEach(lesson => {
    const id = `lesson_${lesson}`;
    const lbl = document.createElement('label');
    lbl.className = 'chip';
    lbl.innerHTML = `<input type="checkbox" id="${id}" data-lesson="${lesson}" checked> ${lesson}`;
    box.appendChild(lbl);
  });

  // Logik: "Alle" toggelt alle; Einzeländerungen passen "Alle" an.
  const allCb = document.getElementById(allId);
  const lessonCbs = lessons.map(l => document.getElementById(`lesson_${l}`));

  function setAll(state){
    allCb.checked = state;
    lessonCbs.forEach(cb => cb.checked = state);
  }
  function refreshAllState(){
    const allOn = lessonCbs.every(cb => cb.checked);
    allCb.checked = allOn;
  }

  allCb.addEventListener('change', () => setAll(allCb.checked));
  lessonCbs.forEach(cb => cb.addEventListener('change', refreshAllState));
}

function getSelectedLessons(){
  const chips = document.querySelectorAll('#lessonFilters input[type="checkbox"][data-lesson]');
  const selected = [];
  chips.forEach(cb => { if (cb.checked) selected.push(cb.getAttribute('data-lesson')); });
  return selected; // leer = keine Auswahl → wird in render() als "alle" interpretiert
}

function render(cards){
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const sideSel = document.getElementById('side');
  const qRaw = document.getElementById('q').value.trim();

  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const selectedLessons = getSelectedLessons();
  const restrictByLesson = selectedLessons.length > 0;

  const filtered = cards.filter(c => {
    // Lektionsfilter
    if (restrictByLesson && !selectedLessons.includes(c.lesson)) return false;

    // Suche (ton-ignorierend)
    if (!qNorm) return true;
    const hayOrig = [...(c.zh||[]), ...(c.de||[])].join(' ');
    const hayNorm = stripToneMarks(hayOrig).toLowerCase();
    return hayNorm.includes(qNorm);
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
    idDiv.textContent = `ID: ${c.id}  •  Lektion: ${c.lesson}`;

    const linesDiv = document.createElement('div');
    linesDiv.className = 'lines';

    function draw(){
      const lines = (current === 'zh' ? c.zh : c.de) || [];
      linesDiv.innerHTML = '';
      lines.forEach(line => {
        const div = document.createElement('div');
        div.className = 'line';
        div.innerHTML = highlightToneInsensitive(line, qRaw);
        linesDiv.appendChild(div);
      });
    }
    draw();

    const actions = document.createElement('div');
    actions.className = 'actions';
    const flip = document.createElement('button');
    flip.className = 'btn';
    flip.textContent = 'Umdrehen';
    flip.addEventListener('click', () => { current = (current === 'zh' ? 'de' : 'zh'); draw(); });

    actions.appendChild(flip);

    el.appendChild(idDiv);
    el.appendChild(linesDiv);
    el.appendChild(actions);

    grid.appendChild(el);
  });
}

// ---------- Start ----------

(async function(){
  try{
    const t0 = performance.now();
    const text = await loadCSV();
    const { rows, delimiter } = parseCSV(text);
    const cards = toCards(rows);
    const t1 = performance.now();

    const meta = document.getElementById('meta');
    meta.textContent = `CSV geladen • Delimiter: "${delimiter === '\t' ? 'TAB' : delimiter}" • Karten: ${cards.length} • ${Math.round(t1 - t0)} ms`;

    // Lektionen bauen
    buildLessonFilters(cards);

    // Events
    const sideSel = document.getElementById('side');
    const q = document.getElementById('q');

    sideSel.addEventListener('change', () => render(cards));
    q.addEventListener('input', () => render(cards));
    document.getElementById('flipAll').addEventListener('click', () => {
      sideSel.value = (sideSel.value === 'zh' ? 'de' : 'zh');
      render(cards);
    });
    document.getElementById('lessonFilters').addEventListener('change', () => render(cards));

    render(cards);
  } catch (err){
    document.getElementById('meta').textContent = 'Fehler: ' + err.message;
    console.error(err);
  }
})();
