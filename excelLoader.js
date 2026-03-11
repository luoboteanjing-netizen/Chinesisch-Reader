export async function loadExcelRows(filePath='data.xlsx'){
  const res = await fetch(filePath);
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden von ${filePath}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  return rows;
}
