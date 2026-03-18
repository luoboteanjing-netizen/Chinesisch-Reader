
// --- Konfiguration ---
const CSV_PATH = './data/Long-Chinesisch_Lektionen.csv';

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
  for (let li=0; li<li
es.length; li++){
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

function formatLesson(code){
  const n = parseInt(String(code||'').replace(/\D/g,''),10);
  if(isNaN(n)) return String(code||'');
  return 'L' + String(n).padStart(2,'0');
}

// ---------- Datenaufbereitung ----------
function toCards(rows){
  const cards = [];
  let start = 0;
  if (rows.length && isHeaderRow(rows[0])) start = 1; // Daten ab Zeile 2
  for (let i=start; i<rows.length; i++){
    const r = rows[i] || [];
    const c = (idx)=> (r[idx]||'').trim();

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

    if (!(de_word || py_word || pos || py_sent || de_sent || hz_word || hz_sent)) continue;

    const id = id_raw || `row${i+1}`;
    const lesson = String(id).slice(0, 3);

    cards.push({
      id, lesson,
      word: { de: de_word, pinyin: py_word, hanzi: hz_word, pos },
      sentence: { de: de_sent, pinyin: py_sent, hanzi: hz_sent }
    });
  }
  return cards;
}

// ---------- UI ----------
function buildLessonFilters(cards){
  const box = document.getElementById('lessonFilters');
  box.innerHTML = '';
  const lessons = Array.from(new Set(cards.map(c => c.lesson))).filter(Boolean).sort();
  lessons.forEach(lesson => {
    const id = `lesson_${lesson}`;
    const lbl = document.createElement('label');
    lbl.className = 'chip';
    lbl.innerHTML = `<input type="checkbox" id="${id}" data-lesson="${lesson}" checked> Lektion ${formatLesson(lesson)}`;
    box.appendChild(lbl);
  });
  const allCb = document.getElementById('lesson_all');
  const cbs = lessons.map(l => document.getElementById(`lesson_${l}`));
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

function render(cards){
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const sideSel = document.getElementById('side');
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();

  const selectedLessons = getSelectedLessons();
  const restrictByLesson = selectedLessons.length > 0;

  const filtered = cards.filter(c => {
    if (restrictByLesson && !selectedLessons.includes(c.lesson)) return false;
    if (!qNorm) return true; // wenn leer, alle zeigen (innerhalb Lektionen)

    if (sideSel.value === 'zh'){
      // NUR chinesische Seite durchsuchen
      const hayZh = [c.word.hanzi, c.word.pinyin, c.word.pos, c.sentence.hanzi, c.sentence.pinyin]
        .filter(Boolean).join(' ');
      return stripToneMarks(hayZh).toLowerCase().includes(qNorm);
    } else {
      // NUR deutsche Seite durchsuchen
      const hayDe = [c.word.de, c.word.pos, c.sentence.de]
        .filter(Boolean).join(' ');
      return stripToneMarks(hayDe).toLowerCase().includes(qNorm);
    }
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

    const idDiv = document.createElement('div');
    idDiv.className = 'id';
    idDiv.textContent = `ID: ${c.id}  •  Lektion: ${c.lesson}`;

    const linesDiv = document.createElement('div');
    linesDiv.className = 'lines';

    function linesForSide(){
      if (sideSel.value === 'zh'){
        // Karte in chinesischer Darstellung
        return [ c.word.hanzi, c.word.pinyin, c.word.pos, c.sentence.hanzi, c.sentence.pinyin ]
          .filter(Boolean);
      } else {
        return [ c.word.de, c.word.pos, c.sentence.de ]
          .filter(Boolean);
      }
    }

    const lines = linesForSide();
    lines.forEach(line => {
      const div = document.createElement('div');
      div.className = 'line';
      div.innerHTML = highlightToneInsensitive(line, qRaw);
      linesDiv.appendChild(div);
    });

    el.appendChild(idDiv);
    el.appendChild(linesDiv);
    grid.appendChild(el);
  });
}

// ---------- App Start ----------
(async function(){
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

    // Events: Live-Render bei Suche/Seite/Lektionen
    document.getElementById('side').addEventListener('change', () => render(cards));
    document.getElementById('q').addEventListener('input', () => render(cards));
    document.getElementById('clear').addEventListener('click', ()=>{ document.getElementById('q').value=''; render(cards); });
    document.getElementById('lesson_all').addEventListener('change', () => render(cards));
    document.getElementById('lessonFilters').addEventListener('change', () => render(cards));

  } catch (err){
    document.getElementById('meta').textContent = 'Fehler: ' + err.message;
    console.error(err);
  }
})();
