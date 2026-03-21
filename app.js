// *** Online-stabile Version (PWA deaktiviert) ***
const CSV_PATH = 'data/Long-Chinesisch_Lektionen.csv';
const OFFLINE_ENABLED = false; // bei Bedarf später wieder auf true setzen und sw.js+manifest hinzufügen

let voices = [];

// ---------------- Hilfsfunktionen ----------------
function detectDelimiter(sample){
  const first = (sample.split(/\r?\n/)[0] || '');
  const count = (s, d) => (s ? (s.split(d).length - 1) : 0);
  const cands = [ [','], [';'], ['\t'] ].map(d => ({d:d[0], n:count(first, d[0])}));
  cands.sort((a,b)=>b.n-a.n);
  return cands[0].n>0 ? cands[0].d : ';';
}
function parseCSV(text){
  const delimiter = detectDelimiter(text);
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const rows = [];
  for(const line of lines){
    if (!line) { rows.push([]); continue; }
    const out = [];
    let cur = '';
    let i = 0, inQuotes = false;
    while(i < line.length){
      const ch = line[i];
      if (inQuotes){
        if (ch === '"'){
          if (i+1 < line.length && line[i+1] === '"'){ cur += '"'; i+=2; continue; }
          inQuotes = false; i++; continue;
        }
        cur += ch; i++; continue;
      } else {
        if (ch === '"'){ inQuotes = true; i++; continue; }
        const isDelim = (delimiter === '\t' ? ch === '\t' : ch === delimiter);
        if (isDelim){ out.push(cur); cur=''; i++; continue; }
        cur += ch; i++;
      }
    }
    out.push(cur);
    rows.push(out.map(s => (s ?? '').trim()))
  }
  return { rows, delimiter };
}
function isHeaderRow(cells){
  const cols = cells.map(s => (s||'').toLowerCase());
  const keys = ['deutsch','pinyin','wortart','hanzi','satz','id'];
  let score = 0;
  for(const k of keys){ if (cols.join(' ').includes(k)) score++; }
  return score >= 3; // heuristisch
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
    const stripped = stripToneMarks(o[i]);
    if (stripped == null) continue;
    for (let k=0; k<stripped.length; k++){ norm += stripped[k]; map.push(i); }
  }
  const idx = norm.toLowerCase().indexOf(qNorm);
  if (idx < 0) return originalText;
  const endIdx = idx + qNorm.length - 1;
  const startOrig = map[idx];
  const endOrig = map[endIdx] + 1;
  return (o.slice(0, startOrig) + '<mark>' + o.slice(startOrig, endOrig) + '</mark>' + o.slice(endOrig));
}

// ---------------- TTS ----------------
function loadVoices(){
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => { voices = speechSynthesis.getVoices(); };
}
function getVoicesForLang(lang){
  const prefix = (lang === 'zh') ? 'zh' : 'de';
  return voices.filter(v => (v.lang || '').toLowerCase().startsWith(prefix));
}
function getTTSSettings(lang){
  const pref = (k, def) => { const v = localStorage.getItem(k); return (v==null||v==='') ? def : v; };
  const pitch = parseFloat(pref(`tts_pitch_${lang}`, '1.0'));
  const rate = parseFloat(pref(`tts_rate_${lang}`, '0.8'));
  return { voiceName: pref(`tts_voice_${lang}`, ''), pitch, rate };
}
function saveTTSSettings(lang){
  const voice = document.getElementById('voiceSelect').value || '';
  const pitch = document.getElementById('pitchSlider').value;
  const rate = document.getElementById('rateSlider').value;
  localStorage.setItem(`tts_voice_${lang}`, voice);
  localStorage.setItem(`tts_pitch_${lang}`, pitch);
  localStorage.setItem(`tts_rate_${lang}`, rate);
}
function updateTTSModal(lang){
  const select = document.getElementById('voiceSelect');
  const list = getVoicesForLang(lang);
  select.innerHTML = '';
  if (list.length === 0){
    select.innerHTML = '<option value="">Keine Stimmen verfügbar (lade Seite neu)</option>';
  } else {
    for(const v of list){
      const opt = document.createElement('option');
      opt.value = v.name; opt.textContent = `${v.name} (${v.lang})`; select.appendChild(opt);
    }
  }
  const s = getTTSSettings(lang);
  if (s.voiceName) select.value = s.voiceName; else if (list[0]) select.value = list[0].name;
  document.getElementById('pitchSlider').value = s.pitch; document.getElementById('pitchValue').textContent = s.pitch;
  document.getElementById('rateSlider').value = s.rate; document.getElementById('rateValue').textContent = s.rate;
}
function showTTSSettings(){ loadVoices(); updateTTSModal(document.getElementById('side').value); document.getElementById('ttsModal').style.display='flex'; }
function testVoice(){
  if (!('speechSynthesis' in window)) return;
  const lang = document.getElementById('side').value;
  const u = new SpeechSynthesisUtterance(lang==='zh'?'Nǐ hǎo':'Hallo');
  u.lang = (lang==='zh')?'zh-CN':'de-DE';
  const s = getTTSSettings(lang);
  const list = getVoicesForLang(lang);
  if (s.voiceName){ const v = list.find(x=>x.name===s.voiceName); if (v) u.voice = v; }
  u.pitch = s.pitch; u.rate = s.rate; u.volume = 0.6; speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function speak(text, lang, volume=1.0){
  if (!text || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = (lang==='zh')?'zh-CN':'de-DE';
  const s = getTTSSettings(lang); const list = getVoicesForLang(lang);
  if (s.voiceName){ const v = list.find(x=>x.name===s.voiceName); if (v) u.voice = v; }
  u.pitch = s.pitch; u.rate = s.rate; u.volume = volume;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function primeTTS(initialLang){
  if (!('speechSynthesis' in window)) return;
  setTimeout(()=>{ const text = initialLang==='zh'?'Nǐ hǎo':'Hallo'; speak(text, initialLang, 0.3); }, 500);
}
function speakCard(c, current){
  let wordText, sentenceText, lang;
  if (current==='zh'){ wordText = c.word.hanzi||''; sentenceText = c.sentence.hanzi||''; lang='zh'; }
  else { wordText = c.word.de; sentenceText = c.sentence.de; lang='de'; }
  if (!('speechSynthesis' in window)) return;
  const s = getTTSSettings(lang); const list = getVoicesForLang(lang);
  const sel = s.voiceName ? list.find(v=>v.name===s.voiceName) : null;
  if (wordText){ setTimeout(()=>{ const u = new SpeechSynthesisUtterance(wordText); u.lang=(lang==='zh')?'zh-CN':'de-DE'; if (sel) u.voice=sel; u.pitch=s.pitch; u.rate=s.rate; u.volume=1.0; u.onend=()=>{ if (sentenceText) setTimeout(()=>speak(sentenceText, lang), 200); }; speechSynthesis.cancel(); speechSynthesis.speak(u); }, 200); }
  else if (sentenceText){ setTimeout(()=>speak(sentenceText, lang), 200); }
}

// ---------------- Datenaufbereitung ----------------
function toCards(rows){
  const cards = [];
  let start = 0;
  if (rows.length && isHeaderRow(rows[0])) start = 1;
  for (let i=start; i<rows.length; i++){
    const r = rows[i] || [];
    const c = idx => (r[idx] ?? '').trim();
    const firstCell = c(0);
    if (firstCell.includes('*')) continue; // Skip-Markierung
    const de_word = c(0);
    const py_word = c(1);
    const pos     = c(2);
    const py_sent = c(3);
    const de_sent = c(4);
    const hz_word = c(5);
    const hz_sent = c(6);
    const id_raw  = c(7);
    const lesson_raw = c(8);
    if (!(de_word || py_word || pos || py_sent || de_sent || hz_word || hz_sent)) continue;
    const id = id_raw || `row${i+1}`;
    const lesson = lesson_raw || `Lektion ${i - start + 1}`;
    cards.push({ id, lesson, word:{de:de_word,pinyin:py_word,hanzi:hz_word,pos}, sentence:{de:de_sent,pinyin:py_sent,hanzi:hz_sent} });
  }
  return cards;
}

// ---------------- UI ----------------
function updateLanguageDisplay(){
  const side = document.getElementById('side').value;
  const sourceEl = document.getElementById('sourceLang');
  const targetEl = document.getElementById('targetLang');
  if (side==='zh'){ sourceEl.innerHTML = '🇨🇳 Chinesisch'; targetEl.innerHTML='🇩🇪 Deutsch'; }
  else { sourceEl.innerHTML='🇩🇪 Deutsch'; targetEl.innerHTML='🇨🇳 Chinesisch'; }
}
function buildLessonFilters(cards){
  const box = document.getElementById('lessonFilters'); box.innerHTML='';
  const lessons = []; const seen = new Set();
  for(const c of cards){ if (c.lesson && !seen.has(c.lesson)){ seen.add(c.lesson); lessons.push(c.lesson); } }
  for(const lesson of lessons){
    const id = `lesson_${lesson.replace(/\s+/g,'_')}`;
    const lbl = document.createElement('label');
    lbl.className = 'chip';
    lbl.innerHTML = `<input type="checkbox" id="${id}" data-lesson="${lesson}" checked> ${lesson}`;
    box.appendChild(lbl);
  }
  const allCb = document.getElementById('lesson_all');
  const cbs = lessons.map(l => document.getElementById(`lesson_${l.replace(/\s+/g,'_')}`));
  function setAll(state){ allCb.checked = state; cbs.forEach(cb=>cb.checked=state); }
  function refreshAll(){ allCb.checked = cbs.every(cb=>cb.checked); }
  allCb.addEventListener('change', ()=> setAll(allCb.checked));
  cbs.forEach(cb => cb.addEventListener('change', refreshAll));
}
function getSelectedLessons(){
  const chips = document.querySelectorAll('#lessonFilters input[type="checkbox"][data-lesson]');
  const selected = []; chips.forEach(cb => { if (cb.checked) selected.push(cb.getAttribute('data-lesson')); });
  return selected;
}
function getSearchHaystack(card, side){
  const fields = [card.word.pos].filter(Boolean);
  if (side==='zh'){ fields.push(card.word.hanzi, card.word.pinyin, card.sentence.hanzi, card.sentence.pinyin); }
  else { fields.push(card.word.de, card.sentence.de); }
  return fields.filter(Boolean).join(' ');
}
function render(cards){
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const sideSel = document.getElementById('side');
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const selectedLessons = getSelectedLessons();
  const restrict = selectedLessons.length > 0; // wenn keine Chips, dann false
  const currentSide = sideSel.value;
  const filtered = cards.filter(c => {
    if (restrict && !selectedLessons.includes(c.lesson)) return false;
    if (!qNorm) return true;
    const hay = getSearchHaystack(c, currentSide);
    return stripToneMarks(hay).toLowerCase().includes(qNorm);
  });
  document.getElementById('count').textContent = `${filtered.length} Karten`;
  grid.innerHTML = '';
  if (filtered.length === 0){ empty.style.display='block'; return; } else { empty.style.display='none'; }

  filtered.forEach(c => {
    const el = document.createElement('div'); el.className = 'card';
    const idDiv = document.createElement('div'); idDiv.className='id'; idDiv.textContent = `ID: ${c.id}`;
    const linesDiv = document.createElement('div'); linesDiv.className='lines';
    let current = sideSel.value;
    function makeLines(){
      const posSpan = c.word.pos ? `<span class="pos">(${c.word.pos})</span>` : '';
      if (current==='zh'){
        const l1 = c.word.hanzi || '';
        const l2 = (c.word.pinyin || '') + (c.word.pos ? ' ' + posSpan : '');
        const l3 = c.sentence.hanzi || '';
        const l4 = c.sentence.pinyin || '';
        return [l1,l2,l3,l4].filter(Boolean);
      } else {
        const l1 = c.word.de || '';
        const l2 = posSpan;
        const l3 = c.sentence.de || '';
        return [l1,l2,l3].filter(Boolean);
      }
    }
    function draw(){
      linesDiv.innerHTML=''; const lines = makeLines();
      lines.forEach((line, idx) => { const div = document.createElement('div'); let cls='line'; if (idx===0){ cls+=' wordline'; if (current==='zh') cls+=' zh'; } div.className=cls; div.innerHTML = highlightToneInsensitive(line, qRaw); linesDiv.appendChild(div); });
    }
    draw();
    const actions = document.createElement('div'); actions.className='actions';
    const flip = document.createElement('button'); flip.className='btn'; flip.textContent='Umdrehen'; flip.addEventListener('click', ()=>{ current = (current==='zh'?'de':'zh'); draw(); });
    const speakBtn = document.createElement('button'); speakBtn.className='speak-btn'; speakBtn.innerHTML='🔊'; speakBtn.title='Vorlesen (Wort, dann Satz)'; speakBtn.addEventListener('click', ()=> speakCard(c, current));
    actions.appendChild(flip); actions.appendChild(speakBtn);
    el.appendChild(idDiv); el.appendChild(linesDiv); el.appendChild(actions); grid.appendChild(el);
  });
}

// ---------------- Lernmodus ----------------
let study = { queue:[], idx:0, side:'zh' };
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function enterStudy(cards){
  const selectedLessons = getSelectedLessons();
  const qRaw = document.getElementById('q').value.trim();
  const qNorm = stripToneMarks(qRaw).toLowerCase();
  const restrict = selectedLessons.length>0;
  const currentSide = document.getElementById('side').value;
  let pool = cards.filter(c=>{ if(restrict && !selectedLessons.includes(c.lesson)) return false; if(!qNorm) return true; const hay = getSearchHaystack(c, currentSide); return stripToneMarks(hay).toLowerCase().includes(qNorm); });
  pool = shuffleArray(pool.slice()); if (pool.length===0){ alert('Keine Karten in der Auswahl.'); return; }
  study.queue = pool; study.idx = 0; study.side = currentSide;
  document.getElementById('listView').style.display='none'; document.getElementById('studyView').style.display='block'; drawStudy();
}
function exitStudy(){ document.getElementById('studyView').style.display='none'; document.getElementById('listView').style.display='block'; }
function drawStudy(){
  const c = study.queue[study.idx];
  document.getElementById('studyId').textContent = `ID: ${c.id}`;
  const linesEl = document.getElementById('studyLines'); linesEl.innerHTML='';
  const posSpan = c.word.pos ? ` <span class="pos">(${c.word.pos})</span>` : '';
  let lines;
  if (study.side==='zh'){
    const l1 = c.word.hanzi || '';
    const l2 = (c.word.pinyin || '') + (c.word.pos ? ' ' + posSpan : '');
    const l3 = c.sentence.hanzi || '';
    const l4 = c.sentence.pinyin || '';
    lines = [l1,l2,l3,l4].filter(Boolean);
  } else {
    const l1 = c.word.de || '';
    const l2 = posSpan;
    const l3 = c.sentence.de || '';
    lines = [l1,l2,l3].filter(Boolean);
  }
  lines.forEach((line, i)=>{ const div=document.createElement('div'); let cls='line' + (i===0 ? ' wordline' : ''); if (study.side==='zh' && i===0) cls+=' zh'; div.className=cls; div.innerHTML=line; linesEl.appendChild(div); });
  const actionsEl = document.getElementById('studyActions'); actionsEl.innerHTML='';
  const flipBtn = document.createElement('button'); flipBtn.className='btn'; flipBtn.textContent='Umdrehen'; flipBtn.addEventListener('click', flipStudy); actionsEl.appendChild(flipBtn);
  const nextBtn = document.createElement('button'); nextBtn.className='btn'; nextBtn.textContent='Nächste Karte'; nextBtn.addEventListener('click', nextStudy); actionsEl.appendChild(nextBtn);
  const speakBtn = document.createElement('button'); speakBtn.className='speak-btn'; speakBtn.innerHTML='🔊'; speakBtn.title='Vorlesen (Wort, dann Satz)'; speakBtn.addEventListener('click', ()=> speakCard(c, study.side)); actionsEl.appendChild(speakBtn);
  document.getElementById('counter').textContent = `${study.idx+1} / ${study.queue.length}`;
}
function nextStudy(){ if(study.queue.length===0) return; study.idx = (study.idx + 1) % study.queue.length; drawStudy(); }
function flipStudy(){ study.side = (study.side==='zh' ? 'de' : 'zh'); drawStudy(); }
function reshuffleStudy(){ if(study.queue.length<=1) return; const current = study.queue[study.idx]; shuffleArray(study.queue); const idx = study.queue.findIndex(x=>x.id===current.id); if(idx>0){ const [it]=study.queue.splice(idx,1); study.queue.unshift(it); study.idx=0; } drawStudy(); }

// ---------------- CSV Laden + App Start ----------------
async function loadCSV(){
  const res = await fetch(CSV_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV nicht gefunden (${res.status})`);
  return await res.text();
}
(async function(){
  // SW absichtlich deaktiviert, um Online-Betrieb zu stabilisieren
  if (OFFLINE_ENABLED && 'serviceWorker' in navigator && location.protocol.startsWith('http')){
    try { await navigator.serviceWorker.register('sw.js'); } catch(e){ console.log('SW registration failed:', e); }
  }
  loadVoices();
  try{
    const t0 = performance.now();
    const text = await loadCSV();
    const { rows, delimiter } = parseCSV(text);
    const cards = toCards(rows);
    const t1 = performance.now();
    const meta = document.getElementById('meta');
    buildLessonFilters(cards);
    render(cards);
    updateLanguageDisplay();
    primeTTS('zh');

    // Events
    document.getElementById('switchDir').addEventListener('click', ()=>{ const side = document.getElementById('side'); side.value = (side.value==='zh'?'de':'zh'); updateLanguageDisplay(); render(cards); if (document.getElementById('ttsModal').style.display !== 'none'){ updateTTSModal(side.value); } });
    document.getElementById('ttsSettingsBtn').addEventListener('click', showTTSSettings);
    document.getElementById('closeTTSModal').addEventListener('click', ()=>{ document.getElementById('ttsModal').style.display='none'; });
    document.getElementById('testVoiceBtn').addEventListener('click', testVoice);
    document.getElementById('saveTTSSettings').addEventListener('click', ()=>{ const lang = document.getElementById('side').value; saveTTSSettings(lang); document.getElementById('ttsModal').style.display='none'; });
    document.getElementById('pitchSlider').addEventListener('input', (e)=>{ document.getElementById('pitchValue').textContent = e.target.value; });
    document.getElementById('rateSlider').addEventListener('input', (e)=>{ document.getElementById('rateValue').textContent = e.target.value; });
    document.getElementById('q').addEventListener('input', ()=> render(cards));
    document.getElementById('lesson_all').addEventListener('change', ()=> render(cards));
    document.getElementById('lessonFilters').addEventListener('change', ()=> render(cards));
    document.getElementById('startStudy').addEventListener('click', ()=> enterStudy(cards));
    document.getElementById('exitStudy').addEventListener('click', ()=> exitStudy());
    document.getElementById('reshuffle').addEventListener('click', ()=> reshuffleStudy());
    document.getElementById('ttsModal').addEventListener('click', (e)=>{ if (e.target.id==='ttsModal'){ e.target.style.display='none'; } });
  } catch(err){
    document.getElementById('meta').textContent = 'Fehler: ' + err.message + '. Prüfe CSV-Pfad und GitHub Pages Pfad.';
    console.error(err);
    const grid = document.getElementById('grid'); grid.innerHTML = '<div class="empty">Konnte Daten nicht laden. Prüfe, ob <code>data/Long-Chinesisch_Lektionen.csv</code> im Repo vorhanden ist.</div>';
  }
})();
