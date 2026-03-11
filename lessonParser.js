// Marker: '*' in erster Zelle startet neue Lektion
// Spalten: 0 Wort Deutsch, 1 Wort Pinyin, 2 Wortart, 3 Satz Pinyin,
//          4 Satz Deutsch, 5 Wort Hanzi, 6 Satz Hanzi

export function parseLessonsAndData(rows) {
  const lessons = [];
  const dataByLesson = {};
  let currentLesson = null;

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    const first = safeCell(row, 0);

    if (first.startsWith('*')) {
      const name = first.replace(/^\*/, '').trim();
      if (!name) { currentLesson = null; continue; }
      currentLesson = name;
      if (!dataByLesson[currentLesson]) dataByLesson[currentLesson] = [];
      if (!lessons.includes(currentLesson)) lessons.push(currentLesson);
      continue;
    }

    if (!currentLesson) continue;

    const hasAny = row.slice(0, 7).some(v => (v !== null && v !== undefined && String(v).trim() !== ''));
    if (!hasAny) continue;

    const record = {
      wortDeutsch:  safeCell(row, 0),
      wortPinyin:   safeCell(row, 1),
      wortart:      safeCell(row, 2),
      satzPinyin:   safeCell(row, 3),
      satzDeutsch:  safeCell(row, 4),
      wortHanzi:    safeCell(row, 5),
      satzHanzi:    safeCell(row, 6),
    };
    dataByLesson[currentLesson].push(record);
  }

  return { lessons, dataByLesson };
}

function safeCell(row, idx) {
  const v = row[idx];
  return (v === null || v === undefined) ? '' : String(v).trim();
}
