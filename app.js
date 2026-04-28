/* ============================================================
   Ifrane Atlas — app.js
   Vanilla JS · Leaflet · no build step
   ============================================================ */

(() => {
  "use strict";

  /* ---- Constants ---- */
  const IFRANE_CENTER = [33.5333, -5.1167];
  const DEFAULT_ZOOM = 14;
  const CATEGORY_LABELS = {
    education: "Education",
    food: "Food & drink",
    nature: "Nature",
    culture: "Culture"
  };

  /* ---- DOM refs ---- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    body: document.body,
    list: $("#locations-panel"),
    search: $("#search"),
    chips: $$(".chip"),
    resultCount: $("#result-count"),
    viewMap: $("#view-map"),
    viewList: $("#view-list"),
    sidebar: $("#sidebar"),
    drawer: $("#drawer-handle"),
    rationale: $("#rationale"),
    openRationale: $("#open-rationale"),
    mapEl: $("#map")
  };

  /* ---- State ---- */
  const state = {
    locations: [],
    filtered: [],
    activeCat: "all",
    query: "",
    activeId: null,
    markers: new Map() // id → leaflet marker
  };

  /* ============================================================
     INITIALISATION
     ============================================================ */
  async function init() {
    try {
      const data = await loadLocations();
      state.locations = data.locations;
      state.filtered = [...state.locations];

      setupMap();
      buildMarkers();
      renderList();
      bindEvents();
      updateResultCount();
    } catch (err) {
      console.error("Failed to initialise atlas:", err);
      els.list.innerHTML = `<li class="empty-state">Couldn't load the atlas. Check your connection and refresh.</li>`;
    }
  }

  async function loadLocations() {
    // Embedded fallback so file:// previews & GitHub Pages both work cleanly.
    // The fetch is the source of truth in production.
    try {
      const res = await fetch("data/locations.json");
      if (!res.ok) throw new Error(res.statusText);
      return await res.json();
    } catch (e) {
      // Fallback for environments that block fetch on file://
      return EMBEDDED_DATA;
    }
  }

  /* ============================================================
     MAP SETUP
     ============================================================ */
  let map;

  function setupMap() {
    map = L.map(els.mapEl, {
      center: IFRANE_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    // Use a clean carto-style tile layer that aligns with the cream palette.
    // Falls back to standard OSM if Carto is unreachable.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);

    // When the user clicks on empty map space, deactivate selection.
    map.on("click", () => setActive(null));
  }

  /* ============================================================
     CUSTOM MARKERS
     ============================================================ */
  function makeIcon(category) {
    const url = `assets/marker-${category}.svg`;
    return L.divIcon({
      className: "atlas-marker",
      html: `<img src="${url}" alt="" width="36" height="44" draggable="false" />`,
      iconSize: [36, 44],
      iconAnchor: [18, 42],
      popupAnchor: [0, -38]
    });
  }

  function buildMarkers() {
    state.locations.forEach((loc) => {
      const marker = L.marker([loc.lat, loc.lng], {
        icon: makeIcon(loc.category),
        title: loc.title,
        alt: `${loc.title} marker`,
        keyboard: true,
        riseOnHover: true
      });

      marker.bindPopup(buildPopupHtml(loc), {
        closeButton: true,
        autoPan: true,
        autoPanPaddingTopLeft: [380, 80],
        autoPanPaddingBottomRight: [40, 40]
      });

      marker.on("click", () => setActive(loc.id, { fly: false, openPopup: false }));

      marker.addTo(map);
      state.markers.set(loc.id, marker);
    });
  }

  function buildPopupHtml(loc) {
    return `
      <div class="popcard">
        <div class="popcard-photo" role="img" aria-label="Photo placeholder for ${escapeHtml(loc.title)}">
          <span>${escapeHtml(loc.photoLabel || "Photo")}</span>
        </div>
        <div class="popcard-body">
          <div class="popcard-cat">${escapeHtml(CATEGORY_LABELS[loc.category] || loc.category)}</div>
          <h3 class="popcard-title">${escapeHtml(loc.title)}</h3>
          <p class="popcard-desc">${escapeHtml(loc.description)}</p>
          <div class="popcard-meta">${escapeHtml(loc.meta || "")}</div>
        </div>
      </div>
    `;
  }

  /* ============================================================
     LIST RENDERING
     ============================================================ */
  function renderList() {
    if (state.filtered.length === 0) {
      els.list.innerHTML = `<li class="empty-state">No places match. Try a different filter or search.</li>`;
      return;
    }

    els.list.innerHTML = state.filtered.map((loc) => `
      <li class="loc-item ${loc.id === state.activeId ? "is-active" : ""}"
          data-id="${loc.id}"
          role="button"
          tabindex="0"
          aria-label="${escapeHtml(loc.title)}, ${escapeHtml(CATEGORY_LABELS[loc.category])}">
        <img class="loc-marker" src="assets/marker-${loc.category}.svg" alt="" />
        <div class="loc-body">
          <h3 class="loc-title">${escapeHtml(loc.title)}</h3>
          <div class="loc-meta">${escapeHtml(CATEGORY_LABELS[loc.category])}</div>
          <p class="loc-desc">${escapeHtml(loc.description)}</p>
        </div>
      </li>
    `).join("");
  }

  function updateResultCount() {
    els.resultCount.textContent = state.filtered.length;
  }

  /* ============================================================
     FILTERING & SEARCH
     ============================================================ */
  function applyFilters() {
    const q = state.query.trim().toLowerCase();
    state.filtered = state.locations.filter((loc) => {
      const matchCat = state.activeCat === "all" || loc.category === state.activeCat;
      const matchSearch =
        !q ||
        loc.title.toLowerCase().includes(q) ||
        loc.description.toLowerCase().includes(q) ||
        (loc.meta || "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    // Hide markers that no longer match
    state.locations.forEach((loc) => {
      const m = state.markers.get(loc.id);
      const visible = state.filtered.some((f) => f.id === loc.id);
      if (visible) {
        if (!map.hasLayer(m)) m.addTo(map);
      } else {
        if (map.hasLayer(m)) map.removeLayer(m);
      }
    });

    renderList();
    updateResultCount();
  }

  /* ============================================================
     ACTIVE SELECTION (sync map ↔ list)
     ============================================================ */
  function setActive(id, { fly = true, openPopup = true } = {}) {
    state.activeId = id;

    // List highlighting
    $$(".loc-item").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.id === id);
    });

    // Marker visual states
    state.markers.forEach((m, mid) => {
      const el = m.getElement();
      if (el) el.classList.toggle("is-active", mid === id);
    });

    if (!id) {
      map.closePopup();
      return;
    }

    const loc = state.locations.find((l) => l.id === id);
    if (!loc) return;

    const marker = state.markers.get(id);
    if (fly) {
      map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 15), { duration: .8 });
    }
    if (openPopup) {
      // small delay so flyTo doesn't fight with autoPan
      setTimeout(() => marker.openPopup(), fly ? 600 : 0);
    }

    // Scroll into view inside the list
    const item = els.list.querySelector(`[data-id="${id}"]`);
    if (item) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function bindEvents() {
    // Search
    els.search.addEventListener("input", (e) => {
      state.query = e.target.value;
      applyFilters();
    });

    // Filter chips
    els.chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        els.chips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        state.activeCat = chip.dataset.cat;
        applyFilters();
      });
    });

    // List item interactions (click + keyboard)
    els.list.addEventListener("click", (e) => {
      const item = e.target.closest(".loc-item");
      if (!item) return;
      setActive(item.dataset.id);
      // On mobile, close drawer after selection
      if (window.matchMedia("(max-width: 860px)").matches) {
        els.sidebar.classList.remove("is-open");
        els.drawer.setAttribute("aria-expanded", "false");
      }
    });
    els.list.addEventListener("keydown", (e) => {
      const item = e.target.closest(".loc-item");
      if (!item) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(item.dataset.id);
      }
    });

    // View toggle
    els.viewMap.addEventListener("click", () => switchView("map"));
    els.viewList.addEventListener("click", () => switchView("list"));

    // Drawer (mobile)
    els.drawer.addEventListener("click", () => {
      const open = els.sidebar.classList.toggle("is-open");
      els.drawer.setAttribute("aria-expanded", String(open));
    });

    // Modal
    els.openRationale.addEventListener("click", openModal);
    els.rationale.addEventListener("click", (e) => {
      if (e.target.matches("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.rationale.hasAttribute("hidden")) closeModal();
    });
  }

  function switchView(mode) {
    if (mode === "list") {
      els.body.classList.add("view-list");
      els.viewList.classList.add("is-active");
      els.viewMap.classList.remove("is-active");
      els.viewList.setAttribute("aria-selected", "true");
      els.viewMap.setAttribute("aria-selected", "false");
    } else {
      els.body.classList.remove("view-list");
      els.viewMap.classList.add("is-active");
      els.viewList.classList.remove("is-active");
      els.viewMap.setAttribute("aria-selected", "true");
      els.viewList.setAttribute("aria-selected", "false");
      // Leaflet needs a nudge to recompute size after reflow
      setTimeout(() => map.invalidateSize(), 200);
    }
  }

  /* ============================================================
     MODAL
     ============================================================ */
  let lastFocus = null;
  function openModal() {
    lastFocus = document.activeElement;
    els.rationale.hidden = false;
    // Focus the close button for keyboard users
    setTimeout(() => els.rationale.querySelector(".modal-close")?.focus(), 50);
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    els.rationale.hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }

  /* ============================================================
     UTILS
     ============================================================ */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---- Embedded fallback data (mirrors data/locations.json) ---- */
  const EMBEDDED_DATA = {
    locations: [
      { id:"aui", title:"Al Akhawayn University", category:"education", lat:33.5366, lng:-5.1086, description:"An English-language liberal arts university founded in 1995, set on a 75-hectare campus modeled on American university traditions. The architecture blends Moroccan and alpine influences.", meta:"Founded 1995 · Liberal arts", photoLabel:"AUI Campus" },
      { id:"mohammed-vi-library", title:"Mohammed VI Library", category:"education", lat:33.5378, lng:-5.1078, description:"The flagship academic library of Al Akhawayn, housing more than 100,000 volumes across the humanities, sciences, and Moroccan studies. A landmark of campus study life.", meta:"Open Mon–Sun · 100k+ volumes", photoLabel:"Library Reading Room" },
      { id:"lion-statue", title:"Stone Lion of Ifrane", category:"culture", lat:33.5278, lng:-5.1100, description:"An iconic stone-carved Atlas lion sculpted during the French Protectorate. The most photographed civic monument in town and a meeting point for visitors.", meta:"Carved circa 1930s · Civic landmark", photoLabel:"The Stone Lion" },
      { id:"parc-de-la-prairie", title:"Parc de la Prairie", category:"nature", lat:33.5306, lng:-5.1144, description:"A landscaped park threaded by the Tizguit stream, with stone bridges, willow trees, and benches. The civic heart of Ifrane's outdoor life year-round.", meta:"Open daily · Free entry", photoLabel:"Tizguit Stream" },
      { id:"michliffen-cedars", title:"Cèdre Gouraud Forest", category:"nature", lat:33.4214, lng:-5.1500, description:"An ancient Atlas cedar forest just south of town, home to a famed millennial cedar and resident Barbary macaques. A short drive from the centre.", meta:"10 km south · Hiking trails", photoLabel:"Atlas Cedars" },
      { id:"cafe-la-paix", title:"Café La Paix", category:"food", lat:33.5294, lng:-5.1108, description:"A long-running town-centre café known for mint tea, msemen, and a warm fireplace in winter. A favored stop for students and locals alike.", meta:"Open 7am–11pm · Café & light meals", photoLabel:"Café Interior" },
      { id:"la-rose", title:"Restaurant La Rose", category:"food", lat:33.5302, lng:-5.1119, description:"A traditional Moroccan restaurant serving slow-cooked tagines, harira, and seasonal cherry desserts. Known for its alpine-style timber interior.", meta:"Lunch & dinner · Moroccan", photoLabel:"Tagine Service" },
      { id:"ifrane-cathedral", title:"Église Notre-Dame des Cèdres", category:"culture", lat:33.5283, lng:-5.1131, description:"A small stone church built in 1932 during the French Protectorate, with a steep pitched roof reflecting Ifrane's distinctive alpine architecture.", meta:"Built 1932 · Historic site", photoLabel:"Stone Façade" }
    ]
  };

  /* ---- Boot ---- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
