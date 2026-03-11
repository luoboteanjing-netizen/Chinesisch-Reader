/* r17.2: Single-sheet parser (sheet #0) with robust marker parsing
   Rules:
   - Only first sheet is read
   - Start at row 2 (1-based)
   - New lesson when first cell starts with '*' (asterisk); anything after first '*' becomes the name (trim all kinds of spaces)
   - The marker row is NOT added as a card
   - Skip empty rows; after >10 consecutive empty rows, stop
   - Column mapping identical to old version:
       COL_WORD={de:1, py:2, zh:6}; COL_SENT={de:5, py:4, zh:7}; COL_POS=3 (1-based)
*/
let EXCEL_URL = './data/Long-Chinesisch_Lektionen.xlsx';
const COL_WORD={de:1,py:2,zh:6};
const COL_SENT={de:5,py:4,zh:7};
const COL_POS=3;
const START_ROW_1BASED=2; // Zeile 2
const MAX_EMPTY_RUN=10;

const LS_KEYS={ settings:'fc_settings_v1', progress:'fc_progress_v1' };

const state={ mode:'de2zh', order:'random',
  rateDe:0.95, pitchDe:1.0, rateZh:0.95, pitchZh:1.0,
  lessons:new Map(),
  selectedLessons:new Set(), pool:[], idx:null, current:null,
  voices:[], browserVoice:{ zh:null, de:null }, voicePanelTarget:'de',
  autoplay:{ on:false, timers:[], gapMs:800 },
  settings:{ mode:'de2zh', order:'random', rateDe:0.95, pitchDe:1.0, rateZh:0.95, pitchZh:1.0, lessons:[], browserVoiceZh:null, browserVoiceDe:null, autoplayGap:800 },
  session:{ total:0, done:0, known:0, unsure:0, unknown:0, ttrSum:0, ttrCount:0 },
  startedAt:null, revealedAt:null,
  progress:{ version:'v1', cards:{}, byLesson:{} },
  wakeLock:null,
  trainingOn:false
};

const $=s=>document.querySelector(s);

function saveSettings(){ try{ localStorage.setItem(LS_KEYS.settings, JSON.stringify(state.settings)); }catch(e){} }
function loadSettings(){ try{ const s=JSON.parse(localStorage.getItem(LS_KEYS.settings)||'null'); if(s){ state.settings=Object.assign(state.settings,s); } }catch(e){} }
function saveProgress(){ try{ localStorage.setItem(LS_KEYS.progress, JSON.stringify(state.progress)); }catch(e){} }
function loadProgress(){ try{ const p=JSON.parse(localStorage.getItem(LS_KEYS.progress)||'null'); if(p && p.version==='v1'){ state.progress=p; } }catch(e){} }
function ensureBL(lessonKey){ const bl=state.progress.byLesson; bl[lessonKey]=bl[lessonKey]||{ known:0, unknown:0 }; return bl[lessonKey]; }

function isCellEmpty(v){ if(v==null) return true; const s=String(v).replace(/ /g,' ').trim(); return s.length===0; }
function isRowEmpty(row){ if(!row || row.length===0) return true; for(const v of row){ if(!isCellEmpty(v)) return false; } return true; }

function getCell(row, idx1){ // 1-based -> trimmed string, NBSP handled
  const i = idx1-1; const v = (row && row.length>i ? row[i] : '');
  return String(v == null ? '' : v).replace(/ /g,' ').trim();
}

function extractLessonName(raw, idx){
  // raw already normalized to string, NBSP converted to space, trimmed
  if(!raw) return `Lektion ${idx}`;
  if(!raw.startsWith('*')) return null; // not a marker line
  let name = raw.slice(1);                 // remove first '*'
  name = name.replace(/^[\s ]+/, ''); // trim any leading spaces (space, tab, NBSP)
  if(!name) name = `Lektion ${idx}`;
  return name;
}

async function parseExcelBuffer(buf){ const wb=XLSX.read(buf,{type:'array'}); state.lessons.clear();
  const shName = wb.SheetNames[0]; // Only first sheet
  if(!shName){ alert('Excel enthält kein Blatt.'); return; }
  const sh = wb.Sheets[shName];
  const rows = XLSX.utils.sheet_to_json(sh,{header:1,blankrows:false});

  let lessonIdx=0; let currentKey=null; let current=null;
  let emptyRun=0;
  const startRow = START_ROW_1BASED-1; // zero-based

  for(let r=startRow; r<rows.length; r++){
    const row = rows[r]||[];

    if(isRowEmpty(row)){
      emptyRun++; if(emptyRun>MAX_EMPTY_RUN) break; else continue;
    } else emptyRun=0;

    const c1raw = row[0];
    const c1 = String(c1raw==null? '': c1raw).replace(/ /g,' ').trim();

    const maybeName = extractLessonName(c1, lessonIdx+1);
    if(maybeName!==null){
      // finalize previous
      if(currentKey && current && current.entries.length>0){ state.lessons.set(currentKey, current); }
      lessonIdx++; currentKey=String(lessonIdx);
      current={ displayName: maybeName, entries:[] };
      continue; // marker row is not a card
    }

    // Build a card
    const w_de = getCell(row, COL_WORD.de);
    const w_py = getCell(row, COL_WORD.py);
    const w_zh = getCell(row, COL_WORD.zh);

    const s_py = getCell(row, COL_SENT.py);
    const s_de = getCell(row, COL_SENT.de);
    const s_zh = getCell(row, COL_SENT.zh);

    const pos  = getCell(row, COL_POS);

    if(!(w_de || w_zh || s_de || s_zh)) continue; // skip filler lines

    if(!currentKey){ // no marker yet -> create default
      lessonIdx++; currentKey=String(lessonIdx); current={ displayName:`Lektion ${lessonIdx}`, entries:[] };
    }

    current.entries.push({ word:{de:w_de, py:w_py, zh:w_zh}, sent:{de:s_de, py:s_py, zh:s_zh}, pos });
  }
  if(currentKey && current && current.entries.length>0){ state.lessons.set(currentKey, current); }

  populateLessonSelect(); syncUISelectionWithSettings();
}

async function loadExcel(){ try{ const res=await fetch(EXCEL_URL,{cache:'no-store'}); const buf=await res.arrayBuffer(); await parseExcelBuffer(buf); }catch(e){ console.error('Excel konnte nicht geladen werden:',e); alert('Konnte Datei nicht laden.'); } }

function populateLessonSelect(){ const sel=$('#lessonSelect'); if(!sel) return; sel.innerHTML=''; const keys=Array.from(state.lessons.keys()).map(k=>parseInt(k,10)).sort((a,b)=>a-b);
  for(const k of keys){ const key=String(k); const lesson=state.lessons.get(key); if(!lesson) continue; const total=(lesson.entries||[]).length; const bl=state.progress.byLesson?.[key]||{known:0,unknown:0}; const known=bl.known||0, unknown=bl.unknown||0; const name = lesson.displayName || `Lektion ${k}`;
    const opt=document.createElement('option'); opt.value=key; opt.textContent=`${name} (${total}) · Richtig ${known} · Falsch ${unknown}`; if(state.settings.lessons?.includes(key)) opt.selected=true; sel.appendChild(opt); } }

function resetSessionStats(){ state.session={ total:state.pool.length, done:0, known:0, unsure:0, unknown:0, ttrSum:0, ttrCount:0 }; renderSessionStats(); }

function gatherPoolFromSettings(){ state.selectedLessons.clear(); (state.settings.lessons||[]).forEach(id=> state.selectedLessons.add(id)); const out=[]; for(const k of state.selectedLessons){ const obj=state.lessons.get(k); if(obj && obj.entries) out.push(...obj.entries); } state.pool=out; state.idx=null; resetSessionStats(); }
function gatherPool(){ const out=[]; for(const k of state.selectedLessons){ const obj=state.lessons.get(k); if(obj && obj.entries) out.push(...obj.entries); } state.pool=out; state.idx=null; resetSessionStats(); }

function setCard(entry){ state.current=entry; $('#solBox').classList.add('masked'); state.startedAt=Date.now(); state.revealedAt=null; if(state.mode==='zh2de'){ $('#promptWord').innerHTML=(entry.word.zh||'—'); $('#promptWordSub').innerHTML=formatPinyinAndPos(entry.word.py, entry.pos); $('#promptSent').innerHTML=formatZh(entry.sent.zh, entry.sent.py); $('#solWord').textContent=entry.word.de||'—'; $('#solSent').textContent=entry.sent.de||'—'; } else { $('#promptWord').textContent=entry.word.de||'—'; $('#promptWordSub').textContent=entry.pos?entry.pos:''; $('#promptSent').textContent=entry.sent.de||'—'; $('#solWord').innerHTML=formatZh(entry.word.zh, entry.word.py); $('#solSent').innerHTML=formatZh(entry.sent.zh, entry.sent.py); } $('#btnNext').disabled=false; $('#btnReveal').disabled=false; $('#btnPlayQ').disabled=false; $('#btnPlayA').disabled=false; disableRating(); renderModeUI(); }

function nextCard(){ if(!state.pool.length) return alert('Bitte Lektionen wählen und übernehmen.'); if(state.order==='seq'){ if(state.idx==null) state.idx=0; else state.idx=(state.idx+1)%state.pool.length; setCard(state.pool[state.idx]); } else { const e=state.pool[Math.floor(Math.random()*state.pool.length)]; setCard(e); } }
function prevCard(){ if(state.order!=='seq' || !state.pool.length) return; if(state.idx==null) state.idx=0; else state.idx=(state.idx-1+state.pool.length)%state.pool.length; setCard(state.pool[state.idx]); }

function scrollToTopHard(){ window.scrollTo(0,0); document.body.scrollTop=0; document.documentElement.scrollTop=0; setTimeout(()=>{ window.scrollTo(0,0); document.body.scrollTop=0; document.documentElement.scrollTop=0; }, 60); }
function scrollToPageEnd(){ try{ window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }catch(e){ window.scrollTo(0, document.body.scrollHeight); } }

function startTraining(){ if(!state.trainingOn){ const sel=$('#lessonSelect'); state.selectedLessons.clear(); const picked=[]; for(const o of sel.selectedOptions){ state.selectedLessons.add(o.value); picked.push(o.value); } state.settings.lessons=picked; saveSettings(); gatherPool(); if(!state.pool.length){ alert('Bitte zuerst Lektion(en) übernehmen.'); return; } state.idx = (state.order==='seq') ? 0 : null; if(state.order==='seq') setCard(state.pool[state.idx]); else setCard(state.pool[Math.floor(Math.random()*state.pool.length)]); state.trainingOn=true; updateTrainingBtn(); scrollToPageEnd(); setTimeout(scrollToPageEnd, 60); } else { stopTraining(); } }

function stopTraining(){ state.trainingOn=false; updateTrainingBtn(); $('#btnPrev').disabled=true; $('#btnReveal').disabled=true; $('#btnNext').disabled=true; $('#btnPlayQ').disabled=true; $('#btnPlayA').disabled=true; disableRating(); $('#solBox').classList.add('masked'); $('#promptWord').textContent='—'; $('#promptWordSub').innerHTML='&nbsp;'; $('#promptSent').textContent='—'; $('#solWord').textContent='—'; $('#solSent').textContent='—'; scrollToTopHard(); }
function updateTrainingBtn(){ const b=$('#btnStart'); if(!b) return; b.textContent = state.trainingOn? 'Training stoppen ■' : 'Training starten ▶'; }

function doReveal(){ $('#solBox').classList.remove('masked'); state.revealedAt=Date.now(); const ttr=state.revealedAt-(state.startedAt||state.revealedAt); if(ttr>0){ state.session.ttrSum+=ttr; state.session.ttrCount+=1; } enableRating(); renderSessionStats(); }

function enableRating(){ $('#btnRateKnown').disabled=false; $('#btnRateUnsure').disabled=false; $('#btnRateUnknown').disabled=false; }
function disableRating(){ $('#btnRateKnown').disabled=true; $('#btnRateUnsure').disabled=true; $('#btnRateUnknown').disabled=true; }

function rate(mark){ if(!state.current) return; state.session.done += 1; if(mark==='known') state.session.known += 1; else if(mark==='unsure') state.session.unsure += 1; else state.session.unknown += 1; renderSessionStats(); try{ const lessonKey = findLessonKeyOfCurrent(); if(lessonKey){ const rec=ensureBL(lessonKey); if(mark==='known') rec.known += 1; else if(mark==='unknown') rec.unknown += 1; saveProgress(); populateLessonSelect(); } }catch(e){} disableRating(); nextCard(); }

function findLessonKeyOfCurrent(){ for(const [k,obj] of state.lessons.entries()){ const arr=obj?.entries||[]; if(arr.includes(state.current)) return k; } return null; }

function formatZh(hz,py){ const h=(hz||'').trim(); const p=(py||'').trim(); return p? `${h}<br><span class="py">${p}</span>` : (h||'—'); }
function formatPinyinAndPos(py,pos){ const a=(py||'').trim(); const b=(pos||'').trim(); if(a&&b) return `<span class="py">${a}</span><br><span class="prompt small" style="display:inline-block;margin-top:6px;">${b}</span>`; if(a) return `<span class="py">${a}</span>`; if(b) return `<span class="prompt small" style="display:inline-block;margin-top:6px;">${b}</span>`; return ''; }

const START_DELAY_MS=150; const BETWEEN_DELAY_MS=800; let _ttsPrimed=false; function ttsPrime(cb){ if(_ttsPrimed){ cb(); return; } setTimeout(()=>{ _ttsPrimed=true; cb(); }, START_DELAY_MS); }
function buildUtterance(text, langKey){ const lang=(langKey==='zh')?'zh-CN':'de-DE'; const u=new SpeechSynthesisUtterance(text||''); u.lang=lang; if(langKey==='zh'){ u.rate=state.rateZh; u.pitch=state.pitchZh; } else { u.rate=state.rateDe; u.pitch=state.pitchDe; } const chosen=(langKey==='zh')?state.browserVoice.zh:state.browserVoice.de; if(chosen) u.voice=chosen; else { const L=(langKey==='zh')?'zh':'de'; const cand=(state.voices||[]).filter(v=>(v.lang||'').toLowerCase().startsWith(L)); u.voice=cand.find(v=>v.default)||cand[0]||null; } return u; }
function ttsSpeak(text, langKey){ const u=buildUtterance(text, langKey); speechSynthesis.speak(u); return u; }
function playSequence(firstText, firstLangKey, secondText, secondLangKey){ ttsPrime(()=>{ try{ speechSynthesis.cancel(); }catch(e){}; ttsSpeak(firstText, firstLangKey); setTimeout(()=>{ ttsSpeak(secondText, secondLangKey); }, BETWEEN_DELAY_MS); }); }
function playQuestion(){ if(!state.current) return; if(state.mode==='de2zh'){ playSequence(state.current.word.de,'de', state.current.sent.de,'de'); } else { playSequence(state.current.word.zh,'zh', state.current.sent.zh,'zh'); } }
function playAnswer(){ if(!state.current) return; if(state.mode==='de2zh'){ playSequence(state.current.word.zh,'zh', state.current.sent.zh,'zh'); } else { playSequence(state.current.word.de,'de', state.current.sent.de,'de'); } }

function setAutoplay(on){ state.autoplay.on=on; if(!on){ try{ speechSynthesis.cancel(); }catch(e){} state.autoplay.timers.forEach(id=>clearTimeout(id)); state.autoplay.timers=[]; releaseWakeLock(); } updateAutoplayBtn(); }
function updateAutoplayBtn(){ const b=$('#btnAutoplay'); if(!b) return; b.textContent = state.autoplay.on? 'Autoplay ■ Stop' : 'Autoplay ▶︎'; }
function speakPair(word, sent, langKey, done){ if(!state.autoplay.on) return; const u1 = buildUtterance(word, langKey); u1.onend = ()=>{ if(!state.autoplay.on) return; const t=setTimeout(()=>{ if(!state.autoplay.on) return; const u2=buildUtterance(sent, langKey); u2.onend=()=>{ if(!state.autoplay.on) return; done && done(); }; speechSynthesis.speak(u2); }, BETWEEN_DELAY_MS); state.autoplay.timers.push(t); }; speechSynthesis.speak(u1); }
function ensurePoolForAutoplay(){ if(state.pool.length>0) return true; if(!state.settings.lessons || state.settings.lessons.length===0){ const sel=$('#lessonSelect'); const picked=[]; for(const o of sel?.selectedOptions||[]){ picked.push(o.value); } if(picked.length>0){ state.settings.lessons=picked; saveSettings(); } }
  gatherPoolFromSettings(); if(!state.pool.length){ alert('Bitte Lektion(en) wählen oder übernehmen, bevor Autoplay startet.'); return false; } if(state.order==='seq'){ state.idx=0; setCard(state.pool[state.idx]); } else { setCard(state.pool[Math.floor(Math.random()*state.pool.length)]); } return true; }
function autoplayStep(){ if(!state.autoplay.on) return; if(!ensurePoolForAutoplay()) { setAutoplay(false); return; } $('#solBox').classList.add('masked'); disableRating(); const qLang = (state.mode==='de2zh')? 'de':'zh'; const aLang = (state.mode==='de2zh')? 'zh':'de'; ttsPrime(()=>{ try{ speechSynthesis.cancel(); }catch(e){}; speakPair(state.current.word[qLang], state.current.sent[qLang], qLang, ()=>{ if(!state.autoplay.on) return; $('#solBox').classList.remove('masked'); speakPair(state.current.word[aLang], state.current.sent[aLang], aLang, ()=>{ if(!state.autoplay.on) return; const t=setTimeout(()=>{ if(!state.autoplay.on) return; if(state.order==='seq'){ if(state.idx==null) state.idx=0; else state.idx=(state.idx+1)%state.pool.length; setCard(state.pool[state.idx]); } else { setCard(state.pool[Math.floor(Math.random()*state.pool.length)]); } autoplayStep(); }, state.autoplay.gapMs); state.autoplay.timers.push(t); }); }); }); }
function toggleAutoplay(){ if(!state.autoplay.on){ if(!ensurePoolForAutoplay()) return; setAutoplay(true); requestWakeLock(); scrollToPageEnd(); setTimeout(scrollToPageEnd, 60); autoplayStep(); } else { setAutoplay(false); } }
function stopAutoplayOnUserAction(){ if(state.autoplay.on) setAutoplay(false); }

// Wake Lock API (screen)
async function requestWakeLock(){ try{ if('wakeLock' in navigator && !state.wakeLock){ state.wakeLock = await navigator.wakeLock.request('screen'); state.wakeLock.addEventListener?.('release', ()=>{ state.wakeLock=null; }); document.addEventListener('visibilitychange', onVisibilityChange, { passive:true }); } }catch(e){ /* ignore */ } }
function onVisibilityChange(){ if(document.visibilityState==='visible' && state.autoplay.on && !state.wakeLock){ requestWakeLock(); } }
function releaseWakeLock(){ try{ if(state.wakeLock){ state.wakeLock.release?.(); } }catch(e){} finally{ state.wakeLock=null; document.removeEventListener('visibilitychange', onVisibilityChange); }

function renderSessionStats(){ const s=state.session; const avg=s.ttrCount? (s.ttrSum/s.ttrCount/1000).toFixed(1) : '—'; const acc=s.done? Math.round(100*s.known/s.done)+'%' : '—'; const el=$('#sessionStats'); if(el) el.textContent=`Karten: ${s.done}/${s.total} · Korrekt: ${acc} · Ø Aufdeck‑Zeit: ${avg}s`; }
function renderModeUI(){ const left=$('#modeLeft'), right=$('#modeRight'); if(left&&right){ if(state.mode==='de2zh'){ left.textContent='🇩🇪 DE'; right.textContent='🇨🇳 ZH'; } else { left.textContent='🇨🇳 ZH'; right.textContent='🇩🇪 DE'; } } const b=$('#btnOrderToggle'); if(b) b.textContent = 'Reihenfolge: ' + (state.order==='seq' ? 'Sequenziell' : 'Zufällig'); updateTrainingBtn(); }

window.addEventListener('DOMContentLoaded', ()=>{
  loadSettings(); loadProgress();
  state.mode = state.settings.mode || 'de2zh';
  state.order = state.settings.order || 'random';
  state.autoplay.gapMs = typeof state.settings.autoplayGap==='number' ? state.settings.autoplayGap : 800;
  state.rateDe = typeof state.settings.rateDe==='number'? state.settings.rateDe : 0.95;
  state.pitchDe = typeof state.settings.pitchDe==='number'? state.settings.pitchDe : 1.0;
  state.rateZh = typeof state.settings.rateZh==='number'? state.settings.rateZh : 0.95;
  state.pitchZh = typeof state.settings.pitchZh==='number'? state.settings.pitchZh : 1.0;
  renderModeUI(); updateAutoplayBtn();

  const gapSec = (state.autoplay.gapMs/1000).toFixed(1); const gr=$('#gapRange'), gv=$('#gapVal'); if(gr&&gv){ gr.value = gapSec; gv.textContent = `(${gapSec} s)`; }
  const setVal=(id,valId,val)=>{ const el=$(id), sp=$(valId); if(el){ el.value=String(val); if(sp) sp.textContent=`(${val.toFixed(2)})`; } };
  setVal('#rateDeRange','#rateDeVal',state.rateDe);
  setVal('#pitchDeRange','#pitchDeVal',state.pitchDe);
  setVal('#rateZhRange','#rateZhVal',state.rateZh);
  setVal('#pitchZhRange','#pitchZhVal',state.pitchZh);

  loadExcel();

  const on=(sel,ev,fn)=>{ const el=$(sel); if(el) el.addEventListener(ev,fn); };
  on('#btnOrderToggle','click',()=>{ stopAutoplayOnUserAction(); state.order = (state.order==='random')? 'seq':'random'; state.settings.order=state.order; saveSettings(); renderModeUI(); });
  on('#btnAutoplay','click',()=>{ toggleAutoplay(); });
  on('#gapRange','input',e=>{ const s=parseFloat(e.target.value)||0.8; state.autoplay.gapMs=Math.round(s*1000); state.settings.autoplayGap=state.autoplay.gapMs; const gv=$('#gapVal'); if(gv) gv.textContent = `(${s.toFixed(1)} s)`; saveSettings(); });
  on('#rateDeRange','input',e=>{ stopAutoplayOnUserAction(); state.rateDe=parseFloat(e.target.value); state.settings.rateDe=state.rateDe; const sp=$('#rateDeVal'); if(sp) sp.textContent=`(${state.rateDe.toFixed(2)})`; saveSettings(); });
  on('#pitchDeRange','input',e=>{ stopAutoplayOnUserAction(); state.pitchDe=parseFloat(e.target.value); state.settings.pitchDe=state.pitchDe; const sp=$('#pitchDeVal'); if(sp) sp.textContent=`(${state.pitchDe.toFixed(2)})`; saveSettings(); });
  on('#rateZhRange','input',e=>{ stopAutoplayOnUserAction(); state.rateZh=parseFloat(e.target.value); state.settings.rateZh=state.rateZh; const sp=$('#rateZhVal'); if(sp) sp.textContent=`(${state.rateZh.toFixed(2)})`; saveSettings(); });
  on('#pitchZhRange','input',e=>{ stopAutoplayOnUserAction(); state.pitchZh=parseFloat(e.target.value); state.settings.pitchZh=state.pitchZh; const sp=$('#pitchZhVal'); if(sp) sp.textContent=`(${state.pitchZh.toFixed(2)})`; saveSettings(); });
  on('#btnSwapMode','click',()=>{ stopAutoplayOnUserAction(); state.mode = (state.mode==='de2zh')? 'zh2de':'de2zh'; state.settings.mode=state.mode; saveSettings(); renderModeUI(); if(state.current) setCard(state.current); });

  on('#btnStart','click',()=>{ stopAutoplayOnUserAction(); startTraining(); });
  on('#btnNext','click',()=>{ stopAutoplayOnUserAction(); nextCard(); });
  on('#btnPrev','click',()=>{ stopAutoplayOnUserAction(); prevCard(); });
  on('#btnReveal','click',()=>{ stopAutoplayOnUserAction(); doReveal(); });
  on('#btnPlayQ','click',()=>{ stopAutoplayOnUserAction(); /* playQuestion(); */ });
  on('#btnPlayA','click',()=>{ stopAutoplayOnUserAction(); /* playAnswer(); */ });

  on('#btnRateKnown','click',()=>{ stopAutoplayOnUserAction(); rate('known'); });
  on('#btnRateUnsure','click',()=>{ stopAutoplayOnUserAction(); rate('unsure'); });
  on('#btnRateUnknown','click',()=>{ stopAutoplayOnUserAction(); rate('unknown'); });

  on('#btnUseLessons','click',()=>{ stopAutoplayOnUserAction(); const sel=$('#lessonSelect'); const picked=[]; for(const o of sel.selectedOptions){ picked.push(o.value); } state.settings.lessons=picked; saveSettings(); gatherPoolFromSettings(); if(picked.length===0){ alert('Keine Lektion ausgewählt.'); } });
  on('#btnClearLessons','click',()=>{ stopAutoplayOnUserAction(); state.selectedLessons.clear(); state.settings.lessons=[]; saveSettings(); state.pool=[]; state.idx=null; resetSessionStats(); const sel=$('#lessonSelect'); for(const o of sel.options){ o.selected=false; } if(state.trainingOn) stopTraining(); });
});
