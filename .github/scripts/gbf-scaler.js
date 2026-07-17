(function () {
  // ------------------------------------------------------------------
  // Top-frame guard
  // ------------------------------------------------------------------
  try {
    if (window.top !== window.self) return;
  } catch (e) {
    return;
  }

  // ------------------------------------------------------------------
  // Resource hints (preconnect / dns-prefetch)
  // ------------------------------------------------------------------
  // GBF can be loaded from two different origins depending on build
  // config, and they hit completely different infrastructure:
  //   - steam.granbluefantasy.com (Steam/desktop build): its own
  //     sharded asset CDN, plus a guild/chat websocket host.
  //   - game.granbluefantasy.jp (original Mobage/browser build): a
  //     differently-named asset CDN, plus the separate Mobage
  //     login/session SDK and ad/analytics trackers that build pulls
  //     in and the Steam build does not.
  // Each preset below was captured from a real network log on that
  // specific origin (2026-07-17). The page's own origin never needs a
  // hint (the browser is already connecting there as part of
  // navigation). The matching preset is picked via location.hostname
  // at runtime and applied as the very first thing this script does,
  // so hints fire as early as possible on every execution, including
  // post-reload cases (Home, entering combat) where the script re-runs
  // from scratch. Low-volume one-off hosts (trackers, single scripts)
  // get dns-prefetch only, not a full preconnect (DNS+TCP+TLS).
  (function addResourceHints() {
    function hint(rel, href, crossorigin) {
      if (
        document.querySelector('link[rel="' + rel + '"][href="' + href + '"]')
      )
        return;
      const l = document.createElement("link");
      l.rel = rel;
      l.href = href;
      if (crossorigin) l.crossOrigin = "anonymous";
      document.head.appendChild(l);
    }

    const PRESETS = {
      // steam.granbluefantasy.com — Steam/desktop build
      "steam.granbluefantasy.com": {
        preconnect: [
          "https://prd-game-a-granbluefantasy-steam.akamaized.net", // bulk: JS/CSS/images/font
          "https://ws.game.granbluefantasy.jp:11240", // guild/chat websocket
        ],
        preconnectCrossorigin: [
          "https://fonts.fontplus.dev", // webfont CSS/woff2
        ],
        dnsPrefetch: [
          "https://www.datadoghq-browser-agent.com", // analytics, one-off
        ],
      },
      // game.granbluefantasy.jp — original Mobage/browser build
      "game.granbluefantasy.jp": {
        preconnect: [
          "https://prd-game-a-granbluefantasy.akamaized.net", // bulk: JS/CSS/images/sounds
          "https://cdn-connect.mobage.jp", // Mobage login/session SDK
          "https://connect.mobage.jp", // Mobage login/session iframes
        ],
        preconnectCrossorigin: [
          "https://fonts.fontplus.dev", // webfont CSS
        ],
        dnsPrefetch: [
          "https://event-api.analytics.mbga.jp", // analytics
          "https://app.mobage.jp", // login proxy iframe, one-off
          "https://aimg-link.gree.net", // one-off script
          "https://d-track.send.microad.jp", // ad tracker, one-off
        ],
      },
    };

    const preset = PRESETS[location.hostname];
    if (!preset) return; // unknown/unrecognized host — nothing to hint from

    (preset.preconnect || []).forEach((h) => hint("preconnect", h));
    (preset.preconnectCrossorigin || []).forEach((h) =>
      hint("preconnect", h, true),
    );
    (preset.dnsPrefetch || []).forEach((h) => hint("dns-prefetch", h));
  })();

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------
  const SIDEBAR_W = 250;
  const SIDEBAR_W_COLLAPSED = 52;

  // "Locked" mode doesn't try to control GBF's own width/zoom math (the
  // game area is genuinely responsive, not a fixed size we can predict
  // with a formula). Instead, when locked, we:
  //   1. Force-hide #submenu / #general-chat (GBF's own chat/help panel)
  //      via CSS !important, regardless of what class GBF toggles on it.
  //   2. Reserve margin-right = sidebar width, same as always, so GBF
  //      lays out the game within (window width - sidebar width).
  //   3. Continuously measure #wrapper's *actual rendered* right edge
  //      (via getBoundingClientRect, which already accounts for whatever
  //      internal zoom GBF is using) and snap the sidebar's left edge to
  //      it. NOTE: #wrapper is the actual game viewport — its parent
  //      #mobage-game-container is an umbrella div that also contains
  //      #submenu/#general-chat as siblings of #wrapper, so it spans
  //      close to full width regardless of game content; measuring the
  //      umbrella instead of #wrapper was the bug in the previous pass.
  const GAME_CONTAINER_ID = "wrapper";

  const NAV = [
    { section: "NAVIGATION" },
    { label: "Home", hash: "#mypage", icon: "\u2302", key: "1" },
    { label: "Party", hash: "#party/index/0/npc/0", icon: "\u2694", key: "p" },
    { label: "Quests", hash: "#quest", icon: "\u2637", key: "2" },
    { label: "Raids", hash: "#quest/assist", icon: "\u2620", key: "3" },
    { label: "Co-op", hash: "#coopraid", icon: "\u21C4", key: "4" },
    { label: "Crew", hash: "#guild", icon: "\u2691", key: "5" },

    { section: "MANAGEMENT" },
    { label: "Supplies", hash: "#item", icon: "\u25C8", key: "6" },
    { label: "Inventory", hash: "#list", icon: "\u2261", key: "7" },
    { label: "Profile", hash: "#profile", icon: "\u263A", key: "8" },

    { section: "MORE" },
    { label: "Shop", hash: "#shop", icon: "\u26C1", key: "9" },
    {
      label: "Journey Drops",
      hash: "#shop/exchange/trajectory",
      icon: "\u2728",
      key: "0",
    },
    { label: "Arcarum", hash: "#arcarum", icon: "\u2606", key: "-" },
    {
      label: "Alchemy Lab",
      hash: "#frontier/alchemy/top",
      icon: "\u2697",
      key: "=",
    },
    { label: "Trial Battles", hash: "#trial_battle", icon: "\u2694", key: "[" },
    { label: "Casino", hash: "#casino", icon: "\u2660", key: "]" },
    { label: "Gacha", hash: "#gacha", icon: "\u2748", key: ";" },
  ];

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : v;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {}
    },
  };

  let collapsed = store.get("gbfCollapsed", "0") === "1";
  let locked = store.get("gbfLocked", "1") === "1";
  let sidebarEl = null; // set once the sidebar exists (outer #gbf-sidebar-outer)
  let sidebarInnerEl = null; // inner #gbf-simple-sidebar (nav content), for auto collapse/expand
  let toggleBtnEl = null; // collapse toggle button, so its icon can be updated from auto logic too
  let sizeObserver = null;
  // True when locked-mode available space is too tight for the full
  // sidebar, forcing icon-only mode regardless of the manual toggle.
  // See positionSidebar() for how this gets set/cleared.
  let autoNarrow = false;

  function isEffectivelyCollapsed() {
    return collapsed || autoNarrow;
  }

  function sidebarWidth() {
    return isEffectivelyCollapsed() ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;
  }

  // Applies the collapsed/expanded visual state (icon-only vs full),
  // driven by isEffectivelyCollapsed() (manual toggle OR auto-narrow).
  // Defined at top level (not nested inside the sidebar-creation block
  // below) so positionSidebar() can call it once auto-narrow changes.
  function applyCollapsedVisual() {
    if (!sidebarInnerEl) return;
    const eff = isEffectivelyCollapsed();
    sidebarInnerEl.classList.toggle("gbf-collapsed", eff);
    if (toggleBtnEl) toggleBtnEl.textContent = eff ? "\u00AB" : "\u00BB";
    sidebarInnerEl.querySelectorAll(".gbf-section-title").forEach((t) => {
      if (!t.dataset.full) t.dataset.full = t.textContent;
      t.textContent = eff ? t.dataset.full.charAt(0) : t.dataset.full;
    });
    applyBodyInset();
  }

  // ------------------------------------------------------------------
  // Base page styles
  // ------------------------------------------------------------------
  const style = document.createElement("style");
  style.innerHTML = `
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #0a1622 !important;
        }
        body {
            overflow-x: hidden !important;
        }
        #wrapper, .wrapper {
            margin: 0 auto 0 0 !important;
        }
        /* When locked, force GBF's own wide-screen side panel closed no
           matter what class/attribute GBF itself is toggling internally. */
        html.gbf-locked #submenu,
        html.gbf-locked #general-chat {
            display: none !important;
        }
    `;
  document.head.appendChild(style);

  // ------------------------------------------------------------------
  // Sidebar
  // ------------------------------------------------------------------
  if (!document.getElementById("gbf-simple-sidebar")) {
    const sidebarStyle = document.createElement("style");
    sidebarStyle.textContent = `
            /* ---- Granblue Fantasy Themed Sidebar (flatter left edge) ----
               #gbf-sidebar-outer handles fixed positioning/left tracking;
               #gbf-simple-sidebar is a fixed-width flex child pinned to
               the outer's LEFT edge (flex-start) — i.e. immediately
               against the game — so it never drifts away from the game
               content. Any extra reclaimed space (when the window is
               wider than the game+sidebar actually need) shows as the
               outer's own themed background AFTER the sidebar, so the
               window's right edge always touches themed background
               instead of a raw gap, without ever moving the sidebar
               itself away from the game.

               z-index is set to the max signed 32-bit int so GBF's own
               fixed-position top/bottom toolbars (which ignore our
               body margin-right inset, since fixed elements aren't
               affected by margins on ancestors) can never render on
               top of us, no matter what z-index GBF itself uses. */
            #gbf-sidebar-outer {
                position: fixed;
                top: 0;
                right: 0;
                height: 100vh;
                width: ${SIDEBAR_W}px;
                display: flex;
                justify-content: flex-start;
                background: linear-gradient(180deg, #0b1a2e 0%, #061220 100%);
                background-image: 
                    linear-gradient(180deg, #0b1a2e 0%, #061220 100%),
                    repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(201, 169, 110, 0.03) 2px,
                        rgba(201, 169, 110, 0.03) 4px
                    );
                border-left: 1px solid rgba(201,169,110,0.25);
                box-shadow: -1px 0 3px rgba(0,0,0,0.3);
                z-index: 2147483647;
            }
            #gbf-simple-sidebar {
                flex: 0 1 auto;
                width: ${SIDEBAR_W}px;
                max-width: 100%;
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
                box-sizing: border-box;
                padding: 12px;
                font-family: "Georgia", "Times New Roman", serif;
                transition: width .12s ease;
            }
            #gbf-simple-sidebar.gbf-collapsed {
                width: ${SIDEBAR_W_COLLAPSED}px;
                padding: 12px 6px;
            }

            #gbf-simple-sidebar::-webkit-scrollbar { width: 8px; }
            #gbf-simple-sidebar::-webkit-scrollbar-track {
                background: rgba(0,0,0,0.3);
                border-radius: 4px;
            }
            #gbf-simple-sidebar::-webkit-scrollbar-thumb {
                background: #c9a96e;
                border-radius: 4px;
                border: 1px solid #5c4a2e;
            }

            .gbf-section-title {
                color: #e9d097;
                font-size: 12px;
                letter-spacing: 2px;
                font-weight: 700;
                margin: 18px 0 8px;
                white-space: nowrap;
                text-transform: uppercase;
                text-shadow: 1px 1px 0 rgba(0,0,0,0.8);
                border-bottom: 1px solid #c9a96e;
                padding-bottom: 3px;
                position: relative;
            }
            .gbf-section-title::after {
                content: '';
                position: absolute;
                bottom: -2px;
                left: 0;
                width: 30px;
                height: 2px;
                background: #c9a96e;
                box-shadow: 0 0 6px rgba(201,169,110,0.6);
            }
            .gbf-collapsed .gbf-section-title {
                text-align: center;
                font-size: 10px;
                letter-spacing: 1px;
                overflow: hidden;
                border-bottom: none;
            }
            .gbf-collapsed .gbf-section-title::after {
                display: none;
            }

            .gbf-nav-btn {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                margin-bottom: 6px;
                padding: 10px 12px;
                background: rgba(20, 30, 45, 0.7);
                border: 1px solid #5c4a2e;
                border-left: 3px solid #c9a96e;
                border-radius: 4px;
                color: #e0d3b5;
                cursor: pointer;
                text-align: left;
                font-weight: 600;
                font-size: 13px;
                font-family: inherit;
                box-sizing: border-box;
                white-space: nowrap;
                overflow: hidden;
                text-shadow: 0 1px 2px rgba(0,0,0,0.6);
                transition: all .15s ease;
                position: relative;
            }
            .gbf-nav-btn:hover {
                background: rgba(50, 70, 100, 0.7);
                border-color: #dbb867;
                color: #f5e7c6;
                box-shadow: 0 0 8px rgba(201,169,110,0.3);
            }
            .gbf-nav-btn:active {
                background: rgba(30, 45, 65, 0.9);
                transform: translateY(1px);
            }
            .gbf-nav-btn.gbf-active {
                background: linear-gradient(90deg, rgba(201,169,110,0.25) 0%, rgba(20,30,45,0.8) 80%);
                border-left-color: #e5c158;
                color: #f9eec1;
                box-shadow: 0 0 12px rgba(201,169,110,0.4);
            }
            .gbf-nav-btn::before {
                content: '';
                position: absolute;
                top: -1px;
                right: -1px;
                width: 6px;
                height: 6px;
                border-top: 1px solid #c9a96e;
                border-right: 1px solid #c9a96e;
                opacity: 0.6;
            }
            .gbf-collapsed .gbf-nav-btn {
                justify-content: center;
                padding: 10px 0;
                gap: 0;
                border-left: none;
                border-radius: 4px;
            }
            .gbf-collapsed .gbf-nav-btn::before {
                display: none;
            }
            .gbf-collapsed .gbf-nav-btn .gbf-label { display: none; }

            .gbf-icon {
                flex: 0 0 auto;
                width: 16px;
                text-align: center;
                font-size: 15px;
                opacity: .9;
                color: #c9a96e;
                text-shadow: 0 0 4px rgba(201,169,110,0.5);
            }
            .gbf-key {
                margin-left: auto;
                font-size: 9px;
                color: #8a7c5a;
                font-weight: 500;
                letter-spacing: 0.5px;
            }
            .gbf-collapsed .gbf-key { display: none; }

            .gbf-row { display: flex; gap: 6px; margin-bottom: 6px; }
            .gbf-row .gbf-nav-btn { margin-bottom: 0; }
            .gbf-collapsed .gbf-row { flex-direction: column; }

            #gbf-toggle {
                width: 100%;
                padding: 8px 0;
                margin-bottom: 4px;
                background: transparent;
                border: 1px solid #5c4a2e;
                border-radius: 4px;
                color: #c9a96e;
                cursor: pointer;
                font-size: 15px;
                font-weight: 700;
                font-family: inherit;
                text-shadow: 0 0 5px rgba(201,169,110,0.4);
                transition: background .15s ease, color .15s ease;
            }
            #gbf-toggle:hover {
                background: rgba(201,169,110,0.15);
                color: #ecd59b;
                box-shadow: 0 0 8px rgba(201,169,110,0.3);
            }
        `;
    document.head.appendChild(sidebarStyle);

    const outer = document.createElement("div");
    outer.id = "gbf-sidebar-outer";
    sidebarEl = outer;

    const sidebar = document.createElement("div");
    sidebar.id = "gbf-simple-sidebar";
    sidebarInnerEl = sidebar;

    // --- collapse toggle ---
    const toggle = document.createElement("button");
    toggle.id = "gbf-toggle";
    toggle.title = "Collapse / expand sidebar (Alt+\\)";
    toggleBtnEl = toggle;
    sidebar.appendChild(toggle);

    // --- nav buttons ---
    const navButtons = [];

    NAV.forEach((item) => {
      if (item.section) {
        const t = document.createElement("div");
        t.className = "gbf-section-title";
        t.textContent = item.section;
        t.dataset.full = item.section;
        sidebar.appendChild(t);
        return;
      }

      const btn = document.createElement("button");
      btn.className = "gbf-nav-btn";
      btn.dataset.hash = item.hash;

      let titleText = item.label;
      if (item.key) {
        titleText += "  (Alt+" + item.key.toUpperCase() + ")";
      }
      btn.title = titleText;

      const ic = document.createElement("span");
      ic.className = "gbf-icon";
      ic.textContent = item.icon || "\u25CF";

      const lb = document.createElement("span");
      lb.className = "gbf-label";
      lb.textContent = item.label;

      btn.appendChild(ic);
      btn.appendChild(lb);

      if (item.key) {
        const kb = document.createElement("span");
        kb.className = "gbf-key";
        kb.textContent = "Alt+" + item.key.toUpperCase();
        btn.appendChild(kb);
      }

      btn.addEventListener("click", () => go(item.hash));
      sidebar.appendChild(btn);
      navButtons.push(btn);
    });

    // --- actions ---
    const actTitle = document.createElement("div");
    actTitle.className = "gbf-section-title";
    actTitle.textContent = "ACTIONS";
    sidebar.appendChild(actTitle);

    const row = document.createElement("div");
    row.className = "gbf-row";

    const backBtn = document.createElement("button");
    backBtn.className = "gbf-nav-btn";
    backBtn.title = "Back (Alt+Left)";
    backBtn.innerHTML =
      '<span class="gbf-icon">\u2190</span><span class="gbf-label">Back</span>';
    backBtn.addEventListener("click", () => history.back());

    const reloadBtn = document.createElement("button");
    reloadBtn.className = "gbf-nav-btn";
    reloadBtn.title = "Reload (Alt+R)";
    reloadBtn.innerHTML =
      '<span class="gbf-icon">\u21BB</span><span class="gbf-label">Reload</span>';
    reloadBtn.addEventListener("click", () => location.reload());

    row.appendChild(backBtn);
    row.appendChild(reloadBtn);
    sidebar.appendChild(row);

    const lockBtn = document.createElement("button");
    lockBtn.className = "gbf-nav-btn";
    lockBtn.id = "gbf-lock-toggle";
    sidebar.appendChild(lockBtn);

    outer.appendChild(sidebar);
    document.body.appendChild(outer);

    // --- behaviour ---
    function go(hash) {
      if (location.hash === hash) {
        location.hash = "";
      }
      location.hash = hash;
    }

    function markActive() {
      const h = location.hash || "";
      let best = null;
      navButtons.forEach((b) => {
        b.classList.remove("gbf-active");
        const bh = b.dataset.hash;
        if (h === bh || h.indexOf(bh + "/") === 0) {
          if (!best || bh.length > best.dataset.hash.length) best = b;
        }
      });
      if (best) best.classList.add("gbf-active");
    }

    function toggleCollapsed() {
      collapsed = !collapsed;
      store.set("gbfCollapsed", collapsed ? "1" : "0");
      applyCollapsedVisual();
      positionSidebar();
    }

    toggle.addEventListener("click", toggleCollapsed);

    function applyLockButton() {
      lockBtn.innerHTML = locked
        ? '<span class="gbf-icon">\u{1F512}</span><span class="gbf-label">Locked</span>'
        : '<span class="gbf-icon">\u{1F513}</span><span class="gbf-label">Unlocked</span>';
      lockBtn.title =
        (locked
          ? "Locked: game stays compact, GBF panel hidden"
          : "Unlocked: GBF panel can appear at wide widths") + "  (Alt+L)";
      lockBtn.classList.toggle("gbf-active", locked);
    }

    function toggleLocked() {
      locked = !locked;
      store.set("gbfLocked", locked ? "1" : "0");
      applyLockButton();
      applyLockState();
    }

    lockBtn.addEventListener("click", toggleLocked);

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (e.key === "\\") {
        toggleCollapsed();
        e.preventDefault();
        return;
      }
      if (key === "l") {
        toggleLocked();
        e.preventDefault();
        return;
      }
      if (key === "r") {
        location.reload();
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowLeft") {
        history.back();
        e.preventDefault();
        return;
      }

      const item = NAV.filter((i) => i.key).find((i) => i.key === key);
      if (item) {
        go(item.hash);
        e.preventDefault();
      }
    });

    window.addEventListener("hashchange", markActive);
    applyCollapsedVisual();
    applyLockButton();
    markActive();
  }

  // ------------------------------------------------------------------
  // Body inset for sidebar (always reserve room for the sidebar itself;
  // this is unrelated to lock/unlock, just keeps content out from under it)
  // ------------------------------------------------------------------
  function applyBodyInset() {
    document.body.style.setProperty(
      "margin-right",
      sidebarWidth() + "px",
      "important",
    );
  }

  // ------------------------------------------------------------------
  // Locked-mode sidebar edge tracking
  // ------------------------------------------------------------------
  function getGameRightEdge() {
    const container = document.getElementById(GAME_CONTAINER_ID);
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return rect.right;
  }

  // Auto icon-only thresholds for locked mode (see positionSidebar):
  // collapse when available space drops below the full sidebar width,
  // but only expand again once there's a bit more than that back — the
  // gap between the two avoids flicker right at the boundary (see
  // comment inside positionSidebar for why a boundary flicker is
  // otherwise possible).
  const AUTO_COLLAPSE_BELOW = SIDEBAR_W;
  const AUTO_EXPAND_AT_OR_ABOVE = 255;

  function positionSidebar() {
    if (!sidebarEl) return;

    // Outer wrapper's right edge is ALWAYS pinned to the window's right
    // edge — this alone guarantees requirement #1 unconditionally.
    sidebarEl.style.right = "0";

    if (!locked) {
      // Auto-narrow only applies to locked mode's edge-fitting logic;
      // clear it when unlocked so the sidebar always matches the
      // manual toggle exactly, same as before this feature existed.
      if (autoNarrow) {
        autoNarrow = false;
        applyCollapsedVisual();
      }
      sidebarEl.style.left = "";
      sidebarEl.style.width = sidebarWidth() + "px";
      return;
    }

    const edge = getGameRightEdge();
    if (edge == null) return; // GBF hasn't laid out yet

    // Auto icon-only mode: when the space actually available for the
    // sidebar (window width minus the game's edge) is too tight for
    // the full sidebar, force the compact icon-only layout regardless
    // of the manual toggle, so content never gets pushed past the
    // window's right edge. Reverts to the manual preference once
    // enough room is back. Collapsing/expanding changes body's
    // margin-right, which changes how much room GBF's own layout
    // leaves for the game — that in turn changes the measured edge on
    // the *next* call, so this settles to a stable state via the
    // existing debounced ResizeObserver rather than needing its own
    // polling loop here.
    const available = window.innerWidth - edge;
    if (autoNarrow && available >= AUTO_EXPAND_AT_OR_ABOVE) {
      autoNarrow = false;
      applyCollapsedVisual();
    } else if (!autoNarrow && available < AUTO_COLLAPSE_BELOW) {
      autoNarrow = true;
      applyCollapsedVisual();
    }

    // Both left (game's edge) and right (window's edge) are pinned,
    // with width:auto — the box exactly fills the space between them,
    // so it can never overlap the game and never leave a gap to the
    // window edge, regardless of how wide that space ends up being.
    sidebarEl.style.left = Math.round(edge) + "px";
    sidebarEl.style.width = "auto";

    if (window.localStorage && localStorage.getItem("gbfDebug") === "1") {
      console.log(
        "[gbf-lock] game right edge=" +
          edge +
          " -> outer left=" +
          Math.round(edge) +
          (autoNarrow ? " (auto-narrow)" : ""),
      );
    }
  }

  // GBF's own page transitions (e.g. clicking Home/Quests/etc.) can
  // cause #wrapper to briefly report an incorrect, much smaller width
  // for a frame or two while the new page lays out, before settling on
  // its real size. Reacting to that instantly makes the sidebar flash
  // into the game area for a split second. Debouncing the ResizeObserver
  // callback means we only reposition once #wrapper's size has actually
  // settled, so the transient in-between value never gets rendered.
  // (This only debounces #wrapper-driven repositioning; the OS window
  // resize handler below stays instant so dragging the window still
  // feels responsive.)
  // 20ms per user's own hands-on testing — confirmed noticeably faster
  // with no regression on their end (originally 100ms).
  let positionDebounceTimer = null;
  function debouncedPositionSidebar() {
    if (positionDebounceTimer) clearTimeout(positionDebounceTimer);
    positionDebounceTimer = setTimeout(() => {
      positionDebounceTimer = null;
      positionSidebar();
    }, 20);
  }

  function ensureSizeObserver() {
    if (sizeObserver) return;
    const container = document.getElementById(GAME_CONTAINER_ID);
    if (!container || typeof ResizeObserver === "undefined") return;
    sizeObserver = new ResizeObserver(() => debouncedPositionSidebar());
    sizeObserver.observe(container);
  }

  function applyLockState() {
    document.documentElement.classList.toggle("gbf-locked", locked);
    applyBodyInset();
    positionSidebar();
    ensureSizeObserver();
  }

  // GBF may finish its own initial layout slightly after our script runs,
  // so retry until the game container actually has a size. Also covers
  // the post-reload case (e.g. Home, entering combat): those are real
  // page reloads where this script re-runs on a fresh document, so this
  // same loop is what rebuilds the sidebar from scratch afterward. Since
  // a real reload means the sidebar unavoidably has to disappear and
  // redraw, the thing worth optimizing is how fast we detect #wrapper is
  // ready and apply — so this checks on every animation frame (via
  // requestAnimationFrame) instead of a fixed setTimeout interval. That's
  // roughly a 16ms worst-case detection latency once #wrapper actually
  // has a size, faster than a fixed-interval poll. Budget is tracked by
  // elapsed wall-clock time (not frame count, since rAF's actual rate
  // isn't guaranteed), capped at MAX_CAPTURE_MS so a pathological case
  // (GBF never finishing layout) doesn't poll forever.
  const MAX_CAPTURE_MS = 30000; // ~30s ceiling — generous vs. the original 5s (250ms*20)
  let captureStartTime = null;
  function retryCaptureAndApply() {
    applyLockState();
    if (getGameRightEdge() == null) {
      const now =
        window.performance && performance.now ? performance.now() : Date.now();
      if (captureStartTime == null) captureStartTime = now;
      if (now - captureStartTime < MAX_CAPTURE_MS) {
        requestAnimationFrame(retryCaptureAndApply);
      }
    }
  }

  retryCaptureAndApply();
  window.addEventListener("resize", () => {
    applyBodyInset();
    positionSidebar();
  });

  // ------------------------------------------------------------------
  // Diagnostics
  // ------------------------------------------------------------------
  if (window.localStorage && localStorage.getItem("gbfDebug") === "1") {
    try {
      if (!document.querySelector("iframe[data-gbf-console]")) {
        const f = document.createElement("iframe");
        f.setAttribute("data-gbf-console", "1");
        f.style.display = "none";
        document.documentElement.appendChild(f);
        window.console = f.contentWindow.console;
      }
    } catch (e) {}
    console.log("[gbf-debug] diagnostics active");
  }
})();
