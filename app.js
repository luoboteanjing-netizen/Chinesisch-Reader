import { loadExcelRows } from './excelLoader.js';
import { parseLessonsAndData } from './lessonParser.js';

const state = {
  lessons: [],
  dataByLesson: {},
  selected: new Set(),
};

async function init() {
  try {
    const rows = await loadExcelRows();
    const { lessons, dataByLesson } = parseLessonsAndData(rows);
    state.lessons = lessons;
    state.dataByLesson = dataByLesson;

    renderLessonList(lessons);
    updateCounters();
  } catch (err) {
    console.error(err);
    alert('Fehler beim Laden der Excel-Datei. Prüfe, ob data.xlsx im Repo liegt.');
  }
}

function renderLessonList(lessons) {
  const container = document.getElementById('lessonList');
  const totalEl = document.getElementById('totalLessons');
  container.innerHTML = '';
  totalEl.textContent = String(lessons.length);

  lessons.forEach((name, idx) => {
    const id = `lesson_${idx}`;

    const label = document.createElement('label');
    label.className = 'lesson-item';
    label.setAttribute('role', 'option');
    label.setAttribute('for', id);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = name;
    cb.addEventListener('change', onSelectChanged);

    const caption = document.createElement('span');
    caption.className = 'lesson-caption';

    const nm = document.createElement('span');
    nm.className = 'lesson-name';
    nm.textContent = name;

    const count = document.createElement('span');
    count.className = 'lesson-size';
    count.textContent = `(${state.dataByLesson[name]?.length ?? 0} Karten)`;

    caption.appendChild(nm);
    caption.appendChild(count);

    label.appendChild(cb);
    label.appendChild(caption);
    container.appendChild(label);
  });
}

function onSelectChanged(e) {
  const name = e.target.value;
  if (e.target.checked) {
    state.selected.add(name);
  } else {
    state.selected.delete(name);
  }
  updateCounters();
}

function updateCounters() {
  const selectedCountEl = document.getElementById('selectedCount');
  const cardCountEl = document.getElementById('cardCount');

  selectedCountEl.textContent = String(state.selected.size);

  const totalCards = [...state.selected].reduce((sum, lessonName) => {
    return sum + (state.dataByLesson[lessonName]?.length ?? 0);
  }, 0);
  cardCountEl.textContent = String(totalCards);
}

init();
