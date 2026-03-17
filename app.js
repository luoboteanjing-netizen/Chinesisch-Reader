
// --- Konfiguration ---
const CSV_PATH = './data/Long-Chinesisch_Lektionen.csv';

// ---------- Utils ----------
function detectDelimiter(sample){
  const first = (sample.split(/\r?\n/)[0] || '');
  const countSplit = (line, delim) => (line.length ? line.split(delim).length - 1 : 0);
  const candidates = [ {d:',',n:countSplit(first,',')}, {d:';',n:countSplit(first,';')}, {d:'\t',n:countSplit(first,'\t')}, {d:'|',n:countSplit(first,'|')} ];
  candidates.sort((a,b)=>b.n-a.n);
  return candidates[0].n>0 ? candidates[0].d : ';';
}
function parseCSV(text){
  const delimiter = detectDelimiter(text);
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const rows=[];
  for(let li=0; li<lines.length; li++){
    let line = lines[li];
    if(!line.trim()){ rows.push([]); continue; }
    const out=[]; let cur=''; let i=0; let inQ=false;
    while(i<line.length){
      const ch=line[i];
      if(inQ){
        if(ch==='"'){
          if(i+1<line.length && line[i+1]==='"'){ cur+='"'; i+=2; }
          else { inQ=false; i++; }
        } else { cur+=ch; i++; }
      } else {
        if(ch==='"'){ inQ=true; i++; }
        else {
          const isDelim=(delimiter==='\t'? ch==='\t' : ch===delimiter);
          if(isDelim){ out.push(cur); cur=''; i++; }
          else { cur+=ch; i++; }
        }
      }
    }
    out.push(cur);
    rows.push(out);
  }
  return { rows, delimiter };
}
async function loadCSV(){ const res=await fetch(CSV_PATH); if(!res.ok) throw new Error('CSV nicht gefunden: '+CSV_PATH); return await res.text(); }
function isHeaderRow(cells){ const h=cells.join(' ').toLowerCase(); return /(deutsch|pinyin|wortart|hanzi|satz|id)/.test(h); }
function stripToneMarks(s){ if(!s) return s; try{ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch{ return s; } }
function formatLesson(code){ const n=parseInt(String(code||'').replace(/\D/g,''),10); if(isNaN(n)) return String(code||''); return 'L'+String(n).padStart(2,'0'); }

// ---------- Datenmodell ----------
function toCards(rows){
  const cards=[]; let start=0; if(rows.length && isHeaderRow(rows[0])) start=1;
  for(let i=start;i<rows.length;i++){
    const r=rows[i]||[]; const c=idx=> (r[idx]||'').trim();
    if((c(0)||'').includes('*')) continue; // Skip
    const de_word=c(0), py_word=c(1), pos=c(2), py_sent=c(3), de_sent=c(4), hz_word=c(5), hz_sent=c(6), id_raw=c(7);
    if(!(de_word||py_word||pos||py_sent||de_sent||hz_word||hz_sent)) continue;
    const id=id_raw || `row${i+1}`; const lesson=String(id).slice(0,3);
    cards.push({ id, lesson, word:{de:de_word,pinyin:py_word,hanzi:hz_word,pos}, sentence:{de:de_sent,pinyin:py_sent,hanzi:hz_sent} });
  }
  return cards;
}

// ---------- Lektionsfilter ----------
function buildLessonFilters(cards){
  const box=document.getElementById('lessonFilters'); box.innerHTML='';
  const lessons=Array.from(new Set(cards.map(c=>c.lesson))).filter(Boolean).sort();
  lessons.forEach(lesson=>{ const id=`lesson_${lesson}`; const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML=`<input type=\"checkbox\" id=\"${id}\" data-lesson=\"${lesson}\" checked> Lektion ${formatLesson(lesson)}`; box.appendChild(lbl); });
  const allCb=document.getElementById('lesson_all'); const cbs=lessons.map(l=>document.getElementById(`lesson_${l}`));
  function setAll(state){ allCb.checked=state; cbs.forEach(cb=>cb.checked=state); }
  function refreshAll(){ allCb.checked=cbs.every(cb=>cb.checked); }
  allCb.addEventListener('change', ()=> setAll(allCb.checked)); cbs.forEach(cb=> cb.addEventListener('change', refreshAll));
}
function getSelectedLessons(){ const nodes=document.querySelectorAll('#lessonFilters input[type=\"checkbox\"][data-lesson]'); const sel=[]; nodes.forEach(cb=>{ if(cb.checked) sel.push(cb.getAttribute('data-lesson')); }); return sel; }

// ---------- Einzelkarte ----------
let study={ pool:[], idx:0, side:'zh' };
function preparePool(allCards){
  const selectedLessons=getSelectedLessons();
  const qRaw=document.getElementById('q').value.trim(); const qNorm=stripToneMarks(qRaw).toLowerCase();
  const restrict=selectedLessons.length>0;
  let pool=allCards.filter(c=>{
    if(restrict && !selectedLessons.includes(c.lesson)) return false;
    if(!qNorm) return true;
    const hay=[c.word.hanzi,c.word.pinyin,c.word.de,c.word.pos,c.sentence.hanzi,c.sentence.pinyin,c.sentence.de].filter(Boolean).join(' ');
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });
  return pool;
}
function updateCounter(){ document.getElementById('counter').textContent = `${study.idx+1} / ${study.pool.length}`; }

function drawCurrentCard(revealed=false){
  const c=study.pool[study.idx]; if(!c) return;
  const posSpan = c.word.pos ? ` <span class=\"pos\">(${c.word.pos})</span>` : '';
  let qLines=[], aLines=[];
  if(study.side==='zh'){
    // Frage: Hanzi, Pinyin
    qLines = [ (c.word.hanzi||'') + posSpan, c.word.pinyin || '' ].filter(Boolean);
    // Antwort: Leerzeile, Satz Hanzi, Satz Pinyin
    aLines = [ '', c.sentence.hanzi || '', c.sentence.pinyin || '' ].filter((v,i)=> v!=='' || i===0);
  } else {
    // Frage: Wort Deutsch
    qLines = [ (c.word.de||'') + (c.word.pos? ` <span class=\"pos\">(${c.word.pos})</span>`:'') ].filter(Boolean);
    // Antwort: Leerzeile, Satz Deutsch
    aLines = [ '', c.sentence.de || '' ].filter((v,i)=> v!=='' || i===0);
  }
  // Render Frage (oben)
  const qBox=document.getElementById('questionLines'); qBox.innerHTML='';
  qLines.forEach((line,i)=>{ const div=document.createElement('div'); div.className='line'+(i===0?' wordline':''); div.innerHTML=line; qBox.appendChild(div); });
  // Meta
  document.getElementById('studyId').textContent = `ID: ${c.id}  •  Lektion: ${formatLesson(c.lesson)}`;
  // Render Antwort (unten)
  const aBox=document.getElementById('answerLines'); aBox.innerHTML='';
  if(revealed){ aLines.forEach(line=>{ const div=document.createElement('div'); div.className='line'; div.textContent=line; aBox.appendChild(div); }); }
  document.getElementById('revealOne').disabled = revealed;
  updateCounter();
}

function startStudy(cards){
  const pool=preparePool(cards);
  if(pool.length===0){ alert('Keine Karten in der Auswahl.'); return; }
  study.pool=pool; study.idx=0; study.side=document.getElementById('side').value;
  document.getElementById('studyView').style.display='block';
  drawCurrentCard(false);
}
function prevCard(){ if(study.pool.length===0) return; study.idx=(study.idx-1+study.pool.length)%study.pool.length; drawCurrentCard(false); }
function nextCard(){ if(study.pool.length===0) return; study.idx=(study.idx+1)%study.pool.length; drawCurrentCard(false); }

// ---------- App Start ----------
(async function(){
  try{
    const t0=performance.now();
    const text=await loadCSV();
    const {rows, delimiter}=parseCSV(text);
    const cards=toCards(rows);
    const t1=performance.now();

    document.getElementById('meta').textContent = `CSV geladen • Delimiter: \"${delimiter==='\t'?'TAB':delimiter}\" • Karten: ${cards.length} • ${Math.round(t1-t0)} ms`;

    buildLessonFilters(cards);

    const sideSel=document.getElementById('side'); const q=document.getElementById('q');
    sideSel.addEventListener('change', ()=> { study.side=sideSel.value; if(study.pool.length) drawCurrentCard(false); });
    q.addEventListener('input', ()=> {}); // kein Livefilter (Vermeidet Konflikte mit Anzeige)
    document.getElementById('flipAll').addEventListener('click', ()=>{ sideSel.value=(sideSel.value==='zh'?'de':'zh'); study.side=sideSel.value; if(study.pool.length) drawCurrentCard(false); });

    document.getElementById('startStudy').addEventListener('click', ()=> startStudy(cards));
    document.getElementById('prevOne').addEventListener('click', prevCard);
    document.getElementById('nextOne').addEventListener('click', nextCard);
    document.getElementById('revealOne').addEventListener('click', ()=> drawCurrentCard(true));

  }catch(err){
    document.getElementById('meta').textContent='Fehler: '+err.message; console.error(err);
  }
})();
