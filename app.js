import { loadExcelRows } from './excelLoader.js';
import { extractLessons } from './lessonParser.js';

async function init() {
    const rows = await loadExcelRows();
    const lessons = extractLessons(rows);
    renderLessonList(lessons);
}

function renderLessonList(lessonArray) {
    const list = document.getElementById('lessonList');
    lessonArray.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        list.appendChild(li);
    });
}

init();