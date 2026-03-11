export async function loadExcelRows(filePath = 'data.xlsx') {
  // Resolve robust relative URL based on the current module location (works in iframes & GitHub Pages)
  const url = new URL(filePath, import.meta.url);
  // Cache-busting while debugging Pages caching (can be removed later)
  url.searchParams.set('v', Date.now().toString());

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('Fetch-Fehler für Excel', { status: res.status, statusText: res.statusText, url: url.toString() });
    throw new Error(`HTTP ${res.status} beim Laden von ${filePath}`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength < 200) {
    console.warn('Excel-Datei ist sehr klein. Ist sie leer oder der Pfad falsch?', { bytes: buf.byteLength, url: url.toString() });
  }

  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    console.error('Keine Sheets im Workbook gefunden');
    throw new Error('Excel enthält keine Arbeitsblätter');
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.debug('Sheet:', sheetName, 'Zeilen (max 5):', rows.slice(0, 5));
  return rows;
}
