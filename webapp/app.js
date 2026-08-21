/* ============ Học Tiếng Anh Thương Mại — app logic ============ */
const D = window.APPDATA;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => (s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const escq = s => (s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")
  .replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/[\r\n]+/g," ");

/* ---------- Persistent progress (localStorage) ---------- */
const STORE = "en_app_v1";
let progress = JSON.parse(localStorage.getItem(STORE) || "{}");
progress.learned = progress.learned || {};        // word -> true
progress.srs = progress.srs || {};                // word -> {ef, interval, due, reps}
progress.quizStats = progress.quizStats || {correct:0, total:0};
progress.listenStats = progress.listenStats || {correct:0, total:0};
progress.myWords = progress.myWords || [];        // [{word,ipa,vi,source}] ĐÃ vào thư viện keyword
progress.pending = progress.pending || [];        // ROOM TẠM: [{word,ipa,vi,freq,source,srcType,at}] chờ xác nhận
progress.imports = progress.imports || [];        // LỊCH SỬ nhập: [{id,type,name,url,at,total,added,dupLib,dupRoom}]
progress.settings = progress.settings || {};      // {viVoice, enVoice, viRate, enRate}
progress.activity = progress.activity || {};       // 'YYYY-MM-DD' -> {rev, new, sent}
progress.sentSrs = progress.sentSrs || {};         // hash câu -> {ef,interval,due,reps}
progress.playCount = progress.playCount || {};     // word(lowercase) -> số lần đã phát/nghe
progress.plan = progress.plan || {};               // {date, wordsDone, sentsDone}
progress.dailyList = progress.dailyList || {};     // {date, words:[...], sents:[...]}
progress.exampleTx = progress.exampleTx || {};     // câu ví dụ -> {vi, zh, pinyin} (cache dịch)
function save(){ localStorage.setItem(STORE, JSON.stringify(progress)); }
function todayKey(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function logActivity(type, n=1){
  const k=todayKey(); const a=progress.activity[k]||(progress.activity[k]={rev:0,new:0,sent:0});
  a[type]=(a[type]||0)+n;
}
function fmtDay(dt){ return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0"); }
function activeDaySet(){
  const s=new Set();
  for(const k in progress.activity){ const a=progress.activity[k]; if((a.rev||0)+(a.new||0)+(a.sent||0)>0) s.add(k); }
  return s;
}
// Chuỗi ngày học liên tiếp
function computeStreak(){
  const days=activeDaySet();
  let cur=0, d=new Date(); d.setHours(0,0,0,0);
  const activeToday=days.has(fmtDay(d));
  if(!activeToday) d=new Date(d.getTime()-DAY_MS);   // hôm nay chưa học → tính từ hôm qua
  while(days.has(fmtDay(d))){ cur++; d=new Date(d.getTime()-DAY_MS); }
  let longest=0; const sorted=[...days].sort();
  for(let i=0;i<sorted.length;i++){
    let run=1; let cd=new Date(sorted[i]+"T00:00:00");
    while(days.has(fmtDay(new Date(cd.getTime()+DAY_MS)))){ run++; cd=new Date(cd.getTime()+DAY_MS); }
    // chỉ đếm run bắt đầu (ngày trước đó không active)
    const prev=fmtDay(new Date(new Date(sorted[i]+"T00:00:00").getTime()-DAY_MS));
    if(!days.has(prev)) longest=Math.max(longest,run);
  }
  return {current:cur, longest:Math.max(longest,cur), activeToday};
}
function dueTotalToday(){ return srsCounts().due + sentCounts().due; }

/* ---------- Kế hoạch học hằng ngày ---------- */
function planTargets(){ return {w:progress.settings.planWords||100, s:progress.settings.planSents||100}; }
function planToday(){ const a=progress.activity[todayKey()]||{}; return {words:(a.rev||0)+(a.new||0), sents:a.sent||0}; }
// Tự lập danh sách CỐ ĐỊNH cho hôm nay (ưu tiên từ/câu MỚI chưa học), giữ nguyên trong ngày
function buildDailyList(force){
  const t=planTargets(), k=todayKey();
  if(!force && progress.dailyList.date===k && progress.dailyList.words) return progress.dailyList;
  // Từ: ưu tiên chưa có trong SRS (mới), rồi đến từ đến hạn, rồi phần còn lại
  const vocab=allVocab().filter(v=>v.word&&v.vi);
  const now=today0();
  const fresh=vocab.filter(v=>!progress.srs[v.word]);
  const due=vocab.filter(v=>{const s=progress.srs[v.word];return s&&s.due<=now;});
  const rest=vocab.filter(v=>progress.srs[v.word] && !(progress.srs[v.word].due<=now));
  const words=shuffle(fresh).concat(shuffle(due)).concat(shuffle(rest)).slice(0,t.w).map(v=>v.word);
  // Câu: ưu tiên chưa ôn
  const sents=allSentences();
  const sFresh=sents.filter(s=>!progress.sentSrs[sentKey(s.en)]);
  const sRest=sents.filter(s=>progress.sentSrs[sentKey(s.en)]);
  const sList=shuffle(sFresh).concat(shuffle(sRest)).slice(0,t.s).map(s=>s.en);
  progress.dailyList={date:k, words, sents:sList}; save();
  return progress.dailyList;
}
function todayWordObjs(){ const dl=buildDailyList(); return dl.words.map(w=>findWord(w)||{word:w,vi:"",ipa:""}).filter(Boolean); }
function todaySentObjs(){ const dl=buildDailyList(); const all=allSentences(); return dl.sents.map(en=>all.find(s=>s.en===en)||{en,vi:"",topic:""}); }
// Học tuần tự danh sách hôm nay (SRS từ)
function studyDailyWords(){
  go('srs');
  const list=todayWordObjs(); list.forEach(v=>srsInit(v.word));
  srsQueue=list.slice(); srsShown=false; srsSessionDone=0; srsSess={again:0,hard:0,good:0,easy:0};
  if($("#srsSessBox")) srsSessBox();
  drawSrs();
  toast(`▶ Học ${list.length} từ hôm nay`);
}
function studyDailySents(){
  go('sentsrs');
  const list=todaySentObjs(); list.forEach(s=>sentSrsInit(s.en));
  sentQueue=list.slice(); sentShown=false; sentDone=0;
  drawSentSrs();
  toast(`▶ Ôn ${list.length} câu hôm nay`);
}
function listenDailyWords(){
  const list=todayWordObjs();
  Seq.start(list.map(v=>({en:v.word, vi:v.vi, ab:amBoiAny(v.word)})), {sayVi:true, gap:450, countPlay:true});
  toast(`▶ Nghe ${list.length} từ hôm nay`);
}
function planCardHTML(){
  const t=planTargets(), p=planToday();
  const wPct=Math.min(100,Math.round(p.words/t.w*100)), sPct=Math.min(100,Math.round(p.sents/t.s*100));
  const barrow=(label,done,goal,pct,color,jump,btn)=>`
    <div style="margin:8px 0">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
        <span>${label} <b>${done}/${goal}</b> ${done>=goal?'✅':''}</span>
        <button class="btn sm" data-jump="${jump}">${btn}</button>
      </div>
      <div class="progress-bar" style="height:12px"><i style="width:${pct}%;background:${color}"></i></div>
    </div>`;
  const dl=buildDailyList();
  return `<div class="panel">
    <h3>🎯 Kế hoạch hôm nay</h3>
    ${barrow("📚 Từ vựng",p.words,t.w,wPct,"var(--brand)","srs","Học từ")}
    ${barrow("📖 Câu",p.sents,t.s,sPct,"var(--accent)","sentsrs","Ôn câu")}
    <div style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px">
      <div class="sub" style="margin-bottom:6px">📋 Danh sách cố định hôm nay: <b>${dl.words.length} từ</b> + <b>${dl.sents.length} câu</b> (tự chọn sẵn, giữ nguyên cả ngày)</div>
      <div class="toolbar">
        <button class="btn primary" id="planStudyW">▶ Học từ hôm nay</button>
        <button class="btn" id="planListenW">🎧 Nghe từ hôm nay</button>
        <button class="btn" id="planStudyS">📖 Ôn câu hôm nay</button>
        <button class="btn sm" id="planShow">Xem danh sách</button>
      </div>
      <div id="planListBox"></div>
    </div>
    <p class="sub">${p.words>=t.w&&p.sents>=t.s?'🎉 Hoàn thành mục tiêu hôm nay! Tuyệt vời.':'Học hết danh sách hôm nay để đạt mục tiêu &amp; giữ chuỗi 🔥. Chỉnh mục tiêu trong 📊 Thống kê.'}</p>
  </div>`;
}

/* ---------- Nhắc ôn tập (Notification) ---------- */
function notifySupported(){ return 'Notification' in window; }
function enableNotify(cb){
  if(!notifySupported()){ toast("Trình duyệt không hỗ trợ thông báo"); cb&&cb(false); return; }
  Notification.requestPermission().then(p=>{ progress.settings.notify=(p==="granted"); save(); cb&&cb(p==="granted"); });
}
let notifiedThisSession=false;
function maybeNotifyDue(){
  if(notifiedThisSession) return; notifiedThisSession=true;
  if(!progress.settings.notify || !notifySupported() || Notification.permission!=="granted") return;
  // Nhắc "bắt kịp": nếu đã qua giờ nhắc hôm nay mà chưa nhắc → nhắc ngay khi mở app
  const [h,m]=(progress.settings.notifyTime||"08:00").split(":").map(Number);
  const now=new Date(), t=new Date(); t.setHours(h,m,0,0);
  if(now>=t && progress.settings.lastNotifyDate!==todayKey()) fireReminder();
}
function fireReminder(){
  if(!progress.settings.notify || !notifySupported() || Notification.permission!=="granted") return;
  const due=dueTotalToday();
  try{ new Notification("📚 Đến giờ học tiếng Anh!", {
    body: due>0 ? `Bạn có ${due} mục đến hạn ôn. Học 100 từ/câu hôm nay để giữ chuỗi 🔥!`
                : "Học danh sách 100 từ + 100 câu hôm nay để giữ chuỗi 🔥!",
    icon:"icon-192.png" }); }catch(_){}
  progress.settings.lastNotifyDate=todayKey(); save();
}
// Đặt hẹn nhắc đúng giờ (chỉ chạy khi app đang mở)
let reminderTimer=null;
function scheduleReminder(){
  clearTimeout(reminderTimer);
  if(!progress.settings.notify || !notifySupported()) return;
  const [h,m]=(progress.settings.notifyTime||"08:00").split(":").map(Number);
  const now=new Date(), next=new Date(); next.setHours(h,m,0,0);
  if(next<=now) next.setTime(next.getTime()+86400000);
  reminderTimer=setTimeout(()=>{ fireReminder(); scheduleReminder(); }, next-now);
}

/* ---------- Unified vocab pool (built-in + user-added) ---------- */
function allVocab(){
  const seen = new Set(D.vocab.map(v=>v.word.toLowerCase()));
  const extra = progress.myWords.filter(w=>!seen.has(w.word.toLowerCase()));
  return D.vocab.concat(extra);
}
function findWord(word){
  const lw=word.toLowerCase();
  return D.vocab.find(v=>v.word.toLowerCase()===lw) ||
         progress.myWords.find(w=>w.word.toLowerCase()===lw) || null;
}
function isKnown(word){
  const lw=word.toLowerCase();
  return D.vocab.some(v=>v.word.toLowerCase()===lw) ||
         progress.myWords.some(m=>m.word.toLowerCase()===lw);
}
function addMyWord(w){
  if(isKnown(w.word)) return false;
  progress.myWords.push(w); srsInit(w.word); logActivity("new"); save(); return true;
}

/* ---------- Pipeline: nguồn → room tạm → lọc trùng → xác nhận → thư viện ---------- */
function inPending(word){ const lw=word.toLowerCase(); return progress.pending.find(p=>p.word.toLowerCase()===lw); }
function hashText(t){ let h=0; const s=(t||"").toLowerCase().replace(/\s+/g," ").trim();
  for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))|0; } return (h>>>0).toString(36); }

// Tách câu để lấy ví dụ chứa từ
function splitSentences(text){
  return (text||"").replace(/\s+/g," ").split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(s=>s.length>3);
}
// Tìm câu ví dụ ngắn nhất (>3 từ) chứa từ/cụm
function findExample(sents, term){
  const re=new RegExp("\\b"+term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i");
  let best="";
  for(const s of sents){ if(re.test(s)){ if(!best || (s.length<best.length && s.split(" ").length>=4)) best=s; } }
  return best;
}
// Trích ứng viên từ 1 đoạn text (lọc cơ bản: độ dài, từ thông dụng, từ đơn giản), xếp theo tần suất
function extractCandidates(text, {maxN=50, minLen=4, removeFunc=true, removeSimple=false, withExample=true}={}){
  const freq=new Map();
  tokenizeEn(text).forEach(w=>{
    if(w.length<minLen) return;
    if(removeFunc && STOP.has(w)) return;
    if(removeSimple && SIMPLE_WORDS.has(w)) return;
    freq.set(w,(freq.get(w)||0)+1);
  });
  const sents=withExample?splitSentences(text):[];
  return [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,maxN)
    .map(([w,f])=>{ const g=D.gloss[w];
      return {word:w, freq:f, ipa:ipaSlashed(w), vi:g?g.v:"", pos:posGuess(w),
        example: withExample?findExample(sents,w):""}; });
}

// Đưa ứng viên vào ROOM TẠM, tự lọc trùng thư viện & trùng room. Ghi lịch sử nhập.
function pushToPending(cands, {source="import", srcType="text", name="", url=""}={}){
  let added=0, dupLib=0, dupRoom=0;
  cands.forEach(c=>{
    if(isKnown(c.word)){ dupLib++; return; }               // đã có trong thư viện keyword
    const ex=inPending(c.word);
    if(ex){ ex.freq+=c.freq; dupRoom++; return; }           // đã có trong room tạm → gộp tần suất
    progress.pending.push({word:c.word, ipa:c.ipa||"", vi:c.vi||"", zh:c.zh||"", pinyin:c.pinyin||"",
      pos:c.pos||"", phrase:!!c.phrase, example:c.example||"", exampleVi:c.exampleVi||"", exampleZh:c.exampleZh||"", examplePinyin:c.examplePinyin||"", freq:c.freq, source, srcType, at:Date.now()});
    added++;
  });
  const rec={ id:hashText((name||"")+"|"+(url||"")+"|"+source+"|"+Date.now()).slice(0,8),
    type:srcType, name:name||source, url:url||"", at:Date.now(),
    total:cands.length, added, dupLib, dupRoom };
  progress.imports.unshift(rec);
  if(progress.imports.length>50) progress.imports.length=50;
  save();
  return {added, dupLib, dupRoom, rec};
}

// Kiểm tra nguồn đã nhập trùng chưa (theo url hoặc hash nội dung)
function findPriorImport({url="", contentHash=""}={}){
  return progress.imports.find(r=> (url && r.url && r.url===url) || (contentHash && r.name===contentHash) );
}

// Xác nhận: chuyển các từ đã chọn từ room tạm vào thư viện keyword
function confirmPending(words, roomName, topic){
  const set=new Set(words.map(w=>w.toLowerCase()));
  let n=0;
  progress.pending.filter(p=>set.has(p.word.toLowerCase())).forEach(p=>{
    if(addMyWord({word:p.word, ipa:p.ipa, vi:p.vi||"", zh:p.zh||"", pinyin:p.pinyin||"", pos:p.pos||"",
      phrase:!!p.phrase, example:p.example||"", exampleVi:p.exampleVi||"", exampleZh:p.exampleZh||"", examplePinyin:p.examplePinyin||"", topic:topic||"", source:roomName||p.source||"import"})) n++;
  });
  progress.pending = progress.pending.filter(p=>!set.has(p.word.toLowerCase()));
  save(); return n;
}
function removeFromPending(words){
  const set=new Set(words.map(w=>w.toLowerCase()));
  progress.pending = progress.pending.filter(p=>!set.has(p.word.toLowerCase())); save();
}
function clearPending(){ progress.pending=[]; save(); }

/* ---------- Tự động dịch nghĩa (Google Translate → MyMemory fallback) ---------- */
async function translateWord(w){
  try{
    const u=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(w)}`;
    const r=await fetch(u);
    if(r.ok){ const j=await r.json(); const t=(j[0]||[]).map(s=>s[0]).join("").trim();
      if(t && t.toLowerCase()!==w.toLowerCase()) return t; }
  }catch(_){}
  try{
    const r=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(w)}&langpair=en|vi`);
    if(r.ok){ const j=await r.json(); const t=(j.responseData&&j.responseData.translatedText||"").trim();
      if(t && !/MYMEMORY WARNING/i.test(t)) return t; }
  }catch(_){}
  return "";
}
// Loại từ (POS): map tên tiếng Việt + đoán theo hậu tố khi không có từ điển
const POS_VI={noun:"danh từ",verb:"động từ",adjective:"tính từ",adverb:"trạng từ",
  pronoun:"đại từ",preposition:"giới từ",conjunction:"liên từ",interjection:"thán từ",
  determiner:"hạn định từ",numeral:"số từ",abbreviation:"viết tắt",particle:"tiểu từ",exclamation:"thán từ"};
function posGuess(w){
  if(/(tion|sion|ment|ness|ity|ance|ence|ship|hood|ism|ist|ology)$/.test(w)) return "danh từ";
  if(/(ize|ise|ify|ate)$/.test(w)) return "động từ";
  if(/(ous|ful|less|ive|able|ible|ical|ic|ish|ary|ent|ant)$/.test(w)) return "tính từ";
  if(/ly$/.test(w)) return "trạng từ";
  return "";
}
// Bộ ~220 từ phổ thông (đơn giản) để loại bỏ khi cần
const SIMPLE_WORDS=new Set(("time people year day thing man woman child world life hand part place case week "+
"company system program question work government number night point home water room mother area money story fact "+
"month lot right study book eye job word business issue side kind head house service friend father power hour game "+
"line end member law car city community name president team minute idea body information back parent face others "+
"level office door health person art war history party result change morning reason research girl guy moment air "+
"teacher force education foot boy age policy process music market sense nation plan college interest death course "+
"someone experience behavior car food rate difference light development report son offer form event industry "+
"good great little own other old high different small large next early young important few public bad same able "+
"have make know take see come think look want give use find tell ask work seem feel try leave call good new first "+
"last long little great little other old right big high different small large next early young important public "+
"really also very just even back there down still around however world people going always usually often").split(/\s+/));

// Dịch đa ngữ: Việt + loại từ (dt=bd) + Trung giản thể + pinyin (dt=rm)
async function translateRich(word){
  const out={vi:"",pos:"",zh:"",pinyin:""};
  try{
    const u=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&q=${encodeURIComponent(word)}`;
    const j=await (await fetch(u)).json();
    out.vi=(j[0]||[]).map(s=>s[0]).join("").trim();
    const d=(j[1]||[])[0]; if(d&&d[0]) out.pos=POS_VI[d[0]]||d[0];
  }catch(_){}
  if(!out.vi){ try{ out.vi=await translateWord(word); }catch(_){} }
  try{
    const u=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&dt=rm&q=${encodeURIComponent(word)}`;
    const j=await (await fetch(u)).json();
    out.zh=(j[0]||[]).map(s=>s[0]).filter(Boolean).join("").trim();
    const rm=(j[0]||[]).find(s=>s[2]); if(rm) out.pinyin=rm[2];
  }catch(_){}
  if(!out.pos) out.pos=posGuess(word);
  return out;
}
// Dịch cả câu: Việt + Trung (Mandarin) + pinyin
async function translateSentenceRich(text){
  const out={vi:"",zh:"",pinyin:""};
  try{ out.vi=await translateWord(text); }catch(_){}
  try{
    const u=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
    const j=await (await fetch(u)).json();
    out.zh=(j[0]||[]).map(s=>s[0]).filter(Boolean).join("").trim();
    out.pinyin=(j[0]||[]).map(s=>s[2]).filter(Boolean).join(" ").trim();
  }catch(_){}
  return out;
}
// Dịch các mục trong room tạm (Việt + Trung + loại từ + câu ví dụ: Việt + Trung + pinyin)
async function translatePending(onProg){
  const todo=progress.pending.filter(p=>!p.vi||!p.zh||!p.pos||(p.example&&(!p.exampleVi||!p.exampleZh)));
  if(!todo.length) return 0;
  let done=0, ok=0; const conc=4;
  for(let i=0;i<todo.length;i+=conc){
    await Promise.all(todo.slice(i,i+conc).map(async p=>{
      if(!p.vi||!p.zh||!p.pos){
        const r=await translateRich(p.word);
        if(r.vi) p.vi=r.vi; if(r.zh) p.zh=r.zh; if(r.pinyin) p.pinyin=r.pinyin; if(r.pos) p.pos=p.pos||r.pos;
        if(r.vi) ok++;
      }
      if(p.example && (!p.exampleVi||!p.exampleZh)){
        const r=await translateSentenceRich(p.example);
        if(r.vi) p.exampleVi=r.vi; if(r.zh) p.exampleZh=r.zh; if(r.pinyin) p.examplePinyin=r.pinyin;
      }
      done++; if(onProg) onProg(done, todo.length);
    }));
  }
  save(); return ok;
}

// Trích cụm từ (collocation) — cặp từ nội dung liền nhau, tần suất ≥2
function extractCollocations(text, {minLen=3, maxN=20}={}){
  const toks=tokenizeEn(text); const freq=new Map();
  for(let i=0;i<toks.length-1;i++){
    const a=toks[i], b=toks[i+1];
    if(a.length<minLen||b.length<minLen) continue;
    if(STOP.has(a)||STOP.has(b)||SIMPLE_WORDS.has(a)||SIMPLE_WORDS.has(b)) continue;
    const k=a+" "+b; freq.set(k,(freq.get(k)||0)+1);
  }
  const sents=splitSentences(text);
  return [...freq.entries()].filter(([,f])=>f>=2).sort((x,y)=>y[1]-x[1]).slice(0,maxN)
    .map(([w,f])=>({word:w, freq:f, ipa:"", vi:"", phrase:true, example:findExample(sents,w)}));
}
// Âm bồi cho từ hoặc cụm
function amBoiAny(s){ return (s||"").includes(" ")?amBoiForSentence(s):amBoiForWord(s); }

/* ---------- Quản lý room/nguồn trong thư viện ---------- */
function libraryRooms(){ const m={}; progress.myWords.forEach(w=>{ const s=w.source||"import"; m[s]=(m[s]||0)+1; }); return m; }
function deleteRoom(source){
  progress.myWords.filter(w=>(w.source||"import")===source).forEach(w=>{
    delete progress.srs[w.word]; delete progress.learned[w.word];
  });
  progress.myWords=progress.myWords.filter(w=>(w.source||"import")!==source);
  save();
}
function renameRoom(oldName, newName){
  progress.myWords.forEach(w=>{ if((w.source||"import")===oldName) w.source=newName; });
  save();
}
function deleteLibWord(word){
  const lw=word.toLowerCase();
  progress.myWords=progress.myWords.filter(w=>w.word.toLowerCase()!==lw);
  delete progress.srs[word]; delete progress.learned[word]; save();
}
// Gỡ từ trùng lặp (cùng chữ) — giữ mục đầu, gộp source
function dedupLibrary(){
  const seen=new Map(); const keep=[];
  progress.myWords.forEach(w=>{ const k=w.word.toLowerCase();
    if(seen.has(k)){ delete progress.srs[w.word]; return; } seen.set(k,1); keep.push(w); });
  const removed=progress.myWords.length-keep.length; progress.myWords=keep; save(); return removed;
}
// Nhóm các từ có cùng nghĩa tiếng Việt (nghi trùng nghĩa)
function duplicateMeanings(){
  const m={};
  progress.myWords.forEach(w=>{ if(!w.vi) return; const k=w.vi.trim().toLowerCase();
    (m[k]=m[k]||[]).push(w.word); });
  return Object.entries(m).filter(([,ws])=>ws.length>1).map(([vi,ws])=>({vi, words:ws}));
}

/* ---------- IPA lookup ---------- */
function ipaClean(s){ return (s||"").replace(/^\/|\/$/g,"").trim(); }
function ipaFor(word){
  const lw=word.toLowerCase();
  const g=D.gloss[lw]; if(g&&g.i) return ipaClean(g.i);
  if(D.ipaDict[lw]) return ipaClean(D.ipaDict[lw]);
  // thử bỏ đuôi thường gặp
  for(const suf of ["s","es","ed","ing","'s","er","ly"]){
    if(lw.endsWith(suf)){ const base=lw.slice(0,-suf.length);
      if(D.ipaDict[base]) return ipaClean(D.ipaDict[base]); }
  }
  return "";
}
function ipaSlashed(word){ const i=ipaFor(word); return i?("/"+i+"/"):""; }

/* ---------- Âm bồi (IPA → phiên âm tiếng Việt gần đúng) ---------- */
const AB_MULTI = [
  ["aʊ","ao"],["aɪ","ai"],["eɪ","ây"],["oʊ","âu"],["əʊ","âu"],["ɔɪ","oi"],
  ["ɪə","ia"],["eə","e"],["ʊə","ua"],["ɜr","ơ"],["ər","ơ"],
  ["tʃ","ch"],["dʒ","gi"],["ts","x"],["dz","d"],
];
const AB_SINGLE = {
  "ɑ":"a","a":"a","æ":"e","ʌ":"â","ɔ":"o","ɒ":"o","ɛ":"e","e":"e","ə":"ơ","ɜ":"ơ",
  "ɪ":"i","i":"i","ɨ":"i","ʊ":"u","u":"u","ʉ":"u","o":"ô","y":"uy",
  "b":"b","d":"đ","ð":"đ","ɡ":"g","g":"g","h":"h","k":"c","l":"l","m":"m","n":"n",
  "ŋ":"ng","p":"p","r":"r","s":"x","ʃ":"s","t":"t","θ":"th","v":"v","w":"qu",
  "j":"y","z":"d","ʒ":"zi","f":"ph","x":"kh","ɹ":"r",
};
function abSyllable(s){
  let out="", i=0;
  while(i<s.length){
    let m=null;
    for(const [k,v] of AB_MULTI){ if(s.startsWith(k,i)){ out+=v; i+=k.length; m=1; break; } }
    if(m) continue;
    const ch=s[i];
    if(AB_SINGLE[ch]!=null) out+=AB_SINGLE[ch];
    else if(/[a-zàáâ]/i.test(ch)) out+=ch;      // để nguyên nếu không tra được
    i++;
  }
  return out;
}
function ipaWordToAmBoi(chunk){
  // dùng dấu trọng âm (ˈ ˌ) làm ranh giới âm tiết → nối bằng gạch để dễ đọc
  let s=chunk.normalize("NFC").replace(/[.ːˑ‿]/g,"");
  const parts=s.split(/[ˈˌ]/).map(p=>abSyllable(p.trim())).filter(Boolean);
  return parts.join("-");
}
function amBoiForWord(word){
  const ipa=ipaFor(word); if(!ipa) return "";
  return ipa.split(/\s+/).map(ipaWordToAmBoi).filter(Boolean).join(" ");
}
function amBoiForIpa(ipa){
  if(!ipa) return "";
  return ipaClean(ipa).split(/\s+/).map(ipaWordToAmBoi).filter(Boolean).join(" ");
}

/* ---------- Gốc từ (word roots: tiền tố / hậu tố) ---------- */
function rootBreakdown(word){
  const w=word.toLowerCase().replace(/[^a-z]/g,"");
  const lines=[];
  let pre=null, suf=null;
  const preKeys=Object.keys(D.prefixes).sort((a,b)=>b.length-a.length);
  for(const p of preKeys){ if(w.startsWith(p) && w.length>p.length+2){ pre=D.prefixes[p]; break; } }
  const sufKeys=Object.keys(D.suffixes).sort((a,b)=>b.length-a.length);
  for(const s of sufKeys){ if(w.endsWith(s) && w.length>s.length+2){ suf=D.suffixes[s]; break; } }
  if(pre) lines.push(`◆ Tiền tố: ${pre}`);
  if(suf) lines.push(`◆ Hậu tố: ${suf}`);
  if(!lines.length) lines.push("◆ (từ gốc — không tách được tiền/hậu tố)");
  return lines.join("\n");
}

/* ---------- Audio (Web Speech) + Youglish ---------- */
let enVoice = null, viVoice = null, zhVoice = null, allVoices = [];
function scoreViVoice(v){
  let s=0; const n=(v.name||"").toLowerCase();
  if(/vi[-_]?vn/i.test(v.lang)) s+=10; else if(/^vi/i.test(v.lang)) s+=6;
  if(/natural|neural|online/.test(n)) s+=6;  // giọng Neural/Natural nghe chuẩn nhất (Edge/Microsoft)
  if(/google/.test(n)) s+=5;                 // Google TTS tiếng Việt tự nhiên
  if(/(hoaimy|hoai|namminh|nam|my|linh|thu|an)/.test(n)) s+=2;
  if(v.localService===false) s+=1;           // giọng online thường tự nhiên hơn
  return s;
}
// Làm sạch text tiếng Việt trước khi đọc (bỏ ngoặc chú thích, tách biến thể) để phát âm rõ hơn
function cleanVi(text){
  return (text||"")
    .replace(/\([^)]*\)/g," ")     // bỏ phần trong ngoặc (thường là chú thích/từ Anh)
    .replace(/[;/|].*$/,"")         // chỉ đọc nghĩa đầu tiên nếu có nhiều nghĩa ngăn bởi ; / |
    .replace(/\s+/g," ").trim();
}
function pickVoice(){
  const vs = speechSynthesis.getVoices(); allVoices = vs;
  const st = progress.settings||{};
  // English
  enVoice = (st.enVoice && vs.find(v=>v.voiceURI===st.enVoice))
         || vs.find(v=>/en[-_]US/i.test(v.lang)) || vs.find(v=>/en[-_]GB/i.test(v.lang))
         || vs.find(v=>/^en/i.test(v.lang)) || null;
  // Vietnamese — chọn giọng có điểm cao nhất để đọc "chuẩn theo âm tiếng Việt"
  const viList = vs.filter(v=>/^vi/i.test(v.lang)).sort((a,b)=>scoreViVoice(b)-scoreViVoice(a));
  viVoice = (st.viVoice && vs.find(v=>v.voiceURI===st.viVoice)) || viList[0] || null;
  // Chinese (Mandarin giản thể) để đọc nghĩa tiếng Trung
  const zhList = vs.filter(v=>/^zh(-|_)?(cn|hans)?/i.test(v.lang) || /chinese|mandarin|普通话|中文/i.test(v.name||""));
  zhVoice = (st.zhVoice && vs.find(v=>v.voiceURI===st.zhVoice))
    || zhList.find(v=>/zh[-_]?cn|hans/i.test(v.lang)) || zhList[0] || null;
}
if ('speechSynthesis' in window){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, rate){
  if(!('speechSynthesis' in window)) { toast("Trình duyệt không hỗ trợ đọc"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; if(enVoice) u.voice = enVoice;
  u.rate = rate || (progress.settings.enRate||0.9);
  speechSynthesis.speak(u);
}
// Đọc tiếng Việt (nghĩa) — dùng giọng Việt tốt nhất, tốc độ riêng
function speakVi(text, rate){
  if(!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanVi(text));
  u.lang = "vi-VN"; if(viVoice) u.voice = viVoice;
  u.rate = rate || (progress.settings.viRate||0.95);
  speechSynthesis.speak(u);
}
// Đọc nghĩa tiếng Trung (Mandarin)
function speakZh(text, rate){
  if(!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang="zh-CN"; if(zhVoice) u.voice=zhVoice; u.rate=rate||(progress.settings.zhRate||1);
  speechSynthesis.speak(u);
}
// Đọc 1 mục và trả Promise khi xong (dùng cho phát tuần tự). lang: 'en' | 'vi' | 'zh'
function speakP(text, {lang="en-US", rate}={}){
  return new Promise(resolve=>{
    if(!('speechSynthesis' in window) || !text){ resolve(); return; }
    const isVi=lang.startsWith("vi"), isZh=lang.startsWith("zh");
    const u=new SpeechSynthesisUtterance(isVi?cleanVi(text):text);
    u.lang = isZh ? "zh-CN" : isVi ? "vi-VN" : "en-US";
    u.rate = rate || (isZh ? (progress.settings.zhRate||1) : isVi ? (progress.settings.viRate||0.95) : (progress.settings.enRate||0.9));
    if(isZh && zhVoice) u.voice=zhVoice;
    else if(isVi && viVoice) u.voice=viVoice;
    else if(!isVi && !isZh && enVoice) u.voice=enVoice;
    u.onend=resolve; u.onerror=resolve;
    speechSynthesis.speak(u);
  });
}
function hasViVoice(){ return !!viVoice; }
function hasZhVoice(){ return !!zhVoice; }
// Đếm số lần một từ được phát/nghe
function bumpPlay(word){ if(!word) return; const k=word.toLowerCase(); progress.playCount[k]=(progress.playCount[k]||0)+1; }
function playCountOf(word){ return progress.playCount[(word||"").toLowerCase()]||0; }

/* ---------- Wake Lock: giữ màn hình sáng khi nghe liên tục ---------- */
let wakeLock=null;
async function acquireWake(){
  try{ if('wakeLock' in navigator){ wakeLock=await navigator.wakeLock.request('screen'); } }catch(_){}
}
function releaseWake(){ try{ wakeLock&&wakeLock.release&&wakeLock.release(); }catch(_){} wakeLock=null; }
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible' && typeof Seq!=='undefined' && Seq.playing) acquireWake();
});
const youglish = w => `https://youglish.com/pronounce/${encodeURIComponent(w)}/english`;
const gtranslate = t => `https://translate.google.com/?sl=en&tl=vi&op=translate&text=${encodeURIComponent(t)}`;

/* ---------- Âm bồi cho cả câu ---------- */
function amBoiForSentence(text){
  return (text.match(/[A-Za-z][A-Za-z'-]*/g)||[]).map(w=>amBoiForWord(w)||w).join(" ");
}

/* ---------- Trình phát tuần tự (nghe liên tục, rảnh tay) ---------- */
const Seq = {
  items:[], idx:0, playing:false, paused:false, opts:{}, token:0,
  start(items, opts={}){
    this.stop();
    this.items=items; this.idx=0; this.opts=Object.assign({rate:0.9, gap:600, sayVi:true, sayZh:false, loop:false, countPlay:false, onItem:null}, opts);
    this.playing=true; this.paused=false; this.token++;
    acquireWake();                       // giữ màn hình sáng khi nghe liên tục
    seqBar(true); this._run(this.token);
  },
  async _run(tok){
    while(this.playing && tok===this.token){
      if(this.paused){ await new Promise(r=>setTimeout(r,200)); continue; }
      if(this.idx>=this.items.length){
        if(this.opts.loop){ this.idx=0; } else { this.stop(); break; }
      }
      const it=this.items[this.idx];
      if(this.opts.onItem) this.opts.onItem(it, this.idx);
      if(this.opts.countPlay){ bumpPlay(it.en); save(); }
      seqBar(true, it);
      const viFirst = progress.settings.viFirst!==false;   // mặc định: đọc tiếng Việt trước
      // 1) Nếu bật viFirst: đọc nghĩa tiếng Việt trước
      if(viFirst && this.opts.sayVi && it.vi){
        await speakP(it.vi, {lang:"vi-VN"});
        if(!this.playing || tok!==this.token) break;
        await new Promise(r=>setTimeout(r,180));
      }
      // 2) Đọc tiếng Anh
      await speakP(it.en, {lang:"en-US", rate:this.opts.rate});
      if(!this.playing || tok!==this.token) break;
      // 3) Nếu KHÔNG bật viFirst: đọc tiếng Việt sau tiếng Anh
      if(!viFirst && this.opts.sayVi && it.vi){
        await new Promise(r=>setTimeout(r,180));
        await speakP(it.vi, {lang:"vi-VN"});
        if(!this.playing || tok!==this.token) break;
      }
      // 4) Tiếng Trung (nếu bật)
      if(this.opts.sayZh && it.zh){
        await new Promise(r=>setTimeout(r,180));
        await speakP(it.zh, {lang:"zh-CN"});
      }
      if(!this.playing || tok!==this.token) break;
      await new Promise(r=>setTimeout(r,this.opts.gap));
      if(this.paused) continue;
      this.idx++;
    }
  },
  next(){ speechSynthesis.cancel(); this.idx++; this.token++; if(this.playing){this.paused=false; this._run(this.token);} },
  prev(){ speechSynthesis.cancel(); this.idx=Math.max(0,this.idx-1); this.token++; if(this.playing){this.paused=false; this._run(this.token);} },
  togglePause(){ this.paused=!this.paused; if(this.paused) speechSynthesis.cancel(); seqBar(true, this.items[this.idx]); },
  stop(){ this.playing=false; this.paused=false; this.token++; speechSynthesis.cancel(); releaseWake(); seqBar(false); },
};
function seqBar(show, it){
  let bar=$("#seqBar");
  if(!show){ if(bar) bar.remove(); return; }
  if(!bar){
    bar=document.createElement("div"); bar.id="seqBar"; document.body.appendChild(bar);
  }
  const cur=it||{}; const pos=Seq.items.length?`${Seq.idx+1}/${Seq.items.length}`:"";
  bar.innerHTML=`
    <div class="seq-info">
      <div class="seq-en">${esc(cur.en||"…")}</div>
      <div class="seq-ab">🗣️ ${esc(cur.ab||amBoiForSentence(cur.en||""))}${cur.vi?` · <span style="color:var(--muted)">${esc(cur.vi)}</span>`:""}${cur.zh?` · <span style="color:var(--accent)">${esc(cur.zh)}</span>`:""}</div>
    </div>
    <div class="seq-ctrl">
      <button class="mini" id="seqPrev">⏮</button>
      <button class="mini" id="seqPause">${Seq.paused?"▶":"⏸"}</button>
      <button class="mini" id="seqNext">⏭</button>
      <span class="seq-pos">${pos}</span>
      <button class="mini" id="seqStop">✕</button>
    </div>`;
  $("#seqPrev").onclick=()=>Seq.prev();
  $("#seqPause").onclick=()=>Seq.togglePause();
  $("#seqNext").onclick=()=>Seq.next();
  $("#seqStop").onclick=()=>Seq.stop();
}

/* ---------- Nhận diện giọng nói (luyện nói) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function speechSupported(){ return !!SR; }
function recognizeOnce(cb){
  if(!SR){ cb(null, "unsupported"); return null; }
  const r=new SR(); r.lang="en-US"; r.interimResults=false; r.maxAlternatives=3;
  r.onresult=e=>{ const alts=[...e.results[0]].map(a=>a.transcript.trim()); cb(alts, null); };
  r.onerror=e=>cb(null, e.error||"error");
  try{ r.start(); }catch(_){}
  return r;
}
function normWord(s){ return (s||"").toLowerCase().replace(/[^a-z ]/g,"").trim(); }

/* ---------- Youglish embedded widget ---------- */
let ygLoaded=false, ygLoading=false, ygWidget=null;
function loadYouglishScript(cb){
  if(ygLoaded){ cb(true); return; }
  if(ygLoading){ setTimeout(()=>loadYouglishScript(cb),300); return; }
  ygLoading=true;
  const s=document.createElement("script");
  s.src="https://youglish.com/public/emb/widget.js"; s.async=true; s.charset="utf-8";
  s.onload=()=>{ ygLoaded=true; ygLoading=false; cb(true); };
  s.onerror=()=>{ ygLoading=false; cb(false); };
  document.head.appendChild(s);
  setTimeout(()=>{ if(!ygLoaded) cb(false); },4000);
}
function openYouglish(query){
  $("#modalCard").innerHTML = `
    <button class="close-x" onclick="closeModal()">×</button>
    <h3 style="margin:0 0 4px">🌐 Youglish · phát âm thật trong video</h3>
    <div class="sub" style="margin-bottom:12px">Nghe người bản xứ phát âm <b class="han-cell" style="font-size:18px">${esc(query)}</b> trong ngữ cảnh thật.</div>
    <div id="ygBox" style="min-height:360px;display:grid;place-items:center">
      <div class="sub">Đang tải Youglish… (cần kết nối mạng)</div>
    </div>
    <div class="toolbar" style="margin-top:12px">
      <button class="btn" onclick="speak('${escq(query)}')">🔊 Đọc máy</button>
      <a class="btn primary" href="${youglish(query)}" target="_blank" rel="noopener">Mở Youglish.com ↗</a>
    </div>`;
  $("#modal").classList.remove("hidden");
  loadYouglishScript(ok=>{
    const box=$("#ygBox"); if(!box) return;
    if(!ok || typeof YG==="undefined"){
      box.innerHTML=`<div class="sub" style="text-align:center">Không tải được widget (offline?).<br>Dùng nút <b>Mở Youglish.com</b> bên dưới.</div>`;
      return;
    }
    box.innerHTML=`<div id="ygWidgetEl" style="width:100%"></div>`;
    try{
      ygWidget = new YG.Widget("ygWidgetEl", { width: 560, components: 9, autoStart:1 });
      ygWidget.fetch(query, "english");
    }catch(e){
      box.innerHTML=`<div class="sub">Không khởi tạo được widget. Dùng nút Mở Youglish.com.</div>`;
    }
  });
}

/* ---------- SRS engine (SM-2 lite) ---------- */
const DAY_MS = 86400000;
const today0 = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
function srsInit(word){
  if(!progress.srs[word]) progress.srs[word]={ef:2.5,interval:0,due:today0(),reps:0};
}
function srsDueList(){
  const now=today0();
  return allVocab().filter(v=>{ const s=progress.srs[v.word]; return s && s.due<=now; });
}
function srsNewList(limit){
  return allVocab().filter(v=>!progress.srs[v.word]).slice(0,limit);
}
function srsReview(word, grade){
  srsInit(word);
  const s=progress.srs[word];
  if(grade<3){ s.reps=0; s.interval=0; s.due=today0(); }
  else{
    s.reps++;
    if(s.reps===1) s.interval=1;
    else if(s.reps===2) s.interval=3;
    else s.interval=Math.round(s.interval*s.ef);
    s.ef=Math.max(1.3, s.ef + (0.1 - (5-grade)*(0.08+(5-grade)*0.02)));
    s.due=today0()+s.interval*DAY_MS;
    if(grade>=4) progress.learned[word]=true;
  }
  logActivity("rev");
  save();
}
function srsCounts(){
  const now=today0(); let due=0, learning=0, mature=0, newc=0;
  allVocab().forEach(v=>{ const s=progress.srs[v.word];
    if(!s) newc++; else if(s.due<=now) due++; else if(s.interval>=21) mature++; else learning++; });
  return {due,learning,mature,newc};
}

/* ---------- Source sentences (từ câu ví dụ trong bộ từ vựng) ---------- */
const SENTS = D.vocab.filter(v=>v.example).map(v=>({en:v.example, vi:v.exampleVi, topic:v.topic, word:v.word}));
// Gộp câu built-in + câu ví dụ của từ tự thêm (nếu có)
function allSentences(){
  const my=progress.myWords.filter(w=>w.example).map(w=>({en:w.example, vi:w.exampleVi||"", zh:w.exampleZh||"", pinyin:w.examplePinyin||"", topic:w.topic||w.source||"", word:w.word}));
  return SENTS.concat(my);
}
// Bản dịch câu ví dụ (Trung + pinyin) từ item hoặc cache
function sentTxOf(s){
  if(s.zh||s.pinyin) return {vi:s.vi||"", zh:s.zh||"", pinyin:s.pinyin||""};
  const c=progress.exampleTx[s.en]; return c ? {vi:s.vi||c.vi||"", zh:c.zh, pinyin:c.pinyin} : {vi:s.vi||"", zh:"", pinyin:""};
}
window.translateSentExample=async function(en){
  toast("Đang dịch (cần mạng)...");
  const r=await translateSentenceRich(en);
  progress.exampleTx[en]={vi:r.vi, zh:r.zh, pinyin:r.pinyin}; save();
  if(typeof drawSentSrs==="function" && sentQueue.length) drawSentSrs();
  toast("✓ Đã dịch");
};

/* ---------- SRS cho câu ví dụ ---------- */
function sentKey(en){ return hashText(en); }
function sentSrsInit(en){ const k=sentKey(en); if(!progress.sentSrs[k]) progress.sentSrs[k]={ef:2.5,interval:0,due:today0(),reps:0}; }
function sentSrsReview(en, grade){
  sentSrsInit(en); const s=progress.sentSrs[sentKey(en)];
  if(grade<3){ s.reps=0; s.interval=0; s.due=today0(); }
  else{
    s.reps++;
    if(s.reps===1) s.interval=1; else if(s.reps===2) s.interval=3; else s.interval=Math.round(s.interval*s.ef);
    s.ef=Math.max(1.3, s.ef + (0.1 - (5-grade)*(0.08+(5-grade)*0.02)));
    s.due=today0()+s.interval*DAY_MS;
  }
  logActivity("sent"); save();
}
function sentCounts(){
  const now=today0(); let due=0,newc=0,learning=0,mature=0;
  allSentences().forEach(s=>{ const st=progress.sentSrs[sentKey(s.en)];
    if(!st) newc++; else if(st.due<=now) due++; else if(st.interval>=21) mature++; else learning++; });
  return {due,newc,learning,mature};
}

/* ---------- Toast ---------- */
let toastT;
function toast(msg){
  let t = $("#toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; document.body.appendChild(t);
    t.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:24px;z-index:99;font-size:14px;box-shadow:var(--shadow);transition:opacity .3s"; }
  t.textContent = msg; t.style.opacity="1";
  clearTimeout(toastT); toastT=setTimeout(()=>t.style.opacity="0",1800);
}

/* ---------- Navigation ---------- */
const PAGES = [
  {id:"home",    ico:"🏠", name:"Tổng quan"},
  {id:"srs",     ico:"🧠", name:"Ôn tập ghi nhớ"},
  {id:"sentsrs", ico:"📖", name:"Ôn câu ví dụ"},
  {id:"listen",  ico:"🎧", name:"Luyện nghe"},
  {id:"vocab",   ico:"📚", name:"Từ vựng", badge:D.vocab.length},
  {id:"flash",   ico:"🎴", name:"Flashcard"},
  {id:"write",   ico:"✍️", name:"Luyện viết"},
  {id:"quiz",    ico:"📝", name:"Kiểm tra"},
  {id:"exam",    ico:"🎯", name:"Thi thử"},
  {id:"roots",   ico:"🌱", name:"Gốc từ"},
  {id:"video",   ico:"🎬", name:"Nhập từ vựng"},
  {id:"sents",   ico:"📄", name:"Câu ví dụ", badge:SENTS.length},
  {id:"subtitle",ico:"📋", name:"Phụ đề → Phiên âm"},
  {id:"stats",   ico:"📊", name:"Thống kê"},
];
function buildNav(){
  $("#nav").innerHTML = PAGES.map(p=>`
    <button class="nav-item" data-page="${p.id}">
      <span class="ico">${p.ico}</span><span>${p.name}</span>
      ${p.badge!=null?`<span class="badge">${p.badge}</span>`:""}
    </button>`).join("");
  $$(".nav-item").forEach(b=>b.onclick=()=>go(b.dataset.page));
}
let current = "home";
function go(id){
  if(typeof Seq!=="undefined" && Seq.playing) Seq.stop();
  if(id!=="exam" && examState && examState.timer){ clearInterval(examState.timer); examState=null; }
  current = id;
  $$(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.page===id));
  $("#pageTitle").textContent = PAGES.find(p=>p.id===id).name;
  $("#sidebar").classList.remove("open");
  RENDER[id]();
  $("#view").scrollTop = 0;
  location.hash = id;
}

/* ================= PAGES ================= */
const RENDER = {};

/* ---------- Home ---------- */
RENDER.home = () => {
  const learned = Object.keys(progress.learned).length;
  const byLevel = {};
  D.vocab.forEach(v=>byLevel[v.level]=(byLevel[v.level]||0)+1);
  const topics = new Set(D.vocab.map(v=>v.topic).filter(Boolean));
  const c = srsCounts();
  const stk = computeStreak();
  const dueAll = dueTotalToday();
  $("#view").innerHTML = `
    <h2 class="section-h">Chào mừng trở lại 👋</h2>
    <p class="sub">App ghi nhớ &amp; học tiếng Anh thương mại — tập trung luyện nghe và từ vựng.</p>

    <div class="panel" style="background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;border:none">
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:13px;opacity:.85">Hôm nay cần ôn</div>
          <div style="font-size:42px;font-weight:800;line-height:1">${c.due} thẻ</div>
          <div style="font-size:13px;opacity:.85">${c.newc} từ mới chờ học · ${c.mature} từ đã nhớ lâu</div>
        </div>
        <div style="text-align:center;padding:0 8px">
          <div style="font-size:34px;font-weight:800;line-height:1">${stk.activeToday?'🔥':'🌙'} ${stk.current}</div>
          <div style="font-size:12px;opacity:.85">ngày liên tiếp${stk.longest>stk.current?` · kỷ lục ${stk.longest}`:''}</div>
        </div>
        <div style="display:flex;gap:10px;margin-left:auto;flex-wrap:wrap">
          <button class="btn" data-jump="srs" style="background:#fff;color:var(--brand)">🧠 Ôn tập ngay</button>
          <button class="btn" data-jump="listen" style="background:rgba(255,255,255,.2);color:#fff;border-color:rgba(255,255,255,.4)">🎧 Luyện nghe</button>
        </div>
      </div>
    </div>
    ${dueAll>0 && !stk.activeToday ? `<div class="panel" style="border-color:var(--warn);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">⏰ <b>${dueAll} mục đến hạn ôn</b> hôm nay. Học ngay để giữ chuỗi 🔥 ${stk.current} ngày!</div>
      <button class="btn primary" data-jump="srs">Ôn ngay</button>
      ${notifySupported() && !progress.settings.notify ? `<button class="btn" id="homeNotify">🔔 Bật nhắc</button>`:''}
    </div>`:''}
    ${planCardHTML()}

    <div class="stat-grid">
      <div class="stat"><div class="n">${allVocab().length}</div><div class="l">Tổng từ vựng</div></div>
      <div class="stat"><div class="n">${learned}</div><div class="l">Từ đã thuộc ✓</div></div>
      <div class="stat"><div class="n">${progress.myWords.length}</div><div class="l">Từ tự thêm 🎬</div></div>
      <div class="stat"><div class="n">${SENTS.length}</div><div class="l">Câu ví dụ</div></div>
      <div class="stat"><div class="n">${topics.size}</div><div class="l">Chủ đề</div></div>
    </div>
    <div class="panel">
      <h3>Bắt đầu học nhanh</h3>
      <div class="toolbar">
        <button class="btn primary" data-jump="srs">🧠 Ôn tập ghi nhớ</button>
        <button class="btn" data-jump="listen">🎧 Luyện nghe</button>
        <button class="btn" data-jump="flash">🎴 Flashcard</button>
        <button class="btn" data-jump="write">✍️ Luyện viết</button>
        <button class="btn" data-jump="video">🎬 Nhập từ vựng (video · text · ảnh · PDF)</button>
      </div>
    </div>
    <div class="panel">
      <h3>Từ vựng theo cấp độ</h3>
      <div class="chips">
        ${Object.entries(byLevel).map(([k,v])=>
          `<span class="chip" data-lvl="${esc(k)}">${esc(k)} · ${v}</span>`).join("")}
      </div>
    </div>`;
  $$("[data-jump]").forEach(b=>b.onclick=()=>go(b.dataset.jump));
  $$("[data-lvl]").forEach(c=>c.onclick=()=>{ vocabFilter.level=c.dataset.lvl; go("vocab"); });
  if($("#homeNotify")) $("#homeNotify").onclick=()=>enableNotify(ok=>{ if(ok){toast("Đã bật nhắc ôn tập"); RENDER.home();} });
  if($("#planStudyW")) $("#planStudyW").onclick=studyDailyWords;
  if($("#planListenW")) $("#planListenW").onclick=listenDailyWords;
  if($("#planStudyS")) $("#planStudyS").onclick=studyDailySents;
  if($("#planShow")) $("#planShow").onclick=()=>{
    const box=$("#planListBox"); if(!box) return;
    if(box.innerHTML){ box.innerHTML=""; return; }
    const dl=buildDailyList();
    box.innerHTML=`<div class="table-wrap" style="box-shadow:none;max-height:260px;margin-top:8px"><table><thead><tr><th>#</th><th>Từ</th><th>Nghĩa</th></tr></thead><tbody>
      ${todayWordObjs().map((v,i)=>`<tr><td>${i+1}</td><td class="han-cell">${esc(v.word)}</td><td style="color:var(--muted)">${esc(v.vi||'')}</td></tr>`).join("")}
    </tbody></table></div>`;
  };
  maybeNotifyDue();
};

/* ---------- SRS review page ---------- */
let srsQueue=[], srsShown=false, srsSessionDone=0, srsMode="listen";
/* ---------- Ôn câu ví dụ (SRS trên câu) ---------- */
let sentQueue=[], sentShown=false, sentDone=0;
RENDER.sentsrs = () => {
  const c=sentCounts();
  $("#view").innerHTML=`
    <h2 class="section-h">📖 Ôn câu ví dụ</h2>
    <p class="sub">Lặp lại ngắt quãng trên <b>cả câu</b> (không chỉ từ đơn) — nghe, hiểu nghĩa, tự chấm. Gồm câu mẫu có sẵn + câu ví dụ của từ bạn tự nhập.</p>
    <div class="stat-grid">
      <div class="stat"><div class="n" style="color:var(--warn)">${c.due}</div><div class="l">Đến hạn</div></div>
      <div class="stat"><div class="n" style="color:var(--accent)">${c.newc}</div><div class="l">Câu mới</div></div>
      <div class="stat"><div class="n">${c.learning}</div><div class="l">Đang học</div></div>
      <div class="stat"><div class="n" style="color:var(--ok)">${c.mature}</div><div class="l">Nhớ lâu</div></div>
    </div>
    <div class="toolbar center-narrow" style="justify-content:center">
      <select id="ssTopic"><option value="">Mọi chủ đề</option>
        ${[...new Set(allSentences().map(s=>s.topic).filter(Boolean))].sort().map(t=>`<option>${esc(t)}</option>`).join("")}</select>
      <label class="sub">Câu mới/phiên <input class="txt" id="ssNew" type="number" value="10" min="0" max="50" style="width:64px"></label>
      <button class="btn primary" id="ssStart">Bắt đầu ôn</button>
    </div>
    <div class="progress-bar"><i id="ssProg"></i></div>
    <div id="ssArea"><p class="sub" style="text-align:center">Nhấn <b>Bắt đầu ôn</b> để vào phiên.</p></div>`;
  $("#ssStart").onclick=startSentSrs;
};
function startSentSrs(){
  const tp=$("#ssTopic").value, nNew=parseInt($("#ssNew").value)||0, now=today0();
  const pool=allSentences().filter(s=>!tp||s.topic===tp);
  const due=pool.filter(s=>{ const st=progress.sentSrs[sentKey(s.en)]; return st&&st.due<=now; });
  const news=pool.filter(s=>!progress.sentSrs[sentKey(s.en)]).slice(0,nNew);
  news.forEach(s=>sentSrsInit(s.en));
  sentQueue=shuffle(due.concat(news)); sentShown=false; sentDone=0;
  if(!sentQueue.length){ $("#ssArea").innerHTML=`<div class="panel" style="text-align:center"><h3>🎉 Không còn câu cần ôn!</h3><p class="sub">Tăng "câu mới/phiên" hoặc thêm từ có ví dụ ở 🎬 Nhập từ vựng.</p></div>`; return; }
  drawSentSrs();
}
function drawSentSrs(){
  if(!sentQueue.length){
    $("#ssProg").style.width="100%";
    $("#ssArea").innerHTML=`<div class="panel" style="text-align:center"><h3>✅ Xong phiên!</h3><p class="sub">Đã ôn ${sentDone} câu.</p>
      <button class="btn primary" onclick="RENDER.sentsrs()">Về trang ôn câu</button></div>`;
    return;
  }
  const s=sentQueue[0], total=sentDone+sentQueue.length;
  $("#ssProg").style.width=(sentDone/total*100)+"%";
  $("#ssArea").innerHTML=`
    <div class="flash-wrap"><div class="panel" style="text-align:center">
      <div class="quiz-q">🎧 Nghe câu — hiểu nghĩa rồi lật</div>
      <div style="font-size:52px;margin:6px 0;cursor:pointer" id="ssPlay">🔊</div>
      <div class="toolbar" style="justify-content:center">
        <button class="btn sm" id="ssReplay">▶ Nghe lại</button>
        <button class="btn sm" id="ssSlow">🐢 Chậm</button>
      </div>
      <div id="ssBack" class="${sentShown?'':'hidden'}" style="margin-top:12px">
        ${(()=>{ const tx=sentTxOf(s); return `<div class="example-box"><div class="eh">${esc(s.en)}</div>
          <div style="font-size:12px;color:var(--warn);margin-top:4px">🗣️ ${esc(amBoiForSentence(s.en))}</div>
          <div style="margin-top:6px">🇻🇳 ${esc(tx.vi||'')}</div>
          ${tx.zh?`<div style="margin-top:4px;color:var(--accent)">🀄 ${esc(tx.zh)}${tx.pinyin?` <span class="sub">(${esc(tx.pinyin)})</span>`:''} <span class="audio-btn" onclick="speakZh('${escq(tx.zh)}')">🔊</span></div>`
                 :`<button class="btn sm" style="margin-top:6px" onclick="translateSentExample('${escq(s.en)}')">🌐 Dịch 中文 + pinyin</button>`}
          ${s.topic?`<div style="font-size:11px;color:var(--muted);margin-top:4px">📂 ${esc(s.topic)}</div>`:''}</div>`; })()}
      </div>
      <div class="flash-controls" style="margin-top:12px">
        ${sentShown?`
          <button class="btn" style="border-color:var(--brand)" data-sg="0">😵 Quên</button>
          <button class="btn" data-sg="3">🤔 Khó</button>
          <button class="btn primary" data-sg="4">🙂 Nhớ</button>
          <button class="btn" style="border-color:var(--ok)" data-sg="5">😎 Dễ</button>`:
          `<button class="btn primary" id="ssFlip">Lật câu</button>`}
      </div>
      <div class="hint">còn ${sentQueue.length} câu</div>
    </div></div>`;
  const play=(r)=>speak(s.en, r); play(0.9);
  $("#ssPlay").onclick=()=>play(0.9); $("#ssReplay").onclick=()=>play(0.9); $("#ssSlow").onclick=()=>play(0.55);
  if($("#ssFlip")) $("#ssFlip").onclick=()=>{sentShown=true; drawSentSrs();};
  $$("[data-sg]").forEach(b=>b.onclick=()=>{
    const g=parseInt(b.dataset.sg); sentSrsReview(s.en,g);
    sentQueue.shift(); if(g<3) sentQueue.push(s); else sentDone++;
    sentShown=false; drawSentSrs();
  });
}

let srsSess={again:0,hard:0,good:0,easy:0};
RENDER.srs = () => {
  const c = srsCounts();
  $("#view").innerHTML = `
    <h2 class="section-h">🧠 Ôn tập ghi nhớ</h2>
    <p class="sub">Lặp lại ngắt quãng: từ nào bạn nhớ sẽ giãn cách ôn xa dần, từ nào quên sẽ lặp lại sớm. Chọn kiểu kiểm tra: nghe, viết chính tả hoặc nói.</p>
    <div class="stat-grid">
      <div class="stat"><div class="n" style="color:var(--warn)">${c.due}</div><div class="l">Đến hạn ôn</div></div>
      <div class="stat"><div class="n" style="color:var(--accent)">${c.newc}</div><div class="l">Từ mới</div></div>
      <div class="stat"><div class="n">${c.learning}</div><div class="l">Đang học</div></div>
      <div class="stat"><div class="n" style="color:var(--ok)">${c.mature}</div><div class="l">Nhớ lâu</div></div>
    </div>
    <div class="chips" style="justify-content:center">
      <span class="chip ${srsMode==='listen'?'active':''}" data-sm="listen">🎧 Nghe &amp; lật</span>
      <span class="chip ${srsMode==='write'?'active':''}" data-sm="write">✍️ Viết chính tả</span>
      <span class="chip ${srsMode==='speak'?'active':''}" data-sm="speak">🎤 Luyện nói</span>
    </div>
    <div class="toolbar center-narrow" style="justify-content:center">
      <select id="srsLevel"><option value="">Mọi cấp độ</option>
        ${[...new Set(D.vocab.map(v=>v.level))].map(l=>`<option>${esc(l)}</option>`).join("")}</select>
      <label class="sub">Số từ mới/phiên: <input class="txt" id="srsNew" type="number" value="10" min="0" max="50" style="width:70px"></label>
      <button class="btn primary" id="srsStart">Bắt đầu ôn</button>
    </div>
    <div id="srsSessBox" class="hidden" style="text-align:center;margin-bottom:8px"></div>
    <div class="progress-bar"><i id="srsProg"></i></div>
    <div id="srsArea"></div>`;
  $$(".chip[data-sm]").forEach(c=>c.onclick=()=>{srsMode=c.dataset.sm; RENDER.srs();});
  $("#srsStart").onclick = startSrs;
  $("#srsArea").innerHTML = `<p class="sub" style="text-align:center">Nhấn <b>Bắt đầu ôn</b> để vào phiên học.</p>`;
};
function srsSessBox(){
  const b=$("#srsSessBox"); if(!b) return;
  const tot=srsSess.again+srsSess.hard+srsSess.good+srsSess.easy;
  if(!tot){ b.classList.add("hidden"); return; }
  b.classList.remove("hidden");
  b.innerHTML=`<span class="chip" style="border-color:var(--brand)">😵 Quên: ${srsSess.again}</span>
    <span class="chip">🤔 Khó: ${srsSess.hard}</span>
    <span class="chip" style="border-color:var(--accent)">🙂 Nhớ: ${srsSess.good}</span>
    <span class="chip" style="border-color:var(--ok)">😎 Dễ: ${srsSess.easy}</span>`;
}
function startSrs(){
  const lvl=$("#srsLevel").value;
  const nNew=parseInt($("#srsNew").value)||0;
  let due=srsDueList().filter(v=>!lvl||v.level===lvl);
  let news=srsNewList(500).filter(v=>!lvl||v.level===lvl).slice(0,nNew);
  news.forEach(v=>srsInit(v.word));
  srsQueue=shuffle(due.concat(news)); srsShown=false; srsSessionDone=0;
  srsSess={again:0,hard:0,good:0,easy:0};
  if(!srsQueue.length){ $("#srsArea").innerHTML=`<div class="panel" style="text-align:center"><h3>🎉 Không còn thẻ cần ôn!</h3><p class="sub">Quay lại sau hoặc thêm từ mới ở mục 🎬 Nhập video.</p></div>`; return; }
  drawSrs();
}
const GRADE_KEY={0:"again",3:"hard",4:"good",5:"easy"};
function srsGrade(v, g){
  srsReview(v.word, g);
  srsSess[GRADE_KEY[g]]++;
  srsSessBox();
  srsQueue.shift();
  if(g<3) srsQueue.push(v);
  else srsSessionDone++;
  srsShown=false; drawSrs();
}
function gradeButtons(){
  return `
    <button class="btn" style="border-color:var(--brand)" data-g="0">😵 Quên</button>
    <button class="btn" data-g="3">🤔 Khó</button>
    <button class="btn primary" data-g="4">🙂 Nhớ</button>
    <button class="btn" style="border-color:var(--ok)" data-g="5">😎 Dễ</button>`;
}
function bindGrades(v){
  $$("[data-g]").forEach(b=>b.onclick=()=>srsGrade(v, parseInt(b.dataset.g)));
}
function drawSrs(){
  srsSessBox();
  if(!srsQueue.length){
    $("#srsProg").style.width="100%";
    $("#srsArea").innerHTML=`<div class="panel" style="text-align:center"><h3>✅ Xong phiên ôn!</h3>
      <p class="sub">Đã ôn ${srsSessionDone} thẻ · 😵 ${srsSess.again} · 🤔 ${srsSess.hard} · 🙂 ${srsSess.good} · 😎 ${srsSess.easy}</p>
      <button class="btn primary" onclick="RENDER.srs()">Về trang ôn tập</button></div>`;
    return;
  }
  const v=srsQueue[0];
  const total=srsSessionDone+srsQueue.length;
  $("#srsProg").style.width=(srsSessionDone/total*100)+"%";
  if(srsMode==="write") return drawSrsWrite(v);
  if(srsMode==="speak") return drawSrsSpeak(v);
  drawSrsListen(v);
}
function drawSrsListen(v){
  $("#srsArea").innerHTML=`
    <div class="flash-wrap">
      <div class="flash" id="srsCard">
        <div class="fhan">${esc(v.word)}</div>
        <div style="color:var(--warn);font-size:16px;margin-top:6px">🗣️ ${esc(amBoiForWord(v.word))}</div>
        <div id="srsBack" class="${srsShown?'':'hidden'}">
          <div class="fpin">${esc(ipaSlashed(v.word)||v.ipa||'')}</div>
          <div class="fvi">${esc(v.vi)}</div>
        </div>
        <div class="hint">${srsShown?'Bạn nhớ tốt tới mức nào?':'Nghe &amp; đoán nghĩa → nhấn để lật'} · còn ${srsQueue.length} thẻ</div>
      </div>
      <div class="flash-controls">
        <button class="btn" onclick="speak('${escq(v.word)}')">🔊 Nghe</button>
        <button class="btn" onclick="speak('${escq(v.word)}',0.55)">🐢 Chậm</button>
        <button class="btn" onclick="openYouglish('${escq(v.word)}')">🌐 Youglish</button>
        ${srsShown?gradeButtons():`<button class="btn primary" id="srsFlip">Lật thẻ</button>`}
      </div>
    </div>`;
  speak(v.word);
  $("#srsCard").onclick=()=>{ if(!srsShown){srsShown=true; drawSrs();} };
  if($("#srsFlip")) $("#srsFlip").onclick=()=>{srsShown=true; drawSrs();};
  bindGrades(v);
}
function drawSrsWrite(v){
  $("#srsArea").innerHTML=`
    <div class="flash-wrap"><div class="panel">
      <div class="quiz-q">Nghe &amp; nhìn nghĩa — gõ lại từ tiếng Anh</div>
      <div class="detail-vi" style="font-size:22px;text-align:center">${esc(v.vi)}</div>
      <div class="detail-pin" style="text-align:center">${esc(ipaSlashed(v.word)||v.ipa||'')}</div>
      <div style="color:var(--warn);text-align:center">🗣️ ${esc(amBoiForWord(v.word))}</div>
      <div class="toolbar" style="justify-content:center;margin:8px 0">
        <button class="btn sm" onclick="speak('${escq(v.word)}')">🔊 Nghe</button>
        <button class="btn sm" onclick="speak('${escq(v.word)}',0.55)">🐢 Chậm</button>
      </div>
      <input class="big-input" id="srsWInput" placeholder="Gõ từ..." autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="toolbar" style="justify-content:center;margin-top:12px">
        <button class="btn primary" id="srsWCheck">Kiểm tra</button>
      </div>
      <div id="srsWRes" style="text-align:center;margin-top:10px"></div>
      <div class="flash-controls" id="srsWGrade"></div>
    </div></div>`;
  speak(v.word);
  const inp=$("#srsWInput"); inp.focus();
  const check=()=>{
    const ok=inp.value.trim().toLowerCase()===v.word.toLowerCase();
    $("#srsWRes").innerHTML = ok
      ? `<span style="color:var(--ok);font-weight:700">✓ Chính xác!</span> <span class="han-cell">${esc(v.word)}</span>`
      : `<span style="color:var(--brand);font-weight:700">✗ Chưa đúng.</span> Đáp án: <span class="han-cell">${esc(v.word)}</span>`;
    inp.disabled=true;
    $("#srsWGrade").innerHTML=ok
      ? `<button class="btn primary" data-g="4">🙂 Nhớ</button><button class="btn" style="border-color:var(--ok)" data-g="5">😎 Dễ</button>`
      : `<button class="btn" style="border-color:var(--brand)" data-g="0">😵 Quên</button><button class="btn" data-g="3">🤔 Khó</button>`;
    bindGrades(v);
  };
  $("#srsWCheck").onclick=check;
  inp.onkeydown=e=>{ if(e.key==="Enter" && !inp.disabled) check(); };
}
function drawSrsSpeak(v){
  const sup=speechSupported();
  $("#srsArea").innerHTML=`
    <div class="flash-wrap"><div class="panel" style="text-align:center">
      <div class="quiz-q">Nhìn từ &amp; phát âm to — micro sẽ chấm</div>
      <div class="fhan" style="font-size:40px;color:var(--brand)">${esc(v.word)}</div>
      <div class="detail-pin">${esc(ipaSlashed(v.word)||v.ipa||'')}</div>
      <div style="color:var(--warn);font-size:16px">🗣️ ${esc(amBoiForWord(v.word))}</div>
      <div class="fvi" style="font-size:16px;color:var(--muted)">${esc(v.vi)}</div>
      <div class="toolbar" style="justify-content:center;margin:12px 0">
        <button class="btn" onclick="speak('${escq(v.word)}')">🔊 Nghe mẫu</button>
        <button class="btn primary mic-btn" id="srsMic">🎤 ${sup?'Nói':'Không hỗ trợ'}</button>
      </div>
      <div id="srsSpRes" class="speak-res"></div>
      <div class="flash-controls" id="srsSpGrade">${gradeButtons()}</div>
    </div></div>`;
  speak(v.word);
  bindGrades(v);
  if(!sup){
    $("#srsSpRes").innerHTML=`<span class="sub">Trình duyệt không hỗ trợ nhận diện giọng nói (dùng Chrome trên Android/PC). Bạn vẫn có thể tự chấm bằng nút bên dưới.</span>`;
    return;
  }
  const mic=$("#srsMic");
  mic.onclick=()=>{
    mic.classList.add("rec"); mic.textContent="🎤 Đang nghe…";
    recognizeOnce((alts,err)=>{
      mic.classList.remove("rec"); mic.textContent="🎤 Nói lại";
      if(err){ $("#srsSpRes").innerHTML=`<span class="sub">Lỗi micro: ${esc(err)}. Cấp quyền micro rồi thử lại.</span>`; return; }
      const target=normWord(v.word);
      const ok=alts.some(a=>normWord(a)===target);
      $("#srsSpRes").innerHTML=`<div class="heard">Nghe được: "${esc(alts[0]||'')}"</div>`+
        (ok?`<div style="color:var(--ok);font-weight:700">✓ Phát âm khớp!</div>`
            :`<div style="color:var(--brand);font-weight:700">✗ Chưa khớp — thử lại hoặc nghe mẫu.</div>`);
      if(ok){ $("#srsSpGrade").innerHTML=`<button class="btn primary" data-g="4">🙂 Nhớ</button><button class="btn" style="border-color:var(--ok)" data-g="5">😎 Dễ</button>`; bindGrades(v); }
    });
  };
}

/* ---------- Vocab ---------- */
let vocabFilter = {level:"", topic:"", q:"", onlyNew:false, room:"", onlyPhrase:false, sort:""};
RENDER.vocab = () => {
  const levels = [...new Set(D.vocab.map(v=>v.level))];
  const topics = [...new Set(D.vocab.map(v=>v.topic).filter(Boolean))].sort();
  const rooms = [...new Set(progress.myWords.map(w=>w.source).filter(Boolean))];
  $("#view").innerHTML = `
    <h2 class="section-h">Từ vựng</h2>
    <p class="sub">Nhấn vào thẻ để xem gốc từ, câu ví dụ và nghe phát âm.</p>
    <div class="toolbar">
      <select id="fLevel"><option value="">Tất cả cấp độ</option>
        ${levels.map(l=>`<option value="${esc(l)}" ${vocabFilter.level===l?"selected":""}>${esc(l)}</option>`).join("")}</select>
      <select id="fTopic"><option value="">Tất cả chủ đề</option>
        ${topics.map(t=>`<option value="${esc(t)}" ${vocabFilter.topic===t?"selected":""}>${esc(t)}</option>`).join("")}</select>
      ${rooms.length?`<select id="fRoom"><option value="">Mọi nguồn/room</option>
        ${rooms.map(r=>`<option value="${esc(r)}" ${vocabFilter.room===r?"selected":""}>🎬 ${esc(r)}</option>`).join("")}</select>`:""}
      <label class="chip ${vocabFilter.onlyNew?'active':''}" id="fNew">Chỉ từ chưa thuộc</label>
      <label class="chip ${vocabFilter.onlyPhrase?'active':''}" id="fPhrase">🔗 Chỉ cụm từ</label>
      <select id="fSort">
        <option value="">Sắp xếp: mặc định</option>
        <option value="lowhigh" ${vocabFilter.sort==='lowhigh'?'selected':''}>📈 Tần suất đọc: thấp→cao</option>
        <option value="highlow" ${vocabFilter.sort==='highlow'?'selected':''}>📉 Tần suất đọc: cao→thấp</option>
      </select>
      <button class="btn sm" id="vPlay">▶ Đọc lần lượt</button>
      <label class="sub">🇻🇳<input type="checkbox" id="vSayVi" checked></label>
      <label class="sub">🇨🇳<input type="checkbox" id="vSayZh"></label>
      <span class="count-pill" id="vCount"></span>
    </div>
    <p class="sub" style="margin-top:-6px">💡 <b>Đọc lần lượt</b> đếm số lần mỗi từ được đọc (hiện góc thẻ). Sắp xếp <b>thấp→cao</b> để ưu tiên từ ít đọc, hoặc <b>cao→thấp</b> để củng cố từ hay đọc.</p>
    <div class="cards-grid" id="vGrid"></div>`;
  $("#fLevel").onchange = e=>{vocabFilter.level=e.target.value; drawVocab();};
  $("#fTopic").onchange = e=>{vocabFilter.topic=e.target.value; drawVocab();};
  if($("#fRoom")) $("#fRoom").onchange = e=>{vocabFilter.room=e.target.value; drawVocab();};
  $("#fSort").onchange = e=>{vocabFilter.sort=e.target.value; drawVocab();};
  $("#fNew").onclick = e=>{vocabFilter.onlyNew=!vocabFilter.onlyNew; e.target.classList.toggle("active",vocabFilter.onlyNew); drawVocab();};
  $("#fPhrase").onclick = e=>{vocabFilter.onlyPhrase=!vocabFilter.onlyPhrase; e.target.classList.toggle("active",vocabFilter.onlyPhrase); drawVocab();};
  $("#vPlay").onclick = ()=>{
    const list=filteredVocab();
    if(!list.length){ toast("Không có từ để đọc"); return; }
    const sayZh=$("#vSayZh").checked;
    Seq.start(list.map(v=>({en:v.word, vi:v.vi, zh:v.zh, ab:amBoiAny(v.word)})),
      {sayVi:$("#vSayVi").checked, sayZh, gap:500, loop:false, countPlay:true});
    if(sayZh && !hasZhVoice()) toast("⚠️ Chưa có giọng Trung — cài trong 📊 Thống kê.");
    toast(`▶ Đang đọc ${list.length} mục`);
  };
  drawVocab();
};
function filteredVocab(){
  const q = vocabFilter.q.trim().toLowerCase();
  let list = allVocab().filter(v=>{
    if(vocabFilter.level && v.level!==vocabFilter.level) return false;
    if(vocabFilter.topic && v.topic!==vocabFilter.topic) return false;
    if(vocabFilter.room && v.source!==vocabFilter.room) return false;
    if(vocabFilter.onlyPhrase && !v.phrase) return false;
    if(vocabFilter.onlyNew && progress.learned[v.word]) return false;
    if(q){ return (v.word+" "+(v.ipa||"")+" "+(v.vi||"")).toLowerCase().includes(q); }
    return true;
  });
  if(vocabFilter.sort==="lowhigh") list=[...list].sort((a,b)=>playCountOf(a.word)-playCountOf(b.word));
  else if(vocabFilter.sort==="highlow") list=[...list].sort((a,b)=>playCountOf(b.word)-playCountOf(a.word));
  return list;
}
function drawVocab(){
  const list = filteredVocab();
  $("#vCount") && ($("#vCount").textContent = `${list.length} từ`);
  const g = $("#vGrid"); if(!g) return;
  g.innerHTML = list.slice(0,600).map(v=>vcardHTML(v)).join("") ||
    `<p class="sub">Không tìm thấy từ phù hợp.</p>`;
  bindVcards(g, list);
  if(list.length>600){ g.insertAdjacentHTML("beforeend",
    `<p class="sub" style="grid-column:1/-1">Hiển thị 600/${list.length} từ — dùng bộ lọc để thu hẹp.</p>`); }
}
function vcardHTML(v){
  const pc=playCountOf(v.word);
  return `<div class="vcard ${progress.learned[v.word]?'learned':''}" data-word="${esc(v.word)}">
    <span class="lvl">${esc(v.level||v.source||'')}</span>
    <div class="han">${esc(v.word)}</div>
    <div class="pin">${esc(ipaSlashed(v.word)||v.ipa||'')}</div>
    <div class="amboi" title="Âm bồi (phát âm gần đúng)">🗣️ ${esc(amBoiAny(v.word))}</div>
    <div class="vi">${esc(v.vi)}</div>
    ${v.topic?`<div class="topic">${esc(v.topic)}</div>`:""}
    <div class="card-actions">
      <button class="mini" data-act="speak">🔊</button>
      <button class="mini" data-act="yg">🌐</button>
      <button class="mini" data-act="learn">${progress.learned[v.word]?'✓ Thuộc':'+ Thuộc'}</button>
      ${pc?`<span class="sub" style="margin-left:auto;color:var(--warn)" title="Số lần đã đọc/nghe">🔊×${pc}</span>`:''}
    </div>
  </div>`;
}
function bindVcards(container, list){
  $$(".vcard", container).forEach(card=>{
    const word = card.dataset.word;
    const v = list.find(x=>x.word===word) || findWord(word);
    card.onclick = e=>{
      const act = e.target.dataset.act;
      if(act==="speak"){ e.stopPropagation(); speak(word); return; }
      if(act==="yg"){ e.stopPropagation(); openYouglish(word); return; }
      if(act==="learn"){ e.stopPropagation(); toggleLearned(word); card.replaceWith(elFromHTML(vcardHTML(v))); bindVcards(container,list); return; }
      openDetail(v);
    };
  });
}
function elFromHTML(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }
function toggleLearned(word){
  if(progress.learned[word]) delete progress.learned[word]; else progress.learned[word]=true;
  save();
}

/* ---------- Detail modal ---------- */
function openDetail(v){
  const rootTxt = v.root || rootBreakdown(v.word);
  $("#modalCard").innerHTML = `
    <button class="close-x" onclick="closeModal()">×</button>
    <div class="detail-han">${esc(v.word)}</div>
    <div class="detail-pin">${esc(ipaSlashed(v.word)||v.ipa||'')}</div>
    <div style="color:var(--warn);font-size:17px;margin-top:2px">🗣️ Âm bồi: ${esc(amBoiForWord(v.word))}</div>
    <div class="detail-vi">${esc(v.vi)}</div>
    <div class="toolbar" style="margin-top:14px">
      <button class="btn sm primary" onclick="speak('${escq(v.word)}')">🔊 Nghe</button>
      <button class="btn sm" onclick="speak('${escq(v.word)}',0.55)">🐢 Chậm</button>
      <button class="btn sm" onclick="toggleLearned('${escq(v.word)}');toast('Đã cập nhật')">✓ Đánh dấu thuộc</button>
      <a class="btn sm" href="${youglish(v.word)}" target="_blank" rel="noopener">🌐 Youglish</a>
      ${v.level?`<span class="chip">${esc(v.level)}</span>`:""}
    </div>
    <div class="detail-row"><div class="lab">🌱 Gốc từ &amp; cụm từ đi kèm</div>
      <div class="breakdown">${esc(rootTxt)}</div></div>
    ${v.example?(()=>{ const tx=exampleTxOf(v); return `<div class="detail-row"><div class="lab">💡 Câu ví dụ</div>
      <div class="example-box"><div class="eh">${esc(v.example)} <span class="audio-btn" onclick="speak('${escq(v.example)}')">🔊</span></div>
      ${tx.vi?`<div class="ep">🇻🇳 ${esc(tx.vi)}</div>`:''}
      ${tx.zh?`<div class="ep" style="color:var(--accent)">🀄 ${esc(tx.zh)}${tx.pinyin?` <span class="sub">(${esc(tx.pinyin)})</span>`:''} <span class="audio-btn" onclick="speakZh('${escq(tx.zh)}')">🔊</span></div>`
             :`<button class="btn sm" style="margin-top:6px" onclick="translateDetailExample('${escq(v.word)}')">🌐 Dịch câu ví dụ sang 中文 + pinyin</button>`}
      </div></div>`; })():""}
    ${v.topic?`<div class="detail-row"><div class="lab">📂 Chủ đề</div>${esc(v.topic)}</div>`:""}
    ${v.source?`<div class="detail-row"><div class="lab">📅 Nguồn</div>Tự thêm từ ${esc(v.source)}</div>`:""}
  `;
  $("#modal").classList.remove("hidden");
}
function exampleTxOf(v){
  if(v.exampleZh||v.examplePinyin) return {vi:v.exampleVi||"", zh:v.exampleZh||"", pinyin:v.examplePinyin||""};
  const c=progress.exampleTx[v.example]; return c || {vi:v.exampleVi||"", zh:"", pinyin:""};
}
window.translateDetailExample=async function(word){
  const v=findWord(word); if(!v||!v.example) return;
  toast("Đang dịch câu ví dụ (cần mạng)...");
  const r=await translateSentenceRich(v.example);
  progress.exampleTx[v.example]={vi:r.vi||v.exampleVi||"", zh:r.zh, pinyin:r.pinyin};
  const mw=progress.myWords.find(w=>w.word.toLowerCase()===word.toLowerCase());
  if(mw){ mw.exampleVi=mw.exampleVi||r.vi; mw.exampleZh=r.zh; mw.examplePinyin=r.pinyin; }
  save(); openDetail(findWord(word));
  toast("✓ Đã dịch câu ví dụ");
};
function closeModal(){ $("#modal").classList.add("hidden"); }
$("#modal").onclick = e=>{ if(e.target.id==="modal") closeModal(); };
document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeModal(); });

/* ---------- Flashcard ---------- */
let flashDeck = [], flashIdx = 0, flashShown = false;
RENDER.flash = () => {
  $("#view").innerHTML = `
    <h2 class="section-h">Flashcard</h2>
    <p class="sub">Nhấn vào thẻ để lật. Đánh giá để hệ thống ưu tiên ôn từ bạn chưa nhớ.</p>
    <div class="toolbar center-narrow" style="justify-content:center">
      <select id="deckLevel"><option value="">Mọi cấp độ</option>
        ${[...new Set(D.vocab.map(v=>v.level))].map(l=>`<option>${esc(l)}</option>`).join("")}</select>
      <select id="deckMode">
        <option value="new">Ưu tiên từ chưa thuộc</option>
        <option value="all">Tất cả (xáo trộn)</option>
        <option value="learned">Chỉ từ đã thuộc</option>
      </select>
      <button class="btn primary" id="startDeck">Bắt đầu</button>
    </div>
    <div class="progress-bar"><i id="flashProg"></i></div>
    <div id="flashArea"></div>`;
  $("#startDeck").onclick = buildDeck;
  buildDeck();
};
function buildDeck(){
  const lvl = $("#deckLevel").value, mode = $("#deckMode").value;
  let pool = allVocab().filter(v=>!lvl||v.level===lvl);
  if(mode==="new") pool = pool.filter(v=>!progress.learned[v.word]);
  if(mode==="learned") pool = pool.filter(v=>progress.learned[v.word]);
  flashDeck = shuffle(pool).slice(0,50); flashIdx=0; flashShown=false;
  if(!flashDeck.length){ $("#flashArea").innerHTML=`<p class="sub" style="text-align:center">Không có từ nào phù hợp.</p>`; return; }
  drawFlash();
}
function drawFlash(){
  const v = flashDeck[flashIdx];
  $("#flashProg").style.width = ((flashIdx)/flashDeck.length*100)+"%";
  $("#flashArea").innerHTML = `
    <div class="flash-wrap">
      <div class="flash" id="flashCard">
        <div class="fhan">${esc(v.word)}</div>
        <div style="color:var(--warn);font-size:16px;margin-top:6px">🗣️ ${esc(amBoiForWord(v.word))}</div>
        <div id="flashBack" class="${flashShown?'':'hidden'}">
          <div class="fpin">${esc(ipaSlashed(v.word)||v.ipa||'')}</div>
          <div class="fvi">${esc(v.vi)}</div>
        </div>
        <div class="hint">${flashShown?'Bạn có nhớ từ này không?':'Nhấn để xem đáp án'} · Thẻ ${flashIdx+1}/${flashDeck.length}</div>
      </div>
      <div class="flash-controls">
        <button class="btn" onclick="speak('${escq(v.word)}')">🔊 Nghe</button>
        ${flashShown?`
          <button class="btn" id="fAgain">😕 Chưa nhớ</button>
          <button class="btn primary" id="fGood">😀 Đã nhớ</button>`:
          `<button class="btn primary" id="fFlip">Lật thẻ</button>`}
      </div>
    </div>`;
  $("#flashCard").onclick = ()=>{ if(!flashShown){flashShown=true; drawFlash();} };
  if($("#fFlip")) $("#fFlip").onclick=()=>{flashShown=true; drawFlash();};
  if($("#fGood")) $("#fGood").onclick=()=>{ progress.learned[v.word]=true; save(); nextFlash(); };
  if($("#fAgain")) $("#fAgain").onclick=()=>{ flashDeck.push(v); nextFlash(); };
}
function nextFlash(){
  flashIdx++; flashShown=false;
  if(flashIdx>=flashDeck.length){
    $("#flashProg").style.width="100%";
    $("#flashArea").innerHTML=`<div class="flash-wrap"><div class="panel" style="text-align:center">
      <h3>🎉 Hoàn thành bộ thẻ!</h3><p class="sub">Đã thuộc: ${Object.keys(progress.learned).length} từ</p>
      <button class="btn primary" onclick="RENDER.flash()">Học bộ mới</button></div></div>`;
    return;
  }
  drawFlash();
}

/* ---------- Writing practice (nghe/nghĩa → gõ từ) ---------- */
let writeItem=null;
RENDER.write = () => {
  $("#view").innerHTML = `
    <h2 class="section-h">Luyện viết (chính tả)</h2>
    <p class="sub">Nhìn nghĩa &amp; nghe phát âm, tự gõ lại từ tiếng Anh rồi kiểm tra.</p>
    <div class="center-narrow">
      <div class="toolbar" style="justify-content:center">
        <select id="wLevel"><option value="">Mọi cấp độ</option>
          ${[...new Set(D.vocab.map(v=>v.level))].map(l=>`<option>${esc(l)}</option>`).join("")}</select>
        <button class="btn primary" id="wNext">Từ mới</button>
      </div>
      <div id="wArea"></div>
    </div>`;
  $("#wNext").onclick = nextWrite;
  nextWrite();
};
function nextWrite(){
  const lvl = $("#wLevel").value;
  const pool = D.vocab.filter(v=>(!lvl||v.level===lvl) && v.word);
  writeItem = pool[Math.floor(Math.random()*pool.length)];
  $("#wArea").innerHTML = `
    <div class="panel" style="text-align:center">
      <div class="detail-vi" style="font-size:22px">${esc(writeItem.vi)}</div>
      <div class="detail-pin" style="font-size:18px">${esc(ipaSlashed(writeItem.word)||writeItem.ipa||'')}</div>
      <div class="toolbar" style="justify-content:center;margin:8px 0">
        <button class="btn sm" onclick="speak('${escq(writeItem.word)}')">🔊 Nghe</button>
        <button class="btn sm" onclick="speak('${escq(writeItem.word)}',0.55)">🐢 Chậm</button>
      </div>
      <input class="big-input" id="wInput" placeholder="Gõ từ tiếng Anh..." autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="toolbar" style="justify-content:center;margin-top:14px">
        <button class="btn primary" id="wCheck">Kiểm tra</button>
        <button class="btn" id="wReveal">Xem đáp án</button>
      </div>
      <div id="wResult" style="margin-top:12px;font-size:16px"></div>
    </div>`;
  const inp = $("#wInput"); inp.focus();
  const check = ()=>{
    const ok = inp.value.trim().toLowerCase()===writeItem.word.toLowerCase();
    $("#wResult").innerHTML = ok
      ? `<span style="color:var(--ok);font-weight:700">✓ Chính xác!</span> ${esc(writeItem.word)}`
      : `<span style="color:var(--brand);font-weight:700">✗ Chưa đúng.</span> Đáp án: <span class="han-cell">${esc(writeItem.word)}</span>`;
    if(ok){ progress.learned[writeItem.word]=true; save(); }
  };
  $("#wCheck").onclick = check;
  inp.onkeydown = e=>{ if(e.key==="Enter") check(); };
  $("#wReveal").onclick = ()=>{ $("#wResult").innerHTML = `Đáp án: <span class="han-cell">${esc(writeItem.word)}</span>`; };
}

/* ---------- Quiz ---------- */
let quizItem=null;
RENDER.quiz = () => {
  $("#view").innerHTML = `
    <h2 class="section-h">Kiểm tra trắc nghiệm</h2>
    <p class="sub">Chọn nghĩa tiếng Việt đúng cho từ tiếng Anh. Điểm: <b id="qScore">${progress.quizStats.correct}/${progress.quizStats.total}</b></p>
    <div class="center-narrow"><div id="qArea"></div></div>`;
  nextQuiz();
};
function nextQuiz(){
  const pool = D.vocab.filter(v=>v.vi);
  quizItem = pool[Math.floor(Math.random()*pool.length)];
  const opts = shuffle([quizItem, ...shuffle(pool.filter(v=>v.vi!==quizItem.vi)).slice(0,3)]);
  $("#qArea").innerHTML = `
    <div class="panel" style="text-align:center">
      <div class="quiz-q">Từ này nghĩa là gì?</div>
      <div class="quiz-han">${esc(quizItem.word)}</div>
      <div class="quiz-q">${esc(ipaSlashed(quizItem.word)||quizItem.ipa||'')} <span class="audio-btn" onclick="speak('${escq(quizItem.word)}')">🔊</span></div>
      <div style="margin-top:14px">${opts.map(o=>`<button class="opt" data-vi="${esc(o.vi)}">${esc(o.vi)}</button>`).join("")}</div>
    </div>`;
  $$(".opt").forEach(b=>b.onclick=()=>{
    const correct = b.dataset.vi===quizItem.vi;
    $$(".opt").forEach(x=>{ x.disabled=true;
      if(x.dataset.vi===quizItem.vi) x.classList.add("correct");
      else if(x===b) x.classList.add("wrong"); });
    progress.quizStats.total++; if(correct){progress.quizStats.correct++; progress.learned[quizItem.word]=true;}
    save(); $("#qScore").textContent = `${progress.quizStats.correct}/${progress.quizStats.total}`;
    setTimeout(nextQuiz, 900);
  });
}

/* ---------- Source sentences (câu ví dụ) ---------- */
let sentTopic="";
RENDER.sents = () => {
  const topics = [...new Set(SENTS.map(s=>s.topic).filter(Boolean))].sort();
  $("#view").innerHTML = `
    <h2 class="section-h">Câu ví dụ</h2>
    <p class="sub">Kho ${SENTS.length} câu mẫu tiếng Anh thương mại — nghe, đọc và tra nghĩa.</p>
    <div class="toolbar">
      <select id="sTopic"><option value="">Tất cả chủ đề</option>
        ${topics.map(t=>`<option ${sentTopic===t?'selected':''}>${esc(t)}</option>`).join("")}</select>
      <input class="txt" id="sQ" placeholder="Tìm trong câu...">
      <button class="btn sm" id="sPlay">▶ Đọc lần lượt</button>
      <label class="sub">🇻🇳 nghĩa <input type="checkbox" id="sSayVi" checked></label>
      <span class="count-pill" id="sCount"></span>
    </div>
    <p class="sub" style="margin-top:-6px">💡 <b>Đọc lần lượt</b>: nghe từng câu (kèm nghĩa) trên→dưới — luyện nghe/nói rảnh tay khi lái xe.</p>
    <div class="table-wrap"><table><thead><tr>
      <th>Chủ đề</th><th>English &amp; Âm bồi</th><th>Tiếng Việt</th><th></th>
    </tr></thead><tbody id="sBody"></tbody></table></div>`;
  let curList=[];
  const draw=()=>{
    const tp=$("#sTopic").value, q=($("#sQ").value||"").toLowerCase();
    curList = SENTS.filter(s=>(!tp||s.topic===tp) && (!q||(s.en+" "+s.vi).toLowerCase().includes(q)));
    $("#sCount").textContent=`${curList.length} câu`;
    $("#sBody").innerHTML = curList.slice(0,400).map(s=>`<tr>
      <td style="color:var(--muted);font-size:12px">${esc(s.topic)}</td>
      <td><div style="font-size:15px">${esc(s.en)}</div><div style="font-size:12px;color:var(--warn)">🗣️ ${esc(amBoiForSentence(s.en))}</div></td>
      <td style="color:var(--muted)">${esc(s.vi)}</td>
      <td style="white-space:nowrap"><button class="mini" onclick="speak('${escq(s.en)}')">🔊</button>
        <button class="mini" onclick="speak('${escq(s.en)}',0.55)">🐢</button></td>
    </tr>`).join("") + (curList.length>400?`<tr><td colspan="4" class="sub">Hiển thị 400/${curList.length} câu — lọc thêm để xem.</td></tr>`:"");
  };
  $("#sTopic").onchange=e=>{sentTopic=e.target.value;draw();};
  $("#sQ").oninput=draw;
  $("#sPlay").onclick=()=>{
    if(!curList.length){ toast("Không có câu để đọc"); return; }
    Seq.start(curList.map(s=>({en:s.en, vi:s.vi, ab:amBoiForSentence(s.en)})),
      {sayVi:$("#sSayVi").checked, gap:700, loop:false});
    toast(`▶ Đang đọc ${curList.length} câu`);
  };
  draw();
};

/* ---------- Tokenize English ---------- */
const STOP = new Set(D.stopwords);
function tokenizeEn(text){
  return (text.toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g)) || [];
}

/* ---------- Subtitle → Phiên âm tool ---------- */
RENDER.subtitle = () => {
  $("#view").innerHTML = `
    <h2 class="section-h">Phụ đề → Phiên âm &amp; Nghĩa</h2>
    <p class="sub">Dán tiếng Anh (mỗi dòng 1 câu). App tự gắn phiên âm IPA, âm bồi và nghĩa Việt (khi từ có trong kho).</p>
    <div class="panel">
      <textarea class="ta" id="subIn" placeholder="Ví dụ:&#10;We export rattan furniture to twelve countries.&#10;Please confirm the shipment date."></textarea>
      <div class="toolbar" style="margin-top:10px">
        <button class="btn primary" id="subGo">▶ Xử lý</button>
        <button class="btn" id="subPlay">▶ Đọc lần lượt</button>
        <button class="btn" id="subSample">Dán câu mẫu</button>
        <button class="btn" id="subClear">Xóa</button>
        <a class="btn" id="subGT" target="_blank" rel="noopener">🌐 Dịch cả đoạn (Google)</a>
      </div>
    </div>
    <div id="subOut"></div>
    <p class="sub">💡 Phiên âm lấy offline từ từ điển ~119.000 từ. Nghĩa Việt hiện khi từ có trong kho; với câu hoàn chỉnh, dùng nút Google Translate. Nút <b>Đọc lần lượt</b> đọc từng dòng trên→dưới (rảnh tay).</p>`;
  const sample="We export rattan furniture to twelve countries.\nPlease confirm the shipment date and the port of loading.";
  $("#subSample").onclick=()=>{ $("#subIn").value=sample; };
  $("#subClear").onclick=()=>{ $("#subIn").value=""; $("#subOut").innerHTML=""; };
  $("#subPlay").onclick=()=>{
    const lines=($("#subIn").value.trim()).split(/\n+/).map(s=>s.trim()).filter(Boolean);
    if(!lines.length){ toast("Hãy dán câu trước"); return; }
    if(!$("#subOut").innerHTML) run();
    Seq.start(lines.map(l=>({en:l, vi:"", ab:amBoiForSentence(l)})), {sayVi:false, gap:600, rate:0.9});
    toast(`▶ Đang đọc ${lines.length} dòng`);
  };
  const run=()=>{
    const text=$("#subIn").value.trim();
    $("#subGT").href = gtranslate(text);
    if(!text){ $("#subOut").innerHTML=""; return; }
    const lines=text.split(/\n+/).filter(Boolean);
    $("#subOut").innerHTML = `<div class="panel">` + lines.map(line=>{
      const toks=line.match(/[A-Za-z][A-Za-z'-]*|[^A-Za-z]+/g)||[];
      const anno=toks.map(t=>{
        if(!/[A-Za-z]/.test(t)) return `<span class="tok" style="background:transparent;border:none"><span class="th">${esc(t.trim())}</span></span>`;
        const lw=t.toLowerCase();
        const g=D.gloss[lw];
        const ipa = ipaSlashed(t);
        const vi = g?g.v:"";
        return `<span class="tok ${g?'known':''}" onclick="speak('${escq(t)}')" title="Nhấn để nghe">
          <span class="tp">${esc(ipa)}</span><span class="th">${esc(t)}</span>
          <span class="tp" style="color:var(--warn)">${esc(amBoiForWord(t))}</span>
          ${vi?`<span class="tv">${esc(vi)}</span>`:""}</span>`;
      }).join("");
      return `<div class="sent-line">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
          <button class="mini" onclick="speak('${escq(line)}')">🔊</button>
          <button class="mini" onclick="speak('${escq(line)}',0.55)">🐢</button>
        </div>
        <div class="anno">${anno}</div>
      </div>`;
    }).join("") + `</div>`;
  };
  $("#subGo").onclick=run;
};

/* ---------- Listening practice ---------- */
let listenMode="word", listenItem=null;
RENDER.listen = () => {
  $("#view").innerHTML = `
    <h2 class="section-h">🎧 Luyện nghe</h2>
    <p class="sub">Nghe trước — hiểu sau. Âm thanh tự phát; bạn đoán rồi kiểm tra.</p>
    <div class="chips">
      <span class="chip ${listenMode==='word'?'active':''}" data-m="word">🔤 Từ→nghĩa</span>
      <span class="chip ${listenMode==='spell'?'active':''}" data-m="spell">🔡 Nghe→chọn từ</span>
      <span class="chip ${listenMode==='sentence'?'active':''}" data-m="sentence">📄 Câu→đáp án</span>
      <span class="chip ${listenMode==='auto'?'active':''}" data-m="auto">▶️ Nghe liên tục</span>
      <span class="chip ${listenMode==='story'?'active':''}" data-m="story">📖 Đoạn văn</span>
      <span class="chip ${listenMode==='speak'?'active':''}" data-m="speak">🎤 Luyện nói</span>
    </div>
    <p class="sub">Điểm nghe: <b id="lScore">${progress.listenStats.correct}/${progress.listenStats.total}</b></p>
    <div class="center-narrow"><div id="lArea"></div></div>`;
  $$(".chip[data-m]").forEach(c=>c.onclick=()=>{listenMode=c.dataset.m; RENDER.listen();});
  if(listenMode==="sentence") nextListenSentence();
  else if(listenMode==="auto") listenAuto();
  else if(listenMode==="story") listenStory();
  else if(listenMode==="speak") nextListenSpeak();
  else nextListenWord();
};

/* ---------- Nghe liên tục (autoplay) ---------- */
function listenAuto(){
  const levels=[...new Set(D.vocab.map(v=>v.level))];
  const topics=[...new Set(D.vocab.map(v=>v.topic).filter(Boolean))].sort();
  $("#lArea").innerHTML=`
    <div class="panel">
      <div class="quiz-q" style="text-align:center;margin-bottom:10px">▶️ Nghe tuần tự liên tục — rảnh tay khi lái xe</div>
      <div class="toolbar" style="justify-content:center">
        <select id="laType"><option value="word">Từ vựng</option><option value="sent">Câu ví dụ</option></select>
        <select id="laScope">
          <option value="due">Từ đến hạn ôn (SRS)</option>
          <option value="new">Từ chưa thuộc</option>
          <option value="all">Tất cả</option>
        </select>
        <select id="laLevel"><option value="">Mọi cấp độ</option>${levels.map(l=>`<option>${esc(l)}</option>`).join("")}</select>
        <select id="laTopic"><option value="">Mọi chủ đề</option>${topics.map(t=>`<option>${esc(t)}</option>`).join("")}</select>
        <select id="laSort">
          <option value="rand">🔀 Ngẫu nhiên</option>
          <option value="lowhigh">📈 Tần suất nghe: thấp→cao</option>
          <option value="highlow">📉 Tần suất nghe: cao→thấp</option>
        </select>
      </div>
      <div class="toolbar" style="justify-content:center">
        <label class="sub">🇻🇳 đọc nghĩa <input type="checkbox" id="laVi" checked></label>
        <label class="sub">🔁 lặp lại <input type="checkbox" id="laLoop"></label>
        <label class="sub">🐢 tốc độ <input type="range" id="laRate" min="0.5" max="1" step="0.05" value="0.9"></label>
        <label class="sub">Số lượng <input class="txt" id="laN" type="number" value="30" min="1" max="500" style="width:70px"></label>
      </div>
      <p class="sub" style="text-align:center;margin:4px 0">🔢 Ưu tiên từ <b>ít được nghe</b> (thấp→cao) để học đều, hoặc <b>nghe nhiều</b> (cao→thấp) để củng cố.</p>
      <div class="toolbar" style="justify-content:center">
        <button class="btn primary" id="laStart">▶ Bắt đầu nghe</button>
      </div>
      <p class="sub" style="text-align:center;margin-top:6px">Thanh điều khiển (⏮ ⏸ ⏭ ✕) hiện ở cuối màn hình khi phát.</p>
    </div>`;
  const sortByFreq=(pool,sort)=>{
    if(sort==="lowhigh") return [...pool].sort((a,b)=>playCountOf(a.word)-playCountOf(b.word));
    if(sort==="highlow") return [...pool].sort((a,b)=>playCountOf(b.word)-playCountOf(a.word));
    return shuffle(pool);
  };
  const buildList=()=>{
    const type=$("#laType").value, scope=$("#laScope").value, lvl=$("#laLevel").value, tp=$("#laTopic").value, sort=$("#laSort").value, n=parseInt($("#laN").value)||30;
    if(type==="sent"){
      let list=SENTS.filter(s=>(!tp||s.topic===tp));
      return shuffle(list).slice(0,n).map(s=>({en:s.en, vi:s.vi, ab:amBoiForSentence(s.en)}));
    }
    let pool=allVocab().filter(v=>v.word&&v.vi);
    if(lvl) pool=pool.filter(v=>v.level===lvl);
    if(tp) pool=pool.filter(v=>v.topic===tp);
    if(scope==="due"){ const now=today0(); pool=pool.filter(v=>{const s=progress.srs[v.word]; return s&&s.due<=now;}); }
    else if(scope==="new") pool=pool.filter(v=>!progress.learned[v.word]);
    return sortByFreq(pool,sort).slice(0,n).map(v=>({en:v.word, vi:v.vi, ab:amBoiForWord(v.word)}));
  };
  $("#laStart").onclick=()=>{
    const list=buildList();
    if(!list.length){ toast("Không có mục phù hợp — đổi bộ lọc"); return; }
    Seq.start(list, {sayVi:$("#laVi").checked, loop:$("#laLoop").checked, rate:parseFloat($("#laRate").value), gap:$("#laType").value==="sent"?700:450, countPlay:$("#laType").value==="word"});
    toast(`▶ Đang nghe ${list.length} mục`);
  };
}

/* ---------- Đoạn văn / câu chuyện ---------- */
function listenStory(){
  const topics=[...new Set(SENTS.map(s=>s.topic).filter(Boolean))].sort();
  $("#lArea").innerHTML=`
    <div class="panel">
      <div class="quiz-q" style="text-align:center;margin-bottom:10px">📖 Ghép câu thành đoạn văn — đọc &amp; nghe liền mạch</div>
      <div class="toolbar" style="justify-content:center">
        <select id="stSource">
          <option value="topic">Theo chủ đề</option>
          <option value="due">Từ đến hạn ôn (SRS)</option>
          <option value="mywords">Từ tôi tự thêm (video)</option>
        </select>
        <select id="stTopic"><option value="">Chọn chủ đề…</option>${topics.map(t=>`<option>${esc(t)}</option>`).join("")}</select>
        <label class="sub">Số câu <input class="txt" id="stN" type="number" value="6" min="2" max="15" style="width:60px"></label>
        <button class="btn primary" id="stGo">Tạo đoạn văn</button>
      </div>
      <div id="stOut" style="margin-top:12px"></div>
    </div>`;
  const build=()=>{
    const src=$("#stSource").value, tp=$("#stTopic").value, n=parseInt($("#stN").value)||6;
    let sents=[];
    if(src==="topic"){
      let pool=SENTS.filter(s=>!tp||s.topic===tp);
      sents=shuffle(pool).slice(0,n);
    }else{
      // chọn nhóm TỪ rồi lấy câu ví dụ của chúng
      let words=[];
      if(src==="due"){ const now=today0(); words=allVocab().filter(v=>{const s=progress.srs[v.word];return s&&s.due<=now;}); }
      else words=progress.myWords.slice();
      words=shuffle(words).slice(0,n);
      sents=words.map(w=>{ const vv=D.vocab.find(x=>x.word.toLowerCase()===w.word.toLowerCase());
        return vv&&vv.example?{en:vv.example,vi:vv.exampleVi,topic:vv.topic}:{en:w.word,vi:w.vi,topic:w.source||""}; });
    }
    if(!sents.length){ $("#stOut").innerHTML=`<p class="sub">Không đủ dữ liệu — chọn nguồn/chủ đề khác hoặc thêm từ ở mục 🎬 Nhập video.</p>`; return; }
    const para=sents.map(s=>s.en).join(" ");
    const paraVi=sents.map(s=>s.vi).filter(Boolean).join(" ");
    $("#stOut").innerHTML=`
      <div class="example-box" style="text-align:left">
        <div style="font-size:16px;line-height:1.7">${sents.map((s,i)=>`<span class="stsent" data-i="${i}" style="cursor:pointer">${esc(s.en)}</span>`).join(" ")}</div>
        <div style="font-size:12px;color:var(--warn);margin-top:8px">🗣️ ${esc(amBoiForSentence(para))}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:8px">${esc(paraVi)}</div>
      </div>
      <div class="toolbar" style="justify-content:center;margin-top:12px">
        <button class="btn primary" id="stPlay">▶ Đọc cả đoạn</button>
        <button class="btn" id="stSlow">🐢 Chậm</button>
        <button class="btn" id="stAgain">🔄 Đoạn khác</button>
        <a class="btn" href="${gtranslate(para)}" target="_blank" rel="noopener">🌐 Dịch (Google)</a>
      </div>`;
    const items=sents.map(s=>({en:s.en, vi:s.vi, ab:amBoiForSentence(s.en)}));
    $("#stPlay").onclick=()=>Seq.start(items,{sayVi:false, gap:500, rate:0.9,
      onItem:(it,idx)=>{ $$(".stsent").forEach(el=>el.style.background=""); const cur=$(`.stsent[data-i="${idx}"]`); if(cur) cur.style.background="rgba(79,70,229,.18)"; }});
    $("#stSlow").onclick=()=>Seq.start(items,{sayVi:false, gap:600, rate:0.55});
    $("#stAgain").onclick=build;
    $$(".stsent").forEach(el=>el.onclick=()=>speak(sents[+el.dataset.i].en));
  };
  $("#stGo").onclick=build;
}

/* ---------- Luyện nói (đọc từ, micro chấm) ---------- */
let speakItem=null;
function nextListenSpeak(){
  const sup=speechSupported();
  const pool=allVocab().filter(v=>v.word&&v.vi);
  speakItem=pool[Math.floor(Math.random()*pool.length)];
  const v=speakItem;
  $("#lArea").innerHTML=`
    <div class="panel" style="text-align:center">
      <div class="quiz-q">🎤 Nhìn từ &amp; phát âm to — micro sẽ chấm</div>
      <div class="fhan" style="font-size:40px;color:var(--brand)">${esc(v.word)}</div>
      <div class="detail-pin">${esc(ipaSlashed(v.word)||v.ipa||'')}</div>
      <div style="color:var(--warn);font-size:16px">🗣️ ${esc(amBoiForWord(v.word))}</div>
      <div class="fvi" style="font-size:15px;color:var(--muted)">${esc(v.vi)}</div>
      <div class="toolbar" style="justify-content:center;margin:12px 0">
        <button class="btn" onclick="speak('${escq(v.word)}')">🔊 Nghe mẫu</button>
        <button class="btn" onclick="speak('${escq(v.word)}',0.55)">🐢 Chậm</button>
        <button class="btn primary mic-btn" id="lMic">🎤 ${sup?'Nói':'Không hỗ trợ'}</button>
        <button class="btn" id="lSkip">➡ Từ khác</button>
      </div>
      <div id="lSpRes" class="speak-res"></div>
    </div>`;
  speak(v.word);
  $("#lSkip").onclick=nextListenSpeak;
  if(!sup){ $("#lSpRes").innerHTML=`<span class="sub">Trình duyệt không hỗ trợ nhận diện giọng nói. Dùng Chrome trên Android/PC để luyện nói.</span>`; return; }
  const mic=$("#lMic");
  mic.onclick=()=>{
    mic.classList.add("rec"); mic.textContent="🎤 Đang nghe…";
    recognizeOnce((alts,err)=>{
      mic.classList.remove("rec"); mic.textContent="🎤 Nói lại";
      if(err){ $("#lSpRes").innerHTML=`<span class="sub">Lỗi micro: ${esc(err)}. Cấp quyền micro rồi thử lại.</span>`; return; }
      const ok=alts.some(a=>normWord(a)===normWord(v.word));
      progress.listenStats.total++; if(ok){progress.listenStats.correct++; progress.learned[v.word]=true; save();}
      $("#lScore") && ($("#lScore").textContent=`${progress.listenStats.correct}/${progress.listenStats.total}`);
      $("#lSpRes").innerHTML=`<div class="heard">Nghe được: "${esc(alts[0]||'')}"</div>`+
        (ok?`<div style="color:var(--ok);font-weight:700">✓ Phát âm khớp! Sang từ khác…</div>`
            :`<div style="color:var(--brand);font-weight:700">✗ Chưa khớp — nghe mẫu &amp; thử lại.</div>`);
      if(ok) setTimeout(nextListenSpeak,1400);
    });
  };
}
function nextListenWord(){
  const pool=allVocab().filter(v=>v.vi&&v.word);
  listenItem=pool[Math.floor(Math.random()*pool.length)];
  const byMeaning = listenMode==="word";
  const distract=shuffle(pool.filter(v=>(byMeaning?v.vi!==listenItem.vi:v.word!==listenItem.word))).slice(0,3);
  const opts=shuffle([listenItem,...distract]);
  $("#lArea").innerHTML=`
    <div class="panel" style="text-align:center">
      <div class="quiz-q">🎧 Nghe và chọn ${byMeaning?'nghĩa đúng':'từ đúng'}</div>
      <div style="font-size:64px;margin:10px 0;cursor:pointer" id="lPlay" title="Nghe lại">🔊</div>
      <div class="toolbar" style="justify-content:center;margin-bottom:6px">
        <button class="btn sm" id="lReplay">▶ Nghe lại</button>
        <button class="btn sm" id="lSlow">🐢 Chậm</button>
      </div>
      <div>${opts.map(o=>`<button class="opt" data-key="${esc(byMeaning?o.vi:o.word)}">${byMeaning?esc(o.vi):`<span class="han-cell">${esc(o.word)}</span>`}</button>`).join("")}</div>
    </div>`;
  bumpPlay(listenItem.word); save();
  const play=(rate)=>speak(listenItem.word, rate);
  play(0.9);
  $("#lPlay").onclick=()=>play(0.9); $("#lReplay").onclick=()=>play(0.9); $("#lSlow").onclick=()=>play(0.55);
  const key = byMeaning?listenItem.vi:listenItem.word;
  $$(".opt").forEach(b=>b.onclick=()=>{
    const ok=b.dataset.key===key;
    $$(".opt").forEach(x=>{x.disabled=true;
      if(x.dataset.key===key)x.classList.add("correct"); else if(x===b)x.classList.add("wrong");});
    progress.listenStats.total++; if(ok){progress.listenStats.correct++; srsInit(listenItem.word); progress.learned[listenItem.word]=true;}
    save(); $("#lScore").textContent=`${progress.listenStats.correct}/${progress.listenStats.total}`;
    b.insertAdjacentHTML("afterend",`<div class="sub" style="margin-top:8px"><span class="han-cell">${esc(listenItem.word)}</span> · <span class="pin-cell">${esc(ipaSlashed(listenItem.word)||listenItem.ipa||'')}</span> · <span style="color:var(--warn)">🗣️ ${esc(amBoiForWord(listenItem.word))}</span> · ${esc(listenItem.vi)} <button class="mini" onclick="openYouglish('${escq(listenItem.word)}')">🌐</button></div>`);
    setTimeout(nextListenWord,1400);
  });
}
function nextListenSentence(){
  const s=SENTS[Math.floor(Math.random()*SENTS.length)];
  $("#lArea").innerHTML=`
    <div class="panel" style="text-align:center">
      <div class="quiz-q">🎧 Nghe câu — cố nghe hiểu rồi hiện đáp án</div>
      <div style="font-size:56px;margin:10px 0;cursor:pointer" id="lPlay">🔊</div>
      <div class="toolbar" style="justify-content:center">
        <button class="btn sm" id="lReplay">▶ Nghe lại</button>
        <button class="btn sm" id="lSlow">🐢 Chậm</button>
        <button class="btn primary sm" id="lShow">👁 Hiện đáp án</button>
        <button class="btn sm" id="lNext">➡ Câu khác</button>
      </div>
      <div id="lReveal" style="margin-top:14px"></div>
    </div>`;
  const play=(rate)=>speak(s.en, rate);
  play(0.9);
  $("#lPlay").onclick=()=>play(0.9); $("#lReplay").onclick=()=>play(0.9); $("#lSlow").onclick=()=>play(0.55);
  $("#lNext").onclick=nextListenSentence;
  $("#lShow").onclick=()=>{ $("#lReveal").innerHTML=`
    <div class="example-box"><div class="eh">${esc(s.en)}</div>
    <div style="margin-top:6px">${esc(s.vi||'')}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:6px">Chủ đề: ${esc(s.topic||'')}</div></div>`;
  };
}

/* ---------- Video input module (học từ mới từ video) ---------- */
function ytId(url){
  const m = (url||"").match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m?m[1]:null;
}
/* Nạp thư viện ngoài (OCR/PDF) theo yêu cầu — cache offline nhờ Service Worker sau lần đầu */
function loadScript(src){
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[data-src="${src}"]`)){ res(); return; }
    const s=document.createElement("script"); s.src=src; s.dataset.src=src;
    s.onload=()=>res(); s.onerror=()=>rej(new Error("Không tải được "+src+" (cần mạng lần đầu)"));
    document.head.appendChild(s);
  });
}
const CDN_TESS="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const CDN_PDF ="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";
const CDN_PDFW="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

async function ocrImage(file, onProgress){
  await loadScript(CDN_TESS);
  const r = await Tesseract.recognize(file, "eng", { logger: m=>{ if(m.status==="recognizing text" && onProgress) onProgress(Math.round(m.progress*100)); } });
  return r.data.text||"";
}
async function pdfText(file, onProgress){
  const pdfjs = await import(CDN_PDF);
  pdfjs.GlobalWorkerOptions.workerSrc = CDN_PDFW;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({data:buf}).promise;
  let out="";
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);
    const tc=await page.getTextContent();
    out += tc.items.map(i=>i.str).join(" ")+"\n";
    if(onProgress) onProgress(Math.round(p/doc.numPages*100));
  }
  return out;
}

let importSrc="text";
RENDER.video = () => {
  $("#view").innerHTML = `
    <h2 class="section-h">🎬 Nhập từ vựng — nhiều nguồn</h2>
    <p class="sub">Chọn nguồn → app trích từ, lọc trùng &amp; lọc cơ bản vào <b>room tạm</b> → bạn kiểm tra rồi <b>xác nhận</b> đưa vào thư viện keyword.</p>
    <div class="chips">
      <span class="chip ${importSrc==='text'?'active':''}" data-src="text">📝 Văn bản</span>
      <span class="chip ${importSrc==='youtube'?'active':''}" data-src="youtube">▶️ YouTube</span>
      <span class="chip ${importSrc==='image'?'active':''}" data-src="image">🖼️ Hình ảnh (OCR)</span>
      <span class="chip ${importSrc==='pdf'?'active':''}" data-src="pdf">📄 PDF</span>
      <span class="chip ${importSrc==='reel'?'active':''}" data-src="reel">📱 Reel Facebook</span>
    </div>
    <div class="panel" id="srcPanel"></div>
    <div class="panel">
      <h3>Bộ lọc &amp; phân loại</h3>
      <div class="toolbar">
        <label class="sub">🔢 Số từ tối đa <input class="txt" id="vMax" type="number" value="40" min="1" max="300" style="width:70px"></label>
        <label class="sub">✂️ Độ dài tối thiểu <input class="txt" id="vMin" type="number" value="4" min="1" max="12" style="width:60px"></label>
        <label class="chip active" id="vFunc">🚫 Bỏ từ thông dụng</label>
        <label class="chip active" id="vSimple">🧹 Bỏ từ đơn giản</label>
        <label class="chip" id="vColl">🔗 Bắt cụm từ</label>
        <label class="chip" id="vAuto">🌐 Tự dịch sau khi lọc</label>
      </div>
      <div class="toolbar" style="margin-top:6px">
        <button class="btn primary" id="vExtract">▶ Lọc vào room tạm</button>
        <span class="sub" id="srcStatus"></span>
      </div>
    </div>
    <div id="pendingArea"></div>
    <div id="libRoomsArea"></div>
    <div id="libCleanArea"></div>
    <div id="historyArea"></div>`;
  $$(".chip[data-src]").forEach(c=>c.onclick=()=>{importSrc=c.dataset.src; RENDER.video();});
  const flags={func:true, simple:true, coll:false, auto:false};
  const tog=(id,key)=>$(id).onclick=e=>{flags[key]=!flags[key]; e.target.classList.toggle("active",flags[key]);};
  tog("#vFunc","func"); tog("#vSimple","simple"); tog("#vColl","coll"); tog("#vAuto","auto");
  drawSrcPanel();
  $("#vExtract").onclick=async ()=>{
    const meta=await gatherSource();
    if(!meta){ return; }
    if(!meta.text || !meta.text.trim()){ toast("Chưa có nội dung để lọc"); return; }
    const prior=findPriorImport({url:meta.url, contentHash:meta.hash});
    if(prior && !confirm(`Nguồn này có vẻ đã nhập rồi (${new Date(prior.at).toLocaleString()}, +${prior.added} từ). Vẫn lọc tiếp?`)) return;
    const maxN=parseInt($("#vMax").value)||40, minLen=parseInt($("#vMin").value)||1;
    let cands=extractCandidates(meta.text, {maxN, minLen, removeFunc:flags.func, removeSimple:flags.simple});
    if(flags.coll){ cands=extractCollocations(meta.text,{minLen:3,maxN:Math.ceil(maxN/2)}).concat(cands); }
    if(!cands.length){ toast("Không tìm thấy từ phù hợp — giảm độ dài tối thiểu / tắt bộ lọc"); return; }
    const r=pushToPending(cands, {source:meta.name, srcType:importSrc, name:meta.hash||meta.name, url:meta.url});
    toast(`Room tạm: +${r.added} mới · ${r.dupLib} trùng thư viện · ${r.dupRoom} trùng room`);
    drawPending(); drawLibRooms(); drawLibClean(); drawHistory();
    $("#pendingArea").scrollIntoView({behavior:"smooth", block:"start"});
    if(flags.auto && r.added){
      const msg=$("#pTransMsg"); if(msg) msg.textContent="Tự động dịch (cần mạng)...";
      const ok=await translatePending((d,t)=>{ const m=$("#pTransMsg"); if(m) m.textContent=`Đang dịch ${d}/${t}...`; });
      toast(`🌐 Đã tự dịch ${ok} từ`); drawPending();
    }
  };
  drawPending(); drawLibRooms(); drawLibClean(); drawHistory();
};

function drawSrcPanel(){
  const p=$("#srcPanel"); if(!p) return;
  if(importSrc==="text"){
    p.innerHTML=`<h3>📝 Dán văn bản / lời thoại (tiếng Anh)</h3>
      <textarea class="ta" id="impText" placeholder="Dán đoạn text, email, mô tả sản phẩm, phụ đề..."></textarea>
      <div class="toolbar" style="margin-top:8px"><button class="btn sm" id="impSample">Dán đoạn mẫu</button></div>`;
    $("#impSample").onclick=()=>{ $("#impText").value="Sustainable procurement and warehouse automation reduce logistics costs. The supplier improved packaging quality and shipment tracking. Blockchain brings transparency and traceability to the supply chain."; };
  }
  else if(importSrc==="youtube"){
    p.innerHTML=`<h3>▶️ YouTube — xem &amp; lấy lời thoại</h3>
      <div class="toolbar"><input class="txt" id="vUrl" style="flex:1;min-width:220px" placeholder="🔗 Dán link YouTube..."><button class="btn" id="vLoad">Xem video</button></div>
      <div id="vPlayer" style="margin-top:10px"></div>
      <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">📖 Cách lấy transcript (bấm mở)</summary>
        <div style="font-size:14px;line-height:1.7;margin-top:6px">
          1. Mở video trên youtube.com → bấm <b>“...more”</b> dưới video → <b>“Show transcript”</b>.<br>
          2. (Tuỳ chọn) ⚙ → <b>Toggle timestamps</b> để bỏ mốc thời gian.<br>
          3. Bôi đen toàn bộ → Ctrl+C → dán vào ô dưới.<br>
          <b>Tự động (nâng cao):</b> chạy <code>python EN_video.py "URL"</code> ở thư mục cha để tải phụ đề.<br>
          <i>Lưu ý: trình duyệt không thể tự tải phụ đề YouTube (chặn CORS) nên cần dán tay hoặc dùng script.</i>
        </div></details>
      <textarea class="ta" id="impText" style="margin-top:10px" placeholder="Dán lời thoại (transcript) tiếng Anh vào đây..."></textarea>`;
    $("#vLoad").onclick=()=>{
      const id=ytId($("#vUrl").value);
      if(!id){ toast("Link YouTube không hợp lệ"); return; }
      $("#vPlayer").innerHTML=`<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden">
        <iframe src="https://www.youtube.com/embed/${id}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"></iframe></div>`;
    };
  }
  else if(importSrc==="image"){
    p.innerHTML=`<h3>🖼️ Hình ảnh → OCR (nhận chữ)</h3>
      <input type="file" id="impFile" accept="image/*" class="txt">
      <div class="toolbar" style="margin-top:8px"><button class="btn" id="ocrRun">🔍 Nhận chữ từ ảnh</button><span class="sub" id="ocrMsg"></span></div>
      <textarea class="ta" id="impText" style="margin-top:10px" placeholder="Chữ nhận được sẽ hiện ở đây (có thể sửa)..."></textarea>
      <p class="sub">📶 Lần đầu cần mạng để tải bộ OCR (~15MB), sau đó dùng offline. Ảnh chụp màn hình reel/bài báo đều được.</p>`;
    $("#ocrRun").onclick=async ()=>{
      const f=$("#impFile").files[0]; if(!f){ toast("Chọn ảnh trước"); return; }
      $("#ocrMsg").textContent="Đang tải bộ OCR & nhận chữ...";
      try{ const t=await ocrImage(f, pct=>$("#ocrMsg").textContent=`Đang nhận chữ... ${pct}%`);
        $("#impText").value=t.trim(); $("#ocrMsg").textContent=`✓ Xong (${(t.match(/\w+/g)||[]).length} từ)`;
      }catch(e){ $("#ocrMsg").textContent="✗ "+e.message; }
    };
  }
  else if(importSrc==="pdf"){
    p.innerHTML=`<h3>📄 PDF → trích chữ</h3>
      <input type="file" id="impFile" accept="application/pdf" class="txt">
      <div class="toolbar" style="margin-top:8px"><button class="btn" id="pdfRun">📄 Trích chữ từ PDF</button><span class="sub" id="pdfMsg"></span></div>
      <textarea class="ta" id="impText" style="margin-top:10px" placeholder="Nội dung PDF sẽ hiện ở đây..."></textarea>
      <p class="sub">📶 Lần đầu cần mạng để tải bộ đọc PDF. PDF scan (ảnh) không có lớp chữ → hãy chụp màn hình và dùng tab 🖼️ Hình ảnh.</p>`;
    $("#pdfRun").onclick=async ()=>{
      const f=$("#impFile").files[0]; if(!f){ toast("Chọn file PDF trước"); return; }
      $("#pdfMsg").textContent="Đang tải bộ đọc & trích chữ...";
      try{ const t=await pdfText(f, pct=>$("#pdfMsg").textContent=`Đang đọc... ${pct}%`);
        $("#impText").value=t.trim();
        $("#pdfMsg").textContent = t.trim()? `✓ Xong (${(t.match(/\w+/g)||[]).length} từ)` : "PDF không có lớp chữ (scan) — dùng tab Hình ảnh.";
      }catch(e){ $("#pdfMsg").textContent="✗ "+e.message; }
    };
  }
  else if(importSrc==="reel"){
    p.innerHTML=`<h3>📱 Reel Facebook / Instagram</h3>
      <div class="toolbar"><input class="txt" id="vUrl" style="flex:1;min-width:220px" placeholder="🔗 Dán link reel (để lưu nguồn)..."></div>
      <div style="font-size:14px;line-height:1.7;margin-top:8px">
        Facebook/Instagram không cho lấy phụ đề tự động. Cách lấy chữ:
        <div>• Bật <b>phụ đề (CC)</b> khi xem reel → <b>chụp màn hình</b> → sang tab 🖼️ Hình ảnh để OCR.</div>
        <div>• Hoặc sao chép phần <b>caption/mô tả</b> của reel rồi dán vào ô dưới.</div>
      </div>
      <textarea class="ta" id="impText" style="margin-top:10px" placeholder="Dán caption / chữ lấy từ reel..."></textarea>`;
  }
}

// Thu thập nội dung + metadata từ nguồn đang chọn
async function gatherSource(){
  const text=($("#impText")?.value)||"";
  const url=($("#vUrl")?.value||"").trim();
  const nameMap={text:"Văn bản", youtube:"YouTube", image:"Hình ảnh", pdf:"PDF", reel:"Reel"};
  let name=nameMap[importSrc]||"Nhập";
  if(importSrc==="youtube" && url){ const id=ytId(url); name="YT:"+(id||url.slice(-11)); }
  if(importSrc==="reel" && url){ name="Reel:"+url.slice(-12); }
  const hash = url ? "url:"+url : "txt:"+hashText(text).slice(0,8);
  return {text, url, name, hash, srcType:importSrc};
}

/* ---------- ROOM TẠM ---------- */
function drawPending(){
  const el=$("#pendingArea"); if(!el) return;
  const pend=progress.pending;
  if(!pend.length){ el.innerHTML=`<div class="panel"><h3>🧺 Room tạm trống</h3><p class="sub">Lọc một nguồn ở trên để đưa từ mới vào đây trước khi xác nhận.</p></div>`; return; }
  const rows=[...pend].sort((a,b)=>b.freq-a.freq);
  el.innerHTML=`<div class="panel">
    <h3>🧺 Room tạm — ${pend.length} từ chờ xác nhận</h3>
    <div class="toolbar">
      <label class="sub">🏷️ Room <input class="txt" id="pRoom" placeholder="vd: Logistics podcast #3" style="width:170px"></label>
      <label class="sub">📂 Chủ đề <select id="pTopic" style="max-width:200px">
        <option value="">— không gán —</option>
        ${[...new Set(D.vocab.map(v=>v.topic).filter(Boolean))].sort().map(t=>`<option>${esc(t)}</option>`).join("")}
      </select></label>
      <button class="btn" id="pAll">☑ Chọn tất cả</button>
      <button class="btn" id="pNone">☐ Bỏ chọn</button>
      <button class="btn" id="pTrans">🌐 Tự động dịch nghĩa</button>
      <button class="btn" id="pPlay">▶ Nghe lần lượt</button>
      <label class="sub">🇻🇳<input type="checkbox" id="pSayVi" checked></label>
      <label class="sub">🇨🇳<input type="checkbox" id="pSayZh"></label>
      <button class="btn primary" id="pConfirm">✅ Xác nhận vào thư viện</button>
      <button class="btn" id="pClear" style="border-color:var(--brand)">🗑️ Xóa room tạm</button>
    </div>
    <p class="sub" style="margin:2px 0 6px">🔊 <b>Nghe lần lượt</b> đọc: English → nghĩa Việt (🇻🇳) → 中文 (🇨🇳). Tick ngôn ngữ muốn nghe.</p>
    <div class="sub" id="pTransMsg" style="margin-bottom:6px"></div>
    <div class="table-wrap" style="box-shadow:none;max-height:none"><table><thead><tr>
      <th><input type="checkbox" id="pHead" checked></th><th>TS</th><th>English</th><th>Loại</th><th>Phiên âm</th><th>Âm bồi</th><th>Nghĩa VN</th><th>中文 (pinyin)</th><th></th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr data-w="${esc(r.word)}">
        <td><input type="checkbox" class="pChk" value="${esc(r.word)}" checked></td>
        <td><b>${r.freq}</b></td>
        <td class="han-cell">${esc(r.word)}${r.phrase?' <span class="sub" style="font-size:10px">cụm</span>':''}
          ${r.example?`<div class="sub" style="font-size:11px;font-weight:400;max-width:260px;white-space:normal">💡 ${esc(r.example)}${r.exampleVi?`<br><span style="color:var(--muted)">🇻🇳 ${esc(r.exampleVi)}</span>`:''}${r.exampleZh?`<br><span style="color:var(--accent)">🀄 ${esc(r.exampleZh)}${r.examplePinyin?` (${esc(r.examplePinyin)})`:''}</span>`:''}</div>`:''}</td>
        <td style="font-size:11px;color:var(--accent)">${esc(r.pos||'')}</td>
        <td class="pin-cell">${esc(r.ipa||'')}</td>
        <td style="color:var(--warn)">${esc(amBoiAny(r.word))}</td>
        <td>${r.vi?esc(r.vi):`<a class="sub" href="${gtranslate(r.word)}" target="_blank" rel="noopener">tra ↗</a>`}</td>
        <td style="font-size:13px">${r.zh?esc(r.zh):''}${r.pinyin?` <span class="sub">(${esc(r.pinyin)})</span>`:''}</td>
        <td style="white-space:nowrap"><button class="mini" onclick="speak('${escq(r.word)}')">🔊</button>
          <button class="mini pDel" data-w="${esc(r.word)}">✕</button></td>
      </tr>`).join("")}
    </tbody></table></div>
    <p class="sub" style="margin-top:8px">Bỏ chọn từ không muốn học, rồi <b>Xác nhận</b> để chuyển sang thư viện keyword (vào luôn bộ ôn tập SRS).</p>
  </div>`;
  const checked=()=>$$(".pChk").filter(c=>c.checked).map(c=>c.value);
  $("#pHead").onclick=e=>$$(".pChk").forEach(c=>c.checked=e.target.checked);
  $("#pAll").onclick=()=>$$(".pChk").forEach(c=>c.checked=true);
  $("#pNone").onclick=()=>$$(".pChk").forEach(c=>c.checked=false);
  $$(".pDel").forEach(b=>b.onclick=()=>{ removeFromPending([b.dataset.w]); drawPending(); });
  $("#pClear").onclick=()=>{ if(confirm("Xóa toàn bộ room tạm?")){ clearPending(); drawPending(); } };
  const missing=pend.filter(p=>!p.vi||!p.zh||!p.pos).length;
  const tb=$("#pTrans");
  if(!missing){ tb.textContent="✓ Đã tra đủ"; tb.disabled=true; }
  tb.onclick=async ()=>{
    tb.disabled=true; const msg=$("#pTransMsg");
    msg.textContent="Đang tra nghĩa VN·中·loại từ (cần mạng)...";
    const ok=await translatePending((d,t)=>{ msg.textContent=`Đang tra ${d}/${t}...`; });
    msg.textContent=`✓ Đã tra ${ok} mục`;
    drawPending();
  };
  $("#pPlay").onclick=()=>{
    const ws=checked(); const items=rows.filter(r=>ws.includes(r.word));
    if(!items.length){ toast("Chọn từ để nghe"); return; }
    const sayVi=$("#pSayVi").checked, sayZh=$("#pSayZh").checked;
    // Đọc English → nghĩa Việt (🇻🇳) → 中文 (🇨🇳)
    Seq.start(items.map(r=>({en:r.word, vi:r.vi, zh:r.zh, ab:amBoiAny(r.word)})), {sayVi, sayZh, gap:500});
    if(sayVi && !hasViVoice()) toast("⚠️ Chưa có giọng Việt — cài trong 📊 Thống kê.");
    if(sayZh && !hasZhVoice()) toast("⚠️ Chưa có giọng Trung — cài giọng Chinese (Mandarin) cho thiết bị.");
  };
  $("#pConfirm").onclick=()=>{
    const ws=checked();
    if(!ws.length){ toast("Chưa chọn từ nào"); return; }
    const room=($("#pRoom").value||"").trim() || "import";
    const topic=$("#pTopic").value||"";
    const n=confirmPending(ws, room, topic);
    toast(`✅ Đã đưa ${n} từ vào thư viện (room "${room}"${topic?` · 📂 ${topic}`:""})`);
    drawPending(); drawLibRooms(); drawLibClean(); drawHistory();
  };
}

/* ---------- QUẢN LÝ ROOM TRONG THƯ VIỆN (xóa/đổi tên nguồn) ---------- */
function drawLibRooms(){
  const el=$("#libRoomsArea"); if(!el) return;
  const rooms=libraryRooms(); const keys=Object.keys(rooms);
  if(!keys.length){ el.innerHTML=""; return; }
  el.innerHTML=`<div class="panel">
    <h3>📚 Room/nguồn trong thư viện (${keys.length})</h3>
    <p class="sub">Đây là các nhóm từ đã xác nhận. Xóa room sẽ gỡ toàn bộ từ của room khỏi thư viện &amp; lịch ôn SRS.</p>
    <div class="table-wrap" style="box-shadow:none;max-height:320px"><table><thead><tr>
      <th>Room / nguồn</th><th>Số từ</th><th>Thao tác</th>
    </tr></thead><tbody>
      ${keys.sort().map(k=>`<tr>
        <td class="han-cell">🎬 ${esc(k)}</td>
        <td><b>${rooms[k]}</b></td>
        <td style="white-space:nowrap">
          <button class="mini lrPlay" data-r="${esc(k)}">▶ Nghe</button>
          <button class="mini lrRen" data-r="${esc(k)}">✏️ Đổi tên</button>
          <button class="mini lrDel" data-r="${esc(k)}" style="border-color:var(--brand)">🗑️ Xóa</button>
        </td></tr>`).join("")}
    </tbody></table></div>
  </div>`;
  $$(".lrDel").forEach(b=>b.onclick=()=>{
    const r=b.dataset.r;
    if(confirm(`Xóa room "${r}" (${rooms[r]} từ) khỏi thư viện? Không thể hoàn tác.`)){
      deleteRoom(r); toast(`Đã xóa room "${r}"`); drawLibRooms(); drawPending();
    }
  });
  $$(".lrRen").forEach(b=>b.onclick=()=>{
    const r=b.dataset.r; const nn=(prompt("Tên mới cho room:", r)||"").trim();
    if(nn && nn!==r){ renameRoom(r,nn); toast("Đã đổi tên"); drawLibRooms(); }
  });
  $$(".lrPlay").forEach(b=>b.onclick=()=>{
    const r=b.dataset.r; const items=progress.myWords.filter(w=>(w.source||"import")===r);
    if(!items.length) return;
    Seq.start(items.map(w=>({en:w.word, vi:w.vi, zh:w.zh, ab:amBoiAny(w.word)})),
      {sayVi:true, sayZh:hasZhVoice() && items.some(w=>w.zh), gap:500});
  });
}

/* ---------- DỌN / GỘP THƯ VIỆN ---------- */
function drawLibClean(){
  const el=$("#libCleanArea"); if(!el) return;
  if(!progress.myWords.length){ el.innerHTML=""; return; }
  const wordDupes=(()=>{ const c={}; progress.myWords.forEach(w=>{const k=w.word.toLowerCase();c[k]=(c[k]||0)+1;});
    return Object.values(c).filter(n=>n>1).reduce((a,n)=>a+n-1,0); })();
  const meanDupes=duplicateMeanings();
  el.innerHTML=`<div class="panel">
    <h3>🧹 Dọn thư viện (${progress.myWords.length} mục)</h3>
    <div class="toolbar">
      <button class="btn ${wordDupes?'primary':''}" id="cbDedup" ${wordDupes?'':'disabled'}>Gỡ từ trùng lặp (${wordDupes})</button>
      <span class="sub">Trùng nghĩa VN: ${meanDupes.length} nhóm</span>
    </div>
    ${meanDupes.length?`<div class="table-wrap" style="box-shadow:none;max-height:320px;margin-top:8px"><table><thead><tr>
      <th>Nghĩa VN trùng</th><th>Các từ (bấm ✕ để xóa bớt)</th>
    </tr></thead><tbody>
      ${meanDupes.map(g=>`<tr>
        <td style="color:var(--muted)">${esc(g.vi)}</td>
        <td>${g.words.map(w=>`<span class="chip" style="margin:2px">${esc(w)} <b class="cbDel" data-w="${esc(w)}" style="cursor:pointer;color:var(--brand)">✕</b></span>`).join("")}</td>
      </tr>`).join("")}
    </tbody></table></div>
    <p class="sub" style="margin-top:6px">Các từ này có nghĩa tiếng Việt giống nhau — có thể là đồng nghĩa hoặc trùng. Xóa bớt nếu không cần học tách.</p>`:`<p class="sub">Không có nghĩa VN trùng lặp. 👍</p>`}
  </div>`;
  if($("#cbDedup")) $("#cbDedup").onclick=()=>{ const n=dedupLibrary(); toast(`Đã gỡ ${n} từ trùng lặp`); drawLibClean(); drawLibRooms(); };
  $$(".cbDel").forEach(b=>b.onclick=()=>{ deleteLibWord(b.dataset.w); toast(`Đã xóa "${b.dataset.w}"`); drawLibClean(); drawLibRooms(); });
}

/* ---------- LỊCH SỬ NHẬP ---------- */
function drawHistory(){
  const el=$("#historyArea"); if(!el) return;
  const h=progress.imports;
  if(!h.length){ el.innerHTML=""; return; }
  el.innerHTML=`<div class="panel">
    <h3>🕘 Lịch sử nhập (${h.length})</h3>
    <div class="table-wrap" style="box-shadow:none;max-height:280px"><table><thead><tr>
      <th>Thời gian</th><th>Nguồn</th><th>Ứng viên</th><th>+Mới</th><th>Trùng TV</th><th>Trùng room</th><th></th>
    </tr></thead><tbody>
      ${h.map(r=>`<tr>
        <td style="font-size:12px">${new Date(r.at).toLocaleString()}</td>
        <td>${({text:"📝",youtube:"▶️",image:"🖼️",pdf:"📄",reel:"📱"})[r.type]||"📥"} ${esc(r.url||r.name||r.type)}</td>
        <td>${r.total}</td><td style="color:var(--ok)"><b>${r.added}</b></td>
        <td style="color:var(--muted)">${r.dupLib}</td><td style="color:var(--muted)">${r.dupRoom}</td>
        <td><button class="mini hDel" data-id="${esc(r.id)}">✕</button></td>
      </tr>`).join("")}
    </tbody></table></div>
    <div class="toolbar" style="margin-top:8px"><button class="btn sm" id="hClear">Xóa toàn bộ lịch sử</button></div>
  </div>`;
  $$(".hDel").forEach(b=>b.onclick=()=>{ progress.imports=progress.imports.filter(x=>x.id!==b.dataset.id); save(); drawHistory(); });
  $("#hClear").onclick=()=>{ progress.imports=[]; save(); drawHistory(); };
}

/* ---------- Chế độ thi thử (tính giờ) ---------- */
let examState=null;
RENDER.exam = () => {
  if(examState && examState.running){ drawExam(); return; }
  $("#view").innerHTML=`
    <h2 class="section-h">🎯 Thi thử (tính giờ)</h2>
    <p class="sub">Mô phỏng bài kiểm tra: nghe/nhìn từ, chọn nghĩa đúng, có đồng hồ đếm ngược. Hết giờ tự nộp bài.</p>
    <div class="panel" style="text-align:center">
      <div class="toolbar" style="justify-content:center">
        <label class="sub">Số câu <select id="exN"><option>10</option><option selected>20</option><option>30</option><option>50</option></select></label>
        <label class="sub">Thời gian/câu <select id="exT"><option value="10">10 giây</option><option value="15" selected>15 giây</option><option value="20">20 giây</option></select></label>
        <label class="sub">Cấp độ <select id="exLvl"><option value="">Mọi cấp độ</option>${[...new Set(D.vocab.map(v=>v.level))].map(l=>`<option>${esc(l)}</option>`).join("")}</select></label>
      </div>
      <button class="btn primary" id="exStart" style="margin-top:8px">▶ Bắt đầu thi</button>
    </div>`;
  $("#exStart").onclick=startExam;
};
function startExam(){
  const N=parseInt($("#exN").value)||20, per=parseInt($("#exT").value)||15, lvl=$("#exLvl").value;
  let pool=allVocab().filter(v=>v.word&&v.vi&&(!lvl||v.level===lvl));
  if(pool.length<4){ toast("Không đủ từ để thi"); return; }
  const qs=shuffle(pool).slice(0,Math.min(N,pool.length)).map(v=>{
    const distract=shuffle(pool.filter(x=>x.vi!==v.vi)).slice(0,3);
    return {word:v.word, ipa:ipaSlashed(v.word)||v.ipa||"", correct:v.vi, options:shuffle([v.vi,...distract.map(d=>d.vi)])};
  });
  examState={qs, idx:0, answers:new Array(qs.length).fill(null), per, timeLeft:qs.length*per, running:true, timer:null};
  examState.timer=setInterval(()=>{
    examState.timeLeft--;
    const t=$("#exTimer"); if(t) t.textContent=fmtTime(examState.timeLeft);
    if(examState.timeLeft<=0) finishExam();
  },1000);
  drawExam();
}
function fmtTime(s){ s=Math.max(0,s); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); }
function drawExam(){
  const st=examState; if(!st){ RENDER.exam(); return; }
  if(st.idx>=st.qs.length){ finishExam(); return; }
  const q=st.qs[st.idx];
  $("#view").innerHTML=`
    <h2 class="section-h">🎯 Thi thử</h2>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="count-pill">Câu ${st.idx+1}/${st.qs.length}</span>
        <span class="count-pill" style="border-color:var(--warn)">⏱ <b id="exTimer">${fmtTime(st.timeLeft)}</b></span>
        <button class="btn sm" id="exQuit">Nộp bài</button>
      </div>
      <div class="progress-bar" style="margin:10px 0"><i style="width:${st.idx/st.qs.length*100}%"></i></div>
      <div style="text-align:center">
        <div class="fhan" style="font-size:36px;color:var(--brand)">${esc(q.word)}</div>
        <div class="detail-pin">${esc(q.ipa)}</div>
        <div style="color:var(--warn);font-size:14px">🗣️ ${esc(amBoiAny(q.word))} <span class="audio-btn" onclick="speak('${escq(q.word)}')">🔊</span></div>
        <div class="quiz-q" style="margin-top:10px">Chọn nghĩa đúng:</div>
        <div>${q.options.map(o=>`<button class="opt" data-vi="${esc(o)}">${esc(o)}</button>`).join("")}</div>
      </div>
    </div>`;
  speak(q.word);
  $("#exQuit").onclick=finishExam;
  $$(".opt").forEach(b=>b.onclick=()=>{
    st.answers[st.idx]={picked:b.dataset.vi, correct:b.dataset.vi===q.correct};
    $$(".opt").forEach(x=>{x.disabled=true; if(x.dataset.vi===q.correct)x.classList.add("correct"); else if(x===b)x.classList.add("wrong");});
    setTimeout(()=>{ st.idx++; drawExam(); }, 700);
  });
}
function finishExam(){
  const st=examState; if(!st) return;
  clearInterval(st.timer); st.running=false;
  const done=st.answers.filter(Boolean);
  const correct=done.filter(a=>a.correct).length;
  const score=Math.round(correct/st.qs.length*100);
  if(correct) logActivity("rev", correct);
  save();
  const wrong=st.qs.map((q,i)=>({q, a:st.answers[i]})).filter(x=>!x.a || !x.a.correct);
  $("#view").innerHTML=`
    <h2 class="section-h">🎯 Kết quả thi thử</h2>
    <div class="panel" style="text-align:center">
      <div style="font-size:56px;font-weight:800;color:${score>=80?'var(--ok)':score>=50?'var(--warn)':'var(--brand)'}">${score}%</div>
      <div class="sub">Đúng ${correct}/${st.qs.length} câu ${score>=80?'🎉 Xuất sắc!':score>=50?'👍 Khá!':'💪 Cần ôn thêm!'}</div>
      <div class="toolbar" style="justify-content:center;margin-top:10px">
        <button class="btn primary" onclick="RENDER.exam()">Thi lại</button>
        <button class="btn" data-jump="srs">🧠 Ôn từ sai</button>
      </div>
    </div>
    ${wrong.length?`<div class="panel"><h3>Xem lại ${wrong.length} câu sai</h3>
      <div class="table-wrap" style="box-shadow:none;max-height:none"><table><thead><tr><th>Từ</th><th>Bạn chọn</th><th>Đáp án đúng</th><th></th></tr></thead><tbody>
      ${wrong.map(x=>`<tr>
        <td class="han-cell">${esc(x.q.word)}</td>
        <td style="color:var(--brand)">${x.a?esc(x.a.picked):'<i>bỏ trống</i>'}</td>
        <td style="color:var(--ok)">${esc(x.q.correct)}</td>
        <td><button class="mini" onclick="speak('${escq(x.q.word)}')">🔊</button></td>
      </tr>`).join("")}
      </tbody></table></div></div>`:`<div class="panel" style="text-align:center"><h3>🏆 Hoàn hảo! Không có câu sai.</h3></div>`}`;
  $$("[data-jump]").forEach(b=>b.onclick=()=>go(b.dataset.jump));
  examState=null;
}

/* ---------- Gốc từ (word roots) ---------- */
RENDER.roots = () => {
  $("#view").innerHTML = `
    <h2 class="section-h">🌱 Gốc từ — tiền tố · hậu tố · cụm từ đi kèm</h2>
    <p class="sub">Phân tích cấu tạo từ giúp đoán nghĩa và nhớ lâu. Nhập bất kỳ từ nào để tách tiền tố/hậu tố.</p>
    <div class="panel">
      <div class="toolbar">
        <input class="txt" id="rzIn" style="flex:1;min-width:220px" placeholder="Nhập từ tiếng Anh (vd: export, shipment, unreliable)...">
        <button class="btn primary" id="rzGo">Phân tích</button>
      </div>
      <div id="rzOut" style="margin-top:8px"></div>
    </div>
    <div class="panel">
      <h3>Bảng tiền tố &amp; hậu tố thông dụng</h3>
      <div class="cards-grid">
        ${Object.entries(D.prefixes).map(([k,v])=>`<div class="vcard"><div class="han" style="font-size:20px">${esc(k)}-</div><div class="vi">${esc(v)}</div></div>`).join("")}
        ${Object.entries(D.suffixes).map(([k,v])=>`<div class="vcard"><div class="han" style="font-size:20px;color:var(--accent)">-${esc(k)}</div><div class="vi">${esc(v)}</div></div>`).join("")}
      </div>
    </div>`;
  const analyze=()=>{
    const t=($("#rzIn").value||"").trim();
    if(!t){ $("#rzOut").innerHTML=""; return; }
    const words=t.split(/\s+/).filter(Boolean);
    $("#rzOut").innerHTML = words.map(w=>{
      const v=findWord(w);
      const rootTxt = (v&&v.root) ? v.root : rootBreakdown(w);
      return `
      <div style="margin-top:10px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span class="han-cell" style="font-size:22px">${esc(w)}</span>
          <span class="pin-cell">${esc(ipaSlashed(w))}</span>
          <span style="color:var(--warn)">🗣️ ${esc(amBoiForWord(w))}</span>
          ${v?`<span class="vi">— ${esc(v.vi)}</span>`:""}
          <button class="mini" onclick="speak('${escq(w)}')">🔊</button>
          <button class="mini" onclick="openYouglish('${escq(w)}')">🌐</button>
        </div>
        <div class="breakdown" style="margin-top:6px">${esc(rootTxt)}</div>
      </div>`;
    }).join("");
  };
  $("#rzGo").onclick=analyze; $("#rzIn").onkeydown=e=>{if(e.key==="Enter")analyze();};
};

/* ---------- Biểu đồ hoạt động theo ngày ---------- */
function activityChart(days=14){
  const arr=[]; const d=new Date(); d.setHours(0,0,0,0);
  for(let i=days-1;i>=0;i--){ const dt=new Date(d.getTime()-i*DAY_MS);
    const k=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
    const a=progress.activity[k]||{}; arr.push({k, day:dt.getDate(), rev:a.rev||0, nw:a.new||0, sent:a.sent||0, tot:(a.rev||0)+(a.new||0)+(a.sent||0)}); }
  const max=Math.max(...arr.map(x=>x.tot),1);
  const totRev=arr.reduce((s,x)=>s+x.rev,0), totNew=arr.reduce((s,x)=>s+x.nw,0), totSent=arr.reduce((s,x)=>s+x.sent,0);
  if(!totRev && !totNew && !totSent) return `<p class="sub">Chưa có hoạt động. Hãy ôn tập hoặc thêm từ mới để theo dõi tiến độ theo ngày.</p>`;
  return `
    <div style="display:flex;align-items:flex-end;gap:4px;height:130px;margin:8px 0">
      ${arr.map(x=>`<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px" title="${x.k}: ${x.rev} ôn · ${x.nw} từ mới · ${x.sent} câu">
        <div style="width:100%;display:flex;flex-direction:column-reverse;height:${x.tot/max*100}px;min-height:${x.tot?4:0}px;border-radius:4px 4px 0 0;overflow:hidden">
          <div style="background:var(--brand);height:${x.tot?x.rev/x.tot*100:0}%"></div>
          <div style="background:var(--ok);height:${x.tot?x.nw/x.tot*100:0}%"></div>
          <div style="background:var(--accent);height:${x.tot?x.sent/x.tot*100:0}%"></div>
        </div>
        <div style="font-size:10px;color:var(--muted)">${x.day}</div>
      </div>`).join("")}
    </div>
    <div class="sub" style="display:flex;gap:14px;flex-wrap:wrap">
      <span><b style="color:var(--brand)">■</b> Ôn tập: ${totRev}</span>
      <span><b style="color:var(--ok)">■</b> Từ mới: ${totNew}</span>
      <span><b style="color:var(--accent)">■</b> Ôn câu: ${totSent}</span>
    </div>`;
}

/* ---------- Stats ---------- */
RENDER.stats = () => {
  const byLevel={}, byTopic={};
  D.vocab.forEach(v=>{byLevel[v.level]=(byLevel[v.level]||0)+1; if(v.topic)byTopic[v.topic]=(byTopic[v.topic]||0)+1;});
  const learned=Object.keys(progress.learned).length;
  const bar=(obj)=>{
    const max=Math.max(...Object.values(obj),1);
    return Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
      <div style="margin:8px 0">
        <div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(k)}</span><b>${v}</b></div>
        <div style="height:10px;background:var(--chip);border-radius:8px;overflow:hidden">
          <i style="display:block;height:100%;width:${v/max*100}%;background:var(--brand)"></i></div>
      </div>`).join("");
  };
  $("#view").innerHTML = `
    <h2 class="section-h">Thống kê</h2>
    <div class="stat-grid">
      <div class="stat"><div class="n">${learned}</div><div class="l">Từ đã thuộc</div></div>
      <div class="stat"><div class="n">${(learned/allVocab().length*100).toFixed(1)}%</div><div class="l">Tiến độ</div></div>
      <div class="stat"><div class="n">${srsCounts().mature}</div><div class="l">Nhớ lâu (SRS)</div></div>
      <div class="stat"><div class="n">${progress.quizStats.correct}/${progress.quizStats.total||0}</div><div class="l">Điểm kiểm tra</div></div>
      <div class="stat"><div class="n">${progress.listenStats.correct}/${progress.listenStats.total||0}</div><div class="l">Điểm luyện nghe</div></div>
      <div class="stat"><div class="n">${progress.myWords.length}</div><div class="l">Từ tự thêm 🎬</div></div>
      <div class="stat"><div class="n">${progress.myWords.filter(w=>w.phrase).length}</div><div class="l">Cụm từ 🔗</div></div>
    </div>
    <div class="panel"><h3>🔥 Chuỗi ngày học</h3>
      <div class="stat-grid" style="margin-top:4px">
        <div class="stat"><div class="n" style="color:var(--warn)">${computeStreak().current}</div><div class="l">Ngày liên tiếp</div></div>
        <div class="stat"><div class="n">${computeStreak().longest}</div><div class="l">Kỷ lục</div></div>
        <div class="stat"><div class="n">${activeDaySet().size}</div><div class="l">Tổng ngày học</div></div>
        <div class="stat"><div class="n" style="color:var(--warn)">${dueTotalToday()}</div><div class="l">Đến hạn hôm nay</div></div>
      </div>
      <div class="toolbar" style="margin-top:8px">
        <label class="sub">🎯 Mục tiêu/ngày — từ <input class="txt" id="planW" type="number" min="10" max="500" value="${planTargets().w}" style="width:70px"></label>
        <label class="sub">câu <input class="txt" id="planS" type="number" min="10" max="500" value="${planTargets().s}" style="width:70px"></label>
        <button class="btn ${progress.settings.notify?'':'primary'}" id="notifyBtn">${progress.settings.notify?'🔔 Đang bật nhắc':'🔔 Bật nhắc ôn tập'}</button>
        <label class="sub">⏰ Giờ nhắc <input class="txt" id="notifyTime" type="time" value="${progress.settings.notifyTime||'08:00'}" style="width:110px"></label>
        <span class="sub" id="notifyMsg"></span>
      </div>
      <p class="sub">Nhắc mỗi ngày vào <b>${progress.settings.notifyTime||'08:00'}</b> bằng thông báo trình duyệt. Lập lịch chạy khi app đang mở; nếu đã qua giờ mà mới mở app thì nhắc ngay. <i>Trình duyệt không nhắc được khi app đóng hoàn toàn — cài app (PWA) &amp; giữ chạy nền để nhắc ổn định hơn.</i></p>
    </div>
    <div class="panel"><h3>📈 Tiến độ 14 ngày gần đây</h3>${activityChart(14)}</div>
    <div class="panel"><h3>Từ vựng theo cấp độ</h3>${bar(byLevel)}</div>
    <div class="panel"><h3>Từ vựng theo chủ đề</h3>${bar(byTopic)}</div>
    <div class="panel"><h3>🔊 Giọng đọc</h3>
      <p class="sub">Chọn giọng &amp; tốc độ. Để đọc <b>nghĩa tiếng Việt chuẩn</b>, hãy cài giọng tiếng Việt (Android: Cài đặt → TTS → Google giọng Việt).</p>
      <div class="toolbar">
        <label class="sub">🇬🇧 Giọng Anh <select id="setEnVoice" style="max-width:220px"></select></label>
        <label class="sub">Tốc độ <input type="range" id="setEnRate" min="0.5" max="1.1" step="0.05" value="${progress.settings.enRate||0.9}"></label>
        <button class="btn sm" id="testEn">🔊 Thử</button>
      </div>
      <div class="toolbar">
        <label class="sub">🇻🇳 Giọng Việt <select id="setViVoice" style="max-width:220px"></select></label>
        <label class="sub">Tốc độ <input type="range" id="setViRate" min="0.6" max="1.3" step="0.05" value="${progress.settings.viRate||1}"></label>
        <button class="btn sm" id="testVi">🔊 Thử</button>
      </div>
      <div class="toolbar">
        <label class="sub">🇨🇳 Giọng Trung <select id="setZhVoice" style="max-width:220px"></select></label>
        <label class="sub">Tốc độ <input type="range" id="setZhRate" min="0.6" max="1.3" step="0.05" value="${progress.settings.zhRate||1}"></label>
        <button class="btn sm" id="testZh">🔊 Thử</button>
      </div>
      <div class="toolbar">
        <label class="chip ${progress.settings.viFirst!==false?'active':''}" id="setViFirst">🔄 Đọc tiếng Việt TRƯỚC tiếng Anh</label>
      </div>
      <p class="sub" id="voiceWarn"></p>
    </div>
    <div class="panel"><h3>📤 Thư viện keyword (chia sẻ giữa máy/điện thoại)</h3>
      <p class="sub">Xuất riêng ${progress.myWords.length} từ/cụm bạn đã thêm ra file để chép sang thiết bị khác, rồi Nhập lại (tự gộp, bỏ trùng).</p>
      <div class="toolbar">
        <button class="btn primary" id="expLib">⬇ Xuất thư viện (.json)</button>
        <label class="btn" style="cursor:pointer">⬆ Nhập thư viện<input type="file" id="impLib" accept="application/json,.json" hidden></label>
        <span class="sub" id="libMsg"></span>
      </div>
    </div>
    <div class="panel"><h3>Quản lý dữ liệu</h3>
      <div class="toolbar">
        <button class="btn" id="expBtn">⬇ Xuất toàn bộ tiến độ (JSON)</button>
        <button class="btn" id="resetBtn">🗑 Đặt lại tiến độ</button>
      </div>
      <p class="sub">Room tạm: ${progress.pending.length} từ · Lịch sử nhập: ${progress.imports.length} · Đã vào thư viện: ${progress.myWords.length}</p></div>`;
  // Voice settings
  const enSel=$("#setEnVoice"), viSel=$("#setViVoice"), zhSel=$("#setZhVoice");
  const enList=allVoices.filter(v=>/^en/i.test(v.lang));
  const viList=allVoices.filter(v=>/^vi/i.test(v.lang));
  const zhList=allVoices.filter(v=>/^zh/i.test(v.lang)||/chinese|mandarin|中文|普通话/i.test(v.name||""));
  enSel.innerHTML=enList.map(v=>`<option value="${esc(v.voiceURI)}" ${enVoice&&enVoice.voiceURI===v.voiceURI?'selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")||`<option>(mặc định hệ thống)</option>`;
  viSel.innerHTML=viList.map(v=>`<option value="${esc(v.voiceURI)}" ${viVoice&&viVoice.voiceURI===v.voiceURI?'selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")||`<option value="">(chưa có giọng Việt)</option>`;
  zhSel.innerHTML=zhList.map(v=>`<option value="${esc(v.voiceURI)}" ${zhVoice&&zhVoice.voiceURI===v.voiceURI?'selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")||`<option value="">(chưa có giọng Trung)</option>`;
  const warn=[];
  if(!viList.length) warn.push("⚠️ Chưa có giọng tiếng Việt — nghĩa Việt đọc bằng giọng mặc định.");
  if(!zhList.length) warn.push("⚠️ Chưa có giọng tiếng Trung — nghĩa 中文 đọc bằng giọng mặc định. Cài gói giọng Chinese (Mandarin).");
  $("#voiceWarn").innerHTML=warn.join("<br>");
  enSel.onchange=e=>{ progress.settings.enVoice=e.target.value; save(); pickVoice(); };
  viSel.onchange=e=>{ progress.settings.viVoice=e.target.value; save(); pickVoice(); };
  zhSel.onchange=e=>{ progress.settings.zhVoice=e.target.value; save(); pickVoice(); };
  $("#setEnRate").oninput=e=>{ progress.settings.enRate=parseFloat(e.target.value); save(); };
  $("#setViRate").oninput=e=>{ progress.settings.viRate=parseFloat(e.target.value); save(); };
  $("#setZhRate").oninput=e=>{ progress.settings.zhRate=parseFloat(e.target.value); save(); };
  if($("#planW")) $("#planW").onchange=e=>{ progress.settings.planWords=Math.max(10,parseInt(e.target.value)||100); save(); };
  if($("#planS")) $("#planS").onchange=e=>{ progress.settings.planSents=Math.max(10,parseInt(e.target.value)||100); save(); };
  if($("#notifyTime")) $("#notifyTime").onchange=e=>{ progress.settings.notifyTime=e.target.value||"08:00"; save(); scheduleReminder(); toast("Đã đặt giờ nhắc "+progress.settings.notifyTime); };
  if($("#notifyBtn")) $("#notifyBtn").onclick=()=>{
    if(progress.settings.notify){ progress.settings.notify=false; save(); scheduleReminder(); RENDER.stats(); toast("Đã tắt nhắc"); return; }
    if(notifySupported() && Notification.permission==="denied"){ $("#notifyMsg").textContent="Bạn đã chặn thông báo — mở cài đặt trình duyệt để cho phép."; return; }
    enableNotify(ok=>{ if(ok) scheduleReminder(); toast(ok?"Đã bật nhắc ôn tập":"Chưa cấp quyền thông báo"); RENDER.stats(); });
  };
  if($("#setViFirst")) $("#setViFirst").onclick=e=>{ progress.settings.viFirst=!(progress.settings.viFirst!==false); save(); e.target.classList.toggle("active",progress.settings.viFirst!==false); };
  $("#testEn").onclick=()=>speak("Business negotiation and shipment schedule.");
  $("#testVi").onclick=()=>speakVi("Đây là giọng đọc tiếng Việt để đọc nghĩa của từ.");
  $("#testZh").onclick=()=>speakZh("这是用来朗读中文释义的声音。");
  $("#expBtn").onclick=()=>{
    const blob=new Blob([JSON.stringify(progress,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="tien-do-english.json"; a.click();
  };
  // Xuất/nhập riêng thư viện keyword
  $("#expLib").onclick=()=>{
    const payload={type:"en-keyword-library", version:1, exportedAt:new Date().toISOString(), words:progress.myWords};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`thu-vien-keyword-${new Date().toISOString().slice(0,10)}.json`; a.click();
    toast(`Đã xuất ${progress.myWords.length} từ/cụm`);
  };
  $("#impLib").onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const data=JSON.parse(rd.result);
        const words=Array.isArray(data)?data:(data.words||[]);
        if(!words.length){ $("#libMsg").textContent="File không có từ nào."; return; }
        let added=0, dup=0;
        words.forEach(w=>{ if(!w||!w.word) return;
          if(addMyWord({word:w.word, ipa:w.ipa||"", vi:w.vi||"", zh:w.zh||"", pinyin:w.pinyin||"",
            pos:w.pos||"", phrase:!!w.phrase, example:w.example||"", exampleVi:w.exampleVi||"", exampleZh:w.exampleZh||"", examplePinyin:w.examplePinyin||"", source:w.source||"nhập từ file"})) added++; else dup++;
        });
        $("#libMsg").textContent=`✓ Nhập ${added} từ mới · ${dup} đã có.`;
        toast(`Đã nhập ${added} từ vào thư viện`);
        RENDER.stats();
      }catch(err){ $("#libMsg").textContent="✗ File không hợp lệ: "+err.message; }
    };
    rd.readAsText(f);
  };
  $("#resetBtn").onclick=()=>{ if(confirm("Xóa toàn bộ tiến độ học (kể cả từ tự thêm, room tạm, lịch sử)?")){ const st=progress.settings; progress={learned:{},srs:{},quizStats:{correct:0,total:0},listenStats:{correct:0,total:0},myWords:[],pending:[],imports:[],settings:st||{},activity:{},sentSrs:{},playCount:{},plan:{},dailyList:{},exampleTx:{}}; save(); RENDER.stats(); toast("Đã đặt lại"); } };
};

/* ---------- Utils ---------- */
function shuffle(a){ a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

/* ---------- Global search ---------- */
$("#globalSearch").addEventListener("input", e=>{
  const q=e.target.value;
  vocabFilter.q=q;
  if(q && current!=="vocab"){ go("vocab"); $("#globalSearch").focus(); }
  else if(current==="vocab") drawVocab();
});

/* ---------- Theme ---------- */
function initTheme(){
  const saved=localStorage.getItem("en_theme");
  if(saved) document.documentElement.setAttribute("data-theme",saved);
  else if(matchMedia("(prefers-color-scheme:dark)").matches) document.documentElement.setAttribute("data-theme","dark");
}
$("#themeBtn").onclick=()=>{
  const cur=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme",cur); localStorage.setItem("en_theme",cur);
};
$("#menuBtn").onclick=()=>$("#sidebar").classList.toggle("open");

/* ---------- Boot ---------- */
initTheme();
buildNav();
scheduleReminder();
go(location.hash.slice(1) && PAGES.some(p=>p.id===location.hash.slice(1)) ? location.hash.slice(1) : "home");
window.closeModal=closeModal; window.speak=speak; window.toggleLearned=toggleLearned; window.toast=toast; window.RENDER=RENDER; window.openYouglish=openYouglish;
