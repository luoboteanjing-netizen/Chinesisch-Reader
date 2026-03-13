
// --- Konfiguration ---
const CSV_PATH = './data/Long-Chinesisch_Lektionen.csv';
// Spalten 1..8 wie vom Nutzer beschrieben
// 1 Wort Deutsch, 2 Wort Pinyin, 3 Wortart, 4 Satz Pinyin,
// 5 Satz Deutsch, 6 Wort Hanzi, 7 Satz Hanzi, 8 ID

// Einfache CSV-Parsing-Funktion mit Quote-Unterstützung und Delimiter-Erkennung (, ; \t |)
function detectDelimiter(sample){
  // Zähle Vorkommen typischer Delimiter in der ersten Zeile
  const first = sample.split(/\r?\n/)[0] || '';
  const c = (ch)=> (first.match(new RegExp(`\${ch}`, 'g'))||[]).length;
  const candidates = [{d:',',n:c(',')},{d:';',n:c(';')},{d:'\t',n:c('\t')},{d:'|',n:c('|')}];
  candidates.sort((a,b)=>b.n-a.n);
  return (candidates[0].n>0? candidates[0].d : ';'); // Fallback ;
}

function parseCSV(text){
  const delimiter = detectDelimiter(text);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  for (let li=0; li<lines.length; li++){
    let line = lines[li];
    // Skip komplett leere Zeilen
    if (!line.trim()) { rows.push([]); continue; }
    const out = [];
    let cur = '';
    let i = 0;
    let inQuotes = false;
    while (i < line.length){
      const ch = line[i];
      if (inQuotes){
        if (ch === '"'){
          if (i+1 < line.length && line[i+1] === '"'){ // escaped quote
            cur += '"'; i += 2; continue;
          } else { inQuotes = false; i++; continue; }
        } else { cur += ch; i++; continue; }
      } else {
        if (ch === '"'){ inQuotes = true; i++; continue; }
        const isDelim = (delimiter === '\t' ? ch === '\t' : ch === delimiter);
        if (isDelim){ out.push(cur); cur=''; i++; continue; }
        // Zeilenende
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

function toCards(rows){
  const cards = [];
  let start = 0;
  if (rows.length && isHeaderRow(rows[0])) start = 1; // Daten ab Zeile 2
  for (let i=start; i<rows.length; i++){
    const r = rows[i] || [];
    // Pad to 8 columns
    const c = (idx)=> (r[idx]||'').trim();
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

    cards.push({ id, zh, de, word:{de:de_word,pinyin:py_word,hanzi:hz_word,pos}, sentence:{de:de_sent,pinyin:py_sent,hanzi:hz_sent} });
  }
  return cards;
}

function highlight(text, q){
  if (!q) return text;
  try{
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = String(text).split(new RegExp(`(${esc})`, 'gi'));
    return parts.map(p => p.toLowerCase() === q.toLowerCase() ? `<mark>${p}</mark>` : p).join('');
  }catch{ return text; }
}

function render(cards){
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const sideSel = document.getElementById('side');
  const q = document.getElementById('q').value.trim();

  const filtered = cards.filter(c => {
    const hay = [...(c.zh||[]), ...(c.de||[])].join(' ').toLowerCase();
    return q ? hay.includes(q.toLowerCase()) : true;
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

    function draw(){
      const lines = (current === 'zh' ? c.zh : c.de) || [];
      linesDiv.innerHTML = '';
      lines.forEach(line => {
        const div = document.createElement('div');
        div.className = 'line';
        div.innerHTML = highlight(line, q);
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

(async function(){
  try{
    const t0 = performance.now();
    const text = await loadCSV();
    const { rows, delimiter } = parseCSV(text);
    const cards = toCards(rows);
    const t1 = performance.now();

    const meta = document.getElementById('meta');
    meta.textContent = `CSV geladen • Delimiter: "${delimiter === '\t' ? 'TAB' : delimiter}" • Karten: ${cards.length} • ${Math.round(t1 - t0)} ms`;

    const sideSel = document.getElementById('side');
    const q = document.getElementById('q');
    sideSel.addEventListener('change', () => render(cards));
    q.addEventListener('input', () => render(cards));
    document.getElementById('flipAll').addEventListener('click', () => {
      sideSel.value = (sideSel.value === 'zh' ? 'de' : 'zh');
      render(cards);
    });

    render(cards);
  } catch (err){
    document.getElementById('meta').textContent = 'Fehler: ' + err.message;
    console.error(err);
  }
})();
