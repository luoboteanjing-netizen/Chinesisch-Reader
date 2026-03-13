
// --- Konfiguration ---
const CSV_PATH = './data/Long-Chinesisch_Lektionen.csv';
const STORAGE_KEY = 'fc_state_v1'; // LocalStorage für Fortschritt & SM-2

// ---------- LocalStorage State ----------
function loadState(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}') || {}; }catch{ return {}; }
}
function saveState(state){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{} }
function resetState(){ localStorage.removeItem(STORAGE_KEY); }

// state schema per cardId:
// {
//   [cardId]: {
//     // basic mode
//     correct: number,
//     wrong: number,
//     lastSeen: epoch_ms,
//     // sm2
//     reps: number,
//     lapses: number,
//     ease: number,          // EF, default 2.5
//     interval: number,      // days
//     due: number,           // epoch_ms when due
//     lastQ: number          // last quality 0..5
//   }
// }

function ensureCardState(state, id){
  if(!state[id]) state[id] = {};
  const cs = state[id];
  if(cs.correct==null) cs.correct = 0;
  if(cs.wrong==null) cs.wrong = 0;
  if(cs.reps==null) cs.reps = 0;
  if(cs.lapses==null) cs.lapses = 0;
  if(cs.ease==null) cs.ease = 2.5;
  if(cs.interval==null) cs.interval = 0;
  if(cs.due==null) cs.due = Date.now();
  return cs;
}

// ---------- CSV & Parsing ----------
function detectDelimiter(sample){
  const first = (sample.split(/?
/)[0] || '');
  const countSplit = (line, delim) => (line.length ? line.split(delim).length - 1 : 0);
  const candidates = [
    { d: ',', n: countSplit(first, ',') },
    { d: ';', n: countSplit(first, ';') },
    { d: '	', n: countSplit(first, '	') },
    { d: '|', n: countSplit(first, '|') }
  ];
  candidates.sort((a,b)=>b.n-a.n);
  return candidates[0].n>0 ? candidates[0].d : ';';
}

function parseCSV(text){
  const delimiter = detectDelimiter(text);
  const lines = text.replace(/
/g,'
').replace(//g,'
').split('
');
  const rows = [];
  for (let li=0; li<lines.length; li++){
    const line = lines[li];
    if (!line.trim()){ rows.push([]); continue; }
    const out = []; let cur=''; let i=0; let inQ=false;
    while(i<line.length){
      const ch=line[i];
      if(inQ){
        if(ch==='"'){
          if(i+1<line.length && line[i+1]==='"'){ cur+='"'; i+=2; continue; }
          else { inQ=false; i++; continue; }
        } else { cur+=ch; i++; continue; }
      } else {
        if(ch==='"'){ inQ=true; i++; continue; }
        const isDelim = (delimiter==='	' ? ch==='	' : ch===delimiter);
        if(isDelim){ out.push(cur); cur=''; i++; continue; }
        cur+=ch; i++;
      }
    }
    out.push(cur); rows.push(out);
  }
  return { rows, delimiter };
}

async function loadCSV(){
  const res = await fetch(CSV_PATH);
  if(!res.ok) throw new Error('CSV nicht gefunden: '+CSV_PATH);
  return await res.text();
}

function isHeaderRow(cells){
  const h = cells.join(' ').toLowerCase();
  return /(deutsch|pinyin|wortart|hanzi|satz|id)/.test(h);
}

// ---------- Normalisierung & Highlight ----------
function stripToneMarks(s){
  if(!s) return s;
  try{ return s.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch{ return s; }
}
function highlightToneInsensitive(originalText, query){
  if(!query) return originalText;
  const qNorm = stripToneMarks(query).toLowerCase();
  const o = String(originalText);
  let norm=''; const map=[];
  for(let i=0;i<o.length;i++){
    const ch=o[i];
    const stripped=stripToneMarks(ch);
    if(!stripped) continue;
    for(let k=0;k<stripped.length;k++){ norm+=stripped[k]; map.push(i); }
  }
  const idx = norm.toLowerCase().indexOf(qNorm);
  if(idx<0) return originalText;
  const endIdx = idx + qNorm.length - 1;
  const startOrig = map[idx];
  const endOrig = map[endIdx] + 1;
  return o.slice(0,startOrig) + '<mark>' + o.slice(startOrig,endOrig) + '</mark>' + o.slice(endOrig);
}

function formatLesson(code){
  const n = parseInt(String(code||'').replace(/\D/g,''),10);
  if(isNaN(n)) return String(code||'');
  return 'L' + String(n).padStart(2,'0');
}

// ---------- Datenmodell ----------
function toCards(rows){
  const cards=[]; let start=0;
  if(rows.length && isHeaderRow(rows[0])) start=1;
  for(let i=start;i<rows.length;i++){
    const r = rows[i]||[];
    const c = idx => (r[idx]||'').trim();

    if((c(0)||'').includes('*')) continue; // Skip-Marker

    const de_word=c(0), py_word=c(1), pos=c(2), py_sent=c(3), de_sent=c(4), hz_word=c(5), hz_sent=c(6), id_raw=c(7);
    if(!(de_word||py_word||pos||py_sent||de_sent||hz_word||hz_sent)) continue;

    const id = id_raw || `row${i+1}`;
    const lesson = String(id).slice(0,3);

    cards.push({ id, lesson, word:{de:de_word,pinyin:py_word,hanzi:hz_word,pos}, sentence:{de:de_sent,pinyin:py_sent,hanzi:hz_sent} });
  }
  return cards;
}

// ---------- Listenansicht ----------
function buildLessonFilters(cards){
  const box = document.getElementById('lessonFilters');
  box.innerHTML='';
  const lessons = Array.from(new Set(cards.map(c=>c.lesson))).filter(Boolean).sort();
  lessons.forEach(lesson=>{
    const id = `lesson_${lesson}`;
    const lbl = document.createElement('label');
    lbl.className='chip';
    lbl.innerHTML = `<input type="checkbox" id="${id}" data-lesson="${lesson}" checked> Lektion ${formatLesson(lesson)}`;
    box.appendChild(lbl);
  });
  const allCb = document.getElementById('lesson_all');
  const cbs = lessons.map(l=>document.getElementById(`lesson_${l}`));
  function setAll(state){ allCb.checked=state; cbs.forEach(cb=>cb.checked=state); }
  function refreshAll(){ allCb.checked=cbs.every(cb=>cb.checked); }
  allCb.addEventListener('change', ()=> setAll(allCb.checked));
  cbs.forEach(cb=> cb.addEventListener('change', refreshAll));
}

function getSelectedLessons(){
  const nodes = document.querySelectorAll('#lessonFilters input[type="checkbox"][data-lesson]');
  const sel=[]; nodes.forEach(cb=>{ if(cb.checked) sel.push(cb.getAttribute('data-lesson')); });
  return sel;
}

function renderList(cards){
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const sideSel = document.getElementById('side');
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const selectedLessons = getSelectedLessons();
  const restrict = selectedLessons.length>0;

  const filtered = cards.filter(c=>{
    if(restrict && !selectedLessons.includes(c.lesson)) return false;
    if(!qNorm) return true;
    const hay = [c.word.hanzi, c.word.pinyin, c.word.de, c.word.pos, c.sentence.hanzi, c.sentence.pinyin, c.sentence.de].filter(Boolean).join(' ');
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });

  document.getElementById('count').textContent = `${filtered.length} Karten`;
  grid.innerHTML='';
  empty.style.display = filtered.length? 'none':'block';

  filtered.forEach(c=>{
    const el = document.createElement('div'); el.className='card';
    let current = sideSel.value; // 'zh'|'de'

    const idDiv = document.createElement('div'); idDiv.className='id';
    idDiv.textContent = `ID: ${c.id}  •  Lektion: ${formatLesson(c.lesson)}`;

    const linesDiv = document.createElement('div'); linesDiv.className='lines';

    function makeLines(){
      const posSpan = c.word.pos ? ` <span class="pos">(${c.word.pos})</span>` : '';
      if(current==='zh'){
        const l1 = (c.word.hanzi||'') + posSpan; // Wort Hanzi + (POS kleiner)
        const l2 = c.word.pinyin||'';
        const l3 = c.sentence.hanzi||'';
        const l4 = c.sentence.pinyin||'';
        return [l1,l2,l3,l4].filter(Boolean);
      } else {
        const l1 = (c.word.de||'') + (c.word.pos? ` <span class="pos">(${c.word.pos})</span>`:'');
        const l2 = c.sentence.de||'';
        return [l1,l2].filter(Boolean);
      }
    }

    function draw(){
      linesDiv.innerHTML='';
      makeLines().forEach(line=>{
        const div=document.createElement('div');
        div.className='line';
        div.innerHTML = highlightToneInsensitive(line, qRaw);
        linesDiv.appendChild(div);
      });
    }

    draw();

    const actions = document.createElement('div'); actions.className='actions';
    const flip = document.createElement('button'); flip.className='btn'; flip.textContent='Umdrehen';
    flip.addEventListener('click', ()=>{ current=(current==='zh'?'de':'zh'); draw(); });
    actions.appendChild(flip);

    el.appendChild(idDiv); el.appendChild(linesDiv); el.appendChild(actions);
    grid.appendChild(el);
  });
}

// ---------- Lernmodus: Basic & SM-2 ----------
let study = { queue:[], idx:0, side:'zh', mode:'basic', dueCount:0 };

function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// SM-2 Update
function sm2Update(cs, quality){
  // quality: 0..5 (Again<=2, Hard=3, Good=4, Easy=5)
  const now = Date.now();
  cs.reps = (cs.reps||0) + 1;
  cs.lastQ = quality;

  // Initial learning: wenn Qualität <3 → Reset Interval auf 1 Tag und Lapse zählen
  if(quality < 3){
    cs.lapses = (cs.lapses||0) + 1;
    cs.interval = 1; // 1 Tag
    cs.ease = Math.max(1.3, (cs.ease||2.5) - 0.2); // etwas strafen
    cs.due = now + cs.interval * 24*60*60*1000;
    return cs;
  }

  // EF-Formel (SM-2)
  const ef = (cs.ease||2.5) + (0.1 - (5-quality)*(0.08 + (5-quality)*0.02));
  cs.ease = Math.max(1.3, ef);

  // Interval
  if(!cs.interval || cs.interval < 1){
    cs.interval = 1; // erster richtiger → 1 Tag
  } else if(cs.interval === 1){
    cs.interval = 6; // zweiter richtiger → 6 Tage
  } else {
    cs.interval = Math.round(cs.interval * cs.ease);
  }

  cs.due = now + cs.interval * 24*60*60*1000;
  return cs;
}

function getStudyPool(cards, mode){
  const selectedLessons = getSelectedLessons();
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const restrict = selectedLessons.length>0;
  const base = cards.filter(c=>{
    if(restrict && !selectedLessons.includes(c.lesson)) return false;
    if(!qNorm) return true;
    const hay=[c.word.hanzi,c.word.pinyin,c.word.de,c.word.pos,c.sentence.hanzi,c.sentence.pinyin,c.sentence.de].filter(Boolean).join(' ');
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });

  if(mode!=='sm2'){
    return { pool: shuffleArray(base.slice()), dueCount: base.length };
  }

  // SM-2: nur fällige Karten auswählen
  const state = loadState();
  const now = Date.now();
  const due = [];
  for(const c of base){
    const cs = ensureCardState(state, c.id);
    if((cs.due||0) <= now){ due.push(c); }
  }
  return { pool: shuffleArray(due), dueCount: due.length };
}

function createSm2Buttons(card, cs, state){
  const actions = document.getElementById('studyActions');
  actions.innerHTML='';
  const mk = (cls, label, q) => {
    const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label;
    b.addEventListener('click', ()=>{
      sm2Update(cs, q); cs.lastSeen = Date.now(); saveState(state); nextStudy();
    });
    return b;
  };
  actions.appendChild(mk('sm2-again','Again',2));
  actions.appendChild(mk('sm2-hard','Hard',3));
  actions.appendChild(mk('sm2-good','Good',4));
  actions.appendChild(mk('sm2-easy','Easy',5));
}

function createBasicButtons(card, cs, state){
  const actions = document.getElementById('studyActions');
  actions.innerHTML='';
  const mk = (label, good)=>{
    const b = document.createElement('button'); b.className='btn'; b.textContent = label;
    b.addEventListener('click', ()=>{
      if(good) cs.correct=(cs.correct||0)+1; else cs.wrong=(cs.wrong||0)+1; cs.lastSeen=Date.now(); saveState(state); nextStudy();
    });
    return b;
  };
  actions.appendChild(mk('Richtig', true));
  actions.appendChild(mk('Falsch', false));
}

function enterStudy(cards){
  const mode = document.getElementById('mode').value; // 'basic' | 'sm2'
  const { pool, dueCount } = getStudyPool(cards, mode);
  if(pool.length===0){
    if(mode==='sm2') alert('Keine fälligen Karten in der Auswahl.'); else alert('Keine Karten in der Auswahl.');
    return;
  }
  study.queue = pool; study.idx=0; study.side = document.getElementById('side').value; study.mode = mode; study.dueCount = dueCount;
  document.getElementById('listView').style.display='none';
  document.getElementById('studyView').style.display='block';
  document.getElementById('hintSm2').style.display = (mode==='sm2') ? 'block':'none';
  drawStudy();
}

function exitStudy(){ document.getElementById('studyView').style.display='none'; document.getElementById('listView').style.display='block'; }

function drawStudy(){
  const c = study.queue[study.idx];
  const idEl = document.getElementById('studyId'); idEl.textContent = `ID: ${c.id}  •  Lektion: ${formatLesson(c.lesson)}`;
  const linesEl = document.getElementById('studyLines'); linesEl.innerHTML='';
  const side = study.side;

  const posSpan = c.word.pos ? ` <span class="pos">(${c.word.pos})</span>` : '';
  let lines;
  if(side==='zh'){
    const l1 = (c.word.hanzi||'') + posSpan;
    const l2 = c.word.pinyin||'';
    const l3 = c.sentence.hanzi||'';
    const l4 = c.sentence.pinyin||'';
    lines = [l1,l2,l3,l4].filter(Boolean);
  } else {
    const l1 = (c.word.de||'') + (c.word.pos? ` <span class="pos">(${c.word.pos})</span>`:'');
    const l2 = c.sentence.de||'';
    lines = [l1,l2].filter(Boolean);
  }
  lines.forEach((line,i)=>{
    const div=document.createElement('div'); div.className='line'+(i===0?' wordline':'')+(side==='zh'&&i===0?' zh':''); div.innerHTML=line; linesEl.appendChild(div);
  });

  document.getElementById('counter').textContent = `${study.idx+1} / ${study.queue.length}`;
  document.getElementById('dueInfo').textContent = `Fällige: ${study.dueCount}`;

  const state = loadState();
  const cs = ensureCardState(state, c.id);

  // Flip & Next Buttons (immer verfügbar)
  const actions = document.getElementById('studyActions');
  const flipBtn = document.createElement('button'); flipBtn.className='btn'; flipBtn.textContent='Umdrehen';
  flipBtn.addEventListener('click', ()=>{ study.side=(study.side==='zh'?'de':'zh'); drawStudy(); });
  actions.innerHTML=''; actions.appendChild(flipBtn);

  if(study.mode==='sm2'){
    // SM-2 Bewertungen
    createSm2Buttons(c, cs, state);
  } else {
    // Basic: Richtig/Falsch
    createBasicButtons(c, cs, state);
  }

  // Weiter-Button immer
  const nextBtn = document.createElement('button'); nextBtn.className='btn'; nextBtn.textContent='Nächste Karte';
  nextBtn.addEventListener('click', ()=> nextStudy());
  actions.appendChild(nextBtn);
}

function nextStudy(){ if(study.queue.length===0) return; study.idx = (study.idx + 1) % study.queue.length; drawStudy(); }
function flipStudy(){ study.side=(study.side==='zh'?'de':'zh'); drawStudy(); }
function reshuffleStudy(){ if(study.queue.length<=1) return; const current=study.queue[study.idx]; shuffleArray(study.queue); const idx=study.queue.findIndex(x=>x.id===current.id); if(idx>0){ const [item]=study.queue.splice(idx,1); study.queue.unshift(item); study.idx=0; } drawStudy(); }

// ---------- Export / Import (Karten-Snapshot) ----------
function exportJSON(cards){
  const selectedLessons = getSelectedLessons();
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const restrict = selectedLessons.length>0;
  const filtered = cards.filter(c=>{
    if(restrict && !selectedLessons.includes(c.lesson)) return false;
    if(!qNorm) return true;
    const hay=[c.word.hanzi,c.word.pinyin,c.word.de,c.word.pos,c.sentence.hanzi,c.sentence.pinyin,c.sentence.de].filter(Boolean).join(' ');
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });
  const payload = { meta:{ exported_at: new Date().toISOString(), count: filtered.length }, cards: filtered };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='cards_snapshot.json'; a.click(); URL.revokeObjectURL(url);
}

function importJSON(setCards){
  const input = document.getElementById('importFile');
  input.onchange = async () => {
    const f = input.files && input.files[0]; if(!f) return;
    const text = await f.text();
    try{
      const data = JSON.parse(text);
      if(Array.isArray(data.cards)){
        setCards(data.cards.map(c=>({ id:c.id, lesson:c.lesson||String((c.id||'').slice(0,3)), word:c.word||{}, sentence:c.sentence||{} })));
      } else { alert('Ungültiges JSON: Feld "cards" fehlt.'); }
    }catch(e){ alert('Fehler beim JSON-Import: '+e.message); }
    input.value='';
  };
  input.click();
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
    meta.textContent = `CSV geladen • Delimiter: "${delimiter==='	'?'TAB':delimiter}" • Karten: ${cards.length} • ${Math.round(t1-t0)} ms`;

    buildLessonFilters(cards);
    renderList(cards);

    // UI Events
    const sideSel = document.getElementById('side');
    const q = document.getElementById('q');
    sideSel.addEventListener('change', ()=> renderList(cards));
    q.addEventListener('input', ()=> renderList(cards));
    document.getElementById('flipAll').addEventListener('click', ()=>{ sideSel.value=(sideSel.value==='zh'?'de':'zh'); renderList(cards); });

    document.getElementById('lesson_all').addEventListener('change', ()=> renderList(cards));
    document.getElementById('lessonFilters').addEventListener('change', ()=> renderList(cards));

    document.getElementById('startStudy').addEventListener('click', ()=> enterStudy(cards));
    document.getElementById('exitStudy').addEventListener('click', ()=> exitStudy());
    document.getElementById('reshuffle').addEventListener('click', ()=> reshuffleStudy());

    document.getElementById('exportJson').addEventListener('click', ()=> exportJSON(cards));
    document.getElementById('importJson').addEventListener('click', ()=> importJSON((newCards)=>{ cards=newCards; buildLessonFilters(cards); renderList(cards); exitStudy(); }));

    document.getElementById('resetProgress').addEventListener('click', ()=>{ if(confirm('Fortschritt wirklich löschen?')){ resetState(); alert('Fortschritt gelöscht.'); }});

  } catch (err){
    document.getElementById('meta').textContent = 'Fehler: ' + err.message;
    console.error(err);
  }
})();
