
fetch('cards.json').then(r=>r.json()).then(data=>{
 const sel=document.getElementById('side');
 const box=document.getElementById('cards');
 function render(){
  box.innerHTML='';
  data.cards.forEach(c=>{
   const d=document.createElement('div');
   d.className='card';
   const lines=(sel.value==='zh'?c.zh:c.de);
   d.innerHTML=lines.join('<br>');
   box.appendChild(d);
  })
 }
 sel.onchange=render;
 render();
});
