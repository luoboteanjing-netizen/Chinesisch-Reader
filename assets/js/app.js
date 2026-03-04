// Simple DE↔ZH conversation trainer using Web Speech API
// NOTE: No server. Everything runs in-browser. Privacy-friendly demo.

const prompts = {
  de2zh: [
    {de: "Ich heiße Anna.", zh: "我叫安娜。", pinyin: "wǒ jiào ānnà"},
    {de: "Wo ist die Toilette?", zh: "洗手间在哪里？", pinyin: "xǐshǒujiān zài nǎlǐ"},
    {de: "Ich hätte gern eine Schüssel Reis.", zh: "我想要一碗米饭。", pinyin: "wǒ xiǎng yào yì wǎn mǐfàn"},
    {de: "Wie viel kostet das?", zh: "这个多少钱？", pinyin: "zhège duōshǎo qián"},
    {de: "Ich verstehe nicht.", zh: "我不懂。", pinyin: "wǒ bù dǒng"}
  ],
  zh2de: [
    {zh: "我来自德国。", de: "Ich komme aus Deutschland.", pinyin: "wǒ láizì déguó"},
    {zh: "请慢一点说。", de: "Bitte sprechen Sie etwas langsamer.", pinyin: "qǐng màn yìdiǎn shuō"},
    {zh: "我需要帮助。", de: "Ich brauche Hilfe.", pinyin: "wǒ xūyào bāngzhù"},
    {zh: "我会一点中文。", de: "Ich spreche ein bisschen Chinesisch.", pinyin: "wǒ huì yìdiǎn zhōngwén"},
    {zh: "谢谢！", de: "Danke!", pinyin: "xièxie"}
  ]
};

const state = { current: null, recognizing: false, mode: 'de2zh', recog: null };

const $ = sel => document.querySelector(sel);

function randomPrompt() {
  const arr = prompts[state.mode];
  return arr[Math.floor(Math.random() * arr.length)];
}

function setPrompt(p){
  state.current = p;
  let text;
  if(state.mode==='de2zh') text = `Übersetze ins Chinesische: "${p.de}"`;
  else text = `Übersetze ins Deutsche: "${p.zh}"`;
  $('#promptText').textContent = text;
}

function speak(text, lang){
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  u.pitch = 1.0;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function initRecognition(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){
    alert('Dein Browser unterstützt die Spracherkennung (Web Speech API) nicht. Bitte verwende Chrome oder Edge.');
    return null;
  }
  const recog = new SR();
  recog.continuous = false;
  recog.interimResults = false;
  recog.lang = state.mode==='de2zh' ? 'zh-CN' : 'de-DE';
  recog.onresult = (e)=>{
    const text = e.results[0][0].transcript.trim();
    $('#heardText').textContent = text || '—';
    evaluate(text);
    toggleRecording(false);
  };
  recog.onerror = ()=>{ toggleRecording(false); };
  recog.onend = ()=>{ toggleRecording(false); };
  state.recog = recog;
  return recog;
}

function toggleRecording(on){
  state.recognizing = !!on;
  $('#btnMic').disabled = on;
  $('#btnStop').disabled = !on;
}

function startRec(){
  if(!state.recog) initRecognition();
  if(!state.recog) return;
  state.recog.lang = state.mode==='de2zh' ? 'zh-CN' : 'de-DE';
  try{
    state.recog.start();
    toggleRecording(true);
  }catch(err){ console.warn(err); }
}

function stopRec(){
  if(state.recog && state.recognizing) state.recog.stop();
}

// Simple evaluation heuristics (demo):
// - Compare to expected translation (rough distance)
// - For zh: hint for common tone words if Hanzi matches but tones likely off
function levenshtein(a,b){
  const m = []; for(let i=0;i<=b.length;i++){ m[i]=[i]; }
  for(let j=0;j<=a.length;j++){ m[0][j]=j; }
  for(let i=1;i<=b.length;i++){
    for(let j=1;j<=a.length;j++){
      m[i][j] = b.charAt(i-1)==a.charAt(j-1) ? m[i-1][j-1] : 1+Math.min(m[i-1][j-1],m[i][j-1],m[i-1][j]);
    }
  }
  return m[b.length][a.length];
}

function evaluate(said){
  if(!state.current) return;
  const target = state.mode==='de2zh' ? state.current.zh : state.current.de;
  const dist = levenshtein((said||'').toLowerCase(), target.toLowerCase());
  const maxLen = Math.max(1, target.length);
  const sim = Math.max(0, 1 - dist/maxLen); // 0..1
  let score = Math.round(sim*100);
  
  // Build friendly feedback (Option 2)
  let feedback = '';
  if(score>85){
    feedback = 'Sehr gut! Klingt fast wie eine Standardantwort. Weiter so!';
  }else if(score>65){
    feedback = 'Gut gemacht! Ein paar Kleinigkeiten passen noch nicht ganz. Achte auf Aussprache und Tempo—du schaffst das!';
  }else{
    feedback = 'Guter Versuch! Versuche es noch einmal etwas deutlicher. Lies dir den Vorschlag unten an und sprich ihn nach.';
  }

  // Correction suggestion
  const correction = target;

  // Extra hint for Chinese common tone words (demo quality)
  if(state.mode==='de2zh'){
    const hints = [];
    if(/你好|谢谢|请|吗/.test(target) && score<90){
      hints.push('Achte auf die Töne (z. B. 你(nǐ) 好(hǎo), 谢谢(xièxie)).');
    }
    if(state.current.pinyin){ hints.push('Sprich die Töne wie in: '+state.current.pinyin); }
    if(hints.length){ feedback += '\n' + hints.join(' '); }
  }

  $('#correctionText').textContent = correction;
  $('#feedbackText').textContent = feedback;
  $('#scoreText').textContent = score + '/100';
}

// UI wiring

document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('input[name="mode"]').forEach(r=>{
    r.addEventListener('change', (e)=>{ state.mode = e.target.value; setPrompt(randomPrompt()); });
  });
  $('#btnNext').addEventListener('click', ()=> setPrompt(randomPrompt()));
  $('#btnMic').addEventListener('click', startRec);
  $('#btnStop').addEventListener('click', stopRec);
  $('#btnSpeakPrompt').addEventListener('click', ()=>{
    if(!state.current) return;
    if(state.mode==='de2zh') speak(`Übersetze ins Chinesische: ${state.current.de}`, 'de-DE');
    else speak(`请把这句话翻译成德语：${state.current.zh}`, 'zh-CN');
  });
  $('#btnPlayCorrection').addEventListener('click', ()=>{
    if(!state.current) return;
    const text = state.mode==='de2zh' ? state.current.zh : state.current.de;
    const lang = state.mode==='de2zh' ? 'zh-CN' : 'de-DE';
    speak(text, lang);
  });
  setPrompt(randomPrompt());
});

