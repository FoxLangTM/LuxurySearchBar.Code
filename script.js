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

const throttle = (func, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// ==================================//
// BEZPIECZEŃSTWO
// ==================================//
if (window.trustedTypes) {
    window.trustedTypes.createPolicy('myPolicy', {
        createHTML: (input) => {
            if (/script|iframe|object|embed/i.test(input)) return '';
            return input;
        },
        createScript: (input) => null
    });
}

// ======= Elementy Interfejsu =======
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
let shownLinks = new Set();

function detectLang() {
  const sysLang = navigator.languages?.[0] || navigator.language || "pl";
  const code = sysLang.split("-")[0].toLowerCase();
  const supported = ["pl","en","de","fr","es","it","pt","nl","sv","ja","zh"];
  return supported.includes(code) ? code : "pl";
}
const lang = detectLang();

const proxies = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
  "https://thingproxy.freeboard.io/fetch/",
];

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
        <div class="trigger-line"></div>
      </div>`;
    document.body.appendChild(root);
  }
  return root;
}

async function fetchWithProxyText(url) {
  for (const p of proxies) {
    try {
      const res = await fetch(p + encodeURIComponent(url), { cache: "no-store" });
      if (res?.ok) return await res.text();
    } catch {}
  }
  return null;
}

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
  if (reset) { nextPage = 0; shownLinks.clear(); grid.innerHTML = ""; }
  loading = true;
  const results = await fetchResultsDDG(query, nextPage, 8);
  results.filter(r => !shownLinks.has(r.link)).forEach(r => {
    shownLinks.add(r.link);
    const card = document.createElement("div");
    card.className="results-res-card";
    card.innerHTML = buildCardHTML(r);
    grid.appendChild(card);
  });
  root.style.display = "block";
  nextPage++;
  loading = false;
}

// ======= Obsługa Scroll Trigger =======
function setupTrigger() {
  const trigger = document.querySelector(".scroll-trigger");
  if (!trigger) return;
  let holdTimer;
  const startHold = () => { trigger.classList.add("active"); holdTimer = setTimeout(() => showSearchResults(currentQuery), 1000); };
  const cancelHold = () => { clearTimeout(holdTimer); trigger.classList.remove("active"); };
  trigger.addEventListener("mousedown", startHold);
  trigger.addEventListener("touchstart", startHold, { passive: true });
  window.addEventListener("mouseup", cancelHold);
  window.addEventListener("touchend", cancelHold);
}
document.addEventListener("DOMContentLoaded", setupTrigger);

// ======= Sugestie i Input =======
input?.addEventListener("input", debounce(async () => {
  const q = input.value.trim();
  if (!q) return resultsSlots.forEach(s => s.classList.remove("filled"));
  const target = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
  const res = await fetchWithProxyText(target);
  const suggestions = JSON.parse(res)?.[1] || [];
  resultsSlots.forEach((slot, i) => {
    if (suggestions[i]) {
      slot.textContent = suggestions[i];
      slot.classList.add("filled");
    } else {
      slot.classList.remove("filled");
    }
  });
}, 200));

// ======= Nawigacja i Menu =======
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

// ======= Ustawienia (Bezpieczne) =======
const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settingsOverlay");

settingsBtn?.addEventListener("click", () => settingsOverlay?.classList.add("show"));
settingsOverlay?.addEventListener("click", (e) => { if(e.target === settingsOverlay) settingsOverlay.classList.remove("show"); });

const dots = document.querySelectorAll('.dot');
dots.forEach((dot, i) => {
  dot.addEventListener('click', () => {
    dots.forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    const layers = document.querySelectorAll('.layer');
    layers.forEach(l => l.classList.remove('active'));
    document.querySelector(`.${dot.dataset.layer}`)?.classList.add('active');
  });
});

const toggle = document.querySelector('.toggle-knob');
toggle?.addEventListener('click', () => toggle.classList.toggle('active'));


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
  if (!dot) return null; // Bezpiecznik: jeśli nie ma kropki, nie rób nic

  const line = dot.parentElement;
  if (!line) return null; // Bezpiecznik: jeśli nie ma linii, nie rób nic
  
  let startX = 0;

  // Canvas do samplingu gradientu
  const canvas = document.createElement('canvas');
  // Używamy szerokości linii lub domyślnie 200px jeśli offsetWidth jest zerem
  canvas.width = line.offsetWidth > 0 ? line.offsetWidth : 200;
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

  // Dynamiczny kolor i shadow kropki (zostawiamy Twój fajny efekt)
  const posColor = getColorAt(percent);
  dot.style.background = posColor;
  const darkShadow = darkenColor(posColor);
  dot.style.boxShadow = `0 2px 30px ${darkShadow}, 0 0 15px rgba(0,170,255,0.5)`;

  // --- NOWA LOGIKA ZAKRESÓW ---
  let newLevel;
  if (percent > 65) {
    newLevel = 100; // Mapujemy na Optimized (oszczędność)
  } else if (percent >= 35 && percent <= 65) {
    newLevel = 50;  // Mapujemy na Balanced
  } else {
    newLevel = 0;   // Mapujemy na Max Power
  }

  // Aktywujemy zmianę tylko, gdy faktycznie przeskoczymy do innego progu
  if (newLevel !== level) {
    level = newLevel;
    applyOptimizations(level); // Wywołujemy główną funkcję optymalizacji
    updateModeVisuals(level);  // Zmieniamy wygląd paska
  }
}


function updateModeVisuals(lvl) {
  const colors = {
    0: "linear-gradient(90deg, #ff3333, #ff5555)",
    50: "linear-gradient(90deg, #ffd700, #ffdd33)",
    100: "linear-gradient(90deg, #33ff66, #66ffaa)"
  };
  line.style.background = colors[lvl];
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

// Podmień fragment w swoim skrypcie:
perfRange?.addEventListener('change', async (e) => {
  const val = parseInt(e.target.value); // Pobiera 0, 50 lub 100
  await setValue(val.toString());
  
  // Teraz aktywujemy tryb na podstawie konkretnej wartości
  applyOptimizations(val); 

  // Dynamiczna zmiana kolorów paska na podstawie progu
  const colors = {
    0: "linear-gradient(90deg, #ff3333, #ff5555)", // Low
    50: "linear-gradient(90deg, #ffaa33, #ffdd33)", // Balanced
    100: "linear-gradient(90deg, #33ff66, #66ffaa)" // Max Power
  };
  e.target.style.background = colors[val] || colors[0];
});

// Upewnij się, że applyOptimizations czyta te wartości:
function applyOptimizations(level) {
  const body = document.body;
  body.classList.remove('max-power', 'balanced', 'optimized');

  // CZYSZCZENIE TŁA: Jeśli istnieje stare tło WebGL, usuwamy je
  const oldCanvas = document.querySelector('canvas');
  if (oldCanvas && level < 100) {
    oldCanvas.remove();
  }

  if (level == 100) { // Max Power
    body.classList.add('max-power');
    // Jeśli chcesz zupełnie usunąć błękitny gradient, 
    // zakomentuj poniższą linię:
    // initWebGLNeonBackground(); 
    console.log("Tryb: Pełna Wydajność");
  } else if (level == 50) { // Balanced
    body.classList.add('balanced');
    console.log("Tryb: Zrównoważony");
  } else { // 0 - Low End
    body.classList.add('optimized');
    console.log("Tryb: Oszczędny");
  }
}



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




// Używamy nazwy bez window na początku, tak jak miałeś wcześniej, 
// ale przypiszemy ją do window wewnątrz, żeby była pancerna.
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

        // --- LOGIKA CZYSZCZENIA DUCKDUCKGO ---
        // Jeśli link zawiera "uddg=", wyciągamy to, co jest po nim
        if (rawUrl.includes("uddg=")) {
            const parts = rawUrl.split("uddg=");
            if (parts.length > 1) {
                // Wyciągamy URL i dekodujemy znaki specjalne (np. %2F na /)
                cleanUrl = decodeURIComponent(parts[1].split("&")[0]);
            }
        }
        // Jeśli link zaczyna się od //, dodajemy https:
        if (cleanUrl.startsWith("//")) {
            cleanUrl = "https:" + cleanUrl;
        }
        // -------------------------------------

        document.body.style.overflow = "hidden"; 
        container.classList.remove("hidden", "minimized", "compact");
        
        // TWOJA KONFIGURACJA SILNIKA
        const enginePrefix = "https://foxcorp-engine.foxlang-team.workers.dev/?url=";
        iframe.src = enginePrefix + cleanUrl;

        container.style.display = "flex";
        console.log("FoxEngine Cleaned URL: " + cleanUrl);
    }
}
window.showiframe = showiframe;



function hideIframe() {
    const container = document.getElementById("iframed");
    if (container) {
        document.body.style.overflow = ""; 
        container.classList.add("hidden"); // Uruchamia animację opacity/scale z CSS
        
        // Czekamy na koniec animacji (np. 500ms) zanim faktycznie usuniemy element z widoku
        setTimeout(() => {
            if (container.classList.contains("hidden")) {
                container.style.display = "none";
                const iframe = container.querySelector("iframe");
                if (iframe) iframe.src = "";
            }
        }, 500); 
        
        console.log("FoxFrame: Clean Exit");
    }
}
window.hideIframe = hideIframe;

function toggleMinimize() {
    const container = document.getElementById("iframed");
    if (container) {
        // Przełączamy klasę minimalizacji
        container.classList.toggle("minimized");
        // Usuwamy kompaktowy rozmiar, by uniknąć błędów wizualnych
        container.classList.remove("compact");
        console.log("Minimalizacja przełączona");
    }
}

function toggleResize() {
    const container = document.getElementById("iframed");
    if (container) {
        // Przełączamy klasę kompaktową
        container.classList.toggle("compact");
        // Jeśli powiększamy/zmieniamy rozmiar, wyłączamy minimalizację
        container.classList.remove("minimized");
        console.log("Rozmiar przełączony");
    }
}

function toggleFullScreen() {
    const container = document.getElementById("iframed");
    
    if (!document.fullscreenElement) {
        // Wejdź w pełny ekran dla całego kontenera FoxFrame
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) { /* Safari/iOS */
            container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) { /* IE11 */
            container.msRequestFullscreen();
        }
    } else {
        // Wyjdź z pełnego ekranu
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}
window.toggleFullScreen = toggleFullScreen;


// Tablica na procesy - musi być na górze lub poza funkcjami
if (typeof foxTabs === 'undefined') {
    var foxTabs = []; 
}

function showTabsManager() {
    const cOverlay = document.getElementById("cardsOverlay");
    const cGrid = document.getElementById("cardsGridContainer");

    // Budujemy siatkę prostokątów
    let gridHTML = `<div class="google-style-grid">`;
    
    if (typeof foxTabs !== 'undefined' && foxTabs.length > 0) {
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

// Funkcja przywracania karty (zamyka panel kart)
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

    // Sprawdzamy, czy w iframe w ogóle coś jest załadowane
    if (currentUrl && currentUrl !== "about:blank" && currentUrl !== "") {
        if (typeof foxTabs === 'undefined') window.foxTabs = [];

        // Sprawdzamy, czy ten URL już istnieje na liście, żeby nie robić śmietnika
        const exists = foxTabs.some(t => t.url === currentUrl);
        
        if (!exists) {
            foxTabs.push({ 
                url: currentUrl, 
                title: currentUrl.split('/')[2] // Wycinamy domenę jako tytuł
            });
            console.log("Added to cards: " + currentUrl);
        }
    }
}



function newCardMannager() {
    // 1. Najpierw wywołujemy Twoją funkcję przypinania (pin)
    // Używamy Twojej logiki pinCurrentProcess, aby zapisać URL
    if (typeof pinCurrentProcess === 'function') {
        pinCurrentProcess();
    }

    // 2. Resetujemy ekran i wracamy do strony głównej
    const container = document.getElementById("iframed");
    const iframe = container.querySelector("iframe");

    if (container) {
        // Dodajemy klasę ukrywającą (dla animacji)
        container.classList.add("hidden");
        document.body.style.overflow = ""; 

        // Natychmiastowe czyszczenie i powrót
        setTimeout(() => {
            container.style.display = "none";
            if (iframe) {
                iframe.src = ""; // Czyścimy src, żeby strona nie działała w tle
            }
            console.log("System: Card pinned and returned to Home");
        }, 500); // czas dopasowany do Twojej animacji hideIframe
    }
}

// Upewniamy się, że funkcja jest dostępna globalnie dla przycisku
window.newCardMannager = newCardMannager;




// FoxCorp Shortcut & Action Handler
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    // Make sure your function names match (e.g., showSearch or openSettings)
    if (action === 'search') {
        setTimeout(() => {
            const searchBtn = document.getElementById('searchBtn');
            if (searchBtn) searchBtn.click();
        }, 300); // Small delay to ensure animations load
    } 
    else if (action === 'settings') {
        setTimeout(() => {
            const settingsBtn = document.getElementById('settings-btn');
            if (settingsBtn) settingsBtn.click();
        }, 300);
    }
});




function applyOptimizations(level) {
  const body = document.body;
  
  // 1. Resetujemy klasy
  body.classList.remove('max-power', 'balanced', 'optimized');

  // 2. CZYŚCIMY TŁO (Kluczowy krok)
  // Szukamy elementu canvas, który tworzy błękitny gradient
  const activeCanvas = document.querySelector('canvas');
  if (activeCanvas) {
    activeCanvas.remove();
    console.log("FoxEngine: WebGL Background Cleaned");
  }

  // 3. Ustawiamy nowy tryb
  if (level == 100) { 
    body.classList.add('max-power');
    // initWebGLNeonBackground(); // Linia zostaje zakomentowana = brak błękitu
    console.log("Tryb: Pełna Wydajność");
  } else if (level == 50) { 
    body.classList.add('balanced');
    console.log("Tryb: Zrównoważony");
  } else { 
    body.classList.add('optimized');
    console.log("Tryb: Oszczędny");
  }
}


