import { loadExcelRows } from './excelLoader.js';
import { parseLessonsAndData } from './lessonParser.js';

// ---- State ----
const state = {
  lessons: [],            // string[]
  dataByLesson: {},       // { [lessonName]: CardRecord[] }
  selected: new Set(),
  dir: 'DEtoZH',
  order: 'sequential',
  deck: [],               // Working deck of Card objects
  history: [],            // Stack for "Zurück"
  currentIndex: -1,
};

const STORAGE_KEY = 'mini_srs_progress_v1';

// ---- Utilities ----
function $(id){ return document.getElementById(id); }

function hash32(str){
  let h = 0 | 0;
  for (let i=0; i<str.length; i++) { h = (h<<5) - h + str.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(16);
}

function cardId(record, lesson){
  return hash32([lesson, record.wortDeutsch, record.wortHanzi, record.wortPinyin].join('|'));
}

function loadProgress(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }catch{ return {}; }
}
function saveProgress(p){ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }

// Progress model per card: { EF: number, intervalMin: number, dueTs: number, reps: number, lapses: number }
function defaultProgress(){
  return { EF: 2.5, intervalMin: 0, dueTs: 0, reps: 0, lapses: 0 };
}

// SM-2 inspired update with simplified grades: 5=Gewusst, 3=Unsicher, 1=Falsch
function updateProgress(prog, quality){
  const now = Date.now();
  // Update EF (easiness factor)
  const q = quality; // 5/3/1
  prog.EF = Math.max(1.3, prog.EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) { // wrong
    prog.reps = 0;
    prog.lapses = (prog.lapses||0) + 1;
    prog.intervalMin = 1; // 1 Minute
    prog.dueTs = now + prog.intervalMin * 60 * 1000;
    return prog;
  }

  // correct or unsure (>=3)
  if (prog.reps === 0) {
    prog.intervalMin = (q === 3 ? 10 : 1440); // 10min for unsure, 1d for known
  } else if (prog.reps === 1) {
    prog.intervalMin = (q === 3 ? 60 : 3*1440); // 1h or 3d
  } else {
    // next interval = prev * EF (days)
    const prevDays = prog.intervalMin / 1440;
    const nextDays = Math.max(1, prevDays * prog.EF * (q === 3 ? 0.6 : 1));
    prog.intervalMin = Math.round(nextDays * 1440);
  }
  prog.reps += 1;
  prog.dueTs = now + prog.intervalMin * 60 * 1000;
  return prog;
}

function formatDue(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}

// ---- Excel + Lessons ----
async function init(){
  const rows = await loadExcelRows();
  const { lessons, dataByLesson } = parseLessonsAndData(rows);
  state.lessons = lessons;
  state.dataByLesson = dataByLesson;
  renderLessonList();
  attachUI();
}

function renderLessonList(){
  const container = $('lessonList');
  const totalEl = $('totalLessons');
  container.innerHTML = '';
  totalEl.textContent = String(state.lessons.length);

  state.lessons.forEach((name, idx) => {
    const id = `lesson_${idx}`;
    const label = document.createElement('label');
    label.className = 'lesson-item';
    label.setAttribute('for', id);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id; cb.value = name;
    cb.checked = state.selected.has(name);
    cb.addEventListener('change', () => {
      if (cb.checked) state.selected.add(name); else state.selected.delete(name);
      updateSelectionStats();
    });

    const nm = document.createElement('span');
    nm.textContent = name + ' ';
    const count = document.createElement('span');
    count.className = 'lesson-size';
    count.textContent = `(${state.dataByLesson[name]?.length ?? 0} Karten)`;

    label.appendChild(cb);
    label.appendChild(nm);
    label.appendChild(count);
    container.appendChild(label);
  });
  updateSelectionStats();
}

function updateSelectionStats(){
  $('selCount').textContent = String(state.selected.size);
  const totalCards = [...state.selected].reduce((sum, name)=> sum + (state.dataByLesson[name]?.length ?? 0), 0);
  $('selCards').textContent = String(totalCards);
}

function attachUI(){
  $('applyBtn').addEventListener('click', ()=> updateSelectionStats());
  $('clearBtn').addEventListener('click', ()=>{
    state.selected.clear(); renderLessonList();
  });

  // Direction toggle
  document.querySelectorAll('#dirSeg button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#dirSeg button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.dir = btn.dataset.dir;
    });
  });
  // Order toggle
  document.querySelectorAll('#orderSeg button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#orderSeg button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.order = btn.dataset.order;
    });
  });

  $('startBtn').addEventListener('click', startTraining);
  $('revealBtn').addEventListener('click', reveal);
  $('nextBtn').addEventListener('click', ()=> rateAndNext(5)); // default skip as known
  $('prevBtn').addEventListener('click', goBack);
  $('knowBtn').addEventListener('click', ()=> rateAndNext(5));
  $('unsureBtn').addEventListener('click', ()=> rateAndNext(3));
  $('dontBtn').addEventListener('click', ()=> rateAndNext(1));
}

function buildDeck(){
  const progress = loadProgress();
  const deck = [];
  for (const name of state.selected) {
    const arr = state.dataByLesson[name] || [];
    for (const rec of arr) {
      const id = cardId(rec, name);
      const prog = progress[id] || defaultProgress();
      deck.push({ id, lesson: name, rec, prog });
    }
  }
  if (state.order === 'random') {
    for (let i=deck.length-1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  }
  return deck;
}

function startTraining(){
  state.deck = buildDeck();
  state.history = [];
  state.currentIndex = -1;
  if (state.deck.length === 0){
    info('Bitte mindestens eine Lektion wählen.'); return;
  }
  nextCard(true);
}

function nextCard(reset=false){
  const now = Date.now();
  // choose next due first, otherwise the nearest due
  let bestIdx = -1;
  let bestDue = Infinity;
  for (let i=0; i<state.deck.length; i++){
    const c = state.deck[i];
    const due = c.prog?.dueTs || 0;
    const isDue = due <= now;
    if (isDue){ bestIdx = i; break; }
    if (due < bestDue){ bestDue = due; bestIdx = i; }
  }
  if (bestIdx === -1){ info('Keine Karten.'); return; }
  if (state.currentIndex >= 0 && !reset){ state.history.push(state.currentIndex); }
  state.currentIndex = bestIdx;
  renderCardFront();
}

function renderCardFront(){
  const c = state.deck[state.currentIndex];
  const {front, back} = makeQA(c.rec, state.dir);
  $('cardFront').textContent = front;
  $('cardBack').textContent = back; $('cardBack').style.display = 'none';
  $('infoText').textContent = dueText(c);
}
function reveal(){ $('cardBack').style.display = 'block'; }

function goBack(){
  const last = state.history.pop();
  if (last == null){ info('Kein Verlauf.'); return; }
  state.currentIndex = last;
  renderCardFront();
}

function rateAndNext(grade){
  const idx = state.currentIndex;
  if (idx < 0) return;
  const c = state.deck[idx];
  // progress update
  const progress = loadProgress();
  const p = progress[c.id] || defaultProgress();
  progress[c.id] = updateProgress(p, grade);
  saveProgress(progress);
  c.prog = progress[c.id];
  info(`Bewertung gespeichert · fällig wieder: ${formatDue(c.prog.dueTs)}`);
  nextCard();
}

function makeQA(rec, dir){
  if (dir === 'DEtoZH'){
    const front = rec.wortDeutsch || '(kein Deutsch)';
    const back = [rec.wortHanzi, rec.wortPinyin, rec.satzPinyin, rec.satzDeutsch]
      .filter(Boolean).join('
');
    return {front, back};
  } else {
    const front = [rec.wortHanzi, rec.wortPinyin].filter(Boolean).join(' · ');
    const back = [rec.wortDeutsch, rec.satzDeutsch, rec.satzPinyin]
      .filter(Boolean).join('
');
    return {front, back};
  }
}

function dueText(c){
  const now = Date.now();
  const dt = c.prog?.dueTs || 0;
  if (dt <= now) return 'Fällig';
  const mins = Math.round((dt-now)/60000);
  if (mins < 60) return `Nicht fällig (in ${mins} min)`;
  const hrs = Math.round(mins/60);
  if (hrs < 24) return `Nicht fällig (in ${hrs} h)`;
  const days = Math.round(hrs/24);
  return `Nicht fällig (in ${days} d)`;
}

function info(msg){ $('infoText').textContent = msg; }

// ---- Boot ----
init().catch(err=>{
  console.error(err);
  alert('Fehler beim Initialisieren. Liegt data.xlsx im Repo?');
});
