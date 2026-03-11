export function extractLessons(rows) {
    const lessons = [];
    rows.forEach(row => {
        if (!row || !row[0]) return;
        const cell = String(row[0]);
        if (cell.startsWith('*')) {
            lessons.push(cell.substring(1).trim());
        }
    });
    return lessons;
}