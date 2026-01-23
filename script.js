// ==================================//
// 1. KONFIGURACJA I NARZĘDZIA
// ==================================//
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
}

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

// Bezpieczeństwo typów
if (window.trustedTypes) {
    try {
        window.trustedTypes.createPolicy('myPolicy', {
            createHTML: (input) => {
                if (/script|iframe|object|embed/i.test(input)) return '';
                return input;
            },
            createScript: (input) => null
        });
    } catch(e) { /* Policy already exists */ }
}

// ==================================//
// 2. WYSZUKIWARKA I INTERFEJS
// ==================================//
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

const proxies = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
  "https://thingproxy.freeboard.io/fetch/",
];


function detectLang() {
  const sysLang = navigator.languages?.[0] || navigator.language || "pl";
  const code = sysLang.split("-")[0].toLowerCase();
  const supported = ["pl","en","de","fr","es","it","pt","nl","sv","ja","zh"];
  return supported.includes(code) ? code : "pl";
}
const lang = detectLang();



function escapeHtml(str = "") {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

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
      </div>`;
    document.body.appendChild(root);
  }
  return root;
}

// Pobieranie danych tekstowych przez Proxy
async function fetchWithProxyText(url) {
  for (const p of proxies) {
    try {
      const res = await fetch(p + encodeURIComponent(url), { cache: "no-store" });
      if (res?.ok) return await res.text();
    } catch {}
  }
  return null;
}

// Pobieranie wyników DuckDuckGo
async function fetchResultsDDG(query, page = 0, perPage = 8) {
  const start = page * perPage;
  const text = await fetchWithProxyText(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${start}`);
  if (!text) return [];
  const doc = new DOMParser().parseFromString(text, "text/html");
  return Array.from(doc.querySelectorAll(".result")).map(r => {
    const a = r.querySelector("a.result__a");
    const url = a?.href || "";
    const display = url.split('/')[2] || url;
    return {
      title: a?.textContent?.trim() || "",
      snippet: r.querySelector(".result__snippet")?.textContent?.trim() || "",
      link: url,
      image: `https://icons.duckduckgo.com/ip3/${display}.ico`
    };
  }).slice(0, perPage);
}


function buildCardHTML(r) {
  return `
    <img src="${escapeHtml(r.image)}" class="results-res-thumb" loading="lazy"/>
    <div class="results-res-info">
      <h3>${escapeHtml(r.title)}</h3>
      <div class="results-res-desc">
        <p class="results-res-text">${escapeHtml(r.snippet)}</p>
      </div>
      <button onclick="showiframe(event)" class="fox-open-btn" data-url="${escapeHtml(r.link)}"></button>
    </div>`;
}

async function showSearchResults(query, reset=false) {
  if (!query || loading) return;
  currentQuery = query;
  const root = ensureResultsRoot();
  const grid = root.querySelector(".results-grid");
  
  if (reset) { 
      nextPage = 0; 
      shownLinks.clear(); 
      grid.innerHTML = ""; 
  }
  
  loading = true;
  const results = await fetchResultsDDG(query, nextPage, 8);
  
  results.filter(r => !shownLinks.has(r.link)).forEach((r, index) => {
    shownLinks.add(r.link);
    const card = document.createElement("div");
    card.className="results-res-card hyper-animate"; // Animacja wejścia
    card.style.animationDelay = `${index * 0.05}s`;
    card.innerHTML = buildCardHTML(r);
    grid.appendChild(card);
  });
  
  root.style.display = "block";
  nextPage++;
  loading = false;
}



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

    // Wewnątrz showNextResults zastąp pętlę forEach:
uniqueResults.forEach((r, index) => {
  const card = document.createElement("div");
  card.className = "results-res-card hyper-animate"; // Dodaj klasę
  card.style.animationDelay = `${index * 0.05}s`;   // Dodaj delay
  card.innerHTML = buildCardHTML(r);
  grid.appendChild(card);
});


    loading = false;
  }


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


function setupTrigger() {
  const trigger = document.querySelector(".scroll-trigger");
  if (!trigger) return;

  let holdTimer = null;
  const HOLD_TIME = 1000;



function startHold() {
  trigger.classList.add("active");
  // Efekt "puchnięcia" przycisku podczas trzymania
  trigger.style.transform = "scale(1.1)";
  holdTimer = setTimeout(showNextResults, HOLD_TIME);
}

function cancelHold() {
  clearTimeout(holdTimer);
  trigger.classList.remove("active");
  trigger.style.transform = "scale(1)"; // Powrót do normy
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




input.addEventListener("input",()=>{
  const q=input.value.trim(); selectedIndex=-1; if(!q) return clearSlots();
  if(debounceTimer) clearTimeout(debounceTimer);
// Znajdź miejsce, gdzie wypełniasz sloty sugestiami i zamień na to:
debounceTimer = setTimeout(async () => {
  const suggestions = await fetchSuggestions(q);
  resultsSlots.forEach((slot, i) => {
    if (suggestions[i]) {
      slot.textContent = suggestions[i];
      slot.classList.add("filled");
      
      // Reset animacji, aby przy każdym nowym znaku pola "drgały"
      slot.style.animation = 'none';
      slot.offsetHeight; // Trigger reflow
      slot.style.animation = `hyperPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.04}s forwards`;
    } else {
      slot.textContent = "";
      slot.classList.remove("filled", "active");
      slot.style.animation = 'none';
    }
  });
}, 200);
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

// Obsługa przycisków interfejsu
btn?.addEventListener("click", () => {
  overlay.style.display = overlay.style.display === "flex" ? "none" : "flex";
  if (overlay.style.display === "flex") { overlay.classList.add("show"); input.focus(); }
});

dockBtn?.addEventListener("click", () => {
  document.getElementById("dockMenu")?.classList.toggle("show");
});

homeBtn?.addEventListener("click", () => {
  document.querySelector(".results-root").style.display = "none";
  window.scrollTo({top: 0, behavior: "smooth"});
});

// Zamykanie overlay po kliknięciu poza
document.addEventListener("click", (e) => {
  const searchMenu = document.querySelector(".search-menu");
  const dockMenu = document.getElementById("dockMenu");
  const searchBtnTarget = e.target.closest("#searchBtn");
  const dockBtnTarget = e.target.closest("#dockBtn");

  if (overlay && overlay.style.display === "flex") {
    if (searchMenu && !searchMenu.contains(e.target) && !searchBtnTarget) {
      overlay.classList.remove("show");
      setTimeout(() => (overlay.style.display = "none"), 300);
    }
  }

  if (dockMenu && dockMenu.classList.contains("show")) {
    if (!dockMenu.contains(e.target) && !dockBtnTarget) {
      dockMenu.classList.remove("show");
    }
  }
});

// ==================================//
// 3. USTAWIENIA I WYDAJNOŚĆ
// ==================================//
const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settingsOverlay");

settingsBtn?.addEventListener("click", () => settingsOverlay?.classList.add("show"));
settingsOverlay?.addEventListener("click", (e) => { if(e.target === settingsOverlay) settingsOverlay.classList.remove("show"); });

// Przełączanie zakładek w ustawieniach
const dots = document.querySelectorAll('.dot');
dots.forEach((dot) => {
  dot.addEventListener('click', () => {
    dots.forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    
    // Ukrywamy wszystkie warstwy
    document.querySelectorAll(".performance-control").forEach(el => el.style.display = "none");
    
    // Pokazujemy odpowiednią
    const targetId = `variation_${dot.dataset.layer}`; // np. variation_layer3
    const targetLayer = document.getElementById(targetId);
    if(targetLayer) targetLayer.style.display = "flex";
  });
});

const toggle = document.querySelector('.toggle-knob');
toggle?.addEventListener('click', () => toggle.classList.toggle('active'));

// Główna funkcja optymalizacji (Clean Version)
function applyOptimizations(level) {
  const body = document.body;
  
  // 1. Reset
  body.classList.remove('max-power', 'balanced', 'optimized');

  // 2. CZYŚCIMY BŁĘKITNE TŁO (Kluczowy krok)
  const activeCanvas = document.querySelector('canvas');
  if (activeCanvas) {
    activeCanvas.remove();
    console.log("FoxEngine: WebGL Background Cleaned");
  }

  // 3. Aplikujemy tryb
  if (level == 100) { 
    body.classList.add('max-power');
    // initWebGLNeonBackground(); // WYŁĄCZONE
    console.log("Tryb: Pełna Wydajność");
  } else if (level == 50) { 
    body.classList.add('balanced');
    console.log("Tryb: Zrównoważony");
  } else { 
    body.classList.add('optimized');
    console.log("Tryb: Oszczędny");
  }
}

// Obsługa suwaka wydajności
const perfRange = document.getElementById('perfRange3');
const perfWrapper = document.querySelector('.performance-range-wrapper');

// IndexedDB Logic
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
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
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
  } catch { return sessionStorage.getItem(KEY) || '0'; }
}

async function setValue(value) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value, KEY);
  } catch { sessionStorage.setItem(KEY, value); }
}

// Inicjalizacja suwaka
(async () => {
  if (perfRange) {
      let savedValue = await getValue();
      perfRange.value = savedValue; 
      applyOptimizations(parseInt(savedValue));
      updateSliderVisuals(parseInt(savedValue));
  }
})();

function updateSliderVisuals(val) {
    if (!perfRange) return;
    const colors = {
        0: "linear-gradient(90deg, #ff3333, #ff5555)",
        50: "linear-gradient(90deg, #ffaa33, #ffdd33)",
        100: "linear-gradient(90deg, #33ff66, #66ffaa)"
    };
    perfRange.style.background = colors[val] || colors[0];
}

perfRange?.addEventListener('change', async (e) => {
  const val = parseInt(e.target.value);
  await setValue(val.toString());
  applyOptimizations(val); 
  updateSliderVisuals(val);
});

// ==================================//
// 4. FOXFRAME (IFRAME MANAGER)
// ==================================//
function showiframe(event) {
    const container = document.getElementById("iframed");
    const iframe = container.querySelector("iframe");

    let target = event.currentTarget || event.target;
    if (!target.getAttribute("data-url")) {
        target = target.closest('[data-url]');
    }

    let rawUrl = target.getAttribute("data-url");

    if (rawUrl) {
        let cleanUrl = rawUrl;
        if (rawUrl.includes("uddg=")) {
            const parts = rawUrl.split("uddg=");
            if (parts.length > 1) {
                cleanUrl = decodeURIComponent(parts[1].split("&")[0]);
            }
        }
        if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl;

        document.body.style.overflow = "hidden"; 
        container.classList.remove("hidden", "minimized", "compact");
        container.style.display = "flex";
        
        const enginePrefix = "https://foxcorp-engine.foxlang-team.workers.dev/?url=";
        iframe.src = enginePrefix + cleanUrl;
    }
}
window.showiframe = showiframe;

function hideIframe() {
    const container = document.getElementById("iframed");
    if (container) {
        document.body.style.overflow = ""; 
        container.classList.add("hidden"); 
        setTimeout(() => {
            if (container.classList.contains("hidden")) {
                container.style.display = "none";
                const iframe = container.querySelector("iframe");
                if (iframe) iframe.src = "";
            }
        }, 500); 
    }
}
window.hideIframe = hideIframe;

function toggleMinimize() {
    const container = document.getElementById("iframed");
    if (container) {
        container.classList.toggle("minimized");
        container.classList.remove("compact");
    }
}

function toggleResize() {
    const container = document.getElementById("iframed");
    if (container) {
        container.classList.toggle("compact");
        container.classList.remove("minimized");
    }
}

function toggleFullScreen() {
    const container = document.getElementById("iframed");
    if (!document.fullscreenElement) {
        if (container.requestFullscreen) container.requestFullscreen();
        else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}
window.toggleFullScreen = toggleFullScreen;

// ==================================//
// 5. CARDS & TABS
// ==================================//
if (typeof foxTabs === 'undefined') var foxTabs = []; 

function showTabsManager() {
    const cOverlay = document.getElementById("cardsOverlay");
    const cGrid = document.getElementById("cardsGridContainer");
    let gridHTML = `<div class="google-style-grid">`;

    if (foxTabs.length > 0) {
        foxTabs.forEach((tab, i) => {
            gridHTML += `
                <div class="tab-rect" onclick="restoreTab('${tab.url}')">
                    <span class="tab-label">CARD ${i + 1}</span>
                    <div class="tab-info">${tab.title}</div>
                </div>`;
        });
    } else {
        gridHTML += `
            <div style="grid-column:1/-1; opacity:0.5; text-align:center; padding:40px; font-family:'Share Tech'; color:#fff; font-size:11px;">
                None cards here.... Pin card by button ❖ in window.
            </div>`;
    }
    gridHTML += `</div>`;
    cGrid.innerHTML = gridHTML;
    cOverlay.classList.add("show");
}

function closeCardsManager() {
    document.getElementById("cardsOverlay").classList.remove("show");
}

function restoreTab(url) {
    const container = document.getElementById("iframed");
    container.querySelector("iframe").src = url;
    closeCardsManager();
    container.style.display = "flex";
    container.classList.remove("hidden");
}

function pinCurrentProcess() {
    const iframe = document.querySelector("#iframed iframe");
    const currentUrl = iframe.src;
    if (currentUrl && currentUrl !== "about:blank" && currentUrl !== "") {
        const exists = foxTabs.some(t => t.url === currentUrl);
        if (!exists) {
            foxTabs.push({ 
                url: currentUrl, 
                title: currentUrl.split('/')[2] || "Process"
            });
            console.log("Card Added");
        }
    }
}

function newCardMannager() {
    pinCurrentProcess();
    const container = document.getElementById("iframed");
    const iframe = container.querySelector("iframe");
    if (container) {
        container.classList.add("hidden");
        document.body.style.overflow = ""; 
        setTimeout(() => {
            container.style.display = "none";
            if (iframe) iframe.src = "";
        }, 500); 
    }
}
window.newCardMannager = newCardMannager;

// Init DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  ensureResultsRoot();
  setupTrigger();
  
  // URL Action Handler
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  if (action === 'search') setTimeout(() => document.getElementById('searchBtn')?.click(), 300);
  else if (action === 'settings') setTimeout(() => document.getElementById('settings-btn')?.click(), 300);
});
