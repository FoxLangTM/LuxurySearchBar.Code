// ======= Global setup =======
const btn = document.getElementById("searchBtn");
const overlay = document.getElementById("overlay");
const input = document.getElementById("searchInput");
const results = Array.from(document.querySelectorAll(".result"));
const dockBtn = document.getElementById("dockBtn");

let selectedIndex = -1;
let debounceTimer = null;
let nextPage = 0;
let currentQuery = "";
let loading = false;

// ======= Language detection =======
function detectLang() {
  const sysLang = navigator.languages?.[0] || navigator.language || "pl";
  const code = sysLang.split("-")[0].toLowerCase();
  const supported = ["pl", "en", "de", "fr", "es", "it", "pt", "nl", "sv", "ja", "zh"];
  return supported.includes(code) ? code : "pl";
}
const lang = detectLang();

// ======= Proxy list =======
const proxies = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
  "https://thingproxy.freeboard.io/fetch/",
];

// ======= Safe HTML escaping =======
function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ======= Utility to get root for results =======
function ensureResultsRoot() {
  let root = document.querySelector(".results-root");
  if (!root) {
    root = document.createElement("div");
    root.className = "results-root";
    root.innerHTML = `
      <div class="results-header">
        <h2 id="queryTitle"></h2>
      </div>
      <div class="results-container">
        <div class="results-grid"></div>
        <div class="loading-indicator">Ładowanie...</div>
      </div>
    `;
    document.body.appendChild(root);
  }
  return root;
}

// ======= Fetch DuckDuckGo HTML results =======
async function fetchWithProxyText(url) {
  for (const p of proxies) {
    try {
      const full = p + encodeURIComponent(url);
      const res = await fetch(full, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      return await res.text();
    } catch (e) {
      console.warn("Proxy failed:", p);
    }
  }
  throw new Error("Brak dostępnego proxy.");
}

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

async function fetchResultsDDG(query, page = 0, perPage = 12) {
  const start = page * perPage;
  const target = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${start}`;
  try {
    const html = await fetchWithProxyText(target);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const results = [];

    doc.querySelectorAll(".result, .web-result").forEach((r) => {
      const a = r.querySelector("a.result__a");
      if (!a) return;
      const href = a.href;
      const title = a.textContent.trim().slice(0, 20);
      const snippet = r.querySelector(".result__snippet")?.textContent?.trim().slice(0, 70) || "";
      const url = resolveDuckHref(href);
      let display = "";
      try { display = new URL(url).hostname.slice(0,25); } catch { display = url.slice(0,25); }
      const img = `https://icons.duckduckgo.com/ip3/${display}.ico`;
      results.push({ title, snippet, link: url, displayLink: display, image: img });
    });

    return results.slice(0, perPage);
  } catch (e) {
    console.error("fetchResultsDDG error:", e);
    return [];
  }
}

// ======= Show search results =======
async function showSearchResults(query, reset = false) {
  if (!query) return;
  currentQuery = query;
  if (reset) nextPage = 0;

  const root = ensureResultsRoot();
  const titleEl = root.querySelector("#queryTitle");
  const container = root.querySelector(".results-container");
  const grid = root.querySelector(".results-grid");
  const loadingIndicator = root.querySelector(".loading-indicator");

  titleEl.textContent = query;
  root.style.display = "flex";
  overlay.classList.remove("show");
  overlay.style.display = "none";
  

  if (reset) {
    grid.innerHTML = "";
    container.scrollTop = 0;
  }

  if (loading) return;
  loading = true;
  loadingIndicator.style.display = "block";

  try {
    const results = await fetchResultsDDG(query, nextPage, 12);
    if (!results.length && reset) {
      const msg = document.createElement("div");
      msg.textContent = "Brak wyników do wyświetlenia.";
      msg.style.color = "#999";
      msg.style.textAlign = "center";
      msg.style.padding = "16px";
      grid.appendChild(msg);
    }

    results.forEach((r) => {
      const card = document.createElement("div");
      card.className = "results-res-card";
      card.innerHTML = `
        <img src="${r.image}" class="results-res-thumb"/>
        <div class="results-res-info">
          <h3>${r.title}</h3>
          <div class="results-res-desc">
            <p class="results-res-text">${r.snippet}</p>
            <img src="${r.image}" class="results-res-mini"/>
          </div>
          <a href="${r.link}" target="_blank">${r.displayLink}</a>
        </div>
      `;
      grid.appendChild(card);
    });

    nextPage++;
  } catch (err) {
    console.error(err);
  } finally {
    loading = false;
    loadingIndicator.style.display = "none";
  }
}

// ======= Infinite scroll =======
window.addEventListener("scroll", () => {
  const root = document.querySelector(".results-root");
  if (!root || loading) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) {
    showSearchResults(currentQuery, false);
  }
});

// ======= Overlay logic =======
btn.addEventListener("click", () => {
  if (overlay.style.display === "flex") {
    overlay.classList.remove("show");
    setTimeout(() => overlay.style.display = "none", 300);
  } else {
    overlay.style.display = "flex";
    setTimeout(() => overlay.classList.add("show"), 10);
    input.focus();
    input.select();
  }
});

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) {
    overlay.classList.remove("show");
    setTimeout(() => (overlay.style.display = "none"), 300);
  }
});

// ======= Suggestions =======
function clearSlots() {
  selectedIndex = -1;
  results.forEach((r) => {
    r.textContent = "";
    r.classList.remove("filled", "active");
  });
}
async function fetchSuggestions(q) {
  const target = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&q=${encodeURIComponent(q)}`;
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy + encodeURIComponent(target), { cache: "no-store" });
      const text = await res.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed[1])) return parsed[1];
    } catch {}
  }
  return [];
}
input.addEventListener("input", () => {
  const q = input.value.trim();
  selectedIndex = -1;
  if (!q) return clearSlots();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const suggestions = await fetchSuggestions(q);
    results.forEach((slot, i) => {
      if (suggestions[i]) {
        slot.textContent = suggestions[i];
        slot.classList.add("filled");
      } else {
        slot.textContent = "";
        slot.classList.remove("filled", "active");
      }
    });
  }, 200);
});

// ======= Keyboard navigation =======
input.addEventListener("keydown", (e) => {
  const filled = results.filter((r) => r.classList.contains("filled"));
  if (!filled.length && e.key !== "Enter") return;
  if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) e.preventDefault();
  if (e.key === "ArrowDown") selectedIndex = (selectedIndex + 1) % filled.length;
  else if (e.key === "ArrowUp") selectedIndex = (selectedIndex - 1 + filled.length) % filled.length;
  else if (e.key === "Enter") {
    const query =
      selectedIndex >= 0 && filled[selectedIndex]
        ? filled[selectedIndex].textContent
        : input.value.trim();
    if (!query) return;
    showSearchResults(query, true);
    return;
  }
  filled.forEach((r, i) => r.classList.toggle("active", i === selectedIndex));
});

// ======= Click suggestions =======
results.forEach((slot) => {
  slot.addEventListener("click", () => {
    if (!slot.classList.contains("filled")) return;
    const q = slot.textContent;
    showSearchResults(q, true);
  });
});

// ======= Dock button =======
dockBtn.addEventListener("click", () => {
  dockBtn.classList.add("spin");
  setTimeout(() => dockBtn.classList.remove("spin"), 400);
});


// --- Infinite scroll ---
window.addEventListener('scroll', async () => {
  if (loading || !currentQuery) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
    loading = true;
    page += 10;
    try {
      const results = await fetchResults(currentQuery, page);
      currentResults.push(...results);
      renderResults(results);
      loading = false;
    } catch { loading = false; }
  }
});


// ======= Funkcja resetowania wyników =======
function resetSearchResults() {
  const root = document.querySelector(".results-root");
  if (root) {
    root.style.display = "none";
    const grid = root.querySelector(".results-grid");
    if (grid) grid.innerHTML = "";
  }

  // Przywracamy overlay i input do stanu początkowego
  overlay.style.display = "none";
  overlay.classList.remove("show");
  input.value = "";
  clearSlots();

  // Scroll do góry
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ======= Podpięcie do przycisku Home =======
const homeBtn = document.getElementById("home-btn");
homeBtn.addEventListener("click", resetSearchResults);

// ======= Dock button =======
dockBtn.addEventListener("click", () => {
  dockBtn.classList.add("spin");
  setTimeout(() => dockBtn.classList.remove("spin"), 400);

  const dockMenu = document.getElementById("dockMenu");
  dockMenu.classList.toggle("show");
});
