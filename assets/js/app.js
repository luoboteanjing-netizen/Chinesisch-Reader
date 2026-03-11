// r17.3.3-diagnostic: extra status messages to find why list not loads
let EXCEL_URL = './data/Long-Chinesisch_Lektionen.xlsx';
const $=s=>document.querySelector(s);
function set(msg){ const el=$('#dbgStatus'); if(el){ el.textContent = msg; } }

set('diagnostic: app.js loaded');

// 1) Check XLSX presence
if(typeof XLSX==='undefined'){
  set('diagnostic: XLSX undefined (xlsx.full.min.js not loaded)');
} else {
  set('diagnostic: XLSX present, fetching excel…');
  fetch(EXCEL_URL,{cache:'no-store'}).then(res=>{
    if(!res.ok){ set('diagnostic: fetch failed HTTP '+res.status); return; }
    set('diagnostic: excel fetched, reading…');
    return res.arrayBuffer();
  }).then(buf=>{
    if(!buf) return;
    try{
      const wb = XLSX.read(buf,{type:'array'});
      const names = (wb.SheetNames||[]).join(', ');
      set('diagnostic: workbook ok, sheets=['+names+']');
    }catch(e){
      set('diagnostic: XLSX.read error: '+(e&&e.message?e.message:String(e)));
    }
  }).catch(err=>{
    set('diagnostic: fetch/read error: '+(err&&err.message?err.message:String(err)));
  });
}
