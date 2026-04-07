const TOKEN_KEY = "zen-workspace-token";
const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const CLIENT_NAVIGATION_ROUTES = new Set([
  "/",
  "/login",
  "/dashboard",
  "/schedule",
  "/tasks",
  "/tasks/new",
  "/notes",
  "/profile",
  "/profile/edit",
  "/settings",
  "/settings/preferences",
  "/settings/security"
]);
const state = {
  token: window.localStorage.getItem(TOKEN_KEY),
  user: null,
  profile: null,
  tasks: [],
  selectedTask: null,
  taskFilter: "all",
  taskComposerDraft: {
    message: "",
    emoji: "",
    imageUrl: "",
    linkUrl: "",
    fileLabel: ""
  },
  taskComposerEmojiOpen: false,
  taskEditorMode: "edit",
  taskEditorTargetId: null,
  taskEditorPriority: "medium",
  taskEditorSubtasks: [],
  taskEditorTagIds: new Set(),
  scheduleView: "month",
  scheduleDate: "",
  scheduleSelectedDate: "",
  scheduleItems: [],
  dashboardPulsePeriod: "week",
  dashboardPulseMetric: "completed",
  notes: [],
  selectedNote: null,
  noteComposerMode: "create",
  noteComposerTargetId: null,
  meta: {
    projects: [],
    tags: []
  }
};
let googleIdentityScriptPromise = null;

function defaultTaskComposerDraft() {
  return {
    message: "",
    emoji: "",
    imageUrl: "",
    linkUrl: "",
    fileLabel: ""
  };
}

document.addEventListener("DOMContentLoaded", () => {
  ensureGlobalInteractionStyles();
  setupClientNavigation();
  initializePage().catch((error) => {
    console.error(error);
    showPageMessage(error.message || "Something went wrong.", "error");
  });
});

function ensureGlobalInteractionStyles() {
  if (document.getElementById("zen-workspace-interaction-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "zen-workspace-interaction-style";
  style.textContent = `
    a,
    button,
    input,
    textarea,
    select,
    [role="button"] {
      -webkit-tap-highlight-color: transparent;
    }

    a:focus,
    button:focus,
    input:focus,
    textarea:focus,
    select:focus,
    [role="button"]:focus {
      outline: none !important;
      box-shadow: none !important;
    }

    a:focus-visible,
    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible,
    [role="button"]:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function canHandleClientNavigation(url) {
  return url.origin === window.location.origin && CLIENT_NAVIGATION_ROUTES.has(normalizePathname(url.pathname));
}

function setupClientNavigation() {
  if (window.__zenWorkspaceNavigationInitialized) {
    return;
  }

  window.__zenWorkspaceNavigationInitialized = true;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const anchor = event.target.closest("a[href]");

    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
      return;
    }

    const href = anchor.getAttribute("href");

    if (!href || href.startsWith("#")) {
      return;
    }

    const url = new URL(href, window.location.origin);

    if (!canHandleClientNavigation(url)) {
      return;
    }

    event.preventDefault();
    navigateTo(`${normalizePathname(url.pathname)}${url.search}`).catch((error) => {
      console.error(error);
      window.location.href = `${normalizePathname(url.pathname)}${url.search}`;
    });
  });

  window.addEventListener("popstate", () => {
    navigateTo(`${window.location.pathname}${window.location.search}`, {
      updateHistory: false,
      preserveScroll: true
    }).catch((error) => {
      console.error(error);
      window.location.reload();
    });
  });
}

async function navigateTo(path, options = {}) {
  const { replace = false, updateHistory = true, preserveScroll = false } = options;
  const url = new URL(path, window.location.origin);
  const targetPath = `${normalizePathname(url.pathname)}${url.search}`;
  const currentPath = `${normalizePathname(window.location.pathname)}${window.location.search}`;

  if (targetPath === currentPath && document.body.dataset.page) {
    return;
  }

  const response = await window.fetch(targetPath, {
    headers: {
      "X-Requested-With": "zen-workspace-client-navigation"
    }
  });

  if (!response.ok) {
    throw new Error(`Navigation failed for ${targetPath}`);
  }

  const html = await response.text();
  const parsedDocument = new window.DOMParser().parseFromString(html, "text/html");
  document.title = parsedDocument.title || document.title;
  document.documentElement.className = parsedDocument.documentElement.className;
  document.documentElement.lang = parsedDocument.documentElement.lang || document.documentElement.lang;
  replaceBodyContent(parsedDocument);

  if (updateHistory) {
    if (replace) {
      window.history.replaceState({}, "", targetPath);
    } else {
      window.history.pushState({}, "", targetPath);
    }
  }

  if (!preserveScroll) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  await initializePage();
}

function replaceBodyContent(parsedDocument) {
  const currentPage = document.body.dataset.page;
  const nextPage = parsedDocument.body.dataset.page;
  const currentTopHeader = Array.from(document.body.children).find((element) => element.tagName === "HEADER");
  const currentAside = document.body.querySelector("aside");
  const currentMain = document.body.querySelector("main");
  const nextTopHeader = Array.from(parsedDocument.body.children).find((element) => element.tagName === "HEADER");
  const nextAside = parsedDocument.body.querySelector("aside");
  const nextMain = parsedDocument.body.querySelector("main");
  const shouldPreserveAppShell =
    currentTopHeader &&
    nextTopHeader &&
    currentAside &&
    nextAside &&
    currentMain &&
    nextMain &&
    currentPage !== "login" &&
    nextPage !== "login";

  syncBodyAttributes(parsedDocument.body);

  if (!shouldPreserveAppShell) {
    const nextBody = parsedDocument.body.cloneNode(true);
    nextBody.querySelectorAll("script").forEach((element) => element.remove());
    document.body.replaceWith(nextBody);
    return;
  }

  syncElementAttributes(currentMain, nextMain);
  currentMain.innerHTML = nextMain.innerHTML;

  const nextBodyNodes = Array.from(parsedDocument.body.children)
    .filter((element) => element.tagName !== "SCRIPT" && element.tagName !== "HEADER" && element.tagName !== "ASIDE" && element.tagName !== "MAIN")
    .map((element) => element.cloneNode(true));

  Array.from(document.body.children).forEach((child) => {
    if (child !== currentTopHeader && child !== currentAside && child !== currentMain) {
      child.remove();
    }
  });

  nextBodyNodes.forEach((node) => {
    document.body.appendChild(node);
  });
}

function syncBodyAttributes(sourceBody) {
  Array.from(document.body.attributes).forEach((attribute) => {
    document.body.removeAttribute(attribute.name);
  });

  Array.from(sourceBody.attributes).forEach((attribute) => {
    document.body.setAttribute(attribute.name, attribute.value);
  });
}

function syncElementAttributes(targetElement, sourceElement) {
  Array.from(targetElement.attributes).forEach((attribute) => {
    targetElement.removeAttribute(attribute.name);
  });

  Array.from(sourceElement.attributes).forEach((attribute) => {
    targetElement.setAttribute(attribute.name, attribute.value);
  });
}

async function initializePage() {
  const page = document.body.dataset.page;

  if (!page) {
    return;
  }

  if (page === "login") {
    await initLoginPage();
    return;
  }

  await ensureAuthenticated();
  await ensureProfileLoaded();
  ensurePersistentSharedChrome(page);

  if (page === "dashboard") {
    await initDashboardPage();
    return;
  }

  if (page === "schedule") {
    await initSchedulePage();
    return;
  }

  if (page === "tasks") {
    await initTasksPage();
    return;
  }

  if (page === "create-task") {
    await initCreateTaskPage();
    return;
  }

  if (page === "notes") {
    await initNotesPage();
    return;
  }

  if (page === "profile") {
    await initProfilePage();
    return;
  }

  if (page === "edit-profile") {
    await initEditProfilePage();
    return;
  }

  if (page === "change-password") {
    await initChangePasswordPage();
    return;
  }

  if (page === "settings-preferences") {
    await initSettingsPreferencesPage();
  }
}

async function initLoginPage() {
  if (state.token) {
    try {
      await ensureAuthenticated();
      await navigateTo("/dashboard", { replace: true });
      return;
    } catch (_error) {
      clearToken();
    }
  }

  const form = document.getElementById("login-form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');

    try {
      setText("login-error", "");
      setButtonLoading(submitButton, true, "Signing In...");

      const payload = {
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        remember: document.getElementById("remember").checked
      };

      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        body: payload,
        authenticated: false
      });

      state.token = response.token;
      state.user = response.user;
      window.localStorage.setItem(TOKEN_KEY, response.token);
      await navigateTo("/dashboard", { replace: true });
    } catch (error) {
      setText("login-error", error.message || "Login failed");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  await initGoogleLogin();
}

async function initGoogleLogin() {
  const container = document.getElementById("google-signin-render");

  if (!container) {
    return;
  }

  setText("google-login-status", "");

  try {
    const config = await apiFetch("/api/auth/config", { authenticated: false });

    if (!config.googleAuthEnabled || !config.googleClientId) {
      setText("google-login-status", "Google sign-in is not configured yet.");
      return;
    }

    await loadGoogleIdentityScript();

    if (!window.google?.accounts?.id) {
      throw new Error("Google sign-in library failed to load");
    }

    container.innerHTML = "";

    window.google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: (response) => {
        handleGoogleCredentialResponse(response).catch((error) => {
          setText("google-login-status", "");
          setText("login-error", error.message || "Google sign-in failed");
        });
      }
    });

    window.google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: Math.max(container.clientWidth || 0, 260)
    });
  } catch (error) {
    setText("google-login-status", error.message || "Unable to initialize Google sign-in.");
  }
}

async function handleGoogleCredentialResponse(response) {
  if (!response?.credential) {
    throw new Error("Google did not return a valid credential");
  }

  setText("login-error", "");
  setText("google-login-status", "Signing in with Google...");

  const payload = {
    credential: response.credential,
    remember: document.getElementById("remember")?.checked || false
  };

  const authResponse = await apiFetch("/api/auth/google", {
    method: "POST",
    body: payload,
    authenticated: false
  });

  state.token = authResponse.token;
  state.user = authResponse.user;
  window.localStorage.setItem(TOKEN_KEY, authResponse.token);
  setText("google-login-status", "");
  await navigateTo("/dashboard", { replace: true });
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise;
  }

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`);

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }

      if (existingScript.dataset.failed === "true") {
        existingScript.remove();
      } else {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Unable to load Google sign-in library")), {
          once: true
        });
        return;
      }
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.dataset.failed = "true";
      googleIdentityScriptPromise = null;
      reject(new Error("Unable to load Google sign-in library"));
    };
    document.head.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

async function ensureAuthenticated() {
  if (!state.token) {
    await navigateTo("/login", { replace: true });
    throw new Error("Please sign in first.");
  }

  if (state.user) {
    return state.user;
  }

  const response = await apiFetch("/api/auth/session");
  state.user = response.user;
  return state.user;
}

async function ensureProfileLoaded() {
  if (state.profile) {
    return state.profile;
  }

  const response = await apiFetch("/api/profile");
  state.profile = response.profile;
  state.user = {
    ...state.user,
    fullName: response.profile.fullName,
    email: response.profile.email,
    avatarUrl: response.profile.avatarUrl
  };
  return state.profile;
}

function renderSharedChrome(page) {
  renderSharedTopbar(page);
  renderSharedSidebar(page);
}

function ensurePersistentSharedChrome(page) {
  renderSharedTopbar(page);

  const aside = document.querySelector("aside");

  if (!aside) {
    wireSharedActions();
    return;
  }

  if (aside.dataset.sharedSidebarInitialized !== "true") {
    renderSharedSidebar(page);
    const renderedAside = document.querySelector("aside");

    if (renderedAside) {
      renderedAside.dataset.sharedSidebarInitialized = "true";
    }
  } else {
    updateSidebarActiveState(page);
    syncSidebarProfileSummary();
  }

  wireSharedActions();
}

function renderSharedTopbar(page) {
  const header = document.querySelector("header");

  if (!header || page === "login") {
    return;
  }

  if (header.dataset.sharedTopbarInitialized !== "true") {
    header.innerHTML = `
      <div class="flex items-center justify-between gap-6 w-full">
        <div class="flex items-center gap-6 min-w-0">
          <a class="text-xl font-bold text-[#3d6758] dark:text-[#b1decc] font-headline tracking-tight whitespace-nowrap" href="/dashboard">ZenWorkspace</a>
          <div class="hidden md:block min-w-0">
            <p class="text-sm font-semibold text-on-surface truncate" data-topbar-title>Workspace</p>
            <p class="text-xs text-on-surface-variant truncate" data-topbar-subtitle>Workspace member</p>
          </div>
          <div data-topbar-search-slot></div>
        </div>
        <div class="flex items-center gap-3">
          <nav class="hidden xl:flex items-center gap-5 text-sm font-medium">
            <a class="text-on-surface-variant hover:text-primary transition-colors" data-topbar-link="dashboard" href="/dashboard">Dashboard</a>
            <a class="text-on-surface-variant hover:text-primary transition-colors" data-topbar-link="schedule" href="/schedule">Schedule</a>
            <a class="text-on-surface-variant hover:text-primary transition-colors" data-topbar-link="tasks" href="/tasks">Tasks</a>
            <a class="text-on-surface-variant hover:text-primary transition-colors" data-topbar-link="notes" href="/notes">Notes</a>
            <a class="text-on-surface-variant hover:text-primary transition-colors" data-topbar-link="profile" href="/profile">Profile</a>
            <a class="text-on-surface-variant hover:text-primary transition-colors" data-topbar-link="settings" href="/settings/preferences">Settings</a>
          </nav>
          <button class="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors" data-go-settings type="button">
            <span class="material-symbols-outlined">settings</span>
          </button>
          <button class="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors" data-go-profile type="button">
            <span class="material-symbols-outlined">person</span>
          </button>
          <div class="relative">
            <button class="w-10 h-10 rounded-full overflow-hidden border border-primary-fixed/40 bg-surface-container-highest transition-transform hover:scale-[1.02]" data-topbar-profile-trigger type="button">
              <img alt="User profile avatar" class="w-full h-full object-cover" data-topbar-avatar src=""/>
            </button>
            <div class="invisible absolute right-0 top-[calc(100%+0.75rem)] z-50 w-72 translate-y-2 overflow-visible rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-lowest opacity-0 shadow-[0px_18px_40px_rgba(43,52,55,0.14)] transition-all duration-200 ease-out pointer-events-none" data-topbar-profile-menu>
              <div class="absolute -top-2 right-4 h-4 w-4 rotate-45 border-l border-t border-outline-variant/20 bg-surface-container-lowest"></div>
              <div class="border-b border-outline-variant/10 px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="h-12 w-12 overflow-hidden rounded-full border border-primary-fixed/40 bg-surface-container-highest">
                    <img alt="User profile avatar" class="h-full w-full object-cover" data-topbar-menu-avatar src=""/>
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-bold text-on-surface" data-topbar-menu-name>Workspace member</p>
                    <p class="truncate text-xs text-on-surface-variant" data-topbar-menu-email></p>
                  </div>
                </div>
              </div>
              <div class="p-2">
                <button class="flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low" data-go-profile data-topbar-menu-link="profile" type="button">
                  <span class="material-symbols-outlined text-lg text-primary">person</span>
                  <span>My Profile</span>
                </button>
                <button class="flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low" data-go-edit-profile data-topbar-menu-link="profile" type="button">
                  <span class="material-symbols-outlined text-lg text-primary">edit</span>
                  <span>Edit Profile</span>
                </button>
                <button class="flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low" data-go-settings data-topbar-menu-link="preferences" type="button">
                  <span class="material-symbols-outlined text-lg text-primary">tune</span>
                  <span>Preferences</span>
                </button>
                <button class="flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low" data-go-security data-topbar-menu-link="security" type="button">
                  <span class="material-symbols-outlined text-lg text-primary">shield</span>
                  <span>Security</span>
                </button>
                <button class="mt-1 flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-error transition-colors hover:bg-error-container/10" data-logout type="button">
                  <span class="material-symbols-outlined text-lg">logout</span>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    header.dataset.sharedTopbarInitialized = "true";
  }

  updateTopbarState(page);
}

function getPageTitle(page) {
  return {
    dashboard: "Workspace Overview",
    schedule: "Schedule",
    tasks: "Task Flow",
    "create-task": "Create Task",
    notes: "Notes Library",
    profile: "Profile",
    "edit-profile": "Edit Profile",
    "settings-preferences": "Preferences",
    "change-password": "Security"
  }[page] || "Workspace";
}

function getActiveTopbarKey(page) {
  if (page === "schedule") {
    return "schedule";
  }

  if (page === "tasks" || page === "create-task") {
    return "tasks";
  }

  if (page === "notes") {
    return "notes";
  }

  if (page === "profile" || page === "edit-profile") {
    return "profile";
  }

  if (page === "settings-preferences" || page === "change-password") {
    return "settings";
  }

  return "dashboard";
}

function updateTopbarState(page) {
  const profile = state.profile || {};
  const titleElement = document.querySelector("[data-topbar-title]");
  const subtitleElement = document.querySelector("[data-topbar-subtitle]");
  const avatarElement = document.querySelector("[data-topbar-avatar]");
  const menuAvatarElement = document.querySelector("[data-topbar-menu-avatar]");
  const menuNameElement = document.querySelector("[data-topbar-menu-name]");
  const menuEmailElement = document.querySelector("[data-topbar-menu-email]");
  const searchSlot = document.querySelector("[data-topbar-search-slot]");
  const activeKey = getActiveTopbarKey(page);

  if (titleElement) {
    titleElement.textContent = getPageTitle(page);
  }

  if (subtitleElement) {
    subtitleElement.textContent = profile.fullName || state.user?.fullName || "Workspace member";
  }

  if (avatarElement) {
    avatarElement.src = profile.avatarUrl || state.user?.avatarUrl || "";
  }

  if (menuAvatarElement) {
    menuAvatarElement.src = profile.avatarUrl || state.user?.avatarUrl || "";
  }

  if (menuNameElement) {
    menuNameElement.textContent = profile.fullName || state.user?.fullName || "Workspace member";
  }

  if (menuEmailElement) {
    menuEmailElement.textContent = profile.email || state.user?.email || "";
  }

  document.querySelectorAll("[data-topbar-link]").forEach((link) => {
    const isActive = link.dataset.topbarLink === activeKey;
    link.className = isActive
      ? "text-primary font-bold transition-colors"
      : "text-on-surface-variant hover:text-primary transition-colors";
  });

  updateTopbarProfileMenuActiveState(page);

  if (searchSlot) {
    if (page === "tasks") {
      searchSlot.innerHTML = `
        <div class="relative hidden lg:block">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
          <input class="bg-surface-container-low border-none rounded-full py-2 pl-10 pr-4 w-72 text-sm focus:ring-2 focus:ring-primary/20 transition-all" id="task-search-input" placeholder="Search tasks..." type="text"/>
        </div>
      `;
    } else if (page === "notes") {
      searchSlot.innerHTML = `
        <div class="relative hidden lg:block">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
          <input class="bg-surface-container-low border-none rounded-full py-2 pl-10 pr-4 w-72 text-sm focus:ring-2 focus:ring-primary/20 transition-all" id="note-search-input" placeholder="Search notes..." type="text"/>
        </div>
      `;
    } else if (page === "schedule") {
      searchSlot.innerHTML = `
        <div class="hidden lg:flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
          <span class="material-symbols-outlined text-base text-primary">calendar_today</span>
          <span>Planner View</span>
        </div>
      `;
    } else {
      searchSlot.innerHTML = "";
    }
  }

  closeTopbarProfileMenu();
}

function updateTopbarProfileMenuActiveState(page) {
  const activeKey = page === "profile" || page === "edit-profile"
    ? "profile"
    : page === "settings-preferences"
      ? "preferences"
      : page === "change-password"
        ? "security"
        : "";

  document.querySelectorAll("[data-topbar-menu-link]").forEach((element) => {
    const isActive = element.dataset.topbarMenuLink === activeKey;
    element.className = isActive
      ? "flex w-full items-center gap-3 rounded-[1rem] bg-primary-fixed px-4 py-3 text-left text-sm font-bold text-on-primary-fixed transition-colors"
      : "flex w-full items-center gap-3 rounded-[1rem] px-4 py-3 text-left text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low";
  });
}

function renderSharedSidebar(page) {
  const aside = document.querySelector("aside");

  if (!aside || page === "login") {
    return;
  }

  const profile = state.profile || {};
  const activePage = {
    dashboard: "dashboard",
    schedule: "schedule",
    tasks: "tasks",
    "create-task": "tasks",
    notes: "notes",
    profile: "profile",
    "edit-profile": "profile",
    "settings-preferences": "preferences",
    "change-password": "security"
  }[page];

  aside.innerHTML = `
    <div class="px-6 mb-8">
      <a class="flex items-center gap-3" href="/dashboard">
        <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary">
          <span class="material-symbols-outlined">spa</span>
        </div>
        <div>
          <h2 class="font-headline text-lg font-extrabold text-[#3d6758]">ZenWorkspace</h2>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Shared Workspace</p>
        </div>
      </a>
    </div>
    <nav class="flex-1 space-y-1 px-4">
      ${renderSidebarLink("dashboard", activePage, "/dashboard", "dashboard", "Dashboard")}
      ${renderSidebarLink("schedule", activePage, "/schedule", "calendar_today", "Schedule")}
      ${renderSidebarLink("tasks", activePage, "/tasks", "check_circle", "Tasks")}
      ${renderSidebarLink("notes", activePage, "/notes", "description", "Notes")}
      ${renderSidebarLink("profile", activePage, "/profile", "person", "Profile")}
      ${renderSidebarLink("preferences", activePage, "/settings/preferences", "tune", "Preferences")}
      ${renderSidebarLink("security", activePage, "/settings/security", "shield", "Security")}
    </nav>
    <div class="mt-auto px-6 space-y-3">
      <button class="w-full rounded-full bg-primary py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-dim" data-go-create-task type="button">New Task</button>
      <button class="flex w-full items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary" data-go-settings type="button">
        <span class="material-symbols-outlined text-lg">settings</span>
        <span>Account Settings</span>
      </button>
      <button class="flex w-full items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-error transition-colors hover:bg-error-container/10" data-logout type="button">
        <span class="material-symbols-outlined text-lg">logout</span>
        <span>Sign Out</span>
      </button>
    </div>
  `;

  syncSidebarProfileSummary();
}

function renderSidebarLink(linkKey, activePage, href, icon, label) {
  const isActive = linkKey === activePage;
  const classes = isActive
    ? "flex items-center gap-3 rounded-full bg-surface-container-lowest px-4 py-3 text-sm font-bold text-primary"
    : "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary";

  return `
    <a class="${classes}" data-sidebar-link="${linkKey}" href="${href}">
      <span class="material-symbols-outlined text-lg">${icon}</span>
      <span>${label}</span>
    </a>
  `;
}

function getActiveSidebarKey(page) {
  return {
    dashboard: "dashboard",
    schedule: "schedule",
    tasks: "tasks",
    "create-task": "tasks",
    notes: "notes",
    profile: "profile",
    "edit-profile": "profile",
    "settings-preferences": "preferences",
    "change-password": "security"
  }[page];
}

function updateSidebarActiveState(page) {
  const activeKey = getActiveSidebarKey(page);

  document.querySelectorAll("[data-sidebar-link]").forEach((link) => {
    const isActive = link.dataset.sidebarLink === activeKey;

    link.className = isActive
      ? "flex items-center gap-3 rounded-full bg-surface-container-lowest px-4 py-3 text-sm font-bold text-primary"
      : "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary";
  });
}

function syncSidebarProfileSummary() {
  const aside = document.querySelector("aside");

  if (!aside) {
    return;
  }

  const nameElement = aside.querySelector("[data-sidebar-profile-name]");
  if (nameElement) {
    const profile = state.profile || {};
    nameElement.textContent = profile.fullName || state.user?.fullName || "Workspace member";
  }

  const tierElement = aside.querySelector("[data-sidebar-profile-tier]");
  if (tierElement) {
    const profile = state.profile || {};
    tierElement.textContent = profile.membershipTier || "Member";
  }
}

function wireSharedActions() {
  const profileTrigger = document.querySelector("[data-topbar-profile-trigger]");
  const profileMenu = document.querySelector("[data-topbar-profile-menu]");

  if (profileTrigger && profileTrigger.dataset.navBound !== "true") {
    profileTrigger.dataset.navBound = "true";
    profileTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTopbarProfileMenu(profileMenu);
    });
  }

  if (!window.__zenWorkspaceProfileMenuDismissBound) {
    window.__zenWorkspaceProfileMenuDismissBound = true;

    document.addEventListener("click", (event) => {
      const menu = document.querySelector("[data-topbar-profile-menu]");
      const trigger = document.querySelector("[data-topbar-profile-trigger]");

      if (!menu || menu.dataset.open !== "true") {
        return;
      }

      if (menu.contains(event.target) || trigger?.contains(event.target)) {
        return;
      }

      closeTopbarProfileMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeTopbarProfileMenu();
      }
    });
  }

  document.querySelectorAll("[data-go-dashboard]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/dashboard");
    });
  });

  document.querySelectorAll("[data-go-tasks]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/tasks");
    });
  });

  document.querySelectorAll("[data-go-schedule]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/schedule");
    });
  });

  document.querySelectorAll("[data-go-notes]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/notes");
    });
  });

  document.querySelectorAll("[data-go-create-task]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/tasks/new");
    });
  });

  document.querySelectorAll("[data-go-edit-profile]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/profile/edit");
    });
  });

  document.querySelectorAll("[data-go-profile]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/profile");
    });
  });

  document.querySelectorAll("[data-go-settings]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/settings/preferences");
    });
  });

  document.querySelectorAll("[data-go-security]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      closeTopbarProfileMenu();
      await navigateTo("/settings/security");
    });
  });

  document.querySelectorAll("[data-logout]").forEach((element) => {
    if (element.dataset.navBound === "true") {
      return;
    }

    element.dataset.navBound = "true";
    element.addEventListener("click", async () => {
      try {
        closeTopbarProfileMenu();
        await apiFetch("/api/auth/logout", { method: "POST" });
      } catch (_error) {
        // noop
      } finally {
        clearToken();
        await navigateTo("/login", { replace: true });
      }
    });
  });
}

function closeTopbarProfileMenu() {
  const menu = document.querySelector("[data-topbar-profile-menu]");

  if (!menu) {
    return;
  }

  menu.dataset.open = "false";
  menu.classList.add("invisible", "opacity-0", "translate-y-2", "pointer-events-none");
  menu.classList.remove("opacity-100", "translate-y-0", "pointer-events-auto");
}

function openTopbarProfileMenu(menu) {
  if (!menu) {
    return;
  }

  menu.dataset.open = "true";
  menu.classList.remove("invisible", "opacity-0", "translate-y-2", "pointer-events-none");
  menu.classList.add("opacity-100", "translate-y-0", "pointer-events-auto");
}

function toggleTopbarProfileMenu(menu) {
  if (!menu) {
    return;
  }

  if (menu.dataset.open === "true") {
    closeTopbarProfileMenu();
    return;
  }

  openTopbarProfileMenu(menu);
}

async function initDashboardPage() {
  const response = await apiFetch("/api/dashboard/summary");
  const pulseButtons = Array.from(document.querySelectorAll("[data-dashboard-pulse-period]"));
  const metricButtons = Array.from(document.querySelectorAll("[data-dashboard-pulse-metric]"));

  bindDashboardActivityModal();
  setText("dashboard-user-name", firstName(state.user.fullName));
  setText("dashboard-open-tasks", String(response.overview.openTasks));

  state.dashboardPulsePeriod = response.pulse?.defaultPeriod || "week";
  state.dashboardPulseMetric = response.pulse?.defaultMetric || "completed";

  pulseButtons.forEach((button) => {
    if (button.dataset.navBound === "true") {
      return;
    }

    button.dataset.navBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.dashboardPulsePeriod = button.dataset.dashboardPulsePeriod;
        renderDashboardPulse(response.pulse);
      });
  });

  metricButtons.forEach((button) => {
    if (button.dataset.navBound === "true") {
      return;
    }

    button.dataset.navBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.dashboardPulseMetric = button.dataset.dashboardPulseMetric;
        renderDashboardPulse(response.pulse);
      });
  });

  renderDashboardPulse(response.pulse);
  renderDashboardUpcoming(response.upcoming);
  renderDashboardNotes(response.recentNotes);
  renderDashboardActivity(response.activity);
}

function renderDashboardPulse(pulse) {
  if (!pulse?.periods) {
    return;
  }

  const selectedKey = pulse.periods[state.dashboardPulsePeriod]
    ? state.dashboardPulsePeriod
    : pulse.defaultPeriod || "week";
  const selectedPeriod = pulse.periods[selectedKey];
  const series = Array.isArray(selectedPeriod?.series) ? selectedPeriod.series : [];
  const metricKey = selectedPeriod.metrics?.[state.dashboardPulseMetric]
    ? state.dashboardPulseMetric
    : pulse.defaultMetric || "completed";
  const selectedMetric = selectedPeriod.metrics[metricKey];
  const chartContainer = document.getElementById("dashboard-pulse-chart");
  const labelsContainer = document.getElementById("dashboard-pulse-chart-labels");
  const legendContainer = document.getElementById("dashboard-pulse-legend");
  const summary = selectedPeriod.summary || {};

  setText("dashboard-pulse-heading", `${selectedPeriod.label} Pulse`);
  setText("dashboard-pulse-delta", selectedMetric.deltaLabel);
  setText("dashboard-pulse-label", selectedMetric.label);
  setText("dashboard-pulse-value", String(selectedMetric.value));
  setText("dashboard-pulse-unit", selectedMetric.unit);
  setText("dashboard-pulse-caption", selectedMetric.caption);
  setText("dashboard-pulse-created", String(summary.created || 0));
  setText("dashboard-pulse-completed", String(summary.completed || 0));
  setText("dashboard-pulse-carry-over", String(summary.carryOver || 0));
  setText("dashboard-pulse-secondary-label", selectedPeriod.secondary?.label || "Completion Rate");
  setText("dashboard-pulse-secondary-value", String(selectedPeriod.secondary?.value || "0%"));
  setText("dashboard-pulse-secondary-caption", selectedPeriod.secondary?.caption || "");

  document.querySelectorAll("[data-dashboard-pulse-period]").forEach((button) => {
    const isActive = button.dataset.dashboardPulsePeriod === selectedKey;
    button.className = isActive
      ? "rounded-full bg-primary px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-primary transition-colors"
      : "rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant transition-colors hover:bg-surface-container-high";
  });

  document.querySelectorAll("[data-dashboard-pulse-metric]").forEach((button) => {
    const isActive = button.dataset.dashboardPulseMetric === metricKey;
    button.className = isActive
      ? "rounded-full bg-primary px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-primary transition-colors"
      : "rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant transition-colors hover:bg-surface-container-high";
  });

  if (chartContainer) {
    chartContainer.innerHTML = renderDashboardPulseLineChart(series, metricKey);
    bindDashboardPulseTooltip(series, selectedMetric);
  }

  if (labelsContainer) {
    labelsContainer.innerHTML = series
      .map((item) => `<span class="flex-1 text-center">${escapeHtml(item.label)}</span>`)
      .join("");
  }

  if (legendContainer) {
    legendContainer.innerHTML = renderDashboardPulseLegend(metricKey);
  }
}

function getDashboardPulseChartDefinitions(activeMetricKey) {
  return [
    {
      key: "created",
      label: "Created",
      color: "#486083",
      glow: "rgba(72,96,131,0.16)",
      gradient: "rgba(72,96,131,0.18)",
      active: activeMetricKey === "created"
    },
    {
      key: "completed",
      label: "Completed",
      color: "#3d6758",
      glow: "rgba(61,103,88,0.16)",
      gradient: "rgba(61,103,88,0.2)",
      active: activeMetricKey === "completed"
    },
    {
      key: "carryOver",
      label: "Carry-over",
      color: "#737c80",
      glow: "rgba(115,124,128,0.14)",
      gradient: "rgba(115,124,128,0.16)",
      active: activeMetricKey === "carryOver"
    }
  ].map((definition) => ({
    ...definition,
    emphasis: activeMetricKey && activeMetricKey !== "focus"
      ? (definition.active ? 1 : 0.42)
      : 0.78
  }));
}

function renderDashboardPulseLegend(activeMetricKey) {
  return getDashboardPulseChartDefinitions(activeMetricKey)
    .map((definition) => `
      <div class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors ${
        definition.active
          ? "bg-surface-container-high text-on-surface shadow-sm"
          : "bg-surface-container-low text-on-surface-variant"
      }">
        <span class="inline-flex h-2.5 w-5 rounded-full" style="background:${definition.color}; opacity:${definition.emphasis};"></span>
        <span>${escapeHtml(definition.label)}</span>
      </div>
    `)
    .join("");
}

function renderDashboardPulseLineChart(series, activeMetricKey) {
  if (!Array.isArray(series) || !series.length) {
    return `
      <div class="flex h-full items-center justify-center rounded-[1.5rem] bg-surface-container-low text-sm font-medium text-on-surface-variant">
        No trend data for this period yet.
      </div>
    `;
  }

  const definitions = getDashboardPulseChartDefinitions(activeMetricKey);
  const values = series.reduce((accumulator, item) => {
    definitions.forEach((definition) => {
      accumulator.push(Number(item[definition.key] || 0));
    });
    return accumulator;
  }, []);
  const width = 640;
  const height = 128;
  const paddingX = 14;
  const paddingY = 14;
  const maxValue = Math.max(...values, 1);
  const stepX = series.length > 1 ? (width - paddingX * 2) / (series.length - 1) : 0;
  const areaLine = definitions.find((definition) => definition.active) || definitions.find((definition) => definition.key === "completed");
  const plottedLines = definitions.map((definition) => {
    const points = series.map((item, index) => {
      const value = Number(item[definition.key] || 0);
      return {
        x: paddingX + stepX * index,
        y: height - paddingY - ((value / maxValue) * (height - paddingY * 2)),
        value
      };
    });

    return {
      ...definition,
      points,
      linePath: buildSmoothLinePath(points),
      areaPath: buildSmoothAreaPath(points, height - paddingY)
    };
  });
  const hitAreas = series.map((_, index) => {
    const pointX = paddingX + stepX * index;
    return `
      <rect
        x="${pointX - 16}"
        y="0"
        width="32"
        height="${height}"
        fill="transparent"
        data-dashboard-pulse-point="${index}"
      ></rect>
    `;
  }).join("");
  const pointMarkers = plottedLines.map((line) => line.points.map((point) => `
    <circle cx="${point.x}" cy="${point.y}" fill="${line.glow}" r="${line.active ? 8 : 5.5}" opacity="${line.emphasis}"></circle>
    <circle cx="${point.x}" cy="${point.y}" fill="#ffffff" r="${line.active ? 3.6 : 2.6}" stroke="${line.color}" stroke-width="${line.active ? 2.1 : 1.5}" opacity="${line.emphasis}"></circle>
  `).join("")).join("");

  return `
    <svg class="h-full w-full overflow-visible" style="animation: dashboardPulseFade 240ms ease-out forwards;" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Pulse trend chart">
      <defs>
        ${plottedLines.map((line) => `
          <linearGradient id="dashboardPulseAreaGradient-${line.key}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${line.color}" stop-opacity="${line.active ? "0.20" : "0.14"}"></stop>
            <stop offset="100%" stop-color="${line.color}" stop-opacity="0"></stop>
          </linearGradient>
        `).join("")}
      </defs>
      ${[0.25, 0.5, 0.75].map((ratio) => {
        const y = paddingY + (height - paddingY * 2) * ratio;
        return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="rgba(115,124,128,0.12)" stroke-dasharray="4 5"></line>`;
      }).join("")}
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(115,124,128,0.18)"></line>
      ${areaLine ? `<path d="${areaLine.areaPath}" fill="url(#dashboardPulseAreaGradient-${areaLine.key})"></path>` : ""}
      ${plottedLines.map((line) => `
        <path
          d="${line.linePath}"
          fill="none"
          stroke="${line.color}"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="${line.active ? 3.5 : 2.25}"
          opacity="${line.emphasis}"
        ></path>
      `).join("")}
      ${pointMarkers}
      ${hitAreas}
    </svg>
  `;
}

function bindDashboardPulseTooltip(series, metric) {
  const chartContainer = document.getElementById("dashboard-pulse-chart");
  const tooltip = document.getElementById("dashboard-pulse-tooltip");
  const wrapper = document.getElementById("dashboard-pulse-chart-wrapper");

  if (!chartContainer || !tooltip || !wrapper || !Array.isArray(series) || !series.length) {
    return;
  }

  chartContainer.querySelectorAll("[data-dashboard-pulse-point]").forEach((element) => {
    const index = Number(element.dataset.dashboardPulsePoint);
    const point = series[index];

    if (!point) {
      return;
    }

    element.addEventListener("mouseenter", () => {
      const primaryValue = formatDashboardPulseMetricValue(Number(point?.[metric.seriesKey] || 0), metric.unit);
      tooltip.innerHTML = `
        <div class="min-w-[190px] rounded-[1rem] bg-on-surface px-3.5 py-3 text-surface shadow-[0_14px_38px_rgba(43,52,55,0.24)]">
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold text-white">${escapeHtml(point.label)}</p>
            <span class="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">${escapeHtml(metric.label)}</span>
          </div>
          <p class="mt-2 text-lg font-extrabold text-white">${escapeHtml(primaryValue)}</p>
          <div class="mt-3 space-y-2 text-[11px] text-white/78">
            ${renderDashboardPulseTooltipRow("Created", Number(point?.created || 0), "#486083", metric.seriesKey === "created")}
            ${renderDashboardPulseTooltipRow("Completed", Number(point?.completed || 0), "#3d6758", metric.seriesKey === "completed")}
            ${renderDashboardPulseTooltipRow("Carry-over", Number(point?.carryOver || 0), "#737c80", false)}
            ${renderDashboardPulseTooltipRow("Focus Score", Number(point?.focusScore || 0), "#b07b3c", metric.seriesKey === "focusScore", "%")}
          </div>
        </div>
      `;
      tooltip.classList.remove("hidden");
    });

    element.addEventListener("mousemove", (event) => {
      const bounds = wrapper.getBoundingClientRect();
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;
      tooltip.style.left = `${Math.min(bounds.width - 24, Math.max(24, offsetX))}px`;
      tooltip.style.top = `${Math.max(8, offsetY - 10)}px`;
      tooltip.style.transform = "translate(-50%, -100%)";
    });

    element.addEventListener("mouseleave", () => {
      tooltip.classList.add("hidden");
    });
  });
}

function renderDashboardPulseTooltipRow(label, value, color, active, unit) {
  return `
    <div class="flex items-center justify-between gap-3 rounded-full px-2.5 py-1.5 ${active ? "bg-white/10 text-white" : ""}">
      <span class="inline-flex items-center gap-2">
        <span class="inline-flex h-2.5 w-2.5 rounded-full" style="background:${color};"></span>
        <span>${escapeHtml(label)}</span>
      </span>
      <span class="font-semibold">${escapeHtml(formatDashboardPulseMetricValue(value, unit || ""))}</span>
    </div>
  `;
}

function formatDashboardPulseMetricValue(value, unit) {
  return `${value}${unit === "%" ? "%" : ""}`;
}

function buildSmoothLinePath(points) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const lastPoint = points[points.length - 1];
  path += ` T ${lastPoint.x} ${lastPoint.y}`;
  return path;
}

function buildSmoothAreaPath(points, baselineY) {
  if (!points.length) {
    return "";
  }

  const linePath = buildSmoothLinePath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  return `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
}

function renderDashboardUpcoming(tasks) {
  const container = document.getElementById("dashboard-upcoming-list");

  if (!container) {
    return;
  }

  container.innerHTML = tasks
    .map((task, index) => {
      const dueDate = task.due_at ? new Date(task.due_at) : null;
      const weekday = dueDate ? dueDate.toLocaleDateString("en-US", { weekday: "short" }) : "--";
      const day = dueDate ? dueDate.getDate() : "--";
      const time = dueDate ? formatDateTime(task.due_at) : "No due date";
      const cardClass = index === 0
        ? "flex-1 p-4 bg-white rounded-full border-l-4 border-primary shadow-sm"
        : "flex-1 p-4 bg-white/60 rounded-full shadow-sm";
      const labelClass = index === 0
        ? "text-xs font-bold text-primary uppercase"
        : "text-xs font-bold text-on-surface-variant opacity-60 uppercase";
      const dayClass = index === 0
        ? "text-lg font-extrabold"
        : "text-lg font-extrabold opacity-60";

      return `
        <div class="flex gap-4">
          <div class="flex flex-col items-center">
            <span class="${labelClass}">${weekday}</span>
            <span class="${dayClass}">${day}</span>
          </div>
          <div class="${cardClass}">
            <h6 class="font-bold text-sm">${escapeHtml(task.title)}</h6>
            <p class="text-xs opacity-60">${escapeHtml(time)}</p>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderDashboardNotes(notes) {
  const container = document.getElementById("dashboard-recent-notes");

  if (!container) {
    return;
  }

  container.innerHTML = notes
    .map((note) => `
      <div class="p-6 bg-surface-container-lowest rounded-full group cursor-pointer transition-all hover:translate-x-1 border border-outline-variant/10" data-note-id="${note.id}">
        <div class="flex items-center gap-4">
          <span class="material-symbols-outlined text-primary">article</span>
          <div class="flex-1">
            <h6 class="font-bold text-sm leading-tight">${escapeHtml(note.title)}</h6>
            <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(relativeTime(note.updated_at))} • ${escapeHtml(note.category)}</p>
          </div>
        </div>
      </div>
    `)
    .join("");

  container.querySelectorAll("[data-note-id]").forEach((element) => {
    element.addEventListener("click", async () => {
      await navigateTo(`/notes?note=${element.dataset.noteId}`);
    });
  });
}

function renderDashboardActivity(items) {
  const container = document.getElementById("dashboard-activity");

  if (!container) {
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const icon = item.entity_type === "note" ? "edit_note" : "task_alt";
      const colorClass = item.entity_type === "note"
        ? "bg-tertiary-container text-on-tertiary-container"
        : "bg-primary-container text-on-primary-container";
      const canOpenModal = item.entity_type === "task" || item.entity_type === "note" || item.entity_type === "session";
      const interactiveClass = canOpenModal
        ? "cursor-pointer hover:bg-surface-container-low hover:translate-x-1"
        : "cursor-default";
      const hintText = canOpenModal ? "View details" : "Recent activity";

      return `
        <div
          class="flex items-center gap-6 p-6 rounded-full transition-all group ${interactiveClass}"
          ${canOpenModal ? `data-dashboard-activity-index="${items.indexOf(item)}"` : ""}
        >
          <div class="w-12 h-12 rounded-full ${colorClass} flex items-center justify-center">
            <span class="material-symbols-outlined">${icon}</span>
          </div>
          <div class="flex-1">
            <h5 class="font-bold">${escapeHtml(item.message)}</h5>
            <p class="text-sm text-on-surface-variant">${escapeHtml(relativeTime(item.created_at))}</p>
          </div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] ${canOpenModal ? "text-primary" : "text-outline"}">
            <span>${hintText}</span>
            ${canOpenModal ? '<span class="material-symbols-outlined text-base">open_in_full</span>' : ""}
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-dashboard-activity-index]").forEach((element) => {
    element.addEventListener("click", async () => {
      const item = items[Number(element.dataset.dashboardActivityIndex)];
      await openDashboardActivityModal(item);
    });
  });
}

function bindDashboardActivityModal() {
  const modal = document.getElementById("dashboard-activity-modal");

  if (!modal || modal.dataset.bound === "true") {
    return;
  }

  modal.dataset.bound = "true";

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close-dashboard-activity-modal]")) {
      closeDashboardActivityModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeDashboardActivityModal();
    }
  });
}

async function openDashboardActivityModal(item) {
  const modal = document.getElementById("dashboard-activity-modal");
  const kicker = document.getElementById("dashboard-activity-modal-kicker");
  const title = document.getElementById("dashboard-activity-modal-title");
  const meta = document.getElementById("dashboard-activity-modal-meta");
  const body = document.getElementById("dashboard-activity-modal-body");

  if (!modal || !kicker || !title || !meta || !body || !item) {
    return;
  }

  kicker.textContent = capitalize(item.entity_type || "activity");
  title.textContent = item.message || "Activity detail";
  meta.textContent = `${relativeTime(item.created_at)} • ${capitalize(item.action_type || "updated")}`;
  body.innerHTML = `
    <div class="rounded-[1.5rem] bg-surface-container-low px-5 py-5 text-sm text-on-surface-variant">
      Loading detail...
    </div>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");

  try {
    if (item.entity_type === "task" && item.entity_id) {
      const response = await apiFetch(`/api/tasks/${Number(item.entity_id)}`);
      body.innerHTML = renderDashboardTaskActivityDetail(response.task, item);
      return;
    }

    if (item.entity_type === "note" && item.entity_id) {
      const response = await apiFetch(`/api/notes/${Number(item.entity_id)}`);
      body.innerHTML = renderDashboardNoteActivityDetail(response.note, item);
      return;
    }

    body.innerHTML = renderDashboardSessionActivityDetail(item);
  } catch (error) {
    body.innerHTML = `
      <div class="rounded-[1.5rem] border border-error/20 bg-error/5 px-5 py-5 text-sm text-error">
        ${escapeHtml(error.message || "Unable to load detail for this activity.")}
      </div>
    `;
  }
}

function closeDashboardActivityModal() {
  const modal = document.getElementById("dashboard-activity-modal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function renderDashboardTaskActivityDetail(task, item) {
  return `
    <div class="space-y-5">
      <div class="grid gap-3 md:grid-cols-3">
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Status</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(capitalize(task.status || "todo"))}</p>
        </div>
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Priority</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(capitalize(task.priority || "medium"))}</p>
        </div>
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Due</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(task.dueAt ? formatDateTime(task.dueAt) : "No deadline")}</p>
        </div>
      </div>
      <div class="rounded-[1.75rem] bg-surface-container-low px-5 py-5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="${tagClass(task.project?.colorHex)} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em]">${escapeHtml(task.project?.name || "General")}</span>
          ${task.isStarred ? '<span class="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Starred</span>' : ""}
        </div>
        <h4 class="mt-4 text-xl font-extrabold text-on-surface">${escapeHtml(task.title)}</h4>
        <p class="mt-3 text-sm leading-7 text-on-surface-variant">${escapeHtml(task.description || "No description for this task yet.")}</p>
      </div>
      <div class="rounded-[1.75rem] bg-surface-container-low px-5 py-5">
        <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Triggered by activity</p>
        <p class="mt-3 text-sm font-semibold text-on-surface">${escapeHtml(item.message)}</p>
        <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(formatDateTime(item.created_at))}</p>
      </div>
    </div>
  `;
}

function renderDashboardNoteActivityDetail(note, item) {
  return `
    <div class="space-y-5">
      <div class="grid gap-3 md:grid-cols-3">
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Category</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(note.category || "General")}</p>
        </div>
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Project</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(note.projectName || "General")}</p>
        </div>
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Updated</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(formatDateTime(note.updatedAt))}</p>
        </div>
      </div>
      <div class="rounded-[1.75rem] bg-surface-container-low px-5 py-5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="${tagClassByName(note.category)} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em]">${escapeHtml(note.category || "General")}</span>
          ${note.isPinned ? '<span class="rounded-full bg-secondary-container px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-secondary-container">Pinned</span>' : ""}
        </div>
        <h4 class="mt-4 text-xl font-extrabold text-on-surface">${escapeHtml(note.title)}</h4>
        <div class="mt-3 space-y-3 text-sm leading-7 text-on-surface-variant">${formatDashboardNoteBody(note.body)}</div>
      </div>
      <div class="rounded-[1.75rem] bg-surface-container-low px-5 py-5">
        <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Triggered by activity</p>
        <p class="mt-3 text-sm font-semibold text-on-surface">${escapeHtml(item.message)}</p>
        <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(formatDateTime(item.created_at))}</p>
      </div>
    </div>
  `;
}

function renderDashboardSessionActivityDetail(item) {
  return `
    <div class="space-y-5">
      <div class="rounded-[1.75rem] bg-surface-container-low px-5 py-5">
        <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Security activity</p>
        <h4 class="mt-4 text-xl font-extrabold text-on-surface">${escapeHtml(item.message || "Session activity")}</h4>
        <p class="mt-3 text-sm leading-7 text-on-surface-variant">This event belongs to your authentication or session history. If this action was unexpected, review your recent devices and credentials in the Security screen.</p>
        <p class="mt-3 text-xs text-on-surface-variant">${escapeHtml(formatDateTime(item.created_at))}</p>
      </div>
    </div>
  `;
}

function formatDashboardNoteBody(value) {
  const content = String(value || "").trim();

  if (!content) {
    return "<p>No note content available.</p>";
  }

  return content
    .split(/\n+/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

async function initSchedulePage() {
  bindScheduleModal();

  const params = new URLSearchParams(window.location.search);
  state.scheduleView = normalizeScheduleView(params.get("view"));
  state.scheduleDate = normalizeScheduleDate(params.get("date"));
  state.scheduleSelectedDate = normalizeScheduleDate(params.get("day") || state.scheduleDate);

  document.querySelectorAll("[data-schedule-view]").forEach((button) => {
    if (button.dataset.navBound === "true") {
      return;
    }

    button.dataset.navBound = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      state.scheduleView = normalizeScheduleView(button.dataset.scheduleView);
      const anchor = parseLocalDate(state.scheduleSelectedDate || state.scheduleDate);
      state.scheduleDate = state.scheduleView === "month"
        ? formatLocalDate(startOfMonthLocal(anchor))
        : formatLocalDate(anchor);
      await loadSchedule();
    });
  });

  document.querySelectorAll("[data-schedule-nav]").forEach((button) => {
    if (button.dataset.navBound === "true") {
      return;
    }

    button.dataset.navBound = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      adjustScheduleRange(button.dataset.scheduleNav);
      await loadSchedule();
    });
  });

  await loadSchedule();
}

function normalizeScheduleView(value) {
  return ["day", "week", "month"].includes(value) ? value : "month";
}

function normalizeScheduleDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return value;
  }

  return formatLocalDate(new Date());
}

function formatLocalDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value) {
  const normalized = normalizeScheduleDate(value);
  return new Date(`${normalized}T00:00:00`);
}

function addCalendarDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addCalendarMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfMonthLocal(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeekLocal(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addCalendarDays(date, diff);
}

function isSameLocalDate(date, comparison) {
  return formatLocalDate(date) === formatLocalDate(comparison);
}

function getScheduleTaskDateKey(task) {
  return formatLocalDate(new Date(task.dueAt));
}

async function loadSchedule() {
  const response = await apiFetch(`/api/schedule?view=${encodeURIComponent(state.scheduleView)}&date=${encodeURIComponent(state.scheduleDate)}&day=${encodeURIComponent(state.scheduleSelectedDate)}`);
  state.scheduleView = response.view || state.scheduleView;
  state.scheduleDate = response.anchorDate || state.scheduleDate;
  state.scheduleItems = response.items || [];

  const selectedCandidate = normalizeScheduleDate(state.scheduleSelectedDate || response.selectedDate || response.anchorDate);
  state.scheduleSelectedDate = selectedCandidate;

  renderSchedule(response);
  syncScheduleUrl();
}

function adjustScheduleRange(direction) {
  const anchor = parseLocalDate(state.scheduleDate);

  if (direction === "today") {
    const today = new Date();
    state.scheduleDate = state.scheduleView === "month"
      ? formatLocalDate(startOfMonthLocal(today))
      : formatLocalDate(today);
    state.scheduleSelectedDate = formatLocalDate(today);
    return;
  }

  if (state.scheduleView === "day") {
    const nextDate = addCalendarDays(anchor, direction === "prev" ? -1 : 1);
    state.scheduleDate = formatLocalDate(nextDate);
    state.scheduleSelectedDate = formatLocalDate(nextDate);
    return;
  }

  if (state.scheduleView === "week") {
    const nextDate = addCalendarDays(anchor, direction === "prev" ? -7 : 7);
    state.scheduleDate = formatLocalDate(nextDate);
    state.scheduleSelectedDate = formatLocalDate(nextDate);
    return;
  }

  const nextDate = addCalendarMonths(anchor, direction === "prev" ? -1 : 1);
  state.scheduleDate = formatLocalDate(nextDate);
  state.scheduleSelectedDate = formatLocalDate(nextDate);
}

function renderSchedule(response) {
  setText("schedule-title", response.range?.label || "Schedule");
  setText("schedule-subtitle", response.range?.subtitle || "Plan and review your workload.");
  setText("schedule-range-label", response.range?.label || "Schedule");
  setText("schedule-scheduled-count", String(response.summary?.scheduledCount || 0));
  setText("schedule-open-count", String(response.summary?.openCount || 0));
  setText("schedule-completed-count", String(response.summary?.completedCount || 0));
  setText("schedule-unscheduled-count", String(response.summary?.unscheduledCount || 0));

  document.querySelectorAll("[data-schedule-view]").forEach((button) => {
    const isActive = button.dataset.scheduleView === state.scheduleView;
    button.className = isActive
      ? "rounded-full bg-primary px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-primary transition-colors"
      : "rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant transition-colors hover:bg-surface-container-high";
  });

  if (state.scheduleView === "month") {
    renderScheduleMonthBoard(response);
  } else if (state.scheduleView === "week") {
    renderScheduleWeekBoard(response);
  } else {
    renderScheduleDayBoard(response);
  }

  renderScheduleSelectedDay();
}

function renderScheduleMonthBoard(response) {
  const container = document.getElementById("schedule-board");

  if (!container) {
    return;
  }

  const anchor = parseLocalDate(response.anchorDate);
  const monthStart = startOfMonthLocal(anchor);
  const gridStart = startOfWeekLocal(monthStart);
  const today = parseLocalDate(response.today);
  const itemsByDate = buildScheduleItemMap(state.scheduleItems);
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const cellDate = addCalendarDays(gridStart, index);
    const dateKey = formatLocalDate(cellDate);
    const items = itemsByDate.get(dateKey) || [];
    const isCurrentMonth = cellDate.getMonth() === monthStart.getMonth();
    const isSelected = dateKey === state.scheduleSelectedDate;
    const isToday = isSameLocalDate(cellDate, today);
    const cellClass = isSelected
      ? "border-primary/50 bg-primary/5"
      : isCurrentMonth
        ? "border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-low"
        : "border-outline-variant/10 bg-surface opacity-60 hover:bg-surface-container-low";

    cells.push(`
      <div class="flex min-h-[144px] flex-col items-start rounded-[1.4rem] border p-3 text-left transition-colors ${cellClass}" data-schedule-day="${dateKey}" role="button" tabindex="0">
        <span class="inline-flex items-center gap-2 text-sm font-bold ${isToday ? "text-primary" : "text-on-surface"}">
          ${cellDate.getDate()}
          ${isToday ? '<span class="h-2 w-2 rounded-full bg-primary"></span>' : ""}
        </span>
        <div class="mt-3 w-full space-y-1.5">
          ${items.slice(0, 3).map((item) => renderScheduleMonthPill(item)).join("")}
          ${items.length > 3 ? `<div class="rounded-full bg-surface-container px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">+${items.length - 3} more</div>` : ""}
        </div>
      </div>
    `);
  }

  container.innerHTML = `
    <div class="overflow-x-auto rounded-[2rem] bg-surface-container-lowest p-5 shadow-sm">
      <div class="min-w-[840px]">
        <div class="grid grid-cols-7 gap-3">
          ${dayLabels.map((label) => `<div class="px-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-outline">${label}</div>`).join("")}
        </div>
        <div class="mt-3 grid grid-cols-7 gap-3">
          ${cells.join("")}
        </div>
      </div>
    </div>
  `;

  bindScheduleBoardActions("month", monthStart);
}

function renderScheduleMonthPill(task) {
  const label = task.dueAt ? new Date(task.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "No time";
  return `
    <button class="flex w-full items-center gap-2 rounded-full px-2 py-1 text-[10px] font-semibold ${scheduleTaskBadgeClass(task)}" data-schedule-task-id="${task.id}" type="button">
      <span class="truncate">${escapeHtml(label)} • ${escapeHtml(task.title)}</span>
    </button>
  `;
}

function renderScheduleWeekBoard(response) {
  const container = document.getElementById("schedule-board");

  if (!container) {
    return;
  }

  const weekStart = startOfWeekLocal(parseLocalDate(response.anchorDate));
  const today = parseLocalDate(response.today);
  const itemsByDate = buildScheduleItemMap(state.scheduleItems);
  const cards = Array.from({ length: 7 }, (_, index) => {
    const cellDate = addCalendarDays(weekStart, index);
    const dateKey = formatLocalDate(cellDate);
    const items = itemsByDate.get(dateKey) || [];
    const isSelected = dateKey === state.scheduleSelectedDate;
    const isToday = isSameLocalDate(cellDate, today);

    return `
      <div class="rounded-[1.75rem] border p-4 ${isSelected ? "border-primary/40 bg-primary/5" : "border-outline-variant/10 bg-surface-container-lowest"}">
        <button class="flex w-full items-start justify-between text-left" data-schedule-day="${dateKey}" type="button">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] ${isToday ? "text-primary" : "text-outline"}">${cellDate.toLocaleDateString("en-US", { weekday: "short" })}</p>
            <p class="mt-1 text-xl font-extrabold text-on-surface">${cellDate.getDate()}</p>
          </div>
          <span class="rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">${items.length}</span>
        </button>
        <div class="mt-4 space-y-2">
          ${items.length
            ? items.map((item) => `
                <button class="w-full rounded-[1rem] px-3 py-3 text-left transition-colors ${scheduleTaskCardClass(item)}" data-schedule-task-id="${item.id}" type="button">
                  <p class="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">${escapeHtml(new Date(item.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}</p>
                  <p class="mt-1 text-sm font-bold">${escapeHtml(item.title)}</p>
                </button>
              `).join("")
            : '<div class="rounded-[1rem] border border-dashed border-outline-variant/30 px-3 py-4 text-sm text-on-surface-variant">No scheduled tasks.</div>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = `<div class="grid gap-4 xl:grid-cols-7">${cards.join("")}</div>`;
  bindScheduleBoardActions("week", weekStart);
}

function renderScheduleDayBoard(response) {
  const container = document.getElementById("schedule-board");

  if (!container) {
    return;
  }

  const selectedDate = state.scheduleSelectedDate || response.anchorDate;
  const items = getScheduleItemsForDate(selectedDate);

  container.innerHTML = `
    <div class="rounded-[2rem] bg-surface-container-lowest p-6 shadow-sm">
      <div class="mb-5 flex items-center justify-between gap-4">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Day Agenda</p>
          <h3 class="mt-2 text-2xl font-extrabold text-on-surface">${escapeHtml(formatScheduleLongLabel(selectedDate))}</h3>
        </div>
        <span class="rounded-full bg-surface-container px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">${items.length} items</span>
      </div>
      <div class="space-y-3">
        ${items.length
          ? items.map((item) => `
              <button class="flex w-full items-start gap-4 rounded-[1.5rem] px-4 py-4 text-left transition-colors ${scheduleTaskCardClass(item)}" data-schedule-task-id="${item.id}" type="button">
                <div class="min-w-[74px] rounded-full bg-surface-container px-3 py-2 text-center text-xs font-bold text-on-surface">
                  ${escapeHtml(new Date(item.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-on-surface">${escapeHtml(item.title)}</p>
                  <p class="mt-1 text-sm text-on-surface-variant">${escapeHtml(item.description || "No description yet.")}</p>
                </div>
              </button>
            `).join("")
          : '<div class="rounded-[1.5rem] border border-dashed border-outline-variant/30 px-4 py-8 text-center text-sm text-on-surface-variant">No scheduled tasks for this day.</div>'}
      </div>
    </div>
  `;

  bindScheduleBoardActions("day", parseLocalDate(selectedDate));
}

function buildScheduleItemMap(items) {
  const map = new Map();

  items.forEach((item) => {
    const key = getScheduleTaskDateKey(item);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  });

  return map;
}

function getScheduleItemsForDate(dateKey) {
  return state.scheduleItems
    .filter((item) => getScheduleTaskDateKey(item) === dateKey)
    .sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
}

function bindScheduleBoardActions(mode, anchorDate) {
  const board = document.getElementById("schedule-board");

  if (!board) {
    return;
  }

  board.querySelectorAll("[data-schedule-day]").forEach((element) => {
    element.addEventListener("click", async () => {
      const nextDate = element.dataset.scheduleDay;
      const clickedDate = parseLocalDate(nextDate);
      state.scheduleSelectedDate = nextDate;

      if (mode === "month" && clickedDate.getMonth() !== anchorDate.getMonth()) {
        state.scheduleDate = formatLocalDate(startOfMonthLocal(clickedDate));
        await loadSchedule();
        return;
      }

      if (mode === "day") {
        state.scheduleDate = nextDate;
        await loadSchedule();
        return;
      }

      renderScheduleSelectedDay();
      syncScheduleUrl();
    });

    element.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      element.click();
    });
  });

  board.querySelectorAll("[data-schedule-task-id]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      event.stopPropagation();
      await openScheduleTaskModal(Number(element.dataset.scheduleTaskId));
    });
  });
}

function renderScheduleSelectedDay() {
  const selectedDate = state.scheduleSelectedDate || state.scheduleDate;
  const items = getScheduleItemsForDate(selectedDate);
  const container = document.getElementById("schedule-selected-list");

  setText("schedule-selected-label", formatScheduleLongLabel(selectedDate));
  setText("schedule-selected-subtitle", items.length ? `${items.length} scheduled item${items.length > 1 ? "s" : ""}` : "No tasks scheduled yet.");

  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = `
      <div class="rounded-[1.5rem] border border-dashed border-outline-variant/30 bg-surface-container-low px-4 py-6 text-sm text-on-surface-variant">
        This day is still open. Add a due date to any task and it will appear here.
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => `
      <button class="w-full rounded-[1.5rem] px-4 py-4 text-left transition-colors ${scheduleTaskCardClass(item)}" data-schedule-task-id="${item.id}" type="button">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-[0.14em] opacity-70">${escapeHtml(new Date(item.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}</p>
            <p class="mt-1 text-sm font-bold">${escapeHtml(item.title)}</p>
            <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(item.project?.name || "General")} • ${escapeHtml(capitalize(item.status))}</p>
          </div>
          ${item.isStarred ? '<span class="material-symbols-outlined text-primary">star</span>' : ""}
        </div>
      </button>
    `)
    .join("");

  container.querySelectorAll("[data-schedule-task-id]").forEach((element) => {
    element.addEventListener("click", async () => {
      await openScheduleTaskModal(Number(element.dataset.scheduleTaskId));
    });
  });
}

function scheduleTaskBadgeClass(task) {
  if (task.status === "completed") {
    return "bg-secondary-container text-on-secondary-container";
  }

  if (task.priority === "high") {
    return "bg-error-container/75 text-on-error-container";
  }

  return task.project?.colorHex
    ? "bg-primary-container text-on-primary-container"
    : "bg-surface-container text-on-surface-variant";
}

function scheduleTaskCardClass(task) {
  if (task.status === "completed") {
    return "bg-secondary-container/60 text-on-secondary-container hover:bg-secondary-container/75";
  }

  if (task.priority === "high") {
    return "bg-error-container/15 text-on-surface hover:bg-error-container/25";
  }

  if (task.status === "in_progress") {
    return "bg-primary/8 text-on-surface hover:bg-primary/12";
  }

  return "bg-surface-container-low text-on-surface hover:bg-surface-container";
}

function formatScheduleLongLabel(value) {
  return parseLocalDate(value).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function syncScheduleUrl() {
  const params = new URLSearchParams();
  params.set("view", state.scheduleView);
  params.set("date", state.scheduleDate);
  params.set("day", state.scheduleSelectedDate);
  window.history.replaceState({}, "", `/schedule?${params.toString()}`);
}

function bindScheduleModal() {
  const modal = document.getElementById("schedule-task-modal");

  if (!modal || modal.dataset.bound === "true") {
    return;
  }

  modal.dataset.bound = "true";

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close-schedule-task-modal]")) {
      closeScheduleTaskModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeScheduleTaskModal();
    }
  });
}

async function openScheduleTaskModal(taskId) {
  const modal = document.getElementById("schedule-task-modal");
  const title = document.getElementById("schedule-task-modal-title");
  const meta = document.getElementById("schedule-task-modal-meta");
  const body = document.getElementById("schedule-task-modal-body");

  if (!modal || !title || !meta || !body) {
    return;
  }

  title.textContent = "Task detail";
  meta.textContent = "Loading...";
  body.innerHTML = `<div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">Loading task detail...</div>`;
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  try {
    const response = await apiFetch(`/api/tasks/${taskId}`);
    const { task } = response;
    title.textContent = task.title;
    meta.textContent = `${capitalize(task.status)} • ${task.project?.name || "General"} • ${task.dueAt ? formatDateTime(task.dueAt) : "No deadline"}`;
    body.innerHTML = renderScheduleTaskModalBody(task);
  } catch (error) {
    body.innerHTML = `<div class="rounded-[1.5rem] border border-error/20 bg-error/5 px-4 py-4 text-sm text-error">${escapeHtml(error.message || "Unable to load this task.")}</div>`;
  }
}

function closeScheduleTaskModal() {
  const modal = document.getElementById("schedule-task-modal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function renderScheduleTaskModalBody(task) {
  return `
    <div class="space-y-5">
      <div class="grid gap-3 md:grid-cols-3">
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Priority</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(capitalize(task.priority || "medium"))}</p>
        </div>
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Subtasks</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(String(task.completedSubtaskCount || 0))} / ${escapeHtml(String(task.subtaskCount || 0))}</p>
        </div>
        <div class="rounded-[1.5rem] bg-surface-container-low px-4 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Updated</p>
          <p class="mt-2 text-sm font-bold text-on-surface">${escapeHtml(relativeTime(task.updatedAt))}</p>
        </div>
      </div>
      <div class="rounded-[1.75rem] bg-surface-container-low px-5 py-5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="${tagClass(task.project?.colorHex)} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em]">${escapeHtml(task.project?.name || "General")}</span>
          ${task.isStarred ? '<span class="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Starred</span>' : ""}
        </div>
        <p class="mt-4 text-sm leading-7 text-on-surface-variant">${escapeHtml(task.description || "No description provided yet.")}</p>
      </div>
      <div class="rounded-[1.75rem] bg-surface-container-low px-5 py-5">
        <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">Recent activity</p>
        <div class="mt-3 space-y-3">
          ${(task.activity || []).slice(0, 4).map((item) => `
            <div class="rounded-[1rem] bg-surface-container-lowest px-4 py-3">
              <p class="text-sm font-semibold text-on-surface">${escapeHtml(item.message)}</p>
              <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-outline">${escapeHtml(relativeTime(item.created_at))}</p>
            </div>
          `).join("") || '<p class="text-sm text-on-surface-variant">No activity yet.</p>'}
        </div>
      </div>
    </div>
  `;
}

async function initTasksPage() {
  if (!state.meta.projects.length && !state.meta.tags.length) {
    state.meta = await apiFetch("/api/meta/options");
  }

  const searchInput = document.getElementById("task-search-input");
  const filterButtons = Array.from(document.querySelectorAll("[data-task-filter]"));
  const statusButtons = Array.from(document.querySelectorAll("[data-task-status]"));

  state.taskFilter = normalizeTaskFilter(new URLSearchParams(window.location.search).get("view"));
  bindTaskComposer();
  bindTaskDetailActions();
  bindTaskEditorModal();

  filterButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      state.taskFilter = normalizeTaskFilter(button.dataset.taskFilter);
      await loadTasks(searchInput ? searchInput.value : "");
    });
  });

  if (searchInput) {
    let debounceId = null;
    searchInput.addEventListener("input", () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => loadTasks(searchInput.value), 250);
    });
  }

  document.getElementById("task-complete-button")?.addEventListener("click", async () => {
    const selectedTaskId = Number(document.body.dataset.selectedTaskId || 0);

    if (!selectedTaskId) {
      return;
    }

    await apiFetch(`/api/tasks/${selectedTaskId}/status`, {
      method: "PATCH",
      body: { status: "completed" }
    });

    await loadTasks(searchInput ? searchInput.value : "");
  });

  statusButtons.forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", async () => {
      const selectedTaskId = Number(document.body.dataset.selectedTaskId || 0);

      if (!selectedTaskId) {
        return;
      }

      try {
        await apiFetch(`/api/tasks/${selectedTaskId}/status`, {
          method: "PATCH",
          body: { status: button.dataset.taskStatus }
        });

        const details = await apiFetch(`/api/tasks/${selectedTaskId}`);
        renderTaskDetail(details.task);
        await loadTasks(searchInput ? searchInput.value : "");
      } catch (error) {
        showPageMessage(error.message || "Could not update task status.", "error");
      }
    });
  });

  document.querySelector("[data-close-task-detail]")?.addEventListener("click", () => {
    clearTaskSelection();
  });

  await loadTasks(searchInput ? searchInput.value : "");
}

async function loadTasks(search, preferredTaskId) {
  const response = await apiFetch(`/api/tasks?search=${encodeURIComponent(search || "")}`);
  state.tasks = response.tasks || [];
  const groups = getTaskGroups();
  const visibleTasks = getVisibleTasksForFilter(groups);

  setText("tasks-count-copy", `You have ${state.tasks.filter((task) => task.status !== "completed").length} open tasks right now.`);
  renderTasksOverview({
    total: state.tasks.length,
    inProgress: groups.inProgress.length,
    todo: groups.todo.length,
    completed: groups.completed.length
  });
  syncTaskFilterButtons();
  applyTaskFilterView();

  const selectedFromQuery = Number(preferredTaskId || new URLSearchParams(window.location.search).get("task") || 0);
  const selectedTaskId = visibleTasks.some((task) => task.id === selectedFromQuery)
    ? selectedFromQuery
    : null;

  renderTaskColumn("tasks-in-progress", groups.inProgress, selectedTaskId);
  renderTaskColumn("tasks-todo", groups.todo, selectedTaskId);
  renderCompletedTasks("tasks-completed", groups.completed, selectedTaskId);

  if (selectedTaskId) {
    document.body.dataset.selectedTaskId = String(selectedTaskId);
    const details = await apiFetch(`/api/tasks/${selectedTaskId}`);
    renderTaskDetail(details.task);
    syncTasksUrl(selectedTaskId);
    return;
  }

  delete document.body.dataset.selectedTaskId;
  syncTasksUrl();
  renderEmptyTaskDetail();
}

function renderTasksOverview(summary) {
  const percentage = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;
  setText("tasks-total-count", String(summary.total));
  setText("tasks-in-progress-count-card", String(summary.inProgress));
  setText("tasks-todo-count-card", String(summary.todo));
  setText("tasks-completed-count-card", String(summary.completed));
  setText("tasks-in-progress-badge", String(summary.inProgress));
  setText("tasks-todo-badge", String(summary.todo));
  setText("tasks-completed-badge", String(summary.completed));
  setText("tasks-progress-percentage", `${percentage}%`);
  setText(
    "tasks-progress-copy",
    summary.total
      ? `${summary.completed} of ${summary.total} tasks completed`
      : "No tasks yet. Create one to start tracking progress."
  );

  const progressBar = document.getElementById("tasks-progress-bar");
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }
}

function syncTaskLayout(hasSelectedTask) {
  const listPanel = document.getElementById("tasks-list-panel");
  const detailPanel = document.getElementById("task-detail-panel");

  if (!listPanel || !detailPanel) {
    return;
  }

  detailPanel.classList.toggle("hidden", !hasSelectedTask);
  listPanel.classList.toggle("lg:max-w-[480px]", hasSelectedTask);
  listPanel.classList.toggle("xl:max-w-[520px]", hasSelectedTask);
}

function normalizeTaskFilter(value) {
  return ["all", "todo", "in_progress", "completed"].includes(value) ? value : "all";
}

function getTaskGroups() {
  return {
    inProgress: state.tasks.filter((task) => task.status === "in_progress"),
    todo: state.tasks.filter((task) => task.status === "todo"),
    completed: state.tasks.filter((task) => task.status === "completed")
  };
}

function getVisibleTasksForFilter(groups) {
  if (state.taskFilter === "in_progress") {
    return groups.inProgress;
  }

  if (state.taskFilter === "todo") {
    return groups.todo;
  }

  if (state.taskFilter === "completed") {
    return groups.completed;
  }

  return [...groups.inProgress, ...groups.todo, ...groups.completed];
}

function syncTaskFilterButtons() {
  document.querySelectorAll("[data-task-filter]").forEach((button) => {
    const isActive = button.dataset.taskFilter === state.taskFilter;
    button.className = isActive
      ? "rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-on-primary transition-colors"
      : "rounded-full bg-surface-container-low px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant transition-colors hover:bg-surface-container";
  });
}

function applyTaskFilterView() {
  const visibilityMap = {
    "tasks-section-in-progress": state.taskFilter === "all" || state.taskFilter === "in_progress",
    "tasks-section-todo": state.taskFilter === "all" || state.taskFilter === "todo",
    "tasks-section-completed": state.taskFilter === "all" || state.taskFilter === "completed"
  };

  Object.entries(visibilityMap).forEach(([id, isVisible]) => {
    const section = document.getElementById(id);
    if (section) {
      section.classList.toggle("hidden", !isVisible);
    }
  });
}

function currentTaskSearchValue() {
  return document.getElementById("task-search-input")?.value || "";
}

function updateTaskActionState() {
  const hasSelectedTask = Boolean(state.selectedTask);

  document.querySelectorAll("[data-task-edit], [data-task-delete], #task-add-subtask-button").forEach((button) => {
    button.disabled = !hasSelectedTask;
    button.classList.toggle("opacity-50", !hasSelectedTask);
    button.classList.toggle("cursor-not-allowed", !hasSelectedTask);
  });
}

function bindTaskDetailActions() {
  const editButton = document.querySelector("[data-task-edit]");
  const deleteButton = document.querySelector("[data-task-delete]");
  const addSubtaskButton = document.getElementById("task-add-subtask-button");

  if (editButton && editButton.dataset.bound !== "true") {
    editButton.dataset.bound = "true";
    editButton.addEventListener("click", () => {
      if (!state.selectedTask) {
        showPageMessage("Select a task first.", "error");
        return;
      }

      openTaskEditor({
        mode: "edit",
        task: state.selectedTask
      });
    });
  }

  if (deleteButton && deleteButton.dataset.bound !== "true") {
    deleteButton.dataset.bound = "true";
    deleteButton.addEventListener("click", async () => {
      if (!state.selectedTask) {
        showPageMessage("Select a task first.", "error");
        return;
      }

      if (!window.confirm(`Delete "${state.selectedTask.title}"?`)) {
        return;
      }

      try {
        await apiFetch(`/api/tasks/${state.selectedTask.id}`, {
          method: "DELETE"
        });

        await loadTasks(currentTaskSearchValue());
        showPageMessage("Task deleted.", "success");
      } catch (error) {
        showPageMessage(error.message || "Could not delete task.", "error");
      }
    });
  }

  if (addSubtaskButton && addSubtaskButton.dataset.bound !== "true") {
    addSubtaskButton.dataset.bound = "true";
    addSubtaskButton.addEventListener("click", async () => {
      if (!state.selectedTask) {
        showPageMessage("Select a task first.", "error");
        return;
      }

      const nextTitle = window.prompt("Add a new subtask", "");

      if (nextTitle === null) {
        return;
      }

      const normalizedTitle = nextTitle.trim();

      if (!normalizedTitle) {
        showPageMessage("Subtask title is required.", "error");
        return;
      }

      await persistTaskUpdateFromDetail(
        state.selectedTask,
        {
          subtasks: [...(state.selectedTask.subtasks || []).map((subtask) => subtask.title), normalizedTitle]
        },
        "Subtask added."
      );
    });
  }

  updateTaskActionState();
}

function bindTaskEditorModal() {
  const modal = document.getElementById("task-editor-modal");
  const form = document.getElementById("task-editor-form");
  const addSubtaskButton = document.getElementById("task-editor-add-subtask");
  const descriptionInput = document.getElementById("task-editor-description");
  const descriptionFormatButtons = Array.from(document.querySelectorAll("[data-task-editor-description-format]"));

  if (!modal || !form || modal.dataset.bound === "true") {
    return;
  }

  modal.dataset.bound = "true";

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close-task-editor]")) {
      closeTaskEditor();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeTaskEditor();
    }
  });

  document.querySelectorAll("[data-task-editor-priority]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      state.taskEditorPriority = button.dataset.taskEditorPriority;
      renderTaskEditorPriorityButtons();
    });
  });

  bindDescriptionFormatting(descriptionFormatButtons, descriptionInput);

  addSubtaskButton?.addEventListener("click", () => {
    state.taskEditorSubtasks.push("");
    renderTaskEditorSubtasks();
    focusLastTaskEditorSubtask();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = document.getElementById("task-editor-submit");
    const errorElement = document.getElementById("task-editor-error");
    const titleInput = document.getElementById("task-editor-task-title");
    const descriptionInput = document.getElementById("task-editor-description");
    const dueAtInput = document.getElementById("task-editor-due-at");
    const projectSelect = document.getElementById("task-editor-project");

    if (!submitButton || !titleInput || !descriptionInput || !dueAtInput || !projectSelect) {
      return;
    }

    if (errorElement) {
      errorElement.textContent = "";
      errorElement.classList.add("hidden");
    }

    const title = titleInput.value.trim();

    if (!title) {
      if (errorElement) {
        errorElement.textContent = "Task title is required.";
        errorElement.classList.remove("hidden");
      }
      return;
    }

    const payload = {
      title,
      description: descriptionInput.value.trim(),
      projectId: projectSelect.value ? Number(projectSelect.value) : null,
      priority: state.taskEditorPriority,
      dueAt: dueAtInput.value ? toSqlDateTime(dueAtInput.value) : null,
      reminderAt: dueAtInput.value ? toSqlDateTime(dueAtInput.value) : null,
      tagIds: Array.from(state.taskEditorTagIds),
      subtasks: state.taskEditorSubtasks.map((value) => value.trim()).filter(Boolean)
    };

    try {
      setButtonLoading(submitButton, true, "Saving...");

      let preferredTaskId = state.taskEditorTargetId;

      if (state.taskEditorMode === "edit" && state.taskEditorTargetId) {
        await apiFetch(`/api/tasks/${state.taskEditorTargetId}`, {
          method: "PUT",
          body: payload
        });
      } else {
        const response = await apiFetch("/api/tasks", {
          method: "POST",
          body: payload
        });
        preferredTaskId = response.taskId;
      }

      closeTaskEditor();
      await loadTasks(currentTaskSearchValue(), preferredTaskId);
      showPageMessage(state.taskEditorMode === "edit" ? "Task updated." : "Task created.", "success");
    } catch (error) {
      if (errorElement) {
        errorElement.textContent = error.message || "Could not save task.";
        errorElement.classList.remove("hidden");
      }
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
}

function openTaskEditor({ mode, task } = {}) {
  const modal = document.getElementById("task-editor-modal");
  const kickerElement = document.getElementById("task-editor-kicker");
  const titleElement = document.getElementById("task-editor-title");
  const subtitleElement = document.getElementById("task-editor-subtitle");
  const titleInput = document.getElementById("task-editor-task-title");
  const descriptionInput = document.getElementById("task-editor-description");
  const dueAtInput = document.getElementById("task-editor-due-at");
  const projectSelect = document.getElementById("task-editor-project");
  const submitButton = document.getElementById("task-editor-submit");
  const errorElement = document.getElementById("task-editor-error");

  if (!modal || !titleInput || !descriptionInput || !dueAtInput || !projectSelect || !submitButton) {
    return;
  }

  state.taskEditorMode = mode === "create" ? "create" : "edit";
  state.taskEditorTargetId = state.taskEditorMode === "edit" ? Number(task?.id || 0) : null;
  state.taskEditorPriority = task?.priority || "medium";
  state.taskEditorSubtasks = (task?.subtasks || []).map((subtask) => subtask.title || "");
  state.taskEditorTagIds = new Set((task?.tags || []).map((tag) => tag.id));

  if (!state.taskEditorSubtasks.length) {
    state.taskEditorSubtasks = [""];
  }

  populateTaskEditorProjectOptions(task?.project?.id || null);
  renderTaskEditorPriorityButtons();
  renderTaskEditorTagOptions();
  renderTaskEditorSubtasks();

  if (kickerElement) {
    kickerElement.textContent = state.taskEditorMode === "edit" ? "Task Editor" : "Task Composer";
  }

  if (titleElement) {
    titleElement.textContent = state.taskEditorMode === "edit" ? "Edit Task" : "Create Task";
  }

  if (subtitleElement) {
    subtitleElement.textContent = state.taskEditorMode === "edit"
      ? "Update task details without leaving the detail panel."
      : "Capture a new task and keep it organized.";
  }

  submitButton.textContent = state.taskEditorMode === "edit" ? "Save Changes" : "Save Task";
  titleInput.value = task?.title || "";
  descriptionInput.value = task?.description || "";
  dueAtInput.value = toDateTimeLocalInputValue(task?.dueAt || "");
  projectSelect.value = task?.project?.id ? String(task.project.id) : "";

  if (errorElement) {
    errorElement.textContent = "";
    errorElement.classList.add("hidden");
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  window.setTimeout(() => titleInput.focus(), 0);
}

function closeTaskEditor() {
  const modal = document.getElementById("task-editor-modal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function populateTaskEditorProjectOptions(selectedProjectId) {
  const projectSelect = document.getElementById("task-editor-project");

  if (!projectSelect) {
    return;
  }

  projectSelect.innerHTML = `
    <option value="">General</option>
    ${state.meta.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("")}
  `;
  projectSelect.value = selectedProjectId ? String(selectedProjectId) : "";
}

function renderTaskEditorPriorityButtons() {
  document.querySelectorAll("[data-task-editor-priority]").forEach((button) => {
    const isActive = button.dataset.taskEditorPriority === state.taskEditorPriority;
    button.className = isActive
      ? "flex-1 rounded-[1.25rem] border border-primary/20 bg-primary text-on-primary px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] transition-colors"
      : "flex-1 rounded-[1.25rem] border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-on-surface transition-colors hover:bg-surface-container";
  });
}

function renderTaskEditorTagOptions() {
  const container = document.getElementById("task-editor-tags");

  if (!container) {
    return;
  }

  container.innerHTML = state.meta.tags
    .map((tag) => {
      const isActive = state.taskEditorTagIds.has(tag.id);
      const classes = isActive
        ? "rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary transition-colors"
        : `${tagClassByType(tag.color_type)} rounded-full px-4 py-2 text-xs font-bold transition-colors`;
      return `<button class="${classes}" data-task-editor-tag="${tag.id}" type="button">${escapeHtml(tag.name)}</button>`;
    })
    .join("");

  container.querySelectorAll("[data-task-editor-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      const tagId = Number(button.dataset.taskEditorTag);
      if (state.taskEditorTagIds.has(tagId)) {
        state.taskEditorTagIds.delete(tagId);
      } else {
        state.taskEditorTagIds.add(tagId);
      }
      renderTaskEditorTagOptions();
    });
  });
}

function renderTaskEditorSubtasks() {
  const container = document.getElementById("task-editor-subtasks");

  if (!container) {
    return;
  }

  container.innerHTML = state.taskEditorSubtasks
    .map((value, index) => `
      <div class="group flex items-center gap-3 rounded-[1.25rem] bg-surface-container-low px-4 py-3">
        <span class="material-symbols-outlined text-primary-fixed-dim">drag_indicator</span>
        <input class="flex-1 border-none bg-transparent p-0 text-sm text-on-surface focus:ring-0" data-task-editor-subtask-input="${index}" maxlength="160" placeholder="Add a subtask" type="text" value="${escapeAttribute(value)}"/>
        <button class="inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error" data-task-editor-subtask-remove="${index}" type="button">
          <span class="material-symbols-outlined text-base">delete</span>
        </button>
      </div>
    `)
    .join("");

  container.querySelectorAll("[data-task-editor-subtask-input]").forEach((input) => {
    input.addEventListener("input", () => {
      state.taskEditorSubtasks[Number(input.dataset.taskEditorSubtaskInput)] = input.value;
    });
  });

  container.querySelectorAll("[data-task-editor-subtask-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.taskEditorSubtasks.splice(Number(button.dataset.taskEditorSubtaskRemove), 1);
      if (!state.taskEditorSubtasks.length) {
        state.taskEditorSubtasks.push("");
      }
      renderTaskEditorSubtasks();
    });
  });
}

function focusLastTaskEditorSubtask() {
  const inputs = document.querySelectorAll("[data-task-editor-subtask-input]");
  const lastInput = inputs[inputs.length - 1];

  if (lastInput) {
    lastInput.focus();
  }
}

function buildTaskPayload(task, overrides = {}) {
  return {
    title: Object.prototype.hasOwnProperty.call(overrides, "title") ? overrides.title : task.title,
    description: Object.prototype.hasOwnProperty.call(overrides, "description") ? overrides.description : (task.description || ""),
    projectId: Object.prototype.hasOwnProperty.call(overrides, "projectId") ? overrides.projectId : (task.project?.id || null),
    priority: Object.prototype.hasOwnProperty.call(overrides, "priority") ? overrides.priority : (task.priority || "medium"),
    dueAt: Object.prototype.hasOwnProperty.call(overrides, "dueAt") ? overrides.dueAt : (task.dueAt || null),
    reminderAt: Object.prototype.hasOwnProperty.call(overrides, "reminderAt") ? overrides.reminderAt : (task.reminderAt || task.dueAt || null),
    tagIds: Object.prototype.hasOwnProperty.call(overrides, "tagIds") ? overrides.tagIds : (task.tags || []).map((tag) => tag.id),
    subtasks: Object.prototype.hasOwnProperty.call(overrides, "subtasks")
      ? overrides.subtasks
      : (task.subtasks || []).map((subtask) => subtask.title)
  };
}

async function persistTaskUpdateFromDetail(task, overrides, successMessage) {
  try {
    await apiFetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      body: buildTaskPayload(task, overrides)
    });

    await loadTasks(currentTaskSearchValue(), task.id);
    showPageMessage(successMessage || "Task updated.", "success");
  } catch (error) {
    showPageMessage(error.message || "Could not update task.", "error");
  }
}

function toDateTimeLocalInputValue(value) {
  if (!value) {
    return "";
  }

  const normalizedValue = typeof value === "string" ? value.replace(" ", "T") : value;
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function syncTasksUrl(selectedTaskId) {
  if (document.body.dataset.page !== "tasks") {
    return;
  }

  const params = new URLSearchParams();

  if (selectedTaskId) {
    params.set("task", String(selectedTaskId));
  }

  if (state.taskFilter !== "all") {
    params.set("view", state.taskFilter);
  }

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function renderTaskColumn(containerId, tasks, selectedTaskId) {
  const container = document.getElementById(containerId);

  if (!container) {
    return;
  }

  if (!tasks.length) {
    container.innerHTML = `
      <div class="rounded-[1.25rem] border border-dashed border-outline-variant/40 bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">
        No tasks in this section yet.
      </div>
    `;
    return;
  }

  container.innerHTML = tasks
    .map((task) => {
      const isSelected = task.id === selectedTaskId;
      const wrapperClass = isSelected
        ? "bg-surface-container-lowest p-5 rounded-xl border-l-4 border-primary shadow-[0px_4px_12px_rgba(43,52,55,0.04)] cursor-pointer"
        : "bg-surface p-5 rounded-xl hover:bg-surface-container-low transition-colors group cursor-pointer border border-transparent hover:border-outline-variant/10";
      const titleClass = isSelected
        ? "font-bold text-on-surface"
        : "font-bold text-on-surface group-hover:text-primary transition-colors";

      return `
        <div class="${wrapperClass}" data-task-card="${task.id}">
          <div class="flex justify-between items-start mb-2">
            <h4 class="${titleClass}">${escapeHtml(task.title)}</h4>
            <span class="material-symbols-outlined text-${task.priority === "high" ? "error" : "outline-variant"} text-sm">${task.isStarred ? "star" : "flag"}</span>
          </div>
          <p class="text-xs text-on-surface-variant line-clamp-2 mb-4 leading-relaxed">${escapeHtml(task.description || "No description yet.")}</p>
          <div class="flex items-center justify-between">
            <span class="${tagClass(task.project?.colorHex)} px-3 py-1 rounded-full text-[10px] font-medium">${escapeHtml(task.project?.name || "General")}</span>
            <div class="flex items-center text-[10px] font-semibold text-on-surface-variant gap-1">
              <span class="material-symbols-outlined text-sm">schedule</span>
              ${escapeHtml(task.dueAt ? formatDateTime(task.dueAt) : "No deadline")}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-task-card]").forEach((element) => {
    element.addEventListener("click", async () => {
      const taskId = Number(element.dataset.taskCard);
      document.body.dataset.selectedTaskId = String(taskId);
      const details = await apiFetch(`/api/tasks/${taskId}`);
      renderTaskDetail(details.task);
      syncTasksUrl(taskId);
      const groups = getTaskGroups();
      renderTaskColumn("tasks-in-progress", groups.inProgress, taskId);
      renderTaskColumn("tasks-todo", groups.todo, taskId);
      renderCompletedTasks("tasks-completed", groups.completed, taskId);
      applyTaskFilterView();
    });
  });
}

function renderCompletedTasks(containerId, tasks, selectedTaskId) {
  const container = document.getElementById(containerId);

  if (!container) {
    return;
  }

  if (!tasks.length) {
    container.innerHTML = `
      <div class="rounded-[1.25rem] border border-dashed border-outline-variant/40 bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">
        Nothing completed yet.
      </div>
    `;
    return;
  }

  container.innerHTML = tasks
    .map((task) => `
      <div class="bg-surface p-4 rounded-xl flex items-center gap-4 cursor-pointer ${task.id === selectedTaskId ? "border border-primary-fixed bg-surface-container-lowest" : ""}" data-task-card="${task.id}">
        <span class="material-symbols-outlined text-primary-fixed-dim" style="font-variation-settings: 'FILL' 1;">check_circle</span>
        <h4 class="font-medium text-sm line-through">${escapeHtml(task.title)}</h4>
      </div>
    `)
    .join("");

  container.querySelectorAll("[data-task-card]").forEach((element) => {
    element.addEventListener("click", async () => {
      const taskId = Number(element.dataset.taskCard);
      document.body.dataset.selectedTaskId = String(taskId);
      const details = await apiFetch(`/api/tasks/${taskId}`);
      renderTaskDetail(details.task);
      syncTasksUrl(taskId);
      const groups = getTaskGroups();
      renderTaskColumn("tasks-in-progress", groups.inProgress, taskId);
      renderTaskColumn("tasks-todo", groups.todo, taskId);
      renderCompletedTasks("tasks-completed", groups.completed, taskId);
      applyTaskFilterView();
    });
  });
}

function bindTaskComposer() {
  const input = document.getElementById("task-activity-input");
  const emojiToggle = document.getElementById("task-emoji-toggle");
  const imageButton = document.getElementById("task-image-button");
  const linkButton = document.getElementById("task-link-button");
  const fileButton = document.getElementById("task-file-button");
  const fileInput = document.getElementById("task-file-input");
  const discardButton = document.getElementById("task-activity-discard");
  const submitButton = document.getElementById("task-activity-submit");
  const emojiPicker = document.getElementById("task-emoji-picker");

  if (!input || input.dataset.bound === "true") {
    syncTaskComposerUI();
    return;
  }

  input.dataset.bound = "true";

  input.addEventListener("input", () => {
    state.taskComposerDraft.message = input.value;
    syncTaskComposerUI();
  });

  emojiToggle?.addEventListener("click", () => {
    state.taskComposerEmojiOpen = !state.taskComposerEmojiOpen;
    syncTaskComposerUI();
  });

  emojiPicker?.querySelectorAll("[data-task-emoji]").forEach((button) => {
    button.addEventListener("click", () => {
      state.taskComposerDraft.emoji = normalizeTaskEmojiChoice(button.dataset.taskEmoji);
      state.taskComposerEmojiOpen = false;
      syncTaskComposerUI();
    });
  });

  imageButton?.addEventListener("click", () => {
    const nextValue = window.prompt(
      "Paste an image URL",
      state.taskComposerDraft.imageUrl || ""
    );

    if (nextValue === null) {
      return;
    }

    state.taskComposerDraft.imageUrl = nextValue.trim();
    syncTaskComposerUI();
  });

  linkButton?.addEventListener("click", () => {
    const nextValue = window.prompt(
      "Paste a reference link",
      state.taskComposerDraft.linkUrl || ""
    );

    if (nextValue === null) {
      return;
    }

    state.taskComposerDraft.linkUrl = nextValue.trim();
    syncTaskComposerUI();
  });

  fileButton?.addEventListener("click", () => {
    fileInput?.click();
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    state.taskComposerDraft.fileLabel = file
      ? `${file.name} (${formatFileSize(file.size)})`
      : "";
    syncTaskComposerUI();
  });

  discardButton?.addEventListener("click", () => {
    resetTaskComposer();
  });

  submitButton?.addEventListener("click", async () => {
    const selectedTaskId = Number(document.body.dataset.selectedTaskId || 0);

    if (!selectedTaskId) {
      showPageMessage("Select a task first.", "error");
      return;
    }

    try {
      setButtonLoading(submitButton, true, "Posting...");

      await apiFetch(`/api/tasks/${selectedTaskId}/activity`, {
        method: "POST",
        body: {
          message: state.taskComposerDraft.message,
          emoji: state.taskComposerDraft.emoji || null,
          imageUrl: state.taskComposerDraft.imageUrl || null,
          linkUrl: state.taskComposerDraft.linkUrl || null,
          fileLabel: state.taskComposerDraft.fileLabel || null
        }
      });

      resetTaskComposer();
      const details = await apiFetch(`/api/tasks/${selectedTaskId}`);
      renderTaskDetail(details.task);
      showPageMessage("Task update posted.", "success");
    } catch (error) {
      showPageMessage(error.message || "Could not post task update.", "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  syncTaskComposerUI();
}

function resetTaskComposer() {
  state.taskComposerDraft = defaultTaskComposerDraft();
  state.taskComposerEmojiOpen = false;

  const fileInput = document.getElementById("task-file-input");
  if (fileInput) {
    fileInput.value = "";
  }

  syncTaskComposerUI();
}

function syncTaskComposerUI() {
  const input = document.getElementById("task-activity-input");
  const assets = document.getElementById("task-activity-assets");
  const emojiPicker = document.getElementById("task-emoji-picker");
  const discardButton = document.getElementById("task-activity-discard");
  const submitButton = document.getElementById("task-activity-submit");
  const hasSelectedTask = Boolean(document.body.dataset.selectedTaskId);
  const hasDraft = Boolean(
    state.taskComposerDraft.message.trim()
    || state.taskComposerDraft.emoji
    || state.taskComposerDraft.imageUrl
    || state.taskComposerDraft.linkUrl
    || state.taskComposerDraft.fileLabel
  );

  if (input) {
    input.value = state.taskComposerDraft.message;
    input.disabled = !hasSelectedTask;
    input.placeholder = hasSelectedTask
      ? "Write a quick update for this task..."
      : "Select a task to add an update...";
  }

  if (emojiPicker) {
    emojiPicker.classList.toggle("hidden", !state.taskComposerEmojiOpen || !hasSelectedTask);
    emojiPicker.classList.toggle("flex", state.taskComposerEmojiOpen && hasSelectedTask);
  }

  if (discardButton) {
    discardButton.disabled = !hasSelectedTask || !hasDraft;
    discardButton.classList.toggle("opacity-50", discardButton.disabled);
  }

  if (submitButton) {
    submitButton.disabled = !hasSelectedTask || !hasDraft;
    submitButton.classList.toggle("opacity-50", submitButton.disabled);
  }

  document.querySelectorAll("#task-image-button, #task-link-button, #task-file-button, #task-emoji-toggle").forEach((button) => {
    button.disabled = !hasSelectedTask;
    button.classList.toggle("opacity-50", !hasSelectedTask);
  });

  if (!assets) {
    return;
  }

  const chips = [];

  if (state.taskComposerDraft.emoji) {
    chips.push({
      key: "emoji",
      label: `Emoji ${state.taskComposerDraft.emoji}`,
      icon: "mood"
    });
  }

  if (state.taskComposerDraft.imageUrl) {
    chips.push({
      key: "imageUrl",
      label: "Image attached",
      icon: "image"
    });
  }

  if (state.taskComposerDraft.linkUrl) {
    chips.push({
      key: "linkUrl",
      label: state.taskComposerDraft.linkUrl,
      icon: "link"
    });
  }

  if (state.taskComposerDraft.fileLabel) {
    chips.push({
      key: "fileLabel",
      label: state.taskComposerDraft.fileLabel,
      icon: "attach_file"
    });
  }

  if (!chips.length) {
    assets.innerHTML = "";
    assets.classList.add("hidden");
    return;
  }

  assets.classList.remove("hidden");
  assets.classList.add("flex");
  assets.innerHTML = chips.map((chip) => `
    <div class="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface">
      <span class="material-symbols-outlined text-base text-primary">${chip.icon}</span>
      <span class="max-w-[200px] truncate">${escapeHtml(chip.label)}</span>
      <button class="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container" data-remove-task-asset="${chip.key}" type="button">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  `).join("");

  assets.querySelectorAll("[data-remove-task-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      state.taskComposerDraft[button.dataset.removeTaskAsset] = "";
      syncTaskComposerUI();
    });
  });
}

function formatFileSize(size) {
  if (!size) {
    return "0 B";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeTaskEmojiChoice(value) {
  const choices = {
    smile: "🙂",
    fire: "🔥",
    done: "✅",
    idea: "💡",
    clip: "📎",
    target: "🎯"
  };

  return choices[value] || value || "";
}

function formatTaskDescriptionInline(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function renderTaskDescriptionMarkup(value) {
  const lines = String(value || "").split("\n");
  const blocks = [];
  let bulletItems = [];

  const flushBulletItems = () => {
    if (!bulletItems.length) {
      return;
    }

    blocks.push(`
      <ul class="list-disc space-y-2 pl-6">
        ${bulletItems.map((item) => `<li>${formatTaskDescriptionInline(item)}</li>`).join("")}
      </ul>
    `);
    bulletItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushBulletItems();
      return;
    }

    if (/^(#{1,3})\s+/.test(trimmed)) {
      const headingPrefix = trimmed.match(/^(#{1,3})\s+/)?.[1] || "#";
      const headingText = trimmed.replace(/^#{1,3}\s+/, "");
      const headingLevel = Math.min(5, headingPrefix.length + 2);
      const headingSizeClass = headingLevel <= 3 ? "text-2xl mt-2" : headingLevel === 4 ? "text-xl mt-1" : "text-lg";

      flushBulletItems();
      blocks.push(`<h${headingLevel} class="font-headline font-extrabold text-on-surface ${headingSizeClass}">${formatTaskDescriptionInline(headingText)}</h${headingLevel}>`);
      return;
    }

    if (/^[\u2022*-]\s+/.test(trimmed)) {
      bulletItems.push(trimmed.replace(/^[\u2022*-]\s+/, ""));
      return;
    }

    flushBulletItems();
    blocks.push(`<p>${formatTaskDescriptionInline(trimmed)}</p>`);
  });

  flushBulletItems();

  return blocks.join("") || "<p>No description yet.</p>";
}

function syncTaskStatusButtons(status) {
  document.querySelectorAll("[data-task-status]").forEach((button) => {
    const isActive = button.dataset.taskStatus === status;
    button.className = isActive
      ? "rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-on-primary transition-colors"
      : "rounded-full bg-surface-container-low px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant transition-colors hover:bg-surface-container";
    button.disabled = !document.body.dataset.selectedTaskId;
    button.classList.toggle("opacity-50", !document.body.dataset.selectedTaskId);
  });
}

function getTextareaActiveRange(textarea) {
  if (textarea.selectionStart !== textarea.selectionEnd) {
    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
  }

  const value = textarea.value;
  const caret = textarea.selectionStart;
  const start = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const nextBreak = value.indexOf("\n", caret);

  return {
    start,
    end: nextBreak === -1 ? value.length : nextBreak
  };
}

function replaceTextareaRange(textarea, start, end, nextValue, nextSelectionStart, nextSelectionEnd) {
  const currentValue = textarea.value;
  textarea.value = `${currentValue.slice(0, start)}${nextValue}${currentValue.slice(end)}`;
  textarea.focus();
  textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
}

function toggleItalicSelection(textarea) {
  const { start, end } = getTextareaActiveRange(textarea);
  const selectedValue = textarea.value.slice(start, end);
  const trimmedValue = selectedValue.trim();

  if (!trimmedValue) {
    const placeholder = "_italic text_";
    replaceTextareaRange(textarea, start, end, placeholder, start + 1, start + placeholder.length - 1);
    return;
  }

  const leadingWhitespace = selectedValue.match(/^\s*/)?.[0] || "";
  const trailingWhitespace = selectedValue.match(/\s*$/)?.[0] || "";
  const coreValue = selectedValue.slice(leadingWhitespace.length, selectedValue.length - trailingWhitespace.length);
  const toggledCore = coreValue.startsWith("_") && coreValue.endsWith("_")
    ? coreValue.slice(1, -1)
    : `_${coreValue}_`;
  const nextValue = `${leadingWhitespace}${toggledCore}${trailingWhitespace}`;

  replaceTextareaRange(textarea, start, end, nextValue, start, start + nextValue.length);
}

function toggleBoldSelection(textarea) {
  const { start, end } = getTextareaActiveRange(textarea);
  const selectedValue = textarea.value.slice(start, end);
  const trimmedValue = selectedValue.trim();

  if (!trimmedValue) {
    const placeholder = "**bold text**";
    replaceTextareaRange(textarea, start, end, placeholder, start + 2, start + placeholder.length - 2);
    return;
  }

  const leadingWhitespace = selectedValue.match(/^\s*/)?.[0] || "";
  const trailingWhitespace = selectedValue.match(/\s*$/)?.[0] || "";
  const coreValue = selectedValue.slice(leadingWhitespace.length, selectedValue.length - trailingWhitespace.length);
  const toggledCore = coreValue.startsWith("**") && coreValue.endsWith("**")
    ? coreValue.slice(2, -2)
    : `**${coreValue}**`;
  const nextValue = `${leadingWhitespace}${toggledCore}${trailingWhitespace}`;

  replaceTextareaRange(textarea, start, end, nextValue, start, start + nextValue.length);
}

function toggleHeadingSelection(textarea) {
  const value = textarea.value;
  const start = value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
  const endBreak = value.indexOf("\n", textarea.selectionEnd);
  const end = endBreak === -1 ? value.length : endBreak;
  const selectedBlock = value.slice(start, end);
  const lines = selectedBlock.split("\n");
  const allHeadings = lines.filter((line) => line.trim()).every((line) => /^#{1,3}\s+/.test(line.trim()));
  const nextLines = lines.map((line) => {
    if (!line.trim()) {
      return line;
    }

    const leadingWhitespace = line.match(/^\s*/)?.[0] || "";

    if (allHeadings) {
      return line.replace(/^(\s*)#{1,3}\s+/, "$1");
    }

    return `${leadingWhitespace}# ${line.trimStart()}`;
  });
  const nextValue = nextLines.join("\n");

  replaceTextareaRange(textarea, start, end, nextValue, start, start + nextValue.length);
}

function toggleBulletSelection(textarea) {
  const value = textarea.value;
  const start = value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
  const endBreak = value.indexOf("\n", textarea.selectionEnd);
  const end = endBreak === -1 ? value.length : endBreak;
  const selectedBlock = value.slice(start, end);
  const lines = selectedBlock.split("\n");
  const allBulleted = lines.filter((line) => line.trim()).every((line) => /^[\u2022*-]\s+/.test(line.trim()));
  const nextLines = lines.map((line) => {
    if (!line.trim()) {
      return line;
    }

    if (allBulleted) {
      return line.replace(/^(\s*)[\u2022*-]\s+/, "$1");
    }

    const leadingWhitespace = line.match(/^\s*/)?.[0] || "";
    return `${leadingWhitespace}\u2022 ${line.trimStart()}`;
  });
  const nextValue = nextLines.join("\n");

  replaceTextareaRange(textarea, start, end, nextValue, start, start + nextValue.length);
}

function bindDescriptionFormatting(buttons, textarea) {
  if (!textarea) {
    return;
  }

  buttons.forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const format = button.dataset.descriptionFormat || button.dataset.taskEditorDescriptionFormat;

      if (format === "heading") {
        toggleHeadingSelection(textarea);
        return;
      }

      if (format === "bold") {
        toggleBoldSelection(textarea);
        return;
      }

      if (format === "italic") {
        toggleItalicSelection(textarea);
        return;
      }

      if (format === "bullet") {
        toggleBulletSelection(textarea);
      }
    });
  });
}

function normalizeTaskEmojiChoice(value) {
  const choices = {
    smile: "\u{1F642}",
    fire: "\u{1F525}",
    done: "\u{2705}",
    idea: "\u{1F4A1}",
    clip: "\u{1F4CE}",
    target: "\u{1F3AF}"
  };

  return choices[value] || value || "";
}

function taskActivityIcon(actionType) {
  if (actionType === "created") {
    return "add_task";
  }

  if (actionType === "commented") {
    return "add_comment";
  }

  if (actionType === "status_changed") {
    return "check_circle";
  }

  if (actionType === "star_updated") {
    return "star";
  }

  if (actionType === "deleted") {
    return "delete";
  }

  return "edit";
}

function renderTaskActivityMetadata(metadata) {
  if (!metadata) {
    return "";
  }

  const blocks = [];

  if (metadata.emoji) {
    blocks.push(`
      <div class="inline-flex items-center gap-2 rounded-full bg-primary/8 px-3 py-2 text-sm font-semibold text-primary">
        <span class="text-lg leading-none">${escapeHtml(metadata.emoji)}</span>
        <span>Reaction added</span>
      </div>
    `);
  }

  if (metadata.imageUrl) {
    blocks.push(`
      <div class="overflow-hidden rounded-[1.25rem] border border-outline-variant/15 bg-surface-container-low">
        <img alt="Task attachment" class="h-40 w-full object-cover" src="${escapeAttribute(metadata.imageUrl)}"/>
      </div>
    `);
  }

  if (metadata.linkUrl) {
    blocks.push(`
      <a class="flex items-center gap-3 rounded-[1.1rem] border border-outline-variant/15 bg-surface-container-low px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-surface-container" href="${escapeAttribute(metadata.linkUrl)}" rel="noreferrer" target="_blank">
        <span class="material-symbols-outlined text-base">link</span>
        <span class="truncate">${escapeHtml(metadata.linkUrl)}</span>
      </a>
    `);
  }

  if (metadata.fileLabel) {
    blocks.push(`
      <div class="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface">
        <span class="material-symbols-outlined text-base text-primary">attach_file</span>
        <span>${escapeHtml(metadata.fileLabel)}</span>
      </div>
    `);
  }

  if (!blocks.length) {
    return "";
  }

  return `<div class="mt-3 flex flex-col gap-3">${blocks.join("")}</div>`;
}

function renderTaskDetail(task) {
  state.selectedTask = task;
  syncTaskLayout(true);
  setText("task-project-name", task.project?.name || "General");
  setText("task-created-at", `Created ${formatLongDate(task.createdAt)}`);
  setText("task-title", task.title);
  setText("task-assignee", state.user.fullName);
  setText("task-due-at", task.dueAt ? formatDateTime(task.dueAt) : "No deadline");
  setText("task-priority", capitalize(task.priority));
  resetTaskComposer();

  const description = document.getElementById("task-description");
  if (description) {
    description.innerHTML = renderTaskDescriptionMarkup(task.description || "No description yet.");
  }

  syncTaskStatusButtons(task.status);
  updateTaskActionState();

  const completeButton = document.getElementById("task-complete-button");
  if (completeButton) {
    completeButton.disabled = task.status === "completed";
    completeButton.classList.toggle("opacity-50", task.status === "completed");
    completeButton.textContent = task.status === "completed" ? "Task Completed" : "Complete Task";
  }

  const subtasksContainer = document.getElementById("task-subtasks");
  if (subtasksContainer) {
    subtasksContainer.innerHTML = (task.subtasks || []).length
      ? task.subtasks
        .map((subtask, index) => `
          <div class="group flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-surface-container">
            <button class="flex items-center gap-4 text-left" data-subtask-toggle="${subtask.id}" type="button">
              <div class="flex h-6 w-6 items-center justify-center rounded-md border-2 border-primary-fixed-dim ${subtask.is_completed ? "bg-primary-fixed" : ""}">
                <span class="material-symbols-outlined text-primary text-sm ${subtask.is_completed ? "" : "hidden group-hover:block"}">check</span>
              </div>
            </button>
            <span class="flex-1 text-on-surface font-medium ${subtask.is_completed ? "line-through opacity-40" : ""}">${escapeHtml(subtask.title)}</span>
            <div class="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button class="inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary" data-subtask-edit-index="${index}" type="button">
                <span class="material-symbols-outlined text-base">edit</span>
              </button>
              <button class="inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error" data-subtask-delete-index="${index}" type="button">
                <span class="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          </div>
        `)
        .join("")
      : `
        <div class="rounded-[1.25rem] border border-dashed border-outline-variant/40 bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">
          No subtasks yet. Use "Add Subtask" to create the first one.
        </div>
      `;

    subtasksContainer.querySelectorAll("[data-subtask-toggle]").forEach((element) => {
      element.addEventListener("click", async () => {
        try {
          await apiFetch(`/api/subtasks/${element.dataset.subtaskToggle}/toggle`, {
            method: "PATCH"
          });

          await loadTasks(currentTaskSearchValue(), task.id);
        } catch (error) {
          showPageMessage(error.message || "Could not update subtask.", "error");
        }
      });
    });

    subtasksContainer.querySelectorAll("[data-subtask-edit-index]").forEach((element) => {
      element.addEventListener("click", async () => {
        const subtaskIndex = Number(element.dataset.subtaskEditIndex);
        const currentSubtask = task.subtasks[subtaskIndex];
        const nextTitle = window.prompt("Edit subtask", currentSubtask?.title || "");

        if (nextTitle === null) {
          return;
        }

        const normalizedTitle = nextTitle.trim();

        if (!normalizedTitle) {
          showPageMessage("Subtask title is required.", "error");
          return;
        }

        await persistTaskUpdateFromDetail(
          task,
          {
            subtasks: task.subtasks.map((item, index) => (index === subtaskIndex ? normalizedTitle : item.title))
          },
          "Subtask updated."
        );
      });
    });

    subtasksContainer.querySelectorAll("[data-subtask-delete-index]").forEach((element) => {
      element.addEventListener("click", async () => {
        const subtaskIndex = Number(element.dataset.subtaskDeleteIndex);
        const targetSubtask = task.subtasks[subtaskIndex];

        if (!window.confirm(`Delete subtask "${targetSubtask?.title || ""}"?`)) {
          return;
        }

        await persistTaskUpdateFromDetail(
          task,
          {
            subtasks: task.subtasks
              .filter((_item, index) => index !== subtaskIndex)
              .map((item) => item.title)
          },
          "Subtask deleted."
        );
      });
    });
  }

  const activityContainer = document.getElementById("task-activity");
  if (activityContainer) {
    activityContainer.innerHTML = (task.activity || []).length
      ? task.activity.map((item) => `
        <div class="flex gap-4 relative z-10">
          <div class="w-6 h-6 rounded-full bg-surface-container-highest border-4 border-surface-container-lowest flex items-center justify-center">
            <span class="material-symbols-outlined text-[10px] text-primary" style="font-variation-settings: 'FILL' 1;">${taskActivityIcon(item.action_type)}</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-on-surface">${escapeHtml(item.message)}</p>
            ${renderTaskActivityMetadata(item.metadata)}
            <p class="text-[10px] text-outline mt-1 uppercase tracking-widest">${escapeHtml(relativeTime(item.created_at))}</p>
          </div>
        </div>
      `)
      .join("")
      : `
        <div class="rounded-[1.25rem] border border-dashed border-outline-variant/40 bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">
          No activity yet. Use the update composer below to leave the first note.
        </div>
      `;
  }

  syncTaskComposerUI();
}

function renderEmptyTaskDetail() {
  state.selectedTask = null;
  syncTaskLayout(false);
  setText("task-project-name", "No task selected");
  setText("task-created-at", "Create a new task or clear your search");
  setText("task-title", "Your task details will appear here");
  setText("task-assignee", state.user?.fullName || "Workspace member");
  setText("task-due-at", "No deadline");
  setText("task-priority", "None");

  const description = document.getElementById("task-description");
  if (description) {
    description.innerHTML = "<p>Select a task from the left to review its details, subtasks, and activity.</p>";
  }

  syncTaskStatusButtons("");
  updateTaskActionState();

  const completeButton = document.getElementById("task-complete-button");
  if (completeButton) {
    completeButton.disabled = true;
    completeButton.classList.add("opacity-50");
    completeButton.textContent = "Complete Task";
  }

  const subtasksContainer = document.getElementById("task-subtasks");
  if (subtasksContainer) {
    subtasksContainer.innerHTML = `
      <div class="rounded-[1.25rem] border border-dashed border-outline-variant/40 bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">
        No subtasks to show yet.
      </div>
    `;
  }

  const activityContainer = document.getElementById("task-activity");
  if (activityContainer) {
    activityContainer.innerHTML = `
      <div class="rounded-[1.25rem] border border-dashed border-outline-variant/40 bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">
        Activity will appear after you select a task.
      </div>
    `;
  }

  resetTaskComposer();
}

function clearTaskSelection() {
  state.selectedTask = null;
  delete document.body.dataset.selectedTaskId;
  syncTasksUrl();

  const groups = getTaskGroups();
  renderTaskColumn("tasks-in-progress", groups.inProgress, null);
  renderTaskColumn("tasks-todo", groups.todo, null);
  renderCompletedTasks("tasks-completed", groups.completed, null);
  applyTaskFilterView();
  renderEmptyTaskDetail();
}

async function initCreateTaskPage() {
  state.meta = await apiFetch("/api/meta/options");

  const form = document.getElementById("create-task-form");
  const dueInput = document.getElementById("task-due-date-input");
  const projectSelect = document.getElementById("task-project-select");
  const priorityButtons = Array.from(document.querySelectorAll("[data-priority-button]"));
  const addSubtaskButton = document.getElementById("add-subtask-button");
  const tagContainer = document.getElementById("task-tag-list");
  const dueCard = document.getElementById("due-date-card");
  const discardButton = document.getElementById("discard-task-button");
  const descriptionInput = document.getElementById("task-description-input");
  const descriptionFormatButtons = Array.from(document.querySelectorAll("[data-description-format]"));

  let selectedPriority = "medium";
  let subtasks = ["Draft initial outline", "Gather visual references"];
  const selectedTagIds = new Set();

  projectSelect.innerHTML = state.meta.projects
    .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
    .join("");

  syncProjectText(projectSelect);
  renderSubtasks();
  renderTags();

  projectSelect.addEventListener("change", () => {
    syncProjectText(projectSelect);
  });

  dueCard?.addEventListener("click", () => {
    if (typeof dueInput.showPicker === "function") {
      dueInput.showPicker();
    } else {
      dueInput.focus();
    }
  });

  dueInput?.addEventListener("change", () => {
    const value = dueInput.value;
    setText("task-due-date-display", value ? formatDateTime(value) : "Pick due date");
    setText("task-reminder-display", value ? "Reminder at due time" : "No reminder");
  });

  bindDescriptionFormatting(descriptionFormatButtons, descriptionInput);

  priorityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedPriority = button.dataset.priorityButton;
      priorityButtons.forEach((item) => {
        item.dataset.active = item === button ? "true" : "false";
      });
      applyPriorityStyles(priorityButtons);
    });
  });

  addSubtaskButton?.addEventListener("click", () => {
    subtasks.push("");
    renderSubtasks();
  });

  discardButton?.addEventListener("click", () => {
    form.reset();
    subtasks = ["", ""];
    selectedTagIds.clear();
    selectedPriority = "medium";
    renderSubtasks();
    renderTags();
    priorityButtons.forEach((item) => {
      item.dataset.active = item.dataset.priorityButton === "medium" ? "true" : "false";
    });
    applyPriorityStyles(priorityButtons);
    setText("task-due-date-display", "Pick due date");
    setText("task-reminder-display", "No reminder");
    syncProjectText(projectSelect);
    showPageMessage("Draft cleared.", "success");
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = document.getElementById("save-task-button");

    try {
      setButtonLoading(submitButton, true, "Saving...");

      const payload = {
        title: document.getElementById("task-title-input").value.trim(),
        description: descriptionInput.value.trim(),
        priority: selectedPriority,
        dueAt: dueInput.value ? toSqlDateTime(dueInput.value) : null,
        reminderAt: dueInput.value ? toSqlDateTime(dueInput.value) : null,
        projectId: Number(projectSelect.value),
        tagIds: Array.from(selectedTagIds),
        subtasks: Array.from(document.querySelectorAll("[data-subtask-input]"))
          .map((input) => input.value.trim())
          .filter(Boolean)
      };

      const response = await apiFetch("/api/tasks", {
        method: "POST",
        body: payload
      });

      await navigateTo(`/tasks?task=${response.taskId}`);
    } catch (error) {
      showPageMessage(error.message || "Could not save task.", "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  function renderSubtasks() {
    const container = document.getElementById("create-subtask-list");

    if (!container) {
      return;
    }

    container.innerHTML = subtasks
      .map((value, index) => `
        <div class="flex items-center gap-4 p-4 bg-surface-container-low rounded-full group hover:bg-surface-container transition-colors">
          <span class="material-symbols-outlined text-primary-fixed-dim">radio_button_unchecked</span>
          <input class="bg-transparent border-none focus:ring-0 p-0 flex-1 text-sm" data-subtask-input="${index}" value="${escapeAttribute(value)}" placeholder="Add a subtask" type="text"/>
          <button class="opacity-0 group-hover:opacity-100 transition-opacity" type="button" data-remove-subtask="${index}">
            <span class="material-symbols-outlined text-outline">close</span>
          </button>
        </div>
      `)
      .join("");

    container.querySelectorAll("[data-subtask-input]").forEach((input) => {
      input.addEventListener("input", () => {
        subtasks[Number(input.dataset.subtaskInput)] = input.value;
      });
    });

    container.querySelectorAll("[data-remove-subtask]").forEach((button) => {
      button.addEventListener("click", () => {
        subtasks.splice(Number(button.dataset.removeSubtask), 1);
        if (!subtasks.length) {
          subtasks.push("");
        }
        renderSubtasks();
      });
    });
  }

  function renderTags() {
    if (!tagContainer) {
      return;
    }

    tagContainer.innerHTML = state.meta.tags
      .map((tag) => {
        const active = selectedTagIds.has(tag.id);
        const classes = active
          ? "px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold cursor-pointer"
          : `${tagClassByType(tag.color_type)} px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer`;
        return `<button class="${classes}" type="button" data-tag-id="${tag.id}">${escapeHtml(tag.name)}</button>`;
      })
      .join("");

    tagContainer.querySelectorAll("[data-tag-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const tagId = Number(button.dataset.tagId);
        if (selectedTagIds.has(tagId)) {
          selectedTagIds.delete(tagId);
        } else {
          selectedTagIds.add(tagId);
        }
        renderTags();
      });
    });
  }

  priorityButtons.forEach((item) => {
    item.dataset.active = item.dataset.priorityButton === "medium" ? "true" : "false";
  });
  applyPriorityStyles(priorityButtons);
}

function applyPriorityStyles(buttons) {
  buttons.forEach((button) => {
    const isActive = button.dataset.active === "true";
    button.classList.toggle("bg-primary-container", isActive);
    button.classList.toggle("border-primary/20", isActive);
    button.classList.toggle("bg-surface-container-lowest", !isActive);
    button.classList.toggle("border-outline-variant/20", !isActive);
  });
}

function syncProjectText(projectSelect) {
  const option = projectSelect.options[projectSelect.selectedIndex];
  setText("task-project-display", option ? option.textContent : "Select project");
}

async function initNotesPage() {
  const searchInput = document.getElementById("note-search-input");

  bindNoteComposer();
  bindNoteActions();

  document.querySelectorAll("[data-create-note]").forEach((button) => {
    if (button.dataset.navBound === "true") {
      return;
    }

    button.dataset.navBound = "true";
    button.addEventListener("click", () => {
      openNoteComposer({
        mode: "create"
      });
    });
  });

  state.meta = await apiFetch("/api/meta/options");

  if (searchInput) {
    let debounceId = null;
    searchInput.addEventListener("input", () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => loadNotes(searchInput.value), 250);
    });
  }

  await loadNotes(searchInput ? searchInput.value : "");
}

async function loadNotes(search, preferredNoteId) {
  const response = await apiFetch(`/api/notes?search=${encodeURIComponent(search || "")}`);
  state.notes = response.notes || [];
  state.selectedNote = null;

  setText("notes-count-copy", `${state.notes.length} notes in your library.`);

  const selectedFromQuery = Number(preferredNoteId || new URLSearchParams(window.location.search).get("note") || 0);
  const selectedNoteId = state.notes.some((note) => note.id === selectedFromQuery)
    ? selectedFromQuery
    : state.notes[0]?.id;

  renderNotesGrid(selectedNoteId);

  if (selectedNoteId) {
    const details = await apiFetch(`/api/notes/${selectedNoteId}`);
    renderNotePreview(details.note);
    syncNotesUrl(selectedNoteId);
    return;
  }

  syncNotesUrl();
  renderEmptyNotePreview();
}

async function initProfilePage() {
  const profile = state.profile || await ensureProfileLoaded();

  setText("profile-name", profile.fullName);
  setText("profile-email", profile.email);
  setText("profile-bio", profile.bio || "No biography yet.");
  setText("profile-phone", profile.phoneNumber || "Not set");
  setText("profile-location", profile.location || "Not set");
  setText("profile-language", languageLabel(profile.preferences?.languageCode));
  setText("profile-timezone", profile.preferences?.timezone || "UTC");
  setText("profile-membership", profile.membershipTier || "Member");

  const avatar = document.getElementById("profile-avatar");
  if (avatar && profile.avatarUrl) {
    avatar.src = profile.avatarUrl;
  }
}

async function initEditProfilePage() {
  const profile = state.profile || await ensureProfileLoaded();
  const form = document.getElementById("edit-profile-form");

  if (!form) {
    return;
  }

  const nameInput = document.getElementById("edit-full-name");
  const usernameInput = document.getElementById("edit-username");
  const emailInput = document.getElementById("edit-email");
  const avatarUrlInput = document.getElementById("edit-avatar-url");
  const bioInput = document.getElementById("edit-bio");
  const avatar = document.getElementById("edit-profile-avatar");
  const previewName = document.getElementById("edit-profile-name-preview");
  const discardButton = document.getElementById("edit-profile-discard");
  const initialData = {
    fullName: profile.fullName || "",
    username: profile.username || "",
    email: profile.email || "",
    avatarUrl: profile.avatarUrl || "",
    bio: profile.bio || ""
  };

  nameInput.value = initialData.fullName;
  usernameInput.value = initialData.username;
  emailInput.value = initialData.email;
  if (avatarUrlInput) {
    avatarUrlInput.value = initialData.avatarUrl;
  }
  bioInput.value = initialData.bio;
  if (avatar && profile.avatarUrl) {
    avatar.src = profile.avatarUrl;
  }
  if (previewName) {
    previewName.textContent = initialData.fullName || "Profile";
  }

  nameInput.addEventListener("input", () => {
    if (previewName) {
      previewName.textContent = nameInput.value.trim() || "Profile";
    }
  });

  avatarUrlInput?.addEventListener("input", () => {
    if (avatar && avatarUrlInput.value.trim()) {
      avatar.src = avatarUrlInput.value.trim();
    }
  });

  discardButton?.addEventListener("click", () => {
    nameInput.value = initialData.fullName;
    usernameInput.value = initialData.username;
    emailInput.value = initialData.email;
    if (avatarUrlInput) {
      avatarUrlInput.value = initialData.avatarUrl;
    }
    bioInput.value = initialData.bio;
    if (avatar && initialData.avatarUrl) {
      avatar.src = initialData.avatarUrl;
    }
    if (previewName) {
      previewName.textContent = initialData.fullName || "Profile";
    }
    showPageMessage("Changes discarded.", "success");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = document.getElementById("edit-profile-save");

    try {
      setButtonLoading(submitButton, true, "Saving...");

      await apiFetch("/api/profile", {
        method: "PUT",
        body: {
          fullName: nameInput.value.trim(),
          username: usernameInput.value.trim(),
          email: emailInput.value.trim(),
          avatarUrl: avatarUrlInput ? avatarUrlInput.value.trim() : "",
          bio: bioInput.value.trim()
        }
      });

      await navigateTo("/profile", { replace: true });
    } catch (error) {
      showPageMessage(error.message || "Could not save profile.", "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
}

async function initChangePasswordPage() {
  const form = document.getElementById("change-password-form");

  if (!form) {
    return;
  }

  const passwordInputs = form.querySelectorAll('input[type="password"]');
  const currentPasswordInput = document.getElementById("current-password-input") || passwordInputs[0];
  const newPasswordInput = document.getElementById("new-password-input") || passwordInputs[1];
  const confirmPasswordInput = document.getElementById("confirm-password-input") || passwordInputs[2];
  const strengthLabel = document.getElementById("password-strength-label");

  newPasswordInput?.addEventListener("input", () => {
    if (!strengthLabel) {
      return;
    }

    const value = newPasswordInput.value;
    if (value.length >= 12) {
      strengthLabel.textContent = "Strong";
    } else if (value.length >= 8) {
      strengthLabel.textContent = "Medium";
    } else {
      strengthLabel.textContent = "Weak";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = document.getElementById("change-password-submit");

    try {
      setButtonLoading(submitButton, true, "Updating...");

      await apiFetch("/api/profile/change-password", {
        method: "POST",
        body: {
          currentPassword: currentPasswordInput.value,
          newPassword: newPasswordInput.value,
          confirmPassword: confirmPasswordInput.value
        }
      });

      form.reset();
      if (strengthLabel) {
        strengthLabel.textContent = "Strong";
      }
      showPageMessage("Password updated successfully.", "success");
    } catch (error) {
      showPageMessage(error.message || "Could not update password.", "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
}

async function initSettingsPreferencesPage() {
  const response = await apiFetch("/api/preferences");
  const preferences = response.preferences;

  const themeButtons = Array.from(document.querySelectorAll("[data-theme-button]"));
  const accentButtons = Array.from(document.querySelectorAll("[data-accent-color]"));
  const languageSelect = document.getElementById("preferences-language");
  const timezoneSelect = document.getElementById("preferences-timezone");
  const autoTranslateInput = document.getElementById("auto-translate");
  const autoDstInput = document.getElementById("preferences-auto-dst");
  const saveButton = document.getElementById("preferences-save");
  const resetButton = document.getElementById("preferences-reset");

  let selectedTheme = preferences.theme || "light";
  let selectedAccent = preferences.accentColor || "#3d6758";

  languageSelect.value = findOrAppendOption(languageSelect, preferences.languageCode, languageLabel(preferences.languageCode));
  timezoneSelect.value = findOrAppendOption(timezoneSelect, preferences.timezone, preferences.timezone);
  autoTranslateInput.checked = Boolean(preferences.autoTranslate);
  autoDstInput.checked = Boolean(preferences.autoDst);

  function syncThemeButtons() {
    themeButtons.forEach((button) => {
      const active = button.dataset.themeButton === selectedTheme;
      button.classList.toggle("border-primary", active);
      button.classList.toggle("border-transparent", !active);
    });
    document.documentElement.classList.toggle("dark", selectedTheme === "dark");
  }

  function syncAccentButtons() {
    accentButtons.forEach((button) => {
      const active = button.dataset.accentColor === selectedAccent;
      button.classList.toggle("ring-2", active);
      button.classList.toggle("ring-offset-2", active);
      button.classList.toggle("ring-[#3d6758]", active);
    });
  }

  themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedTheme = button.dataset.themeButton;
      syncThemeButtons();
    });
  });

  accentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedAccent = button.dataset.accentColor;
      syncAccentButtons();
    });
  });

  resetButton?.addEventListener("click", () => {
    selectedTheme = "light";
    selectedAccent = "#3d6758";
    languageSelect.value = findOrAppendOption(languageSelect, "en-US", "English (United States)");
    timezoneSelect.value = findOrAppendOption(timezoneSelect, "UTC", "UTC");
    autoTranslateInput.checked = false;
    autoDstInput.checked = true;
    syncThemeButtons();
    syncAccentButtons();
    showPageMessage("Preferences reset locally.", "success");
  });

  saveButton?.addEventListener("click", async () => {
    try {
      setButtonLoading(saveButton, true, "Saving...");

      await apiFetch("/api/preferences", {
        method: "PUT",
        body: {
          theme: selectedTheme,
          accentColor: selectedAccent,
          languageCode: languageSelect.value,
          timezone: timezoneSelect.value,
          autoTranslate: autoTranslateInput.checked,
          autoDst: autoDstInput.checked
        }
      });

      syncThemeButtons();
      syncAccentButtons();
      showPageMessage("Preferences saved.", "success");
    } catch (error) {
      showPageMessage(error.message || "Could not save preferences.", "error");
    } finally {
      setButtonLoading(saveButton, false);
    }
  });

  syncThemeButtons();
  syncAccentButtons();
}

function renderNotesGrid(selectedNoteId) {
  const container = document.getElementById("notes-grid");

  if (!container) {
    return;
  }

  container.innerHTML = state.notes
    .map((note) => {
      const isSelected = note.id === selectedNoteId;
      const wrapperClass = isSelected
        ? "group bg-surface-container-lowest border-2 border-primary-fixed p-6 rounded-full flex flex-col gap-4 shadow-sm hover:translate-y-[-2px] transition-all duration-300 relative overflow-hidden"
        : "group bg-surface-container-lowest p-6 rounded-full flex flex-col gap-4 hover:bg-surface-container-high transition-all duration-300 shadow-[0px_4px_12px_rgba(43,52,55,0.03)] border border-transparent";

      return `
        <div class="${wrapperClass}" data-note-card="${note.id}">
          <div class="flex justify-between items-start">
            <span class="${tagClassByName(note.category)} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${escapeHtml(note.category)}</span>
            ${note.isPinned ? '<span class="material-symbols-outlined text-primary" style="font-variation-settings: \'FILL\' 1;">push_pin</span>' : ""}
          </div>
          <div>
            <h3 class="text-xl font-bold mb-2">${escapeHtml(note.title)}</h3>
            <p class="text-sm text-on-surface-variant line-clamp-3 leading-relaxed">${escapeHtml(note.excerpt)}</p>
          </div>
          <div class="mt-auto pt-4 flex items-center justify-between border-t border-surface-container text-[11px] font-medium text-outline">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-xs">schedule</span>
              <span>${escapeHtml(relativeTime(note.updatedAt))}</span>
            </div>
            <span class="material-symbols-outlined opacity-0 group-hover:opacity-100 transition-opacity">open_in_new</span>
          </div>
        </div>
      `;
    })
    .join("");

    container.querySelectorAll("[data-note-card]").forEach((element) => {
      element.addEventListener("click", async () => {
        const noteId = Number(element.dataset.noteCard);
        const details = await apiFetch(`/api/notes/${noteId}`);
        renderNotePreview(details.note);
        syncNotesUrl(noteId);
        renderNotesGrid(noteId);
      });
    });
}

function renderNotePreview(note) {
  state.selectedNote = note;
  document.body.dataset.selectedNoteId = String(note.id);
  const tagsContainer = document.getElementById("note-preview-tags");

  if (tagsContainer) {
    tagsContainer.innerHTML = `
      <span class="${tagClassByName(note.category)} px-3 py-1 rounded-full text-[10px] font-bold uppercase">${escapeHtml(note.category)}</span>
      ${note.tags.map((tag) => `<span class="${tagClassByType(tag.color_type)} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${escapeHtml(tag.name)}</span>`).join("")}
    `;
  }

  setText("note-preview-title", note.title);
  setText("note-preview-author", state.user.fullName);
  setText("note-preview-date", formatLongDate(note.updatedAt));

  const body = document.getElementById("note-preview-body");
  if (body) {
    body.innerHTML = note.body
      .split("\n")
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
  }

  updateNoteActionState();
}

function renderEmptyNotePreview() {
  state.selectedNote = null;
  delete document.body.dataset.selectedNoteId;

  const tagsContainer = document.getElementById("note-preview-tags");
  if (tagsContainer) {
    tagsContainer.innerHTML = `<span class="px-3 py-1 bg-surface-container-highest text-on-surface-variant rounded-full text-[10px] font-bold uppercase tracking-wider">No Selection</span>`;
  }

  setText("note-preview-title", "Select a note");
  setText("note-preview-author", state.user?.fullName || "Workspace member");
  setText("note-preview-date", "No note selected");

  const body = document.getElementById("note-preview-body");
  if (body) {
    body.innerHTML = "<p>Choose a note from the left to view and edit its details.</p>";
  }

  updateNoteActionState();
}

function syncNotesUrl(selectedNoteId) {
  if (document.body.dataset.page !== "notes") {
    return;
  }

  const nextUrl = selectedNoteId
    ? `${window.location.pathname}?note=${selectedNoteId}`
    : window.location.pathname;

  window.history.replaceState({}, "", nextUrl);
}

function bindNoteActions() {
  const editButton = document.querySelector("[data-note-edit]");
  const deleteButton = document.querySelector("[data-note-delete]");
  const shareButton = document.querySelector("[data-note-share]");

  if (editButton && editButton.dataset.navBound !== "true") {
    editButton.dataset.navBound = "true";
    editButton.addEventListener("click", () => {
      const selectedNote = state.selectedNote;

      if (!selectedNote) {
        showPageMessage("Select a note first.", "error");
        return;
      }

      openNoteComposer({
        mode: "edit",
        note: selectedNote
      });
    });
  }

  if (deleteButton && deleteButton.dataset.navBound !== "true") {
    deleteButton.dataset.navBound = "true";
    deleteButton.addEventListener("click", async () => {
      const selectedNote = state.selectedNote;

      if (!selectedNote) {
        showPageMessage("Select a note first.", "error");
        return;
      }

      if (!window.confirm(`Delete "${selectedNote.title}"?`)) {
        return;
      }

      await apiFetch(`/api/notes/${selectedNote.id}`, {
        method: "DELETE"
      });

      await loadNotes(document.getElementById("note-search-input")?.value || "");
      showPageMessage("Note deleted.", "success");
    });
  }

  if (shareButton && shareButton.dataset.navBound !== "true") {
    shareButton.dataset.navBound = "true";
    shareButton.addEventListener("click", async () => {
      const selectedNote = state.selectedNote;

      if (!selectedNote) {
        showPageMessage("Select a note first.", "error");
        return;
      }

      const shareText = `${selectedNote.title}\n\n${selectedNote.body || ""}`.trim();

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText);
          showPageMessage("Note copied to clipboard.", "success");
          return;
        }
      } catch (_error) {
        // noop
      }

      window.prompt("Copy note content", shareText);
    });
  }

  updateNoteActionState();
}

function bindNoteComposer() {
  const modal = document.getElementById("note-composer-modal");
  const form = document.getElementById("note-composer-form");

  if (!modal || !form || modal.dataset.bound === "true") {
    return;
  }

  modal.dataset.bound = "true";

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close-note-composer]")) {
      closeNoteComposer();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeNoteComposer();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = document.getElementById("note-composer-submit");
    const errorElement = document.getElementById("note-composer-error");
    const titleInput = document.getElementById("note-composer-note-title");
    const categoryInput = document.getElementById("note-composer-note-category");
    const bodyInput = document.getElementById("note-composer-note-body");
    const projectSelect = document.getElementById("note-composer-note-project");

    if (!submitButton || !titleInput || !categoryInput || !bodyInput || !projectSelect) {
      return;
    }

    if (errorElement) {
      errorElement.textContent = "";
      errorElement.classList.add("hidden");
    }

    try {
      setButtonLoading(submitButton, true, state.noteComposerMode === "edit" ? "Saving..." : "Creating...");

      const payload = {
        title: titleInput.value.trim(),
        body: bodyInput.value.trim(),
        category: categoryInput.value.trim() || "General",
        projectId: projectSelect.value ? Number(projectSelect.value) : null,
        tagIds: state.noteComposerMode === "edit" && state.selectedNote?.id === state.noteComposerTargetId
          ? (state.selectedNote.tags || []).map((tag) => tag.id)
          : []
      };

      let preferredNoteId = null;

      if (state.noteComposerMode === "edit" && state.noteComposerTargetId) {
        await apiFetch(`/api/notes/${state.noteComposerTargetId}`, {
          method: "PUT",
          body: payload
        });
        preferredNoteId = state.noteComposerTargetId;
      } else {
        const response = await apiFetch("/api/notes", {
          method: "POST",
          body: payload
        });
        preferredNoteId = response.noteId;
      }

      closeNoteComposer();
      await loadNotes(document.getElementById("note-search-input")?.value || "", preferredNoteId);
      showPageMessage(state.noteComposerMode === "edit" ? "Note updated." : "Note created.", "success");
    } catch (error) {
      if (errorElement) {
        errorElement.textContent = error.message || "Could not save note.";
        errorElement.classList.remove("hidden");
      }
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
}

function openNoteComposer({ mode, note } = {}) {
  const modal = document.getElementById("note-composer-modal");
  const titleElement = document.getElementById("note-composer-title");
  const subtitleElement = document.getElementById("note-composer-subtitle");
  const kickerElement = document.getElementById("note-composer-kicker");
  const titleInput = document.getElementById("note-composer-note-title");
  const categoryInput = document.getElementById("note-composer-note-category");
  const bodyInput = document.getElementById("note-composer-note-body");
  const projectSelect = document.getElementById("note-composer-note-project");
  const submitButton = document.getElementById("note-composer-submit");
  const errorElement = document.getElementById("note-composer-error");

  if (!modal || !titleInput || !categoryInput || !bodyInput || !projectSelect || !submitButton) {
    return;
  }

  state.noteComposerMode = mode === "edit" ? "edit" : "create";
  state.noteComposerTargetId = state.noteComposerMode === "edit" ? Number(note?.id || 0) : null;

  populateNoteProjectOptions(note?.projectId || null);

  if (state.noteComposerMode === "edit" && note) {
    if (titleElement) {
      titleElement.textContent = "Edit Note";
    }
    if (subtitleElement) {
      subtitleElement.textContent = "Update the note and keep the preview in sync.";
    }
    if (kickerElement) {
      kickerElement.textContent = "Note Editor";
    }
    submitButton.textContent = "Save Changes";
    titleInput.value = note.title || "";
    categoryInput.value = note.category || "General";
    bodyInput.value = note.body || "";
    projectSelect.value = note.projectId ? String(note.projectId) : "";
  } else {
    if (titleElement) {
      titleElement.textContent = "Create Note";
    }
    if (subtitleElement) {
      subtitleElement.textContent = "Capture an idea and keep it organized.";
    }
    if (kickerElement) {
      kickerElement.textContent = "Note Composer";
    }
    submitButton.textContent = "Save Note";
    titleInput.value = "";
    categoryInput.value = "General";
    bodyInput.value = "";
    projectSelect.value = "";
  }

  if (errorElement) {
    errorElement.textContent = "";
    errorElement.classList.add("hidden");
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  window.setTimeout(() => titleInput.focus(), 0);
}

function closeNoteComposer() {
  const modal = document.getElementById("note-composer-modal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function populateNoteProjectOptions(selectedProjectId) {
  const projectSelect = document.getElementById("note-composer-note-project");

  if (!projectSelect) {
    return;
  }

  projectSelect.innerHTML = `
    <option value="">General</option>
    ${state.meta.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("")}
  `;
  projectSelect.value = selectedProjectId ? String(selectedProjectId) : "";
}

function updateNoteActionState() {
  const hasSelectedNote = Boolean(state.selectedNote);

  document.querySelectorAll("[data-note-edit], [data-note-delete], [data-note-share]").forEach((button) => {
    button.disabled = !hasSelectedNote;
    button.classList.toggle("opacity-50", !hasSelectedNote);
    button.classList.toggle("cursor-not-allowed", !hasSelectedNote);
  });
}

async function apiFetch(url, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  };

  const shouldAuthenticate = options.authenticated !== false;

  if (shouldAuthenticate && state.token) {
    fetchOptions.headers.Authorization = `Bearer ${state.token}`;
  }

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await window.fetch(url, fetchOptions);

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      if (document.body.dataset.page !== "login") {
        await navigateTo("/login", { replace: true });
      }
    }

    throw new Error(payload?.error?.message || payload.message || "Request failed");
  }

  return payload;
}

function clearToken() {
  state.token = null;
  state.user = null;
  state.profile = null;
  state.tasks = [];
  state.selectedTask = null;
  state.taskFilter = "all";
  state.taskComposerDraft = defaultTaskComposerDraft();
  state.taskComposerEmojiOpen = false;
  state.taskEditorMode = "edit";
  state.taskEditorTargetId = null;
  state.taskEditorPriority = "medium";
  state.taskEditorSubtasks = [];
  state.taskEditorTagIds = new Set();
  state.scheduleView = "month";
  state.scheduleDate = "";
  state.scheduleSelectedDate = "";
  state.scheduleItems = [];
  state.dashboardPulsePeriod = "week";
  state.dashboardPulseMetric = "completed";
  state.notes = [];
  state.selectedNote = null;
  state.meta = {
    projects: [],
    tags: []
  };
  window.localStorage.removeItem(TOKEN_KEY);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function showPageMessage(message, type) {
  const element = document.getElementById("page-feedback");
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("text-error", "text-primary");
  element.classList.add(type === "error" ? "text-error" : "text-primary");
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) {
    return;
  }

  if (isLoading) {
    button.dataset.originalText = button.textContent.trim();
    button.textContent = loadingText || "Loading...";
    button.disabled = true;
    button.classList.add("opacity-70");
    return;
  }

  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  button.classList.remove("opacity-70");
}

function formatDateTime(value) {
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatLongDate(value) {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function relativeTime(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);

  if (seconds < 3600) {
    const minutes = Math.max(1, Math.floor(seconds / 60));
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }

  if (seconds < 86400) {
    const hours = Math.max(1, Math.floor(seconds / 3600));
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  if (seconds < 604800) {
    const days = Math.max(1, Math.floor(seconds / 86400));
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  return formatLongDate(value);
}

function toSqlDateTime(value) {
  return `${value.replace("T", " ")}:00`;
}

function firstName(fullName) {
  return String(fullName || "").split(" ")[0] || "there";
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function tagClassByType(type) {
  if (type === "primary") {
    return "bg-primary-fixed text-on-primary-container";
  }

  if (type === "secondary") {
    return "bg-secondary-container text-on-secondary-container";
  }

  if (type === "tertiary") {
    return "bg-tertiary-container text-on-tertiary-container";
  }

  return "bg-surface-container-highest text-on-surface-variant";
}

function tagClassByName(name) {
  const normalized = String(name || "").toLowerCase();

  if (normalized.includes("work")) {
    return "bg-tertiary-fixed text-on-tertiary-container";
  }

  if (normalized.includes("personal")) {
    return "bg-secondary-fixed text-on-secondary-container";
  }

  if (normalized.includes("idea")) {
    return "bg-primary-fixed text-on-primary-container";
  }

  return "bg-surface-container-highest text-on-surface-variant";
}

function tagClass(colorHex) {
  if (colorHex === "#3d6758") {
    return "bg-primary-fixed text-on-primary-container";
  }

  if (colorHex === "#486083") {
    return "bg-tertiary-container text-on-tertiary-container";
  }

  return "bg-secondary-container text-on-secondary-container";
}

function languageLabel(code) {
  const labels = {
    "en-US": "English (United States)",
    "vi-VN": "Vietnamese (Vietnam)",
    "ja-JP": "Japanese (Japan)"
  };

  return labels[code] || code || "English (United States)";
}

function findOrAppendOption(select, value, label) {
  if (!select) {
    return value;
  }

  const existingOption = Array.from(select.options).find((option) => option.value === value || option.textContent === value);

  if (existingOption) {
    existingOption.value = value;
    return value;
  }

  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
  return value;
}

