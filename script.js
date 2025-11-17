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
      <span class="fake-link" data-url="${escapeHtml(r.link)}">${escapeHtml(r.displayLink)}</span>
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
const dots = document.querySelectorAll('.dot'); // zakładam, że tak się nazywają twoje przyciski
dots.forEach((dot, i) => {
  dot.addEventListener('click', () => {
    updateCategory(i); // pokaż odpowiedni layer
  });
});
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



const mainBtn = document.getElementById('variation_1btn');

mainBtn.addEventListener('click', () => {
  const layer = document.getElementById('variation_layer1');
layer.parentElement.classList.add('active'); // włącza opacity i pointer-event
  // Sprawdź, czy już istnieje linia i variations

  if (!layer.querySelector('.line')) {
    // Tworzymy linię
    const line = document.createElement('div');
    line.className = 'line';
    layer.appendChild(line);

    // Tworzymy kilka przełączników
    const variations = [
      { label: 'Opcja 1' },
      { label: 'Opcja 2' },
      { label: 'Opcja 3' }
    ];

    variations.forEach(v => {
      const variation = document.createElement('div');
      variation.className = 'variation';

      const dot = document.createElement('div');
      dot.className = 'variation-dot';

      const label = document.createElement('span');
      label.className = 'variation-label';
      label.textContent = v.label;

      variation.appendChild(dot);
      variation.appendChild(label);

      // Kliknięcie na przełącznik
      variation.addEventListener('click', () => {
        // reset wszystkich
        layer.querySelectorAll('.variation-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });

      layer.appendChild(variation);
    });
  }
});


const binaryToggle = document.getElementById('toggle1');
const leftLabel = binaryToggle.querySelector('.toggle-label.left');
const rightLabel = binaryToggle.querySelector('.toggle-label.right');

binaryToggle.addEventListener('click', () => {
  const isLeftActive = leftLabel.classList.contains('active');

  if(isLeftActive){
    leftLabel.classList.remove('active');
    rightLabel.classList.add('active');
    binaryToggle.classList.add('active');
  } else {
    leftLabel.classList.add('active');
    rightLabel.classList.remove('active');
    binaryToggle.classList.remove('active');
  }
});



const toggle = document.querySelector('.toggle-knob');
const settingsToggle = document.querySelector('.settings-toggle');

toggle?.addEventListener('click', () => {
  toggle.classList.toggle('active');
});

function updateCategory(index) {
  // logika zmiany kategorii
  if (settingsToggle) {
    settingsToggle.style.display = index === 0 ? 'flex' : 'none';
  }
}

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

function createPerfControl(dotId) {
  let level = 1;
  const dot = document.getElementById(dotId);
  const line = dot?.parentElement;
  let startX = 0;

  // Canvas do samplingu gradientu (czerwony 0%, złoty 50%, zielony 100%)
  const canvas = document.createElement('canvas');
  canvas.width = line.offsetWidth;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, '#ff3333');
  grad.addColorStop(0.5, '#ffd700');
  grad.addColorStop(1, '#2BE501');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, 1);

  function getColorAt(percent) {
    const x = Math.floor((percent / 100) * (canvas.width - 1));
    const [r, g, b] = ctx.getImageData(x, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  }

  function darkenColor(color, factor = 0.7) {
    const [_, r, g, b] = color.match(/rgb\((\d+), (\d+), (\d+)\)/);
    return `rgba(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)}, 0.8)`;
  }

  function startDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchmove", onDrag, { passive: false });
    document.addEventListener("touchend", stopDrag);
  }

    function onDrag(e) {
    if (e.touches) e.preventDefault();
    e.stopPropagation();
    const rect = line.getBoundingClientRect();
    const currentX = e.touches ? e.touches[0].clientX : e.clientX;
    let percent = ((currentX - rect.left) / rect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));

    dot.style.left = percent + "%";

    // Dynamiczny kolor dot i shadow
    const posColor = getColorAt(percent);
    dot.style.background = posColor; // Kolor dot = kolor linii
    const darkShadow = darkenColor(posColor);
    dot.style.boxShadow = `0 2px 30px ${darkShadow}, 0 0 15px rgba(0,170,255,0.5)`; // Ciemniejszy shadow + neon halo

    let newLevel = 1;
    if (percent > 66) newLevel = 3;
    else if (percent > 33) newLevel = 2;

    if (newLevel !== level) {
      level = newLevel;
      updateMode();
    }
  }

  function stopDrag() {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchmove", onDrag);
    document.removeEventListener("touchend", stopDrag);
  }

  function updateMode() {
    const colors = {
      1: "linear-gradient(90deg, #ff3333, #ff5555)",
      2: "linear-gradient(90deg, #ffd700, #ffdd33)",
      3: "linear-gradient(90deg, #33ff66, #66ffaa)"
    };
    line.style.background = colors[level];
  }

  dot?.addEventListener("mousedown", startDrag);
  dot?.addEventListener("touchstart", startDrag, { passive: false });

  return {
    getValue: () => level,
    setValue: (v) => { level = v; updateMode(); }
  };


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
})



function applyOptimizations(level) {
  const body = document.body;
  body.classList.remove('max-power', 'balanced', 'optimized'); // Czyszczenie klas

  if (level == 0) { // Low end: max moc, daje wszystko
    body.classList.add('max-power');
    // CSS dla .max-power: transform: scale(1); filter: none; /* Pełne animacje plus neon-metal gradient */
    // Plus kreatywny add-on: init webGL neon-metal background dla dostojnego efektu
    initWebGLNeonBackground();
    // Brak optymalizacji – pełna moc
    body.style.overflow = ''; // Reset rozciągnięcia
  } else if (level == 50) { // Half end: zrównoważona, średnia
    body.classList.add('balanced');
    // CSS dla .balanced: transform: scale(0.95); filter: grayscale(0.1); /* Lekka równowaga */
    body.style.overflow = ''; // Reset
  } else { // 100 full end: optymalizacja, oszczędności
    body.classList.add('optimized');
    body.style.animation = 'none'; // Bezpośrednia blokada animacji dla body
    // CSS dla .optimized: transform: scale(0.3); filter: grayscale(0.5) blur(1px); transition: none; /* Dodatkowa blokada, mocniejsze zmniejszenie pikseli */
    // Skracanie nie używanych skryptów: clear non-essential timeouts/intervals
    if (debounceTimer) clearTimeout(debounceTimer); // Przykładowo, skracanie debounce
    // Opcjonalnie: if (someAnimInterval) clearInterval(someAnimInterval); // Dodaj dla swoich loopów
    // Symulacja zmiany res: scale dla "mniej pikseli" (jak 980x520) + overflow hidden dla rozciągnięcia
    body.style.overflow = 'hidden';
  }
}

function initWebGLNeonBackground() {
  // Kreatywny add-on: webGL canvas z metaliczno-neonowym gradientem (srebrno-błękitny puls z ciemniejszym halo)
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '-1';
  canvas.style.pointerEvents = 'none'; // Nie blokuje interakcji
  document.body.appendChild(canvas);

  const gl = canvas.getContext('webgl');
  if (!gl) return; // Fallback if no webGL

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const vsSource = `
    attribute vec4 aPosition;
    void main() {
      gl_Position = aPosition;
    }
  `;
  const fsSource = `
    precision mediump float;
    uniform vec2 uResolution;
    uniform float uTime;
    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      vec3 color = mix(vec3(0.66,0.66,0.66), vec3(0.0,0.66,1.0), uv.x + sin(uTime * 0.5) * 0.1); // Srebrno-błękitny neon puls
      color *= 0.8 + 0.2 * sin(uv.y * 10.0 + uTime); // Dostojny metaliczny wzór
      vec3 darkHalo = color * 0.7; // Ciemniejszy dla głębi halo
      gl_FragColor = vec4(mix(color, darkHalo, 0.3), 1.0); // Mieszanka z ciemniejszym halo
    }
  `;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  gl.useProgram(shaderProgram);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(shaderProgram, 'aPosition');
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLocation);

  const resolutionLocation = gl.getUniformLocation(shaderProgram, 'uResolution');
  const timeLocation = gl.getUniformLocation(shaderProgram, 'uTime');

  function render() {
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, performance.now() / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }
  render();

  function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    return shaderProgram;
  }

  function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
}

const perfRange = document.getElementById('perfRange3');
const perfWrapper = document.querySelector('.performance-range-wrapper');

// Wrapper dla IndexedDB (z fallback na sessionStorage)
const DB_NAME = 'FoxCorpDB';
const DB_VERSION = 1;
const STORE_NAME = 'perfStore';
const KEY = 'perfValue';

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getValue() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(KEY);
      request.onsuccess = () => resolve(request.result || '0');
      request.onerror = () => resolve('0');
    });
  } catch {
    console.warn('Błąd IndexedDB, fallback na sessionStorage');
    return sessionStorage.getItem(KEY) || '0';
  }
}

async function setValue(value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(granted => {
            if (granted) console.log('Persistent storage granted');
          });
        }
      };
    });
  } catch (err) {
    console.warn('Nie udało się zapisać w IndexedDB:', err);
    sessionStorage.setItem(KEY, value); // Backup
  }
}

// Funkcja do obliczania procentowej pozycji dot'a (thumb) względem wrappera linii
function getDotPercent() {
  if (!perfRange || !perfWrapper) return 0;
  const rect = perfWrapper.getBoundingClientRect();
  const thumbRect = perfRange.getBoundingClientRect(); // Przybliżenie pozycji thumb'a
  const percent = ((thumbRect.left - rect.left + thumbRect.width / 2) / rect.width) * 100;
  return Math.max(0, Math.min(100, percent));
}

// Funkcja snapująca na podstawie pozycji (dla apply)
function snapValue(percent) {
  if (percent < 25) return 0;
  else if (percent <= 75) return 50;
  else return 100;
}

// Na load: Odczytaj, ustaw value na raw, apply na snapowanej pozycji
(async () => {
  let savedValue = await getValue();
  perfRange.value = savedValue; // Raw value dla pozycji
  const percent = getDotPercent(); // Oblicz aktualną pozycję
  applyOptimizations(snapValue(percent));
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(granted => {
      if (granted) console.log('Persistent storage granted');
    });
  }
})();

// Na input: Zapis raw value, ale apply na bieżącej pozycji dot'a
perfRange?.addEventListener('input', async (e) => {
  await setValue(e.target.value); // Zapisz raw
  const percent = getDotPercent(); // Mierz pozycję dot'a
  applyOptimizations(snapValue(percent)); // Apply tryb
});

// Na change: To samo, finalny zapis i apply
perfRange?.addEventListener('change', async (e) => {
  await setValue(e.target.value);
  const percent = getDotPercent();
  applyOptimizations(snapValue(percent));

  // Update gradient na podstawie snap
  const snapped = snapValue(percent);
  const colors = {
    0: "linear-gradient(90deg, #ff3333, #ff5555)",
    50: "linear-gradient(90deg, #ffaa33, #ffdd33)",
    100: "linear-gradient(90deg, #33ff66, #66ffaa)"
  };
  e.target.style.background = colors[snapped] || colors[0];
});

// Automatyczny zapis raw na wyjście
window.addEventListener('beforeunload', async () => {
  await setValue(perfRange.value);
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    await setValue(perfRange.value);
  }
});


// --- Tworzenie trzech kontrolerów ---
const wydajność3 = createPerfControl("perfDot3");

// --- Pokazywanie odpowiedniego layera przy zmianie kategorii ---
function updateCategory(index) {
  document.querySelectorAll(".performance-control").forEach(el => el.style.display = "none");
  const layer = document.getElementById(`variation_layer${index + 1}`);
  if (layer) layer.style.display = "flex";
}



// ================================================================
// FOXCORP – NAKŁADKA IFRAME – DZIAŁA 100% BEZ ŻADNYCH <a>
// ================================================================

const firefoxOverlay = document.createElement('div');
firefoxOverlay.className = 'firefox-overlay';
firefoxOverlay.innerHTML = `
  <div class="firefox-header">
    <button id="closeFirefoxOverlay">✕</button>
    <div id="firefoxCurrentUrl">FoxCorp • Przeglądanie</div>
  </div>
  <iframe id="firefoxIframe" src="about:blank" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"></iframe>
`;
document.body.appendChild(firefoxOverlay);

const overlayCSS = document.createElement('style');
overlayCSS.textContent = `
  .firefox-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #000; z-index: 99999; display: none; flex-direction: column; }
  .firefox-overlay.active { display: flex; }
  .firefox-header { height: 56px; background: linear-gradient(145deg, #1a1a1a, #0c0c1f); border-bottom: 3px solid #00aaff; display: flex; align-items: center; padding: 0 15px; gap: 15px; box-shadow: 0 6px 30px rgba(0,170,255,0.5); }
  #closeFirefoxOverlay { width: 46px; height: 46px; background: linear-gradient(45deg, #ff3366, #ff5577); border: none; border-radius: 50%; color: white; font-size: 22px; box-shadow: 0 0 25px rgba(255,50,100,0.8); cursor: pointer; }
  #firefoxCurrentUrl { color: #00eeff; font-size: 15px; font-weight: bold; text-shadow: 0 0 10px #00eeff; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  #firefoxIframe { flex: 1; border: none; background: white; }
`;
document.head.appendChild(overlayCSS);

const iframe = document.getElementById('firefoxIframe');
const urlDisplay = document.getElementById('firefoxCurrentUrl');

// KLIKNIĘCIE W CAŁY WYNIK – DZIAŁA ZAWSZE
document.addEventListener('click', e => {
  const card = e.target.closest('.results-res-card');
  if (!card) return;

  // Bierzemy URL z data-url w span.fake-link
  const fakeLink = card.querySelector('.fake-link');
  if (!fakeLink || !fakeLink.dataset.url) return;

  let url = fakeLink.dataset.url.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  iframe.src = url;
  urlDisplay.textContent = url;
  firefoxOverlay.classList.add('active');
});

// Zamknij
document.getElementById('closeFirefoxOverlay')?.addEventListener('click', () => {
  firefoxOverlay.classList.remove('active');
  setTimeout(() => iframe.src = 'about:blank', 300);
});