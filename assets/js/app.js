/* App JS: Mehrere Excel-Quellen + Blätter als Lektionen (festes Mapping)
   - Blätter 2..18 = je eine Lektion
   - Spalten (1-basiert): 1=Deutsch, 2=Pinyin, 6=Hanzi, 9=Lektions-ID
   - Daten starten ab Zeile 3 (1-basiert)
   - Quellen-Dropdown
*/

// ==== KONFIGURATION ====
const SOURCES = [
  { name: 'Master', url: 'https://luoboteanjing-netizen.github.io/Chinesisch-Reader/data/Long-Chinesisch_Lektionen.xlsx' }
  // Weitere Quellen können hier hinzugefügt werden:
  // { name: 'Alternative', url: 'https://.../data/AndereDatei.xlsx' }
];
const SHEET_RANGE = { start: 2, end: 18 };   // Blätter 2..18 (inkl.)
const DATA_START_ROW = 3;                    // Daten beginnen in Zeile 3 (1-basiert)
const COLS = { de:1, pinyin:2, hanzi:6, lessonId:9 }; // 1-basiert

// ==== STATE ====
const state = {
  mode: 'de2zh', recognizing:false, recog:null, rate:0.95,
  voicePref:{ zh:'female', de:'female' }, voices:[],
  lessons:new Map(), selectedLessons:new Set(), current:null,
  currentSourceUrl:null
};
const $ = (s)=>document.querySelector(s);

// ==== Excel laden ====
function populateSourceSelect(){
  const sel=$('#sourceSelect'); sel.innerHTML='';
  for (const s of SOURCES){ const o=document.createElement('option'); o.value=s.url; o.textContent=s.name; sel.appendChild(o); }
  if (SOURCES.length){ sel.value=SOURCES[0].url; state.currentSourceUrl=SOURCES[0].url; }
}

async function loadExcelFromURL(url){
  const status=$('#excelStatus');
  try{
    status.textContent='Excel wird geladen…';
    const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status);
    const buf=await res.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    state.lessons.clear();

    const startIdx=Math.max(1,SHEET_RANGE.start)-1, endIdx=Math.max(startIdx,SHEET_RANGE.end-1);
    for(let si=startIdx; si<=endIdx && si<wb.SheetNames.length; si++){
      const sheet=wb.Sheets[wb.SheetNames[si]]; if(!sheet) continue;
      const rows=XLSX.utils.sheet_to_json(sheet,{header:1,blankrows:false}); if(!rows||!rows.length) continue;
      const r0=Math.max(1,DATA_START_ROW)-1;
      for(let r=r0; r<rows.length; r++){
        const row=rows[r]; if(!row) continue;
        const val=(i)=> row[Math.max(0,i-1)];
        const de=val(COLS.de), py=val(COLS.pinyin), zh=val(COLS.hanzi), lid=val(COLS.lessonId);
        if(!de && !zh) continue;
        const lessonKey=(lid!=null && String(lid).trim()!=='')? String(lid).trim() : `Blatt${si+1}`;
        if(!state.lessons.has(lessonKey)) state.lessons.set(lessonKey,[]);
        state.lessons.get(lessonKey).push({ de:String(de||'').trim(), zh:String(zh||'').trim(), pinyin:String(py||'').trim() });
      }
    }
    populateLessonSelect();
    status.textContent=`Excel geladen (${state.lessons.size} Lektion(en)).`;
  }catch(err){ status.textContent='Excel konnte nicht geladen werden: '+err.message; console.error(err); }
}

function populateLessonSelect(){
  const sel=$('#lessonSelect'); sel.innerHTML='';
  const keys=Array.from(state.lessons.keys()).sort((a,b)=>(''+a).localeCompare(''+b,'de',{numeric:true}));
  for(const k of keys){ const o=document.createElement('option'); o.value=k; o.textContent=`Lektion ${k} (${state.lessons.get(k).length})`; sel.appendChild(o); }
}
function commitLessonSelection(){ const sel=$('#lessonSelect'); state.selectedLessons.clear(); for(const o of sel.selectedOptions) state.selectedLessons.add(o.value); }
function buildPool(){ const out=[]; for(const k of state.selectedLessons){ const a=state.lessons.get(k); if(a) out.push(...a);} return out; }
function randomOf(a){ return a[Math.floor(Math.random()*a.length)]; }
function setPrompt(){ const pool=buildPool(); if(!pool.length){ $('#promptText').textContent='Bitte Lektionen auswählen und „Auswahl übernehmen“ klicken.'; state.current=null; return;} const pick=randomOf(pool); state.current=pick; if(state.mode==='de2zh') $('#promptText').textContent=`Übersetze ins Chinesische: "${pick.de}"`; else $('#promptText').textContent=`Übersetze ins Deutsche: "${pick.zh}"`; }

// ==== Bewertung / Feedback ====
function levenshtein(a,b){ a=(a||'').toLowerCase(); b=(b||'').toLowerCase(); const m=[]; for(let i=0;i<=b.length;i++){ m[i]=[i]; } for(let j=0;j<=a.length;j++){ m[0][j]=j; } for(let i=1;i<=b.length;i++){ for(let j=1;j<=a.length;j++){ m[i][j]= b[i-1]===a[j-1]? m[i-1][j-1] : 1+Math.min(m[i-1][j-1],m[i][j-1],m[i-1][j]); } } return m[b.length][a.length]; }
function evaluate(said){ if(!state.current) return; const target= state.mode==='de2zh'? state.current.zh : state.current.de; const dist=levenshtein(said||'',target||''); const sim=Math.max(0,1 - dist/Math.max(1,(target||'').length)); const score=Math.round(sim*100); let fb= score>85? 'Sehr gut! Klingt fast wie eine Standardantwort. Weiter so!' : (score>65? 'Gut gemacht! Ein paar Kleinigkeiten passen noch nicht ganz. Achte auf Aussprache und Tempo—du schaffst das!' : 'Guter Versuch! Lies den Vorschlag unten und sprich ihn nach – das wird!'); if(state.mode==='de2zh' && state.current.pinyin) fb+=`
Tipp (Pinyin): ${state.current.pinyin}`; $('#correctionText').textContent=target||'—'; $('#feedbackText').textContent=fb; $('#scoreText').textContent=`${score}/100`; }

// ==== TTS / Stimmen ====
function refreshVoices(){ state.voices = window.speechSynthesis?.getVoices?.() || []; }
function pickVoice(lang, gender){ if(!state.voices.length) return null; const list=state.voices.filter(v=>(v.lang||'').toLowerCase().startsWith(lang)); if(!list.length) return null; const want=(gender||'').toLowerCase(); const isF=s=>/female|weib|女/i.test(s); const isM=s=>/male|männ|男/i.test(s); const byName=list.filter(v=> (want==='female'? isF(v.name+" "+v.voiceURI): isM(v.name+" "+v.voiceURI))); return byName[0] || list.find(v=>v.default) || list[0]; }
function speak(text, langCode){ const u=new SpeechSynthesisUtterance(text); u.lang=langCode; u.rate=state.rate; const v= langCode.startsWith('zh')? pickVoice('zh', state.voicePref.zh) : pickVoice('de', state.voicePref.de); if(v) u.voice=v; speechSynthesis.cancel(); speechSynthesis.speak(u); }

// ==== Speech Recognition ====
function initRecognition(){ const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR){ alert('Dein Browser unterstützt die Spracherkennung nicht. Bitte Chrome/Edge verwenden.'); return null; } const recog=new SR(); recog.continuous=false; recog.interimResults=false; recog.lang= state.mode==='de2zh'? 'zh-CN':'de-DE'; recog.onresult=e=>{ const t=e.results[0][0].transcript.trim(); $('#heardText').textContent=t||'—'; evaluate(t); toggleRecording(false); }; recog.onerror=()=>toggleRecording(false); recog.onend=()=>toggleRecording(false); state.recog=recog; return recog; }
function toggleRecording(on){ state.recognizing=!!on; $('#btnMic').disabled=on; $('#btnStop').disabled=!on; }
function startRec(){ if(!state.recog) initRecognition(); if(!state.recog) return; state.recog.lang= state.mode==='de2zh'? 'zh-CN':'de-DE'; try{ state.recog.start(); toggleRecording(true);}catch(e){} }
function stopRec(){ if(state.recog && state.recognizing) state.recog.stop(); }

// ==== UI ====
window.addEventListener('DOMContentLoaded',()=>{
  refreshVoices(); if('speechSynthesis' in window && typeof speechSynthesis.onvoiceschanged!=='undefined') speechSynthesis.onvoiceschanged=refreshVoices;
  populateSourceSelect(); if(state.currentSourceUrl) loadExcelFromURL(state.currentSourceUrl);
  $('#sourceSelect').addEventListener('change',e=>{ state.currentSourceUrl=e.target.value; loadExcelFromURL(state.currentSourceUrl); });
  document.querySelectorAll('input[name="mode"]').forEach(r=> r.addEventListener('change', e=>{ state.mode=e.target.value; setPrompt(); }));
  document.querySelectorAll('input[name="zhVoice"]').forEach(r=> r.addEventListener('change', e=> state.voicePref.zh=e.target.value));
  document.querySelectorAll('input[name="deVoice"]').forEach(r=> r.addEventListener('change', e=> state.voicePref.de=e.target.value));
  $('#rateRange').addEventListener('input',e=>{ state.rate=parseFloat(e.target.value); $('#rateVal').textContent=`(${state.rate.toFixed(2)})`; });
  $('#btnUseLessons').addEventListener('click',()=>{ commitLessonSelection(); setPrompt(); });
  $('#btnClearLessons').addEventListener('click',()=>{ $('#lessonSelect').selectedIndex=-1; state.selectedLessons.clear(); $('#promptText').textContent='Lektionsauswahl geleert. Wähle erneut und klicke „Neue Aufgabe“."'; });
  $('#btnNext').addEventListener('click',setPrompt);
  $('#btnSpeakPrompt').addEventListener('click',()=>{ if(!state.current) return; if(state.mode==='de2zh') speak(`Übersetze ins Chinesische: ${state.current.de}`,'de-DE'); else speak(`请把这句话翻译成德语：${state.current.zh}`,'zh-CN'); });
  $('#btnPlayCorrection').addEventListener('click',()=>{ if(!state.current) return; const text= state.mode==='de2zh'? state.current.zh : state.current.de; const lang= state.mode==='de2zh'? 'zh-CN':'de-DE'; speak(text,lang); });
  $('#btnMic').addEventListener('click',startRec);
  $('#btnStop').addEventListener('click',stopRec);
});
