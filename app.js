
const CSV_PATH = './data/Long-Chinesisch_Lektionen.csv';

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
  return candidates[0].n>0 ? candidates[0].d : ';';
}

function parseCSV(text){
  const delimiter = detectDelimiter(text);
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
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
        const isDelim = (delimiter==='\t' ? ch==='\t' : ch===delimiter);
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

function stripToneMarks(s){
  if(!s) return s;
  try{ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch{ return s; }
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

function toCards(rows){
  const cards=[]; let start=0;
  if(rows.length && isHeaderRow(rows[0])) start=1;
  for(let i=start;i<rows.length;i++){
    const r = rows[i]||[];
    const c = idx => (r[idx]||'').trim();

    if((c(0)||'').includes('*')) continue;

    const de_word=c(0), py_word=c(1), pos=c(2), py_sent=c(3), de_sent=c(4), hz_word=c(5), hz_sent=c(6), id_raw=c(7);
    if(!(de_word||py_word||pos||py_sent||de_sent||hz_word||hz_sent)) continue;

    const id = id_raw || `row${i+1}`;
    const lesson = String(id).slice(0,3);

    cards.push({ id, lesson, word:{de:de_word,pinyin:py_word,hanzi:hz_word,pos}, sentence:{de:de_sent,pinyin:py_sent,hanzi:hz_sent} });
  }
  return cards;
}

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
    let current = sideSel.value;
    const idDiv = document.createElement('div'); idDiv.className='id';
    idDiv.textContent = `ID: ${c.id}  •  Lektion: ${formatLesson(c.lesson)}`;
    const linesDiv = document.createElement('div'); linesDiv.className='lines';

    function makeLines(){
      const posSpan = c.word.pos ? ` <span class="pos">(${c.word.pos})</span>` : '';
      if(current==='zh'){
        const l1 = (c.word.hanzi||'') + posSpan;
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

let study = { queue:[], idx:0, side:'zh' };
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function enterStudy(cards){
  const selectedLessons = getSelectedLessons();
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const restrict = selectedLessons.length>0;
  let pool = cards.filter(c=>{
    if(restrict && !selectedLessons.includes(c.lesson)) return false;
    if(!qNorm) return true;
    const hay=[c.word.hanzi,c.word.pinyin,c.word.de,c.word.pos,c.sentence.hanzi,c.sentence.pinyin,c.sentence.de].filter(Boolean).join(' ');
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });
  pool = shuffleArray(pool.slice());
  if(pool.length===0){ alert('Keine Karten in der Auswahl.'); return; }
  study.queue = pool; study.idx=0; study.side = document.getElementById('side').value;
  document.getElementById('listView').style.display='none';
  document.getElementById('studyView').style.display='block';
  drawStudy();
}
function exitStudy(){ document.getElementById('studyView').style.display='none'; document.getElementById('listView').style.display='block'; }
function drawStudy(){
  const c = study.queue[study.idx];
  const idEl = document.getElementById('studyId'); idEl.textContent = `ID: ${c.id}  •  Lektion: ${formatLesson(c.lesson)}`;
  const linesEl = document.getElementById('studyLines'); linesEl.innerHTML='';
  const posSpan = c.word.pos ? ` <span class=\"pos\">(${c.word.pos})</span>` : '';
  let lines;
  if(study.side==='zh'){
    const l1 = (c.word.hanzi||'') + posSpan;
    const l2 = c.word.pinyin||'';
    const l3 = c.sentence.hanzi||'';
    const l4 = c.sentence.pinyin||'';
    lines = [l1,l2,l3,l4].filter(Boolean);
  } else {
    const l1 = (c.word.de||'') + (c.word.pos? ` <span class=\"pos\">(${c.word.pos})</span>`:'');
    const l2 = c.sentence.de||'';
    lines = [l1,l2].filter(Boolean);
  }
  lines.forEach((line,i)=>{ const div=document.createElement('div'); div.className='line'+(i===0?' wordline':'')+(study.side==='zh'&&i===0?' zh':''); div.innerHTML=line; linesEl.appendChild(div); });
  document.getElementById('counter').textContent = `${study.idx+1} / ${study.queue.length}`;
}
function nextStudy(){ if(study.queue.length===0) return; study.idx=(study.idx+1)%study.queue.length; drawStudy(); }
function flipStudy(){ study.side=(study.side==='zh'?'de':'zh'); drawStudy(); }
function reshuffleStudy(){ if(study.queue.length<=1) return; const current=study.queue[study.idx]; shuffleArray(study.queue); const idx=study.queue.findIndex(x=>x.id===current.id); if(idx>0){ const [item]=study.queue.splice(idx,1); study.queue.unshift(item); study.idx=0; } drawStudy(); }

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

(async function(){
  try{
    const t0 = performance.now();
    const text = await loadCSV();
    const { rows, delimiter } = parseCSV(text);
    let cards = toCards(rows);
    const t1 = performance.now();
    document.getElementById('meta').textContent = `CSV geladen • Delimiter: "${delimiter==='\t'?'TAB':delimiter}" • Karten: ${cards.length} • ${Math.round(t1-t0)} ms`;
    buildLessonFilters(cards);
    renderList(cards);
    const sideSel = document.getElementById('side');
    const q = document.getElementById('q');
    sideSel.addEventListener('change', ()=> renderList(cards));
    q.addEventListener('input', ()=> renderList(cards));
    document.getElementById('flipAll').addEventListener('click', ()=>{ sideSel.value=(sideSel.value==='zh'?'de':'zh'); renderList(cards); });
    document.getElementById('lesson_all').addEventListener('change', ()=> renderList(cards));
    document.getElementById('lessonFilters').addEventListener('change', ()=> renderList(cards));
    document.getElementById('startStudy').addEventListener('click', ()=> enterStudy(cards));
    document.getElementById('exitStudy').addEventListener('click', ()=> exitStudy());
    document.getElementById('nextOne').addEventListener('click', ()=> nextStudy());
    document.getElementById('flipOne').addEventListener('click', ()=> flipStudy());
    document.getElementById('reshuffle').addEventListener('click', ()=> reshuffleStudy());
    document.getElementById('exportJson').addEventListener('click', ()=> exportJSON(cards));
    document.getElementById('importJson').addEventListener('click', ()=> importJSON((newCards)=>{ cards=newCards; buildLessonFilters(cards); renderList(cards); exitStudy(); }));
  } catch (err){
    document.getElementById('meta').textContent = 'Fehler: ' + err.message;
    console.error(err);
  }
})();
