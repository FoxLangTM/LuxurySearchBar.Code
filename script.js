// ======= Global setup =======
const btn = document.getElementById("searchBtn");
const overlay = document.getElementById("overlay");
const input = document.getElementById("searchInput");
const resultsSlots = Array.from(document.querySelectorAll(".result"));
const dockBtn = document.getElementById("dockBtn");
const homeBtn = document.getElementById("home-btn");

let selectedIndex = -1;
let debounceTimer = null;
let nextPage = 0;
let currentQuery = "";
let loading = false;

let historyStack = [];
let historyIndex = -1;
let shownLinks = new Set();

// ======= Language detection =======
function detectLang() {
  const sysLang = navigator.languages?.[0] || navigator.language || "pl";
  const code = sysLang.split("-")[0].toLowerCase();
  const supported = ["pl","en","de","fr","es","it","pt","nl","sv","ja","zh"];
  return supported.includes(code) ? code : "pl";
}
const lang = detectLang();

// ======= Proxy list =======
const proxies = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
  "https://thingproxy.freeboard.io/fetch/",
];

// ======= HTML escape =======
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ======= Ensure results root =======
function ensureResultsRoot() {
  let root = document.querySelector(".results-root");
  if (!root) {
    root = document.createElement("div");
    root.className = "results-root";
    root.innerHTML = `
      <div class="results-header"><h2 id="queryTitle"></h2></div>
      <div class="results-container">
        <div class="results-grid"></div>
      </div>
      <div class="scroll-trigger">
        <div class="trigger-dot"></div>
        <div class="trigger-line"></div>
      </div>
    `;
    document.body.appendChild(root);
  }
  return root;
}

// ======= Fetch via proxy =======
async function fetchWithProxyText(url) {
  for (const p of proxies) {
    try {
      const full = p + encodeURIComponent(url);
      const res = await fetch(full, { cache: "no-store" });
      if (!res || !res.ok) continue;
      const text = await res.text();
      if (text) return text;
    } catch {}
  }
  return null;
}

// ======= Resolve DuckDuckGo redirect =======
function resolveDuckHref(href) {
  try {
    const url = new URL(href);
    if (url.hostname === "duckduckgo.com" && url.searchParams.has("uddg")) {
      return decodeURIComponent(url.searchParams.get("uddg"));
    }
    return href;
  } catch {
    return href;
  }
}

// ======= Fetch DuckDuckGo results =======
async function fetchResultsDDG(query, page = 0, perPage = 8) {
  const start = page * perPage;
  const target = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${start}`;
  const text = await fetchWithProxyText(target);
  if (!text) return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const arr = [];
    doc.querySelectorAll(".result, .web-result").forEach((r) => {
      const a = r.querySelector("a.result__a");
      if (!a) return;
      const href = a.href || "";
      const title = (a.textContent || "").trim().slice(0,120);
      const snippet = (r.querySelector(".result__snippet")?.textContent || "").trim().slice(0,200);
      const url = resolveDuckHref(href);
      let display = "";
      try { display = new URL(url).hostname.slice(0,25); } catch { display = url.slice(0,25); }
      const img = `https://icons.duckduckgo.com/ip3/${display}.ico`;
      arr.push({ title, snippet, link: url, displayLink: display, image: img });
    });
    return arr.slice(0,perPage);
  } catch { return []; }
}

// ======= Build card HTML =======
function buildCardHTML(r) {
  return `
    <img src="${escapeHtml(r.image)}" class="results-res-thumb" loading="lazy"/>
    <div class="results-res-info">
      <h3>${escapeHtml(r.title)}</h3>
      <div class="results-res-desc">
        <p class="results-res-text">${escapeHtml(r.snippet)}</p>
        <img src="${escapeHtml(r.image)}" class="results-res-mini" loading="lazy"/>
      </div>
      <a href="${escapeHtml(r.link)}" target="_blank" rel="noopener">${escapeHtml(r.displayLink)}</a>
    </div>
  `;
}

// ======= Show search results =======
async function showSearchResults(query, reset=false) {
  if (!query) return;
  currentQuery = query;
  const root = ensureResultsRoot();
  const grid = root.querySelector(".results-grid");
  const titleEl = root.querySelector("#queryTitle");
  if (titleEl) titleEl.textContent = query;
  if (root) root.style.display = "block";

  if (reset) {
    nextPage = 0;
    historyStack = [];
    historyIndex = -1;
    shownLinks.clear();
    grid.innerHTML = "";
  }

  if (loading) return;
  loading = true;

  const results = await fetchResultsDDG(query, nextPage, 8);
  const uniqueResults = results.filter(r => !shownLinks.has(r.link));
  if (!uniqueResults.length && nextPage===0) {
    grid.innerHTML = `<div class="results-empty">Brak wyników dla: ${escapeHtml(query)}</div>`;
    loading = false;
    return;
  }

  uniqueResults.forEach(r=>shownLinks.add(r.link));
  historyStack.push(uniqueResults);
  historyIndex = historyStack.length-1;
  nextPage++;

  grid.innerHTML = "";
  uniqueResults.forEach(r=>{
    const card = document.createElement("div");
    card.className="results-res-card";
    card.innerHTML = buildCardHTML(r);
    grid.appendChild(card);
  });

  loading=false;
}



// ======= Scroll trigger behavior =======
function setupTrigger() {
  const trigger = document.querySelector(".scroll-trigger");
  if (!trigger) return;

  let holdTimer = null;
  const HOLD_TIME = 1000;

  async function showNextResults() {
    trigger.classList.remove("active");
    if (!currentQuery || loading) return;
    loading = true;

    const grid = document.querySelector(".results-grid");
    if (!grid) { loading = false; return; }

    const results = await fetchResultsDDG(currentQuery, nextPage, 8);
    const uniqueResults = results.filter(r => !shownLinks.has(r.link));
    if (!uniqueResults.length) { loading = false; return; }

    uniqueResults.forEach(r => shownLinks.add(r.link));
    historyStack.push(uniqueResults);
    historyIndex = historyStack.length - 1;
    nextPage++;

    uniqueResults.forEach(r => {
      const card = document.createElement("div");
      card.className = "results-res-card";
      card.innerHTML = buildCardHTML(r);
      grid.appendChild(card);
    });

    loading = false;
  }

  function startHold() {
    trigger.classList.add("active");
    holdTimer = setTimeout(showNextResults, HOLD_TIME);
  }

  function cancelHold() {
    clearTimeout(holdTimer);
    trigger.classList.remove("active");
  }

  trigger.addEventListener("mousedown", startHold);
  trigger.addEventListener("touchstart", startHold, { passive: true });
  window.addEventListener("mouseup", cancelHold);
  window.addEventListener("touchend", cancelHold);
}

document.addEventListener("DOMContentLoaded", setupTrigger);


  

// ======= Suggestions =======
async function fetchSuggestions(q){
  if(!q) return [];
  const target=`https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&q=${encodeURIComponent(q)}`;
  for(const proxy of proxies){
    try{
      const res=await fetch(proxy+encodeURIComponent(target),{cache:"no-store"});
      if(!res||!res.ok) continue;
      const txt=await res.text();
      const parsed=JSON.parse(txt);
      if(Array.isArray(parsed[1])) return parsed[1];
    }catch{}
  }
  return [];
}
function clearSlots(){ selectedIndex=-1; resultsSlots.forEach(r=>{r.textContent=""; r.classList.remove("filled","active");}); }

// ======= Input handlers =======
input.addEventListener("input",()=>{
  const q=input.value.trim(); selectedIndex=-1; if(!q) return clearSlots();
  if(debounceTimer) clearTimeout(debounceTimer);
  debounceTimer=setTimeout(async()=>{
    const suggestions=await fetchSuggestions(q);
    resultsSlots.forEach((slot,i)=>{
      if(suggestions[i]) { slot.textContent=suggestions[i]; slot.classList.add("filled"); }
      else { slot.textContent=""; slot.classList.remove("filled","active"); }
    });
  },200);
});

input.addEventListener("keydown",(e)=>{
  const filled=resultsSlots.filter(r=>r.classList.contains("filled"));
  if(!filled.length && e.key!=="Enter") return;
  if(["ArrowDown","ArrowUp","Enter"].includes(e.key)) e.preventDefault();
  if(e.key==="ArrowDown") selectedIndex=(selectedIndex+1)%filled.length;
  else if(e.key==="ArrowUp") selectedIndex=(selectedIndex-1+filled.length)%filled.length;
  else if(e.key==="Enter"){
    const q=selectedIndex>=0 && filled[selectedIndex]?filled[selectedIndex].textContent:input.value.trim();
    if(!q) return;
    showSearchResults(q,true);
  }
  filled.forEach((r,i)=>r.classList.toggle("active",i===selectedIndex));
});

resultsSlots.forEach(slot=>{
  slot.addEventListener("click",()=>{
    if(!slot.classList.contains("filled")) return;
    showSearchResults(slot.textContent,true);
  });
});

// ======= Overlay toggle =======
btn.addEventListener("click",()=>{
  if(overlay.style.display==="flex"){ overlay.classList.remove("show"); setTimeout(()=>overlay.style.display="none",300);}
  else{ overlay.style.display="flex"; setTimeout(()=>overlay.classList.add("show"),10); input.focus(); input.select();}
});
overlay.addEventListener("click",(e)=>{ if(e.target===overlay){ overlay.classList.remove("show"); setTimeout(()=>overlay.style.display="none",300);} });
input.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); showSearchResults(input.value.trim(),true); }});

// ======= Dock button =======
dockBtn?.addEventListener("click",()=>{
  dockBtn.classList.add("spin");
  setTimeout(()=>dockBtn.classList.remove("spin"),400);
  const dockMenu=document.getElementById("dockMenu");
  if(dockMenu) dockMenu.classList.toggle("show");
});

// ======= Home button =======
homeBtn?.addEventListener("click",()=>{
  const root=document.querySelector(".results-root");
  if(root) root.style.display="none";
  overlay.style.display="none"; overlay.classList.remove("show");
  input.value=""; clearSlots(); historyStack=[]; historyIndex=-1; shownLinks.clear(); nextPage=0;
  const grid=root?.querySelector(".results-grid"); if(grid) grid.innerHTML="";
  window.scrollTo({top:0,behavior:"smooth"});
});

// === SETTINGS TOGGLE ===
const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settingsOverlay");

settingsBtn.addEventListener("click", () => {
  settingsOverlay.classList.add("show");
});

settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.remove("show");
  }
});


const closeLine = document.querySelector(".settings-close-line");
let closeTimer = null;
const CLOSE_HOLD = 200;

function startCloseHold() {
  closeTimer = setTimeout(() => {
    const panel = document.querySelector(".settings-overlay");
    if(panel) panel.classList.remove("show");
  }, CLOSE_HOLD);
}

function cancelCloseHold() {
  clearTimeout(closeTimer);
}

closeLine.addEventListener("mousedown", startCloseHold);
closeLine.addEventListener("touchstart", startCloseHold, {passive:true});
document.addEventListener("mouseup", cancelCloseHold);
document.addEventListener("touchend", cancelCloseHold);



const panel = document.querySelector('.settings-panel');
const dots = panel.querySelectorAll('.dot');
const layers = panel.querySelectorAll('.layer');

dots.forEach(dot => {
  dot.addEventListener('click', () => {
    // dezaktywacja wszystkich dotów
    dots.forEach(d => d.classList.remove('active'));
    // dezaktywacja wszystkich warstw
    layers.forEach(l => l.classList.remove('active'));

    // aktywacja klikniętej dot i warstwy
    dot.classList.add('active');
    const layerName = dot.dataset.layer;
    const layer = panel.querySelector(`.${layerName}`);
    if (layer) {
      layer.style.transition = 'opacity 0.3s ease';
      layer.classList.add('active');
    }
  });
});




// ======= Assistant (full) =======
function createAssistantPanel(){
  const panel=document.createElement("div");
  panel.className="assistant-section";
  panel.innerHTML=`
    <button id="assistantBtn">Asystent 🔹</button>
    <div id="assistantPanel">
      <div class="assistant-content">
        <div class="assistant-text" id="assistantText">Witaj! Jestem Twoim asystentem. Kliknij akcję po prawej, aby rozpocząć.</div>
        <div class="assistant-controls">
          <button class="assistant-action" data-action="summary">📑 Podsumuj</button>
          <button class="assistant-action" data-action="translate">🌍 Tłumacz</button>
          <button class="assistant-action" data-action="idea">💡 Pomysł</button>
        </div>
      </div>
      <button class="assistant-more" id="assistantMore">Więcej</button>
    </div>`;
  return panel;
}

function setupAssistantBehavior(){
  const btnA=document.getElementById("assistantBtn");
  const panel=document.getElementById("assistantPanel");
  const textEl=document.getElementById("assistantText");
  const moreBtn=document.getElementById("assistantMore");
  const actions=document.querySelectorAll(".assistant-action");

  btnA?.addEventListener("click",()=>{panel.style.display=panel.style.display==="block"?"none":"block";});
  actions.forEach(a=>{
    a.addEventListener("click",async()=>{
      const query=document.getElementById("searchInput")?.value?.trim();
      if(!query){ textEl.textContent="Najpierw wpisz coś w ⌕ wyszukiwarkę"; return;}
      textEl.textContent="ꂣ Przetwarzam...";
      if(a.dataset.action==="translate"){ const l=await detectLanguage(query); textEl.textContent=await fetchTranslation(query,l);}
      else if(a.dataset.action==="summary"){ textEl.textContent=await fetchGroqAnswer(`Podsumuj: ${query}`);}
      else if(a.dataset.action==="idea"){ textEl.textContent=await fetchGroqAnswer(`Pomysł dla: ${query}`);}
    });
  });
  moreBtn?.addEventListener("click",()=>{ textEl.textContent+="\n\n🔹 Dalsze informacje wkrótce..."; });
}

const assistantObserver=new MutationObserver(()=>{
  const root=document.querySelector(".results-root");
  const grid=root?.querySelector(".results-grid");
  if(grid && !document.querySelector(".assistant-section")){
    const assistant=createAssistantPanel();
    grid.parentElement.insertBefore(assistant,grid);
    setupAssistantBehavior();
  }
});
assistantObserver.observe(document.body,{childList:true,subtree:true});

// ======= Assistant translation / language =======
const assistantUserLang=(navigator.languages?.[0]||navigator.language||"en").split("-")[0];
async function detectLanguage(text){ try{const proxy=proxies[Math.floor(Math.random()*proxies.length)]; const url=proxy+encodeURIComponent(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=|en`); const res=await fetch(url); if(!res||!res.ok)return assistantUserLang; const data=await res.json(); return data?.responseData?.detectedLanguage||assistantUserLang;}catch{return assistantUserLang;} }
async function fetchTranslation(text,fromLang){ try{ const proxy=proxies[Math.floor(Math.random()*proxies.length)]; const url=`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${assistantUserLang}`; const res=await fetch(proxy+encodeURIComponent(url)); if(!res||!res.ok) return "📍 Serwer niedostępny."; const data=await res.json(); return data?.responseData?.translatedText||"Brak odpowiedzi"; }catch{return "📍 Serwer niedostępny.";}}
async function fetchGroqAnswer(prompt){ return `📌 (Podsumowanie tymczasowe) ${prompt.slice(0,120)}...`;}

// ======= Init DOMContentLoaded =======
document.addEventListener("DOMContentLoaded", () => {
  ensureResultsRoot();
  setupTrigger();
});

function setupTrigger() {
  const trigger = document.querySelector(".scroll-trigger");
  const overlay = document.getElementById("overlay");
  const searchMenu = document.querySelector(".search-menu");
  let holdTimer = null;
  const HOLD_TIME = 500; // pół sekundy

  if (!trigger) return;

  function startHold() {
    if (loading) return;
    trigger.classList.add("active");

    holdTimer = setTimeout(async () => {
      await showNextResults();
      trigger.classList.remove("active");
    }, HOLD_TIME);
  }

  function cancelHold() {
    clearTimeout(holdTimer);
    trigger.classList.remove("active");
  }

  trigger.addEventListener("mousedown", startHold);
  trigger.addEventListener("touchstart", startHold);
  document.addEventListener("mouseup", cancelHold);
  document.addEventListener("touchend", cancelHold);

  // --- Zamykaj search bar po kliknięciu poza nim ---
  document.addEventListener("click", (e) => {
    if (!overlay || overlay.style.display !== "flex") return;

    const insideSearch = searchMenu && searchMenu.contains(e.target);
    const triggerButton = e.target.closest("#searchBtn");

    if (!insideSearch && !triggerButton) {
      overlay.classList.remove("show");
      setTimeout(() => (overlay.style.display = "none"), 300);
    }
  });

  // --- Główna funkcja ładowania wyników ---
  async function showNextResults() {
    if (!currentQuery || loading) return;
    loading = true;

    const grid = document.querySelector(".results-grid");
    if (!grid) {
      loading = false;
      return;
    }

    const results = await fetchResultsDDG(currentQuery, nextPage, 8);
    const uniqueResults = results.filter((r) => !shownLinks.has(r.link));

    if (!uniqueResults.length) {
      loading = false;
      return;
    }

    uniqueResults.forEach((r) => shownLinks.add(r.link));
    historyStack.push(uniqueResults);
    historyIndex = historyStack.length - 1;
    nextPage++;

    uniqueResults.forEach((r) => {
      const card = document.createElement("div");
      card.className = "results-res-card";
      card.innerHTML = buildCardHTML(r);
      grid.appendChild(card);
    });

    loading = false;
  }
}


// === Zamykaj wyszukiwarkę i dock menu po kliknięciu poza nimi ===
document.addEventListener("click", (e) => {
  const overlay = document.getElementById("overlay");
  const searchMenu = document.querySelector(".search-menu");
  const dockMenu = document.getElementById("dockMenu"); // masz taki id
  const searchBtn = e.target.closest("#searchBtn");
  const dockBtn = e.target.closest("#dockBtn");

  // --- Search bar ---
  if (overlay && overlay.style.display === "flex") {
    const insideSearch = searchMenu && searchMenu.contains(e.target);
    if (!insideSearch && !searchBtn) {
      overlay.classList.remove("show");
      setTimeout(() => (overlay.style.display = "none"), 300);
    }
  }

  // --- Dock menu ---
  if (dockMenu && dockMenu.classList.contains("show")) {
    const insideDock = dockMenu.contains(e.target);
    if (!insideDock && !dockBtn) {
      dockMenu.classList.remove("show");
    }
  }
});