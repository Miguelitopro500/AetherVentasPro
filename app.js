// ============================================================================
// AETHER VAULT • MOTOR JAVASCRIPT (BLOQUE 1 DE 3: SUPABASE, AVATARES Y ACCESO)
// ============================================================================

// 1) REEMPLAZA ESTOS DOS VALORES CON LOS DE TU PROYECTO EN SUPABASE
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-CLAVE-PUBLICA-ANON-KEY";

const sbClient =
  window.supabase && SUPABASE_URL.startsWith("http") && !SUPABASE_URL.includes("TU-PROYECTO")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const SESSION_CACHE_KEY = "aether_vault_session_v1";
const UNIVERSAL_CACHE_KEY = "aether_vault_gate_passed_v1";

// ~20 avatares predeterminados variados (estilo consola)
const PRESET_AVATARS = [
  "🐺", "🐱", "🐶", "🦊", "🐼", "🐯", "🐸", "🦉", "🐲", "🦖",
  "🚀", "🛸", "🪐", "🌙", "⚡", "🔥", "❄️", "🛡️", "⚔️", "🎮"
];

const DEFAULT_CONFIG = {
  id: 1,
  universal_key: "AETHER2026",
  admin1_key: "ADMIN123",
  admin2_key: "MASTER2026",
  afk_reward: 10,
  afk_seconds: 120,
  rew_defense: 25,
  rew_riddles: 15,
  rew_memory: 15,
  rew_quiz: 12,
  rew_reflex: 10,
  max_gift: 500
};

const DEFAULT_CHALLENGES = [
  {
    id: "ch-r1",
    type: "riddle",
    question: "Mientras más grande es, menos se ve. ¿Qué es?",
    answer: "la oscuridad",
    options: []
  },
  {
    id: "ch-r2",
    type: "riddle",
    question: "Tiene agujas pero no cose, tiene números pero no lee. ¿Qué es?",
    answer: "el reloj",
    options: []
  },
  {
    id: "ch-q1",
    type: "quiz",
    question: "¿Cuánto es 14 × 3 + 8?",
    answer: "50",
    options: ["48", "50", "52", "56"]
  },
  {
    id: "ch-q2",
    type: "quiz",
    question: "¿En qué continente se encuentra Ecuador?",
    answer: "América",
    options: ["Europa", "África", "América", "Oceanía"]
  }
];

const vaultState = {
  universalPassed: false,
  currentUser: null,
  config: { ...DEFAULT_CONFIG },
  products: [],
  challenges: [],
  purchases: []
};

let authMode = "login";
let selectedRegAvatar = PRESET_AVATARS[0];
let selectedSetAvatar = PRESET_AVATARS[0];

// --- Utilidades de interfaz y seguridad ---
function showMsg(el, text, isOk = false) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("msg-ok", "msg-err");
  if (!text) return;
  el.classList.add(isOk ? "msg-ok" : "msg-err");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAvatarElement(container, avatarValue) {
  if (!container) return;
  const val = String(avatarValue || PRESET_AVATARS[0]);
  if (val.startsWith("data:image/")) {
    container.innerHTML = `<img src="${val}" alt="Avatar" />`;
  } else {
    container.textContent = val;
  }
}

// Comprime imagen desde galería a tamaño miniatura (pocos KB) usando Canvas
function compressImageToTinyDataUrl(file, maxSize = 96, quality = 0.52) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.clearRect(0, 0, maxSize, maxSize);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Botones Ver/Ocultar contraseña
document.querySelectorAll(".toggle-pass").forEach((btn) => {
  btn.addEventListener("click", () => {
    const inp = document.getElementById(btn.dataset.target);
    if (!inp) return;
    const isPass = inp.type === "password";
    inp.type = isPass ? "text" : "password";
    btn.textContent = isPass ? "Ocultar" : "Ver";
  });
});

// --- Carga inicial de configuración, productos y retos desde Supabase ---
async function loadVaultCatalogAndConfig() {
  if (!sbClient) {
    vaultState.config = { ...DEFAULT_CONFIG };
    vaultState.challenges = [...DEFAULT_CHALLENGES];
    return;
  }

  const [{ data: cfgRows }, { data: prodRows }, { data: chRows }] = await Promise.all([
    sbClient.from("aether_config").select("*").eq("id", 1).maybeSingle(),
    sbClient.from("aether_products").select("*").order("created_at", { ascending: false }),
    sbClient.from("aether_challenges").select("*").order("created_at", { ascending: true })
  ]);

  if (cfgRows) {
    vaultState.config = { ...DEFAULT_CONFIG, ...cfgRows };
  }
  vaultState.products = Array.isArray(prodRows) ? prodRows : [];
  vaultState.challenges =
    Array.isArray(chRows) && chRows.length > 0 ? chRows : [...DEFAULT_CHALLENGES];
}

async function refreshCurrentUserFromDb() {
  if (!sbClient || !vaultState.currentUser) return;
  const { data: userRow } = await sbClient
    .from("aether_users")
    .select("*")
    .eq("id", vaultState.currentUser.id)
    .maybeSingle();

  if (!userRow) {
    // Si el administrador borró la cuenta desde el panel o base de datos, se cierra sesión
    forceSignOutClean();
    return;
  }

  vaultState.currentUser = userRow;
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ id: userRow.id }));

  const { data: purRows } = await sbClient
    .from("aether_purchases")
    .select("*")
    .eq("user_id", userRow.id)
    .order("created_at", { ascending: false });

  vaultState.purchases = Array.isArray(purRows) ? purRows : [];
}

function applyUserThemeAndAccent(user) {
  const theme = user?.theme === "light" ? "light" : "dark";
  const accent = ["cyan", "cobalt", "electric"].includes(user?.accent) ? user.accent : "cyan";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-accent", accent);
}

// --- PANTALLA 0: PUERTA DE CLAVE UNIVERSAL ---
const screenUniversal = document.getElementById("screen-universal");
const screenAuth = document.getElementById("screen-auth");
const appShell = document.getElementById("app-shell");
const formUniversal = document.getElementById("form-universal");
const msgUniversal = document.getElementById("msg-universal");

function showGateScreen() {
  screenUniversal.classList.remove("hidden");
  screenAuth.classList.add("hidden");
  appShell.classList.add("hidden");
}

function showAuthScreen() {
  screenUniversal.classList.add("hidden");
  screenAuth.classList.remove("hidden");
  appShell.classList.add("hidden");
  buildPresetGrid("reg-preset-grid", (av) => {
    selectedRegAvatar = av;
    renderAvatarElement(document.getElementById("reg-avatar-preview"), av);
  });
  renderAvatarElement(document.getElementById("reg-avatar-preview"), selectedRegAvatar);
}

formUniversal.addEventListener("submit", async (e) => {
  e.preventDefault();
  const keyInput = document.getElementById("inp-universal-key").value.trim();
  showMsg(msgUniversal, "");

  if (!sbClient) {
    showMsg(msgUniversal, "Configura primero SUPABASE_URL y SUPABASE_ANON_KEY en app.js.");
    return;
  }

  await loadVaultCatalogAndConfig();
  const expectedKey = String(vaultState.config.universal_key || "").trim();

  if (!keyInput || keyInput !== expectedKey) {
    showMsg(msgUniversal, "Clave universal incorrecta.");
    return;
  }

  vaultState.universalPassed = true;
  localStorage.setItem(UNIVERSAL_CACHE_KEY, "1");
  showMsg(msgUniversal, "Acceso concedido. Cargando...", true);
  setTimeout(() => {
    msgUniversal.textContent = "";
    showAuthScreen();
  }, 300);
});

// --- PANTALLA 1: LOGIN Y REGISTRO ---
document.querySelectorAll("#auth-mode-tabs .sw-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    authMode = btn.dataset.authmode;
    document.querySelectorAll("#auth-mode-tabs .sw-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    document
      .getElementById("register-avatar-section")
      .classList.toggle("hidden", authMode !== "register");
    document.getElementById("btn-auth-submit").textContent =
      authMode === "register" ? "Crear Cuenta" : "Iniciar Sesión";
    showMsg(document.getElementById("msg-auth"), "");
  });
});

function buildPresetGrid(containerId, onSelect) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = "";
  PRESET_AVATARS.forEach((emo, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn" + (idx === 0 ? " selected" : "");
    btn.textContent = emo;
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      onSelect(emo);
    });
    grid.appendChild(btn);
  });
}

document.getElementById("inp-reg-photo").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const tinyData = await compressImageToTinyDataUrl(file, 96, 0.52);
    selectedRegAvatar = tinyData;
    renderAvatarElement(document.getElementById("reg-avatar-preview"), tinyData);
    document
      .querySelectorAll("#reg-preset-grid .preset-btn")
      .forEach((b) => b.classList.remove("selected"));
  } catch (_) {
    showMsg(document.getElementById("msg-auth"), "No se pudo procesar la imagen.");
  }
});

document.getElementById("form-auth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msgAuth = document.getElementById("msg-auth");
  const username = document.getElementById("inp-auth-user").value.trim().toLowerCase();
  const password = document.getElementById("inp-auth-pass").value;

  showMsg(msgAuth, "");
  if (!sbClient) {
    showMsg(msgAuth, "Falta configurar Supabase en app.js.");
    return;
  }

  if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
    showMsg(msgAuth, "Usuario: 3 a 20 caracteres (letras, números, punto, guion o guion bajo).");
    return;
  }
  if (password.length < 4) {
    showMsg(msgAuth, "La contraseña debe tener al menos 4 caracteres.");
    return;
  }

  if (authMode === "register") {
    const { data: existing } = await sbClient
      .from("aether_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existing) {
      showMsg(msgAuth, "Ese nombre de usuario ya existe. Elige otro.");
      return;
    }

    const { data: created, error } = await sbClient
      .from("aether_users")
      .insert({
        username,
        password,
        avatar: selectedRegAvatar || PRESET_AVATARS[0],
        coins: 0,
        theme: "dark",
        accent: "cyan",
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (error || !created) {
      showMsg(msgAuth, "No se pudo crear la cuenta en la base de datos.");
      return;
    }

    await enterVaultSession(created);
  } else {
    const { data: userRow, error } = await sbClient
      .from("aether_users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .maybeSingle();

    if (error || !userRow) {
      showMsg(msgAuth, "Usuario o contraseña incorrectos.");
      return;
    }

    await sbClient
      .from("aether_users")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", userRow.id);

    await enterVaultSession(userRow);
  }
});

async function enterVaultSession(userRow) {
  vaultState.currentUser = userRow;
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ id: userRow.id }));
  applyUserThemeAndAccent(userRow);
  await loadVaultCatalogAndConfig();
  await refreshCurrentUserFromDb();

  screenUniversal.classList.add("hidden");
  screenAuth.classList.add("hidden");
  appShell.classList.remove("hidden");

  updateHudBar();
  renderShopGrid();
  renderChallengeModules();
  renderMyPurchases();
  initSettingsScreen();
  startAfkEngine();
}

function forceSignOutClean() {
  vaultState.currentUser = null;
  localStorage.removeItem(SESSION_CACHE_KEY);
  stopAfkEngine();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.setAttribute("data-accent", "cyan");
  appShell.classList.add("hidden");
  showAuthScreen();
}

document.getElementById("btn-logout").addEventListener("click", () => {
  forceSignOutClean();
});

function updateHudBar() {
  const u = vaultState.currentUser;
  if (!u) return;
  document.getElementById("hud-coins").textContent = String(u.coins ?? 0);
  document.getElementById("hud-username").textContent = `@${u.username}`;
  renderAvatarElement(document.getElementById("hud-avatar"), u.avatar);
  document.getElementById("lbl-max-gift").textContent = String(vaultState.config.max_gift ?? 500);
}

// ============================================================================
// AETHER VAULT • MOTOR JAVASCRIPT (BLOQUE 2A: NAVEGACIÓN, TIENDA Y ANTI-AFK)
// ============================================================================

// --- Navegación entre apartados principales ---
document.querySelectorAll("#main-nav .nav-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const viewId = btn.dataset.view;
    document.querySelectorAll("#main-nav .nav-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".app-view").forEach((v) => v.classList.add("hidden"));
    document.getElementById(viewId).classList.remove("hidden");

    await refreshCurrentUserFromDb();
    updateHudBar();

    if (viewId === "view-shop") renderShopGrid();
    if (viewId === "view-earn") renderChallengeModules();
    if (viewId === "view-purchases") renderMyPurchases();
  });
});

// --- Helper para actualizar monedas en base de datos ---
async function adjustUserCoinsInDb(userId, delta) {
  if (!sbClient || !userId) return { ok: false, coins: 0 };
  const { data: fresh } = await sbClient
    .from("aether_users")
    .select("coins")
    .eq("id", userId)
    .single();
  if (!fresh) return { ok: false, coins: 0 };

  const nextCoins = Math.max(0, Number(fresh.coins || 0) + Number(delta || 0));
  const { error } = await sbClient
    .from("aether_users")
    .update({ coins: nextCoins })
    .eq("id", userId);

  if (error) return { ok: false, coins: fresh.coins };
  if (vaultState.currentUser && vaultState.currentUser.id === userId) {
    vaultState.currentUser.coins = nextCoins;
    updateHudBar();
  }
  return { ok: true, coins: nextCoins };
}

// --- TIENDA VIRTUAL ESTILO TEMU ---
let selectedProduct = null;

function renderShopGrid() {
  const grid = document.getElementById("shop-products-grid");
  const query = (document.getElementById("inp-shop-search")?.value || "").trim().toLowerCase();
  if (!grid) return;

  const list = vaultState.products.filter((p) => {
    if (!query) return true;
    return (
      String(p.title || "").toLowerCase().includes(query) ||
      String(p.description || "").toLowerCase().includes(query)
    );
  });

  if (list.length === 0) {
    grid.innerHTML = `<div class="glass-card"><p class="muted">No hay productos publicados todavía o no coinciden con la búsqueda.</p></div>`;
    return;
  }

  grid.innerHTML = list
    .map((p) => {
      const coverHtml =
        p.cover_type === "url" && p.cover_value
          ? `<img src="${escapeHtml(p.cover_value)}" alt="${escapeHtml(p.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><div class="temu-emoji-cover" style="display:none;">📦</div>`
          : `<div class="temu-emoji-cover">${escapeHtml(p.cover_value || "🎁")}</div>`;

      return `
        <article class="temu-card" data-pid="${escapeHtml(p.id)}">
          <div class="temu-thumb">${coverHtml}</div>
          <div class="temu-body">
            <div class="temu-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</div>
            <div class="temu-price">${Number(p.price || 0)} 🪙</div>
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll(".temu-card").forEach((card) => {
    card.addEventListener("click", () => {
      const prod = vaultState.products.find((x) => String(x.id) === String(card.dataset.pid));
      if (prod) openProductModal(prod);
    });
  });
}

document.getElementById("inp-shop-search").addEventListener("input", renderShopGrid);

function openProductModal(prod) {
  selectedProduct = prod;
  const modal = document.getElementById("modal-product-detail");
  const coverBox = document.getElementById("det-cover-box");
  const stockNum = Number(prod.stock ?? -1);
  const stockBadge = document.getElementById("det-stock-badge");

  if (stockNum === 0) {
    stockBadge.textContent = "AGOTADO";
  } else if (stockNum > 0) {
    stockBadge.textContent = `STOCK LIMITADO: ${stockNum} DISPONIBLES`;
  } else {
    stockBadge.textContent = "STOCK ILIMITADO";
  }

  coverBox.innerHTML =
    prod.cover_type === "url" && prod.cover_value
      ? `<img src="${escapeHtml(prod.cover_value)}" alt="${escapeHtml(prod.title)}" />`
      : `<div class="temu-emoji-cover" style="padding:26px;">${escapeHtml(prod.cover_value || "🎁")}</div>`;

  document.getElementById("det-title").textContent = prod.title;
  document.getElementById("det-desc").textContent = prod.description || "Sin descripción adicional.";
  document.getElementById("det-price").textContent = String(prod.price ?? 0);
  document.getElementById("inp-product-vip").value = "";
  showMsg(document.getElementById("msg-product-detail"), "");

  const alreadyUnlocked = vaultState.purchases.find((pu) => String(pu.product_id) === String(prod.id));
  const unlockedBox = document.getElementById("det-unlocked-link-box");

  if (alreadyUnlocked) {
    unlockedBox.classList.remove("hidden");
    document.getElementById("det-final-url").textContent = prod.delivery_url;
    document.getElementById("btn-visit-unlocked").href = prod.delivery_url;
  } else {
    unlockedBox.classList.add("hidden");
  }

  modal.classList.remove("hidden");
}

document.getElementById("btn-close-product").addEventListener("click", () => {
  document.getElementById("modal-product-detail").classList.add("hidden");
  selectedProduct = null;
});

async function finalizeProductUnlock(prod, methodLabel) {
  if (!sbClient || !vaultState.currentUser || !prod) return;
  const stockNum = Number(prod.stock ?? -1);

  if (stockNum === 0) {
    showMsg(document.getElementById("msg-product-detail"), "Este producto ya no tiene stock disponible.");
    return;
  }

  if (stockNum > 0) {
    await sbClient
      .from("aether_products")
      .update({ stock: stockNum - 1 })
      .eq("id", prod.id);
    prod.stock = stockNum - 1;
  }

  await sbClient.from("aether_purchases").insert({
    user_id: vaultState.currentUser.id,
    product_id: prod.id,
    product_title: prod.title,
    delivery_url: prod.delivery_url,
    method: methodLabel
  });

  await loadVaultCatalogAndConfig();
  await refreshCurrentUserFromDb();
  updateHudBar();
  renderShopGrid();

  showMsg(document.getElementById("msg-product-detail"), `¡Desbloqueado (${methodLabel})!`, true);
  const unlockedBox = document.getElementById("det-unlocked-link-box");
  unlockedBox.classList.remove("hidden");
  document.getElementById("det-final-url").textContent = prod.delivery_url;
  document.getElementById("btn-visit-unlocked").href = prod.delivery_url;
}

document.getElementById("btn-buy-product").addEventListener("click", async () => {
  const msgEl = document.getElementById("msg-product-detail");
  if (!selectedProduct || !vaultState.currentUser) return;

  const stockNum = Number(selectedProduct.stock ?? -1);
  if (stockNum === 0) {
    showMsg(msgEl, "Producto agotado.");
    return;
  }

  await refreshCurrentUserFromDb();
  const price = Number(selectedProduct.price || 0);
  const currentCoins = Number(vaultState.currentUser.coins || 0);

  if (currentCoins < price) {
    showMsg(msgEl, `Te faltan ${price - currentCoins} 🪙 para comprar este producto.`);
    return;
  }

  const res = await adjustUserCoinsInDb(vaultState.currentUser.id, -price);
  if (!res.ok) {
    showMsg(msgEl, "Error al descontar monedas en la base de datos.");
    return;
  }

  await finalizeProductUnlock(selectedProduct, `${price} 🪙`);
});

document.getElementById("btn-redeem-vip").addEventListener("click", async () => {
  const msgEl = document.getElementById("msg-product-detail");
  const codeEntered = document.getElementById("inp-product-vip").value.trim().toUpperCase();
  const prodVip = String(selectedProduct?.vip_code || "").trim().toUpperCase();

  if (!selectedProduct) return;
  if (!prodVip || codeEntered !== prodVip) {
    showMsg(msgEl, "Código VIP incorrecto para este producto.");
    return;
  }

  await finalizeProductUnlock(selectedProduct, `Código VIP: ${prodVip}`);
});

document.getElementById("btn-copy-unlocked").addEventListener("click", () => {
  const txt = document.getElementById("det-final-url").textContent;
  navigator.clipboard?.writeText(txt);
  showMsg(document.getElementById("msg-product-detail"), "Enlace copiado al portapapeles.", true);
});

// --- TEMPORIZADOR ACTIVO ANTI-AFK ---
let afkIntervalId = null;
let afkProgressSec = 0;
let afkClaimSecondsLeft = 0;

function stopAfkEngine() {
  if (afkIntervalId) {
    clearInterval(afkIntervalId);
    afkIntervalId = null;
  }
  afkProgressSec = 0;
  afkClaimSecondsLeft = 0;
}

function startAfkEngine() {
  stopAfkEngine();
  updateAfkLabels();

  afkIntervalId = setInterval(() => {
    if (!vaultState.currentUser) return;

    const targetSec = Math.max(15, Number(vaultState.config.afk_seconds || 120));
    const btnClaim = document.getElementById("btn-claim-afk");
    const timerText = document.getElementById("afk-timer-text");
    const barEl = document.getElementById("afk-progress-bar");

    if (afkClaimSecondsLeft > 0) {
      afkClaimSecondsLeft--;
      document.getElementById("afk-countdown").textContent = String(afkClaimSecondsLeft);
      if (afkClaimSecondsLeft <= 0) {
        btnClaim.classList.add("hidden");
        afkProgressSec = 0;
        barEl.style.width = "0%";
        timerText.textContent = "El bono expiró por no reclamar a tiempo. Sigue activo...";
      }
      return;
    }

    const isVisible = document.visibilityState === "visible" && document.hasFocus();
    if (!isVisible) {
      timerText.textContent = "Pausado: mantén la pestaña visible y activa para avanzar.";
      return;
    }

    afkProgressSec++;
    const pct = Math.min(100, Math.round((afkProgressSec / targetSec) * 100));
    barEl.style.width = `${pct}%`;
    timerText.textContent = `Tiempo activo: ${afkProgressSec}s / ${targetSec}s`;

    if (afkProgressSec >= targetSec) {
      afkClaimSecondsLeft = 15;
      document.getElementById("afk-countdown").textContent = "15";
      btnClaim.classList.remove("hidden");
      timerText.textContent = "¡Bono listo! Reclámalo antes de que pasen 15 segundos.";
    }
  }, 1000);
}

function updateAfkLabels() {
  const rew = Number(vaultState.config.afk_reward || 10);
  document.getElementById("afk-reward-label").textContent = `Recompensa: +${rew} 🪙`;
  document.getElementById("tag-reward-defense").textContent = `+${vaultState.config.rew_defense ?? 25} 🪙 por victoria`;
  document.getElementById("tag-reward-riddles").textContent = `+${vaultState.config.rew_riddles ?? 15} 🪙`;
  document.getElementById("tag-reward-memory").textContent = `+${vaultState.config.rew_memory ?? 15} 🪙`;
  document.getElementById("tag-reward-quiz").textContent = `+${vaultState.config.rew_quiz ?? 12} 🪙`;
  document.getElementById("tag-reward-reflex").textContent = `+${vaultState.config.rew_reflex ?? 10} 🪙`;
}

document.getElementById("btn-claim-afk").addEventListener("click", async () => {
  if (afkClaimSecondsLeft <= 0 || !vaultState.currentUser) return;
  afkClaimSecondsLeft = 0;
  afkProgressSec = 0;
  document.getElementById("btn-claim-afk").classList.add("hidden");
  document.getElementById("afk-progress-bar").style.width = "0%";

  const reward = Number(vaultState.config.afk_reward || 10);
  await adjustUserCoinsInDb(vaultState.currentUser.id, reward);
  document.getElementById("afk-timer-text").textContent = `¡Recibiste +${reward} 🪙 por presencia activa!`;
});

// ============================================================================
// AETHER VAULT • MOTOR JAVASCRIPT (BLOQUE 2B: JUEGOS, REGALOS Y AJUSTES)
// ============================================================================

// --- MÓDULOS DE GANANCIA (DEFENSA, ACERTIJOS, MEMORIA, CULTURA/MATES, REFLEJOS) ---
document.querySelectorAll("#earn-modules-tabs .mod-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#earn-modules-tabs .mod-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".earn-module").forEach((m) => m.classList.add("hidden"));
    document.getElementById(btn.dataset.mod).classList.remove("hidden");
  });
});

function renderChallengeModules() {
  updateAfkLabels();
  renderRiddleCard();
  renderQuizCard();
  buildEarnMemoryBoard();
}

// 1) Defensa por Carriles (Canvas)
let selectedTurretType = "pulse";
let defenseLoopId = null;
let defenseActive = false;

document.querySelectorAll(".turret-pick").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".turret-pick").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedTurretType = btn.dataset.turret;
  });
});

document.getElementById("btn-start-defense").addEventListener("click", () => {
  if (defenseActive) return;
  startDefenseGame();
});

function startDefenseGame() {
  const canvas = document.getElementById("defense-canvas");
  const ctx = canvas.getContext("2d");
  const msgEl = document.getElementById("msg-defense");
  showMsg(msgEl, "Batalla iniciada. Haz clic en las casillas de la cuadrícula para colocar torretas.", true);

  const rows = 3;
  const cols = 7;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  let energy = 100;
  let hp = 100;
  let wave = 1;
  let enemiesSpawnedInWave = 0;
  let spawnCooldown = 45;
  let genTick = 0;
  defenseActive = true;

  const turrets = [];
  const enemies = [];
  const bolts = [];

  const costs = { pulse: 40, frost: 60, generator: 35 };

  function syncHud() {
    document.getElementById("def-energy").textContent = String(Math.floor(energy));
    document.getElementById("def-wave").textContent = `${wave} / 3`;
    document.getElementById("def-hp").textContent = `${Math.max(0, Math.floor(hp))}%`;
  }

  function handleCanvasClick(ev) {
    if (!defenseActive) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;

    const c = Math.floor(x / cellW);
    const r = Math.floor(y / cellH);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (turrets.some((t) => t.r === r && t.c === c)) return;

    const cost = costs[selectedTurretType] || 40;
    if (energy < cost) {
      showMsg(msgEl, `Necesitas ${cost} ⚡ de energía para esa torreta.`);
      return;
    }

    energy -= cost;
    turrets.push({
      r,
      c,
      type: selectedTurretType,
      cooldown: 0,
      genTimer: 0
    });
    syncHud();
  }

  canvas.onclick = handleCanvasClick;

  if (defenseLoopId) cancelAnimationFrame(defenseLoopId);

  function step() {
    if (!defenseActive) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dibujar cuadrícula táctica
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
        ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
      }
    }

    genTick++;
    if (genTick % 90 === 0) {
      energy = Math.min(200, energy + 8);
    }

    // Torretas
    turrets.forEach((t) => {
      const cx = t.c * cellW + cellW / 2;
      const cy = t.r * cellH + cellH / 2;

      if (t.type === "generator") {
        ctx.fillStyle = "#38bdf8";
        t.genTimer++;
        if (t.genTimer >= 160) {
          t.genTimer = 0;
          energy = Math.min(200, energy + 15);
        }
      } else if (t.type === "frost") {
        ctx.fillStyle = "#60a5fa";
      } else {
        ctx.fillStyle = "#0ea5e9";
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();

      if (t.type !== "generator") {
        t.cooldown--;
        const hasTarget = enemies.some((en) => en.r === t.r && en.x > cx);
        if (hasTarget && t.cooldown <= 0) {
          t.cooldown = t.type === "frost" ? 55 : 36;
          bolts.push({
            r: t.r,
            x: cx + 18,
            y: cy,
            slow: t.type === "frost"
          });
        }
      }
    });

    // Generar oleadas
    const maxPerWave = wave * 4 + 2;
    spawnCooldown--;
    if (enemiesSpawnedInWave < maxPerWave && spawnCooldown <= 0) {
      enemiesSpawnedInWave++;
      spawnCooldown = Math.max(48, 95 - wave * 12);
      const lane = Math.floor(Math.random() * rows);
      enemies.push({
        r: lane,
        x: canvas.width + 16,
        y: lane * cellH + cellH / 2,
        hp: 40 + wave * 15,
        speed: 0.75 + wave * 0.12,
        slowTimer: 0
      });
    }

    // Proyectiles
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += 6.5;
      ctx.fillStyle = b.slow ? "#bae6fd" : "#7dd3fc";
      ctx.fillRect(b.x - 6, b.y - 3, 12, 6);

      let hit = false;
      for (const en of enemies) {
        if (en.r === b.r && Math.abs(en.x - b.x) < 18) {
          en.hp -= 20;
          if (b.slow) en.slowTimer = 90;
          hit = true;
          break;
        }
      }
      if (hit || b.x > canvas.width) bolts.splice(i, 1);
    }

    // Enemigos
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (en.hp <= 0) {
        enemies.splice(i, 1);
        energy = Math.min(200, energy + 6);
        continue;
      }
      let curSpeed = en.speed;
      if (en.slowTimer > 0) {
        en.slowTimer--;
        curSpeed *= 0.45;
      }
      en.x -= curSpeed;

      ctx.fillStyle = en.slowTimer > 0 ? "#818cf8" : "#f43f5e";
      ctx.beginPath();
      ctx.arc(en.x, en.y, 15, 0, Math.PI * 2);
      ctx.fill();

      if (en.x < 12) {
        enemies.splice(i, 1);
        hp -= 25;
        if (hp <= 0) {
          defenseActive = false;
          syncHud();
          showMsg(msgEl, "El núcleo perdió su energía. ¡Inténtalo de nuevo!");
          return;
        }
      }
    }

    // Avance de oleadas o victoria
    if (enemiesSpawnedInWave >= maxPerWave && enemies.length === 0) {
      if (wave < 3) {
        wave++;
        enemiesSpawnedInWave = 0;
        spawnCooldown = 50;
        showMsg(msgEl, `¡Oleada ${wave} de 3 en camino!`, true);
      } else {
        defenseActive = false;
        syncHud();
        const rew = Number(vaultState.config.rew_defense ?? 25);
        adjustUserCoinsInDb(vaultState.currentUser.id, rew);
        showMsg(msgEl, `¡Victoria total! Ganaste +${rew} 🪙.`, true);
        return;
      }
    }

    syncHud();
    defenseLoopId = requestAnimationFrame(step);
  }

  defenseLoopId = requestAnimationFrame(step);
}

// 2) Acertijos de Lógica
function renderRiddleCard() {
  const box = document.getElementById("riddle-box");
  const riddles = vaultState.challenges.filter((c) => c.type === "riddle");
  if (!riddles.length) {
    box.innerHTML = `<p class="muted">No hay acertijos configurados aún.</p>`;
    return;
  }
  const item = riddles[Math.floor(Math.random() * riddles.length)];
  box.innerHTML = `
    <p><strong>${escapeHtml(item.question)}</strong></p>
    <div class="input-row" style="margin-top:10px;">
      <input type="text" id="inp-riddle-ans" placeholder="Escribe tu respuesta..." autocomplete="off" />
      <button type="button" class="btn btn-primary btn-sm" id="btn-check-riddle" style="width:auto;margin-top:0;">Responder</button>
    </div>
  `;
  document.getElementById("btn-check-riddle").addEventListener("click", async () => {
    const val = document.getElementById("inp-riddle-ans").value.trim().toLowerCase();
    const expected = String(item.answer || "").trim().toLowerCase();
    const msg = document.getElementById("msg-riddles");
    if (!val) return;
    if (val === expected || val.includes(expected)) {
      const rew = Number(vaultState.config.rew_riddles ?? 15);
      await adjustUserCoinsInDb(vaultState.currentUser.id, rew);
      showMsg(msg, `¡Correcto! Ganaste +${rew} 🪙.`, true);
      renderRiddleCard();
    } else {
      showMsg(msg, "Respuesta incorrecta. Prueba con otro acertijo.");
      renderRiddleCard();
    }
  });
}

// 3) Secuencia de Memoria
let memSeq = [];
let memStep = 0;
let memLocked = true;

function buildEarnMemoryBoard() {
  const grid = document.getElementById("earn-memory-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "mem-tile";
    tile.dataset.idx = String(i);
    tile.textContent = String(i + 1);
    tile.addEventListener("click", () => handleMemClick(i));
    grid.appendChild(tile);
  }
}

function playMemSequence() {
  memLocked = true;
  memStep = 0;
  memSeq.forEach((idx, i) => {
    setTimeout(() => {
      const el = document.querySelector(`#earn-memory-grid .mem-tile[data-idx="${idx}"]`);
      if (!el) return;
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 340);
      if (i === memSeq.length - 1) {
        setTimeout(() => {
          memLocked = false;
          showMsg(document.getElementById("msg-memory"), "Tu turno: repite la secuencia.", true);
        }, 420);
      }
    }, (i + 1) * 550);
  });
}

async function handleMemClick(idx) {
  if (memLocked) return;
  const msg = document.getElementById("msg-memory");
  if (idx !== memSeq[memStep]) {
    memLocked = true;
    showMsg(msg, "Fallaste la secuencia. Pulsa Iniciar Secuencia para intentar de nuevo.");
    return;
  }
  memStep++;
  if (memStep >= memSeq.length) {
    memLocked = true;
    const rew = Number(vaultState.config.rew_memory ?? 15);
    await adjustUserCoinsInDb(vaultState.currentUser.id, rew);
    showMsg(msg, `¡Secuencia perfecta! Ganaste +${rew} 🪙.`, true);
  }
}

document.getElementById("btn-start-memory").addEventListener("click", () => {
  memSeq = [
    Math.floor(Math.random() * 9),
    Math.floor(Math.random() * 9),
    Math.floor(Math.random() * 9),
    Math.floor(Math.random() * 9)
  ];
  showMsg(document.getElementById("msg-memory"), "Observa el patrón...", true);
  playMemSequence();
});

// 4) Preguntas de Cultura y Matemáticas Rápidas
function renderQuizCard() {
  const box = document.getElementById("quiz-box");
  const quizzes = vaultState.challenges.filter((c) => c.type === "quiz");
  if (!quizzes.length) {
    box.innerHTML = `<p class="muted">No hay preguntas configuradas aún.</p>`;
    return;
  }
  const item = quizzes[Math.floor(Math.random() * quizzes.length)];
  const opts = Array.isArray(item.options) && item.options.length > 0 ? item.options : [item.answer];

  box.innerHTML = `
    <p><strong>${escapeHtml(item.question)}</strong></p>
    <div class="quiz-options">
      ${opts
        .map(
          (op) =>
            `<button type="button" class="btn btn-secondary btn-sm quiz-opt-btn" data-ans="${escapeHtml(op)}">${escapeHtml(op)}</button>`
        )
        .join("")}
    </div>
  `;

  box.querySelectorAll(".quiz-opt-btn").forEach((b) => {
    b.addEventListener("click", async () => {
      const msg = document.getElementById("msg-quiz");
      if (b.dataset.ans.trim().toLowerCase() === String(item.answer || "").trim().toLowerCase()) {
        const rew = Number(vaultState.config.rew_quiz ?? 12);
        await adjustUserCoinsInDb(vaultState.currentUser.id, rew);
        showMsg(msg, `¡Respuesta correcta! Ganaste +${rew} 🪙.`, true);
      } else {
        showMsg(msg, "Incorrecto. Intenta con otra pregunta.");
      }
      renderQuizCard();
    });
  });
}

// 5) Prueba de Reflejos
let reflexState = "idle";
let reflexWaitTimer = null;
let reflexStartTime = 0;

document.getElementById("btn-reflex-pad").addEventListener("click", async () => {
  const pad = document.getElementById("btn-reflex-pad");
  const msg = document.getElementById("msg-reflex");

  if (reflexState === "idle") {
    reflexState = "waiting";
    pad.className = "reflex-pad waiting";
    pad.textContent = "Espera a que se ilumine en azul brillante... ¡no pulses antes!";
    showMsg(msg, "");
    const delay = 1200 + Math.floor(Math.random() * 2200);
    reflexWaitTimer = setTimeout(() => {
      reflexState = "go";
      pad.className = "reflex-pad go";
      pad.textContent = "⚡ ¡PULSA AHORA! ⚡";
      reflexStartTime = performance.now();
    }, delay);
  } else if (reflexState === "waiting") {
    clearTimeout(reflexWaitTimer);
    reflexState = "idle";
    pad.className = "reflex-pad idle";
    pad.textContent = "Te adelantaste. Pulsa aquí para reiniciar.";
    showMsg(msg, "Pulsa solo cuando cambie a azul brillante.");
  } else if (reflexState === "go") {
    const ms = Math.round(performance.now() - reflexStartTime);
    reflexState = "idle";
    pad.className = "reflex-pad idle";
    pad.textContent = `Tiempo: ${ms} ms • Pulsa para jugar otra vez`;
    if (ms <= 750) {
      const rew = Number(vaultState.config.rew_reflex ?? 10);
      await adjustUserCoinsInDb(vaultState.currentUser.id, rew);
      showMsg(msg, `¡Gran reflejo (${ms} ms)! Ganaste +${rew} 🪙.`, true);
    } else {
      showMsg(msg, `Tu tiempo fue ${ms} ms (necesitas 750 ms o menos para ganar el bono).`);
    }
  }
});

// --- REGALAR MONEDAS ENTRE USUARIOS ---
document.getElementById("form-gift-coins").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg-gift");
  const targetUser = document.getElementById("inp-gift-to").value.trim().toLowerCase();
  const amount = Number(document.getElementById("inp-gift-amount").value);
  const maxGift = Number(vaultState.config.max_gift ?? 500);

  if (!sbClient || !vaultState.currentUser) return;
  if (!targetUser || targetUser === vaultState.currentUser.username) {
    showMsg(msg, "Ingresa un nombre de usuario válido distinto al tuyo.");
    return;
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    showMsg(msg, "Ingresa una cantidad entera mayor a 0.");
    return;
  }
  if (amount > maxGift) {
    showMsg(msg, `El máximo permitido por envío es ${maxGift} 🪙.`);
    return;
  }

  await refreshCurrentUserFromDb();
  if (Number(vaultState.currentUser.coins || 0) < amount) {
    showMsg(msg, "No tienes suficientes monedas para regalar esa cantidad.");
    return;
  }

  const { data: receiver } = await sbClient
    .from("aether_users")
    .select("id, username, coins")
    .eq("username", targetUser)
    .maybeSingle();

  if (!receiver) {
    showMsg(msg, "No existe ningún usuario registrado con ese nombre.");
    return;
  }

  await adjustUserCoinsInDb(vaultState.currentUser.id, -amount);
  await adjustUserCoinsInDb(receiver.id, amount);

  document.getElementById("inp-gift-to").value = "";
  document.getElementById("inp-gift-amount").value = "";
  showMsg(msg, `Enviaste ${amount} 🪙 a @${receiver.username}.`, true);
});

// --- MIS CANJES ---
function renderMyPurchases() {
  const listEl = document.getElementById("my-purchases-list");
  if (!vaultState.purchases.length) {
    listEl.innerHTML = `<p class="muted small">Aún no has desbloqueado ningún producto.</p>`;
    return;
  }
  listEl.innerHTML = vaultState.purchases
    .map(
      (pu) => `
      <div class="list-item-card">
        <div>
          <strong>${escapeHtml(pu.product_title)}</strong>
          <div class="tiny muted">${escapeHtml(pu.delivery_url)} • (${escapeHtml(pu.method)})</div>
        </div>
        <a class="btn btn-primary btn-sm" href="${escapeHtml(pu.delivery_url)}" target="_blank" rel="noopener noreferrer">Abrir</a>
      </div>
    `
    )
    .join("");
}

// --- CONFIGURACIÓN VISUAL DEL USUARIO (TUERCA) ---
document.getElementById("btn-open-settings").addEventListener("click", () => {
  document.querySelectorAll(".app-view").forEach((v) => v.classList.add("hidden"));
  document.getElementById("view-settings").classList.remove("hidden");
  initSettingsScreen();
});

document.getElementById("btn-close-settings").addEventListener("click", () => {
  document.getElementById("view-settings").classList.add("hidden");
  document.getElementById("view-shop").classList.remove("hidden");
  document.querySelectorAll("#main-nav .nav-tab").forEach((b, i) => b.classList.toggle("active", i === 0));
});

function initSettingsScreen() {
  const u = vaultState.currentUser;
  if (!u) return;
  selectedSetAvatar = u.avatar || PRESET_AVATARS[0];
  renderAvatarElement(document.getElementById("set-avatar-preview"), selectedSetAvatar);

  buildPresetGrid("set-preset-grid", (av) => {
    selectedSetAvatar = av;
    renderAvatarElement(document.getElementById("set-avatar-preview"), av);
  });

  document.querySelectorAll(".theme-opt").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.settheme === (u.theme || "dark"));
  });

  document.querySelectorAll(".accent-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.setaccent === (u.accent || "cyan"));
  });
}

document.querySelectorAll(".theme-opt").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const theme = btn.dataset.settheme;
    document.querySelectorAll(".theme-opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (vaultState.currentUser && sbClient) {
      vaultState.currentUser.theme = theme;
      applyUserThemeAndAccent(vaultState.currentUser);
      await sbClient.from("aether_users").update({ theme }).eq("id", vaultState.currentUser.id);
    }
  });
});

document.querySelectorAll(".accent-swatch").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const accent = btn.dataset.setaccent;
    document.querySelectorAll(".accent-swatch").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (vaultState.currentUser && sbClient) {
      vaultState.currentUser.accent = accent;
      applyUserThemeAndAccent(vaultState.currentUser);
      await sbClient.from("aether_users").update({ accent }).eq("id", vaultState.currentUser.id);
    }
  });
});

document.getElementById("inp-set-photo").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const tinyData = await compressImageToTinyDataUrl(file, 96, 0.52);
  selectedSetAvatar = tinyData;
  renderAvatarElement(document.getElementById("set-avatar-preview"), tinyData);
});

document.getElementById("btn-save-avatar").addEventListener("click", async () => {
  const msg = document.getElementById("msg-settings");
  if (!sbClient || !vaultState.currentUser) return;
  const { error } = await sbClient
    .from("aether_users")
    .update({ avatar: selectedSetAvatar })
    .eq("id", vaultState.currentUser.id);

  if (error) {
    showMsg(msg, "No se pudo guardar el avatar.");
    return;
  }
  vaultState.currentUser.avatar = selectedSetAvatar;
  updateHudBar();
  showMsg(msg, "Avatar actualizado.", true);
});

// ============================================================================
// AETHER VAULT • MOTOR JAVASCRIPT (BLOQUE 3 DE 3: DOS ADMINS, SYNC Y ARRANQUE)
// ============================================================================

let admin1Authenticated = false;
let admin2Authenticated = false;
let principalTapCount = 0;
let principalTapTimer = null;
let activitySyncTimerId = null;

// --- ACCESO ADMINISTRADOR NIVEL 1 (BÁSICO: PIDE CLAVE CADA VEZ) ---
function openAdmin1Login() {
  admin1Authenticated = false;
  document.getElementById("inp-admin1-pass").value = "";
  showMsg(document.getElementById("msg-admin1-login"), "");
  document.getElementById("modal-admin1-login").classList.remove("hidden");
}

document.getElementById("admin-basic-trigger").addEventListener("click", () => {
  if (!vaultState.currentUser) return;
  openAdmin1Login();
});

document.getElementById("secret-trigger-gate").addEventListener("click", () => {
  openAdmin1Login();
});

document.getElementById("btn-cancel-admin1").addEventListener("click", () => {
  document.getElementById("modal-admin1-login").classList.add("hidden");
});

document.getElementById("form-admin1-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg-admin1-login");
  const pass = document.getElementById("inp-admin1-pass").value.trim();

  await loadVaultCatalogAndConfig();
  const expected = String(vaultState.config.admin1_key || "").trim();

  if (pass !== expected) {
    showMsg(msg, "Clave de Administrador Básico incorrecta.");
    return;
  }

  admin1Authenticated = true;
  document.getElementById("modal-admin1-login").classList.add("hidden");
  resetProductAdminForm();
  renderAdmin1ProductsList();
  document.getElementById("modal-admin1-panel").classList.remove("hidden");
});

document.getElementById("btn-close-admin1-panel").addEventListener("click", () => {
  admin1Authenticated = false;
  document.getElementById("modal-admin1-panel").classList.add("hidden");
});

// --- CRUD DE PRODUCTOS (ADMINISTRADOR BÁSICO) ---
function resetProductAdminForm() {
  document.getElementById("adm-prod-id").value = "";
  document.getElementById("adm-prod-title").value = "";
  document.getElementById("adm-prod-desc").value = "";
  document.getElementById("adm-prod-price").value = "";
  document.getElementById("adm-prod-stock").value = "-1";
  document.getElementById("adm-prod-cover-type").value = "emoji";
  document.getElementById("adm-prod-cover-value").value = "";
  document.getElementById("adm-prod-link").value = "";
  document.getElementById("adm-prod-vip").value = "";
  document.getElementById("btn-cancel-prod-edit").classList.add("hidden");
}

document.getElementById("btn-cancel-prod-edit").addEventListener("click", resetProductAdminForm);

document.getElementById("form-product-admin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg-admin1-prod");
  if (!admin1Authenticated || !sbClient) return;

  const editId = document.getElementById("adm-prod-id").value.trim();
  const payload = {
    title: document.getElementById("adm-prod-title").value.trim(),
    description: document.getElementById("adm-prod-desc").value.trim(),
    price: Math.max(0, Number(document.getElementById("adm-prod-price").value || 0)),
    stock: Number(document.getElementById("adm-prod-stock").value ?? -1),
    cover_type: document.getElementById("adm-prod-cover-type").value,
    cover_value: document.getElementById("adm-prod-cover-value").value.trim(),
    delivery_url: document.getElementById("adm-prod-link").value.trim(),
    vip_code: document.getElementById("adm-prod-vip").value.trim().toUpperCase()
  };

  if (!payload.title || !payload.cover_value || !payload.delivery_url) {
    showMsg(msg, "Completa título, portada y enlace.");
    return;
  }

  let err = null;
  if (editId) {
    const res = await sbClient.from("aether_products").update(payload).eq("id", editId);
    err = res.error;
  } else {
    const res = await sbClient.from("aether_products").insert(payload);
    err = res.error;
  }

  if (err) {
    showMsg(msg, "Error al guardar producto en Supabase.");
    return;
  }

  resetProductAdminForm();
  await loadVaultCatalogAndConfig();
  renderAdmin1ProductsList();
  renderShopGrid();
  showMsg(msg, editId ? "Producto actualizado." : "Producto publicado en la tienda.", true);
});

function renderAdmin1ProductsList() {
  const listEl = document.getElementById("admin1-products-list");
  if (!vaultState.products.length) {
    listEl.innerHTML = `<p class="muted small">No hay productos creados aún.</p>`;
    return;
  }

  listEl.innerHTML = vaultState.products
    .map(
      (p) => `
      <div class="list-item-card">
        <div>
          <strong>${escapeHtml(p.title)}</strong>
          <div class="tiny muted">
            ${Number(p.price || 0)} 🪙 • Stock: ${Number(p.stock) < 0 ? "Ilimitado" : p.stock}
            ${p.vip_code ? `• VIP: ${escapeHtml(p.vip_code)}` : ""}
          </div>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary btn-sm btn-edit-p" data-id="${escapeHtml(p.id)}">Editar</button>
          <button type="button" class="btn btn-logout-red btn-sm btn-del-p" data-id="${escapeHtml(p.id)}">Borrar</button>
        </div>
      </div>
    `
    )
    .join("");

  listEl.querySelectorAll(".btn-edit-p").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = vaultState.products.find((x) => String(x.id) === String(btn.dataset.id));
      if (!p) return;
      document.getElementById("adm-prod-id").value = p.id;
      document.getElementById("adm-prod-title").value = p.title || "";
      document.getElementById("adm-prod-desc").value = p.description || "";
      document.getElementById("adm-prod-price").value = p.price ?? 0;
      document.getElementById("adm-prod-stock").value = p.stock ?? -1;
      document.getElementById("adm-prod-cover-type").value = p.cover_type || "emoji";
      document.getElementById("adm-prod-cover-value").value = p.cover_value || "";
      document.getElementById("adm-prod-link").value = p.delivery_url || "";
      document.getElementById("adm-prod-vip").value = p.vip_code || "";
      document.getElementById("btn-cancel-prod-edit").classList.remove("hidden");
    });
  });

  listEl.querySelectorAll(".btn-del-p").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!sbClient) return;
      await sbClient.from("aether_products").delete().eq("id", btn.dataset.id);
      await loadVaultCatalogAndConfig();
      renderAdmin1ProductsList();
      renderShopGrid();
    });
  });
}

// --- DISPARADOR OCULTO (5 TOQUES) HACIA ADMINISTRADOR PRINCIPAL ---
document.getElementById("trigger-admin-principal").addEventListener("click", () => {
  if (!admin1Authenticated) return;
  principalTapCount++;
  clearTimeout(principalTapTimer);
  principalTapTimer = setTimeout(() => {
    principalTapCount = 0;
  }, 1800);

  if (principalTapCount >= 5) {
    principalTapCount = 0;
    admin2Authenticated = false;
    document.getElementById("inp-admin2-pass").value = "";
    showMsg(document.getElementById("msg-admin2-login"), "");
    document.getElementById("modal-admin2-login").classList.remove("hidden");
  }
});

document.getElementById("btn-cancel-admin2").addEventListener("click", () => {
  document.getElementById("modal-admin2-login").classList.add("hidden");
});

document.getElementById("form-admin2-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg-admin2-login");
  const pass = document.getElementById("inp-admin2-pass").value.trim();

  await loadVaultCatalogAndConfig();
  const expected = String(vaultState.config.admin2_key || "").trim();

  if (pass !== expected) {
    showMsg(msg, "Clave de Administrador Principal incorrecta.");
    return;
  }

  admin2Authenticated = true;
  document.getElementById("modal-admin2-login").classList.add("hidden");
  fillEconomyInputs();
  renderAdmin2Challenges();
  await renderAdmin2UsersList();
  document.getElementById("modal-admin2-panel").classList.remove("hidden");
});

document.getElementById("btn-close-admin2-panel").addEventListener("click", () => {
  admin2Authenticated = false;
  document.getElementById("modal-admin2-panel").classList.add("hidden");
});

document.querySelectorAll("#admin2-tabs .mod-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!admin2Authenticated) return;
    document.querySelectorAll("#admin2-tabs .mod-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".adm2-section").forEach((s) => s.classList.add("hidden"));
    document.getElementById(btn.dataset.adm2).classList.remove("hidden");
    if (btn.dataset.adm2 === "adm2-users") await renderAdmin2UsersList();
  });
});

// --- ADMIN PRINCIPAL TAB 1: ECONOMÍA ---
function fillEconomyInputs() {
  const c = vaultState.config;
  document.getElementById("cfg-afk-reward").value = c.afk_reward ?? 10;
  document.getElementById("cfg-afk-seconds").value = c.afk_seconds ?? 120;
  document.getElementById("cfg-rew-defense").value = c.rew_defense ?? 25;
  document.getElementById("cfg-rew-riddles").value = c.rew_riddles ?? 15;
  document.getElementById("cfg-rew-memory").value = c.rew_memory ?? 15;
  document.getElementById("cfg-rew-quiz").value = c.rew_quiz ?? 12;
  document.getElementById("cfg-rew-reflex").value = c.rew_reflex ?? 10;
  document.getElementById("cfg-max-gift").value = c.max_gift ?? 500;
}

document.getElementById("form-economy-rules").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg-adm2-eco");
  if (!admin2Authenticated || !sbClient) return;

  const updates = {
    afk_reward: Math.max(1, Number(document.getElementById("cfg-afk-reward").value || 10)),
    afk_seconds: Math.max(15, Number(document.getElementById("cfg-afk-seconds").value || 120)),
    rew_defense: Math.max(1, Number(document.getElementById("cfg-rew-defense").value || 25)),
    rew_riddles: Math.max(1, Number(document.getElementById("cfg-rew-riddles").value || 15)),
    rew_memory: Math.max(1, Number(document.getElementById("cfg-rew-memory").value || 15)),
    rew_quiz: Math.max(1, Number(document.getElementById("cfg-rew-quiz").value || 12)),
    rew_reflex: Math.max(1, Number(document.getElementById("cfg-rew-reflex").value || 10)),
    max_gift: Math.max(1, Number(document.getElementById("cfg-max-gift").value || 500))
  };

  const { error } = await sbClient.from("aether_config").update(updates).eq("id", 1);
  if (error) {
    showMsg(msg, "No se pudo guardar la configuración económica.");
    return;
  }

  vaultState.config = { ...vaultState.config, ...updates };
  updateHudBar();
  updateAfkLabels();
  showMsg(msg, "Equilibrio económico guardado.", true);
});

// --- ADMIN PRINCIPAL TAB 2: RETOS Y PREGUNTAS ---
document.getElementById("form-add-challenge").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg-adm2-ch");
  if (!admin2Authenticated || !sbClient) return;

  const type = document.getElementById("adm-ch-type").value;
  const question = document.getElementById("adm-ch-question").value.trim();
  const answer = document.getElementById("adm-ch-answer").value.trim();
  const rawOpts = document.getElementById("adm-ch-options").value.trim();
  const options =
    type === "quiz" && rawOpts
      ? rawOpts.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (!question || !answer) return;

  const { error } = await sbClient.from("aether_challenges").insert({
    type,
    question,
    answer,
    options
  });

  if (error) {
    showMsg(msg, "No se pudo guardar el reto.");
    return;
  }

  document.getElementById("adm-ch-question").value = "";
  document.getElementById("adm-ch-answer").value = "";
  document.getElementById("adm-ch-options").value = "";
  await loadVaultCatalogAndConfig();
  renderAdmin2Challenges();
  renderChallengeModules();
  showMsg(msg, "Reto agregado correctamente.", true);
});

function renderAdmin2Challenges() {
  const listEl = document.getElementById("adm2-challenges-list");
  if (!vaultState.challenges.length) {
    listEl.innerHTML = `<p class="muted small">Sin retos registrados.</p>`;
    return;
  }
  listEl.innerHTML = vaultState.challenges
    .map(
      (c) => `
      <div class="list-item-card">
        <div>
          <strong>[${c.type === "riddle" ? "Acertijo" : "Cultura/Mates"}] ${escapeHtml(c.question)}</strong>
          <div class="tiny muted">Respuesta: ${escapeHtml(c.answer)}</div>
        </div>
        <button type="button" class="btn btn-logout-red btn-sm btn-del-ch" data-id="${escapeHtml(c.id)}">Borrar</button>
      </div>
    `
    )
    .join("");

  listEl.querySelectorAll(".btn-del-ch").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!sbClient) return;
      await sbClient.from("aether_challenges").delete().eq("id", btn.dataset.id);
      await loadVaultCatalogAndConfig();
      renderAdmin2Challenges();
      renderChallengeModules();
    });
  });
}

// --- ADMIN PRINCIPAL TAB 3: USUARIOS, CONEXIONES Y MONEDAS ---
async function renderAdmin2UsersList() {
  const listEl = document.getElementById("adm2-users-list");
  if (!sbClient || !admin2Authenticated) return;

  const { data: users } = await sbClient
    .from("aether_users")
    .select("id, username, avatar, coins, last_seen, created_at")
    .order("created_at", { ascending: false });

  if (!users || !users.length) {
    listEl.innerHTML = `<p class="muted small">No hay usuarios registrados.</p>`;
    return;
  }

  listEl.innerHTML = users
    .map((u) => {
      const seenLabel = u.last_seen
        ? new Date(u.last_seen).toLocaleString()
        : "Sin registro reciente";
      return `
        <div class="list-item-card">
          <div>
            <strong>@${escapeHtml(u.username)}</strong>
            <div class="tiny muted">Última actividad: ${escapeHtml(seenLabel)}</div>
          </div>
          <div class="input-row" style="margin:0;">
            <input type="number" class="coin-set-input" data-uid="${escapeHtml(u.id)}" value="${Number(u.coins || 0)}" style="width:95px;margin:0;" />
            <button type="button" class="btn btn-secondary btn-sm btn-save-coins" data-uid="${escapeHtml(u.id)}">Guardar 🪙</button>
            <button type="button" class="btn btn-logout-red btn-sm btn-del-user" data-uid="${escapeHtml(u.id)}">Eliminar</button>
          </div>
        </div>
      `;
    })
    .join("");

  listEl.querySelectorAll(".btn-save-coins").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.uid;
      const inp = listEl.querySelector(`.coin-set-input[data-uid="${uid}"]`);
      const nextCoins = Math.max(0, Number(inp.value || 0));
      await sbClient.from("aether_users").update({ coins: nextCoins }).eq("id", uid);
      if (vaultState.currentUser && String(vaultState.currentUser.id) === String(uid)) {
        vaultState.currentUser.coins = nextCoins;
        updateHudBar();
      }
      showMsg(document.getElementById("msg-adm2-users"), "Saldo actualizado silenciosamente.", true);
    });
  });

  listEl.querySelectorAll(".btn-del-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.uid;
      await sbClient.from("aether_purchases").delete().eq("user_id", uid);
      await sbClient.from("aether_users").delete().eq("id", uid);
      if (vaultState.currentUser && String(vaultState.currentUser.id) === String(uid)) {
        forceSignOutClean();
      }
      await renderAdmin2UsersList();
      showMsg(document.getElementById("msg-adm2-users"), "Cuenta eliminada de la base de datos.", true);
    });
  });
}

document.getElementById("btn-refresh-users").addEventListener("click", renderAdmin2UsersList);

// --- ADMIN PRINCIPAL TAB 4: CAMBIO DE CLAVES ---
document.getElementById("form-update-keys").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg-adm2-keys");
  if (!admin2Authenticated || !sbClient) return;

  const kUniv = document.getElementById("new-key-universal").value.trim();
  const kAdm1 = document.getElementById("new-key-admin1").value.trim();
  const kAdm2 = document.getElementById("new-key-admin2").value.trim();

  const patch = {};
  if (kUniv) patch.universal_key = kUniv;
  if (kAdm1) patch.admin1_key = kAdm1;
  if (kAdm2) patch.admin2_key = kAdm2;

  if (Object.keys(patch).length === 0) {
    showMsg(msg, "Escribe al menos una clave nueva para actualizar.");
    return;
  }

  const { error } = await sbClient.from("aether_config").update(patch).eq("id", 1);
  if (error) {
    showMsg(msg, "No se pudieron actualizar las claves.");
    return;
  }

  vaultState.config = { ...vaultState.config, ...patch };
  document.getElementById("new-key-universal").value = "";
  document.getElementById("new-key-admin1").value = "";
  document.getElementById("new-key-admin2").value = "";
  showMsg(msg, "Claves actualizadas en la base de datos.", true);
});

// --- ACTUALIZACIÓN PERIÓDICA DE ACTIVIDAD CADA 10 MINUTOS ---
function startActivityHeartbeat() {
  if (activitySyncTimerId) clearInterval(activitySyncTimerId);
  activitySyncTimerId = setInterval(async () => {
    if (!sbClient || !vaultState.currentUser) return;
    await sbClient
      .from("aether_users")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", vaultState.currentUser.id);
  }, 10 * 60 * 1000);
}

// --- ARRANQUE INICIAL ---
(async function bootAetherVault() {
  await loadVaultCatalogAndConfig();
  startActivityHeartbeat();

  const cachedSessionRaw = localStorage.getItem(SESSION_CACHE_KEY);
  const gatePassed = localStorage.getItem(UNIVERSAL_CACHE_KEY) === "1";

  if (cachedSessionRaw && sbClient) {
    try {
      const parsed = JSON.parse(cachedSessionRaw);
      if (parsed?.id) {
        const { data: uRow } = await sbClient
          .from("aether_users")
          .select("*")
          .eq("id", parsed.id)
          .maybeSingle();
        if (uRow) {
          await enterVaultSession(uRow);
          return;
        }
      }
    } catch (_) {}
    localStorage.removeItem(SESSION_CACHE_KEY);
  }

  if (gatePassed) {
    vaultState.universalPassed = true;
    showAuthScreen();
  } else {
    showGateScreen();
  }
})();
