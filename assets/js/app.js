// r17.3.2: voices panel fixes + results table
let EXCEL_URL = './data/Long-Chinesisch_Lektionen.xlsx';
const COL_WORD={de:1,py:2,zh:6};
const COL_SENT={de:5,py:4,zh:7};
const COL_POS=3;
const START_ROW_1BASED=2; // 1-based row index
const MAX_EMPTY_RUN=10;

const LS_KEYS={ settings:'fc_settings_v1', progress:'fc_progress_v1' };
const state={ mode:'de2zh', order:'random', rateDe:0.95, pitchDe:1.0, rateZh:0.95, pitchZh:1.0,
  lessons:new Map(), selectedLessons:new Set(), pool:[], idx:null, current:null,
  autoplay:{ on:false, timers:[], gapMs:800 }, settings:{ mode:'de2zh', order:'random', rateDe:0.95, pitchDe:1.0, rateZh:0.95, pitchZh:1.0, lessons:[], autoplayGap:800, voiceDe:null, voiceZh:null },
  session:{ total:0, done:0, known:0, unsure:0, unknown:0, ttrSum:0, ttrCount:0 }, startedAt:null, revealedAt:null,
  progress:{ version:'v1', cards:{}, byLesson:{} }, wakeLock:null, trainingOn:false,
  voices:[] };

const $=s=>document.querySelector(s);

const dbg={ sheetName:'—', rows:0, lessons:0, cards:0, markerLines:0, stopReason:'', ready:false };
function setDbg(){ const el=$('#dbgStatus'); if(!el) return; const msg=`Blatt 0: ${dbg.sheetName} | Zeilen: ${dbg.rows} | Marker: ${dbg.markerLines} | Lektionen: ${dbg.lessons} | Karten: ${dbg.cards} ${dbg.stopReason?(' | '+dbg.stopReason):''}`; el.textContent=msg; }

function saveSettings(){ try{ localStorage.setItem(LS_KEYS.settings, JSON.stringify(state.settings)); }catch(e){} }
function loadSettings(){ try{ const s=JSON.parse(localStorage.getItem(LS_KEYS.settings)||'null'); if(s){ state.settings=Object.assign(state.settings,s); } }catch(e){} }
function saveProgress(){ try{ localStorage.setItem(LS_KEYS.progress, JSON.stringify(state.progress)); }catch(e){} }
function loadProgress(){ try{ const p=JSON.parse(localStorage.getItem(LS_KEYS.progress)||'null'); if(p && p.version==='v1'){ state.progress=p; } }catch(e){} }
function ensureBL(lessonKey){ const bl=state.progress.byLesson; bl[lessonKey]=bl[lessonKey]||{ known:0, unknown:0 }; return bl[lessonKey]; }

function isCellEmpty(v){ if(v==null) return true; const s=String(v).replace(/ /g,' ').trim(); return s.length===0; }
function isRowEmpty(row){ if(!row || row.length===0) return true; for(const v of row){ if(!isCellEmpty(v)) return false; } return true; }
function getCell(row, idx1){ const i=idx1-1; const v=(row && row.length>i? row[i]: ''); return String(v==null?'':v).replace(/ /g,' ').trim(); }

function extractLessonName(raw, idx){ if(!raw) return `Lektion ${idx}`; if(!raw.startsWith('*')) return null; let name=raw.slice(1); name=name.replace(/^[\s ]+/, ''); if(!name) name=`Lektion ${idx}`; return name; }

async function parseExcelBuffer(buf){ try{
  const wb=XLSX.read(buf,{type:'array'});
  state.lessons.clear();
  if(!wb.SheetNames || wb.SheetNames.length===0){ dbg.stopReason='(kein Blatt gefunden)'; setDbg(); return; }
  const shName=wb.SheetNames[0]; dbg.sheetName=shName; const sh=wb.Sheets[shName];
  const rows=XLSX.utils.sheet_to_json(sh,{header:1,blankrows:false}); dbg.rows=rows.length; setDbg();

  let lessonIdx=0, currentKey=null, current=null, emptyRun=0, totalCards=0, markerCount=0;
  const startRow=START_ROW_1BASED-1;
  for(let r=startRow;r<rows.length;r++){
    const row=rows[r]||[];
    if(isRowEmpty(row)){ emptyRun++; if(emptyRun>MAX_EMPTY_RUN){ dbg.stopReason=`(Stopp nach >${MAX_EMPTY_RUN} Leerzeilen)`; break; } else continue; } else emptyRun=0;

    const c1 = String(row[0]==null?'':row[0]).replace(/ /g,' ').trim();
    const maybeName = extractLessonName(c1, lessonIdx+1);
    if(maybeName!==null){ // marker line
      markerCount++;
      if(currentKey && current && current.entries.length>0){ state.lessons.set(currentKey, current); }
      lessonIdx++; currentKey=String(lessonIdx); current={ displayName: maybeName, entries:[] };
      continue; // do not add this row as card
    }

    const w_de=getCell(row,COL_WORD.de), w_py=getCell(row,COL_WORD.py), w_zh=getCell(row,COL_WORD.zh);
    const s_py=getCell(row,COL_SENT.py), s_de=getCell(row,COL_SENT.de), s_zh=getCell(row,COL_SENT.zh);
    const pos=getCell(row,COL_POS);
    if(!(w_de||w_zh||s_de||s_zh)) continue;
    if(!currentKey){ lessonIdx++; currentKey=String(lessonIdx); current={ displayName:`Lektion ${lessonIdx}`, entries:[] }; }
    current.entries.push({ word:{de:w_de, py:w_py, zh:w_zh}, sent:{de:s_de, py:s_py, zh:s_zh}, pos });
    totalCards++;
  }
  if(currentKey && current && current.entries.length>0){ state.lessons.set(currentKey, current); }

  dbg.markerLines=markerCount; dbg.lessons=state.lessons.size; dbg.cards=totalCards; setDbg();
  populateLessonSelect(); syncUISelectionWithSettings(); renderResultsTable();
 }catch(err){ console.error('parseExcelBuffer error:',err); dbg.stopReason='(Parsing-Fehler: '+(err?.message||'')+')'; setDbg(); }
}

async function loadExcel(){ try{ const res=await fetch(EXCEL_URL,{cache:'no-store'}); if(!res.ok){ throw new Error('HTTP '+res.status); } const buf=await res.arrayBuffer(); await parseExcelBuffer(buf); }catch(e){ console.error('Excel konnte nicht geladen werden:',e); dbg.stopReason='(Fetch-Fehler – prüfen: Pfad/Name/CORS)'; setDbg(); alert('Konnte Excel nicht laden. Prüfe Pfad/Name/CORS.'); } }

function populateLessonSelect(){ const sel=$('#lessonSelect'); if(!sel) return; sel.innerHTML=''; const keys=Array.from(state.lessons.keys()).map(k=>parseInt(k,10)).sort((a,b)=>a-b); for(const k of keys){ const key=String(k); const lesson=state.lessons.get(key); if(!lesson) continue; const total=(lesson.entries||[]).length; const bl=state.progress.byLesson?.[key]||{known:0,unknown:0}; const name=lesson.displayName||`Lektion ${k}`; const opt=document.createElement('option'); opt.value=key; opt.textContent=`${name} (${total}) · Richtig ${bl.known||0} · Falsch ${bl.unknown||0}`; if(state.settings.lessons?.includes(key)) opt.selected=true; sel.appendChild(opt); } }
function syncUISelectionWithSettings(){ const sel=$('#lessonSelect'); if(!sel) return; const wanted=new Set(state.settings.lessons||[]); for(const o of sel.options){ o.selected=wanted.has(o.value); } }

function resetSessionStats(){ state.session={ total:state.pool.length, done:0, known:0, unsure:0, unknown:0, ttrSum:0, ttrCount:0 }; renderSessionStats(); }
function gatherPoolFromSettings(){ state.selectedLessons.clear(); (state.settings.lessons||[]).forEach(id=> state.selectedLessons.add(id)); const out=[]; for(const k of state.selectedLessons){ const obj=state.lessons.get(k); if(obj && obj.entries) out.push(...obj.entries); } state.pool=out; state.idx=null; resetSessionStats(); }
function gatherPool(){ const out=[]; for(const k of state.selectedLessons){ const obj=state.lessons.get(k); if(obj && obj.entries) out.push(...obj.entries); } state.pool=out; state.idx=null; resetSessionStats(); }

function setCard(entry){ state.current=entry; $('#solBox').classList.add('masked'); state.startedAt=Date.now(); state.revealedAt=null;
  if(state.mode==='zh2de'){
    $('#promptWord').innerHTML=(entry.word.zh||'—');
    $('#promptWordSub').innerHTML=formatPinyinAndPos(entry.word.py, entry.pos);
    $('#promptSent').innerHTML=formatZh(entry.sent.zh, entry.sent.py);
    $('#solWord').textContent=entry.word.de||'—';
    $('#solSent').textContent=entry.sent.de||'—';
  } else {
    $('#promptWord').textContent=entry.word.de||'—';
    $('#promptWordSub').textContent=entry.pos?entry.pos:'';
    $('#promptSent').textContent=entry.sent.de||'—';
    $('#solWord').innerHTML=formatZh(entry.word.zh, entry.word.py);
    $('#solSent').innerHTML=formatZh(entry.sent.zh, entry.sent.py);
  }
  $('#btnPrev').disabled=false; $('#btnReveal').disabled=false; $('#btnNext').disabled=false; $('#btnPlayQ').disabled=false; $('#btnPlayA').disabled=false; disableRating(); renderModeUI(); }

function nextCard(){ if(!state.pool.length) return alert('Bitte Lektionen wählen und übernehmen.'); if(state.order==='seq'){ if(state.idx==null) state.idx=0; else state.idx=(state.idx+1)%state.pool.length; setCard(state.pool[state.idx]); } else { const e=state.pool[Math.floor(Math.random()*state.pool.length)]; setCard(e); } }
function prevCard(){ if(!state.pool.length) return; if(state.order!=='seq'){ alert('Zurück nur im sequenziellen Modus.'); return; } if(state.idx==null) state.idx=0; else state.idx=(state.idx-1+state.pool.length)%state.pool.length; setCard(state.pool[state.idx]); }

function startTraining(){ if(!state.trainingOn){ const sel=$('#lessonSelect'); state.selectedLessons.clear(); const picked=[]; for(const o of sel.selectedOptions){ state.selectedLessons.add(o.value); picked.push(o.value); } state.settings.lessons=picked; saveSettings(); gatherPool(); if(!state.pool.length){ alert('Bitte zuerst Lektion(en) übernehmen.'); return; } state.idx = (state.order==='seq') ? 0 : null; if(state.order==='seq') setCard(state.pool[state.idx]); else setCard(state.pool[Math.floor(Math.random()*state.pool.length)]); state.trainingOn=true; updateTrainingBtn(); } else { stopTraining(); } }

function stopTraining(){ state.trainingOn=false; updateTrainingBtn(); $('#btnPrev').disabled=true; $('#btnReveal').disabled=true; $('#btnNext').disabled=true; $('#btnPlayQ').disabled=true; $('#btnPlayA').disabled=true; disableRating(); $('#solBox').classList.add('masked'); $('#promptWord').textContent='—'; $('#promptWordSub').innerHTML='&nbsp;'; $('#promptSent').textContent='—'; $('#solWord').textContent='—'; $('#solSent').textContent='—'; }
function updateTrainingBtn(){ const b=$('#btnStart'); if(!b) return; b.textContent = state.trainingOn? 'Training stoppen ■' : 'Training starten ▶'; }

function doReveal(){ $('#solBox').classList.remove('masked'); state.revealedAt=Date.now(); const ttr=state.revealedAt-(state.startedAt||state.revealedAt); if(ttr>0){ state.session.ttrSum+=ttr; state.session.ttrCount+=1; } enableRating(); renderSessionStats(); }
function enableRating(){ $('#btnRateKnown').disabled=false; $('#btnRateUnsure').disabled=false; $('#btnRateUnknown').disabled=false; }
function disableRating(){ $('#btnRateKnown').disabled=true; $('#btnRateUnsure').disabled=true; $('#btnRateUnknown').disabled=true; }

function rate(mark){ if(!state.current) return; state.session.done += 1; if(mark==='known') state.session.known += 1; else if(mark==='unsure') state.session.unsure += 1; else state.session.unknown += 1; renderSessionStats(); try{ const lessonKey = findLessonKeyOfCurrent(); if(lessonKey){ const rec=ensureBL(lessonKey); if(mark==='known') rec.known += 1; else if(mark==='unknown') rec.unknown += 1; saveProgress(); populateLessonSelect(); renderResultsTable(); } }catch(e){} disableRating(); nextCard(); }

function findLessonKeyOfCurrent(){ for(const [k,obj] of state.lessons.entries()){ const arr=obj?.entries||[]; if(arr.includes(state.current)) return k; } return null; }

function formatZh(hz,py){ const h=(hz||'').trim(); const p=(py||'').trim(); return p? `${h}<br><span class="py">${p}</span>` : (h||'—'); }
function formatPinyinAndPos(py,pos){ const a=(py||'').trim(); const b=(pos||'').trim(); if(a&&b) return `<span class="py">${a}</span><br><span class="prompt small" style="display:inline-block;margin-top:6px;">${b}</span>`; if(a) return `<span class="py">${a}</span>`; if(b) return `<span class="prompt small" style="display:inline-block;margin-top:6px;">${b}</span>`; return ''; }

// ====== RESULTS TABLE ======
function renderResultsTable(){ const tbl=$('#resultsTable'); if(!tbl) return; const keys=Array.from(state.lessons.keys()).map(k=>parseInt(k,10)).sort((a,b)=>a-b); let html='<thead><tr><th>Lektion</th><th>Richtig</th><th>Falsch</th></tr></thead><tbody>'; for(const k of keys){ const key=String(k); const name=(state.lessons.get(key)?.displayName)||`Lektion ${k}`; const bl=state.progress.byLesson?.[key]||{known:0,unknown:0}; const known=bl.known||0, unknown=bl.unknown||0; html+=`<tr><td>${escapeHtml(name)}</td><td>${known}</td><td>${unknown}</td></tr>`; } html+='</tbody>'; tbl.innerHTML=html; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;"}[m])); }

// ====== TTS / VOICES ======
function refreshVoices(){ try{ state.voices = window.speechSynthesis?.getVoices?.() || []; }catch(e){ state.voices=[]; } }
function getVoiceByName(name){ if(!name) return null; return (state.voices||[]).find(v=>v.name===name)||null; }
function buildUtterance(text, lang){ const u=new SpeechSynthesisUtterance(text||''); u.lang=lang; if(lang.startsWith('de')){ u.rate=state.rateDe; u.pitch=state.pitchDe; const v=getVoiceByName(state.settings.voiceDe); if(v) u.voice=v; } else if(lang.startsWith('zh')){ u.rate=state.rateZh; u.pitch=state.pitchZh; const v=getVoiceByName(state.settings.voiceZh); if(v) u.voice=v; } return u; }
function speak(text, lang){ try{ const u=buildUtterance(text, lang); window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }catch(e){} }
function playQ(){ if(!state.current) return; if(state.mode==='de2zh'){ speak(state.current.word.de,'de-DE'); } else { speak(state.current.word.zh,'zh-CN'); } }
function playA(){ if(!state.current) return; if(state.mode==='de2zh'){ speak(state.current.word.zh,'zh-CN'); } else { speak(state.current.word.de,'de-DE'); } }

function openVoicesPanelFor(lang){ try{ const panel=$('#voicePanel'); const list=$('#voicesList'); const label=$('#panelLang'); const btnRefresh=$('#btnVoicesRefresh'); if(!panel||!list||!label) return; label.textContent=lang.toUpperCase(); panel.classList.remove('hidden');
    const rebuild=()=>{ list.innerHTML=''; refreshVoices(); const voices=(state.voices||[]).filter(v=> (v.lang||'').toLowerCase().startsWith(lang==='zh'?'zh':'de') ); if(voices.length===0){ list.innerHTML='<div class="hint">Keine Systemstimmen gefunden. Bitte einmal irgendwo in die Seite klicken/tippen und dann „Aktualisieren“ drücken.</div>'; return; } voices.forEach(v=>{ const row=document.createElement('div'); row.className='voice'; const meta=document.createElement('div'); meta.className='meta'; meta.innerHTML=`<div class="name">${v.name}</div><div>${v.lang}${v.default?' · default':''}</div>`; const btn=document.createElement('button'); btn.className='btn small'; btn.textContent='Auswählen'; btn.addEventListener('click',()=>{ if(lang==='zh'){ state.settings.voiceZh=v.name; } else { state.settings.voiceDe=v.name; } saveSettings(); panel.classList.add('hidden'); }); row.appendChild(meta); row.appendChild(btn); list.appendChild(row); }); };
    rebuild();
    btnRefresh?.addEventListener('click', rebuild);
    // Some browsers fire voiceschanged async
    if(window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis){ const handler=()=>{ rebuild(); window.speechSynthesis.onvoiceschanged=null; }; window.speechSynthesis.onvoiceschanged=handler; }
 }catch(e){}
}
function closeVoices(){ const panel=$('#voicePanel'); if(panel) panel.classList.add('hidden'); }

// ====== SESSION/UI ======
function renderSessionStats(){ const s=state.session; const avg=s.ttrCount? (s.ttrSum/s.ttrCount/1000).toFixed(1) : '—'; const acc=s.done? Math.round(100*s.known/s.done)+'%' : '—'; const el=$('#sessionStats'); if(el) el.textContent=`Karten: ${s.done}/${s.total} · Korrekt: ${acc} · Ø Aufdeck‑Zeit: ${avg}s`; }
function renderModeUI(){ const left=$('#modeLeft'), right=$('#modeRight'); if(left&&right){ if(state.mode==='zh2de'){ left.textContent='🇨🇳 ZH'; right.textContent='🇩🇪 DE'; } else { left.textContent='🇩🇪 DE'; right.textContent='🇨🇳 ZH'; } } const b=$('#btnOrderToggle'); if(b) b.textContent='Reihenfolge: '+(state.order==='seq'?'Sequenziell':'Zufällig'); updateTrainingBtn(); }

window.addEventListener('DOMContentLoaded', ()=>{
  loadSettings(); loadProgress();
  state.mode=state.settings.mode||'de2zh'; state.order=state.settings.order||'random';
  state.autoplay.gapMs = typeof state.settings.autoplayGap==='number' ? state.settings.autoplayGap : 800;
  renderModeUI(); setDbg();
  loadExcel();
  const on=(sel,ev,fn)=>{ const el=$(sel); if(el) el.addEventListener(ev,fn); };
  on('#btnStart','click',()=>{ startTraining(); });
  on('#btnNext','click',()=>{ nextCard(); });
  on('#btnPrev','click',()=>{ prevCard(); });
  on('#btnReveal','click',()=>{ doReveal(); });
  on('#btnRateKnown','click',()=>{ rate('known'); });
  on('#btnRateUnsure','click',()=>{ rate('unsure'); });
  on('#btnRateUnknown','click',()=>{ rate('unknown'); });
  on('#btnOrderToggle','click',()=>{ state.order=(state.order==='random')?'seq':'random'; state.settings.order=state.order; saveSettings(); renderModeUI(); });
  on('#btnSwapMode','click',()=>{ state.mode=(state.mode==='de2zh')?'zh2de':'de2zh'; state.settings.mode=state.mode; saveSettings(); renderModeUI(); if(state.current) setCard(state.current); });
  on('#btnUseLessons','click',()=>{ const sel=$('#lessonSelect'); const picked=[]; for(const o of sel.selectedOptions){ picked.push(o.value); } state.settings.lessons=picked; saveSettings(); gatherPoolFromSettings(); renderResultsTable(); });
  on('#btnClearLessons','click',()=>{ state.selectedLessons.clear(); state.settings.lessons=[]; saveSettings(); state.pool=[]; state.idx=null; resetSessionStats(); const sel=$('#lessonSelect'); if(sel){ for(const o of sel.options){ o.selected=false; } } if(state.trainingOn) stopTraining(); renderResultsTable(); });
  on('#btnPlayQ','click',()=>{ playQ(); });
  on('#btnPlayA','click',()=>{ playA(); });
  on('#btnVoiceDe','click',()=>{ openVoicesPanelFor('de'); });
  on('#btnVoiceZh','click',()=>{ openVoicesPanelFor('zh'); });
  on('#btnCloseVoices','click',()=>{ closeVoices(); });
  // prime voices after first user gesture (for iframes)
  document.body.addEventListener('click',()=>{ refreshVoices(); }, { once:true });
});
