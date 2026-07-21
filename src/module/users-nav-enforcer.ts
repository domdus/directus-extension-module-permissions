import { normalizeConfig, extractModuleIdFromPath } from '../shared/evaluate';
import { userHasAdminAccess } from '../shared/admin';
import { MODULE_PERMISSIONS_FIELD, type ModulePermissionsConfig } from '../shared/types';

const ENFORCER_FLAG = '__modulePermissionsUsersNavEnforcerInstalled';
const STYLE_ID = 'mp-users-nav-enforcer-styles';
/** Legacy html class — cleared on apply so old sessions don't keep broken layout CSS. */
const HIDDEN_NAV_CLASS = 'mp-module-nav-hidden';
/** Marked on the middle Module Navigation panel only (never the module icon bar). */
const NAV_PANEL_ATTR = 'data-mp-module-nav-hidden';
const ROLE_ATTR = 'data-mp-users-role-hidden';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LooseStore = {
	currentUser?: {
		admin_access?: boolean;
		role?: string | { id?: string } | null;
	} | null;
	settings?: {
		[MODULE_PERMISSIONS_FIELD]?: ModulePermissionsConfig | null;
	} | null;
};

function getPinia(app: any): any {
	return app?.config?.globalProperties?.$pinia || null;
}

function getStoreState(pinia: any, id: string): LooseStore | null {
	try {
		const store = pinia?._s?.get?.(id);
		return (store || null) as LooseStore | null;
	} catch {
		return null;
	}
}

function isAdminUser(pinia: any): boolean {
	const userStore = getStoreState(pinia, 'userStore');
	return userHasAdminAccess(userStore?.currentUser);
}

function getConfig(pinia: any): ModulePermissionsConfig {
	const settingsStore = getStoreState(pinia, 'settingsStore');
	return normalizeConfig(settingsStore?.settings?.[MODULE_PERMISSIONS_FIELD]);
}

function ensureStyleEl(): HTMLStyleElement {
	let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
	if (el) return el;
	el = document.createElement('style');
	el.id = STYLE_ID;
	document.head.appendChild(el);
	return el;
}

function buildChromeCss(): string {
	// Hide only the Module Navigation chrome we mark — never the left module icon bar.
	//
	// Important (Directus 11.14+ / 12 SplitPanel): do NOT `display:none` the
	// `.sp-start` / `.sp-divider` grid items. Removing them from the grid while
	// `grid-template-columns` still has 3 tracks mis-assigns columns and can
	// blank `#main-content` (seen on Insights). Zero the root track instead and
	// only hide the aside / nav content inside the start pane.
	return `
aside[${NAV_PANEL_ATTR}],
#module-navigation[${NAV_PANEL_ATTR}],
.module-nav[${NAV_PANEL_ATTR}],
.mobile-nav[${NAV_PANEL_ATTR}],
.resize-wrapper[${NAV_PANEL_ATTR}] {
	display: none !important;
	width: 0 !important;
	min-width: 0 !important;
	max-width: 0 !important;
	inline-size: 0 !important;
	min-inline-size: 0 !important;
	max-inline-size: 0 !important;
	flex: 0 0 0 !important;
	overflow: hidden !important;
	pointer-events: none !important;
	border: none !important;
}

/* Collapse SplitPanel start track without removing grid items (11.14+ / 12). */
.sp-start[${NAV_PANEL_ATTR}],
.sp-divider[${NAV_PANEL_ATTR}] {
	width: 0 !important;
	min-width: 0 !important;
	max-width: 0 !important;
	inline-size: 0 !important;
	min-inline-size: 0 !important;
	max-inline-size: 0 !important;
	overflow: hidden !important;
	pointer-events: none !important;
	border: none !important;
	opacity: 0 !important;
}

.root-split:has(> .sp-start[${NAV_PANEL_ATTR}]),
.root-split:has(> .sp-start > [${NAV_PANEL_ATTR}]),
.root-split:has(> .sp-start [${NAV_PANEL_ATTR}]) {
	grid-template-columns: 0px 0px minmax(0, 1fr) !important;
}

/* Header / project-info controls that reopen Module Navigation. */
html.${HIDDEN_NAV_CLASS} .header-bar .nav-toggle,
html.${HIDDEN_NAV_CLASS} .header-bar .nav-toggle-separator,
html.${HIDDEN_NAV_CLASS} .project-info .nav-toggle,
html.${HIDDEN_NAV_CLASS} button.nav-toggle,
html.${HIDDEN_NAV_CLASS} .v-button.nav-toggle {
	display: none !important;
}
`.trim();
}

/**
 * Middle Module Navigation panel(s) — never the left module icon bar.
 *
 * v12: `aside.module-nav` / `#module-navigation` (sibling of module-bar).
 * v11: `#navigation` wraps module-bar + `.resize-wrapper` (v-resizeable root)
 *      that contains `.module-nav`. Mark the resize-wrapper boundary.
 */
function findModuleNavPanels(): HTMLElement[] {
	const panels: HTMLElement[] = [];
	const push = (el: Element | null | undefined) => {
		if (el instanceof HTMLElement && !panels.includes(el)) panels.push(el);
	};

	document.querySelectorAll('aside.module-nav, #module-navigation, .mobile-nav.module-nav').forEach((el) => {
		// v11's outer #navigation also matches aria "Module Navigation" but not these selectors.
		if (el.id === 'navigation' && el.querySelector(':scope > .module-bar, :scope > .resize-wrapper')) {
			return;
		}
		push(el);
	});

	const navigation = document.querySelector('#navigation');
	if (navigation) {
		const wrapper =
			navigation.querySelector(':scope > .resize-wrapper') ||
			navigation.querySelector(':scope > .v-resizeable');
		if (wrapper instanceof HTMLElement && wrapper.querySelector('.module-nav')) {
			push(wrapper);
		} else {
			navigation.querySelectorAll('.module-nav').forEach((el) => {
				if (!(el instanceof HTMLElement)) return;
				if (el.closest('.module-bar')) return;
				const parent = el.parentElement;
				if (parent?.classList.contains('resize-wrapper')) push(parent);
				else push(el);
			});
		}
	}

	return panels;
}

function clearModuleNavPanelMarks() {
	document.documentElement.classList.remove(HIDDEN_NAV_CLASS);
	document.querySelectorAll(`[${NAV_PANEL_ATTR}]`).forEach((node) => {
		node.removeAttribute(NAV_PANEL_ATTR);
	});
}

/** True when we collapsed the nav bar solely to hide Module Navigation. */
let forcedNavBarCollapse = false;

/** Directus 11.17+ / 12: collapse the SplitPanel that hosts Module Navigation. */
function collapseModuleNavSplit(pinia: any) {
	try {
		const navBarStore = getStoreState(pinia, 'nav-bar-store') as LooseStore & {
			collapsed?: boolean | { value?: boolean };
			collapse?: () => void;
			expand?: () => void;
		} | null;

		if (!navBarStore) return;

		const isCollapsed =
			typeof navBarStore.collapsed === 'boolean'
				? navBarStore.collapsed
				: Boolean((navBarStore.collapsed as { value?: boolean } | undefined)?.value);

		if (!isCollapsed) {
			if (typeof navBarStore.collapse === 'function') {
				navBarStore.collapse();
			} else if ('collapsed' in navBarStore) {
				(navBarStore as { collapsed: boolean }).collapsed = true;
			}
			forcedNavBarCollapse = true;
			return;
		}

		// Already collapsed (by us or the user) — keep forcing via store so
		// expand attempts while the hide-rule is active are undone.
		if (typeof navBarStore.collapse === 'function') {
			navBarStore.collapse();
		}
	} catch {
		// ignore
	}
}

function restoreModuleNavSplit(pinia: any) {
	if (!forcedNavBarCollapse) return;
	forcedNavBarCollapse = false;

	try {
		const navBarStore = getStoreState(pinia, 'nav-bar-store') as LooseStore & {
			expand?: () => void;
			collapsed?: boolean;
		} | null;

		if (!navBarStore) return;

		if (typeof navBarStore.expand === 'function') {
			navBarStore.expand();
		} else if ('collapsed' in navBarStore) {
			navBarStore.collapsed = false;
		}
	} catch {
		// ignore
	}
}

/** Direct child start pane of the outer `.root-split` that hosts Module Navigation. */
function findRootNavStartPane(panel: HTMLElement): HTMLElement | null {
	const start = panel.closest('.sp-start');
	if (!(start instanceof HTMLElement)) return null;
	if (!start.querySelector('aside.module-nav, #module-navigation, .module-nav')) return null;

	const root = start.parentElement;
	// Must be the outer module-nav SplitPanel — never `.main-split` (content + sidebar).
	if (!(root instanceof HTMLElement)) return null;
	if (!root.classList.contains('root-split')) return null;
	if (root.classList.contains('main-split')) return null;
	if (root.querySelector(':scope > .sp-start') !== start) return null;

	return start;
}

/**
 * Backup when CSS :has() / store collapse hasn't zeroed the track yet:
 * overwrite SplitPanel's inline `--*-gridTemplate` on the root that hosts module nav.
 * Never mark the root with NAV_PANEL_ATTR — that would hide the whole layout.
 */
function collapseSplitPanelTracks(panels: HTMLElement[]) {
	const roots = new Set<HTMLElement>();

	for (const panel of panels) {
		const start = findRootNavStartPane(panel);
		if (!start?.parentElement) continue;
		roots.add(start.parentElement);
	}

	for (const root of roots) {
		const props: string[] = [];
		for (let i = 0; i < root.style.length; i++) {
			const prop = root.style.item(i);
			if (prop && (prop.endsWith('gridTemplate') || prop.endsWith('-gridTemplate'))) {
				props.push(prop);
			}
		}
		for (const prop of props) {
			root.style.setProperty(prop, '0px 0px minmax(0, 1fr)');
		}
	}
}

function markSplitPanes(panels: HTMLElement[]) {
	for (const panel of panels) {
		const start = findRootNavStartPane(panel);
		if (!start) continue;

		start.setAttribute(NAV_PANEL_ATTR, '');

		const divider = start.nextElementSibling;
		if (divider instanceof HTMLElement && divider.classList.contains('sp-divider')) {
			divider.setAttribute(NAV_PANEL_ATTR, '');
		}
	}
}

function applyModuleNavChrome(pinia: any, currentPath: string) {
	const config = getConfig(pinia);
	const hiddenModules = new Set((config.navigation_hidden_modules || []).map(String));
	const moduleId = extractModuleIdFromPath(currentPath);

	ensureStyleEl().textContent = buildChromeCss();
	clearModuleNavPanelMarks();

	const shouldHide = Boolean(moduleId && hiddenModules.has(moduleId));
	if (!shouldHide) {
		restoreModuleNavSplit(pinia);
		return;
	}

	const panels = findModuleNavPanels();
	for (const panel of panels) {
		panel.setAttribute(NAV_PANEL_ATTR, '');
	}
	markSplitPanes(panels);
	document.documentElement.classList.add(HIDDEN_NAV_CLASS);
	collapseModuleNavSplit(pinia);
	collapseSplitPanelTracks(panels);
}

function roleIdFromHref(href: string | null): string | null {
	if (!href) return null;
	try {
		const url = new URL(href, window.location.origin);
		const path = url.pathname.replace(/^\/admin/, '') || '/';
		const segments = path.split('/').filter(Boolean);
		if (segments[0] !== 'users' || segments[1] !== 'roles') return null;
		if (!segments[2] || segments[2] === '+') return null;
		return segments[2];
	} catch {
		const match = href.match(/\/users\/roles\/([^/?#]+)/);
		return match?.[1] && match[1] !== '+' ? match[1] : null;
	}
}

function shouldHideRoleId(
	roleId: string,
	ownRoleOnly: boolean,
	allowed: Set<string>,
	explicitHidden: Set<string>,
): boolean {
	if (explicitHidden.has(roleId)) return true;
	if (ownRoleOnly && !allowed.has(roleId)) return true;
	return false;
}

function hideRow(row: HTMLElement, roleId: string) {
	row.setAttribute(ROLE_ATTR, roleId);
	row.style.display = 'none';
}

function findUsersNavRoot(): Element | null {
	return (
		document.querySelector('#module-navigation') ||
		document.querySelector('#navigation .module-nav-content') ||
		document.querySelector('aside.module-nav .module-nav-content') ||
		document.querySelector('.module-nav-content') ||
		document.querySelector('aside.module-nav')
	);
}

/**
 * Users role tree rows are clickable VListItem/VListGroup nodes (router.push),
 * not anchors. Prefer href/data-value/uuid attrs; fall back to matching the
 * active route role id's sibling rows via known allowed/hidden sets when the
 * current path is /users/roles/:id.
 */
function hideUsersRoleTree(pinia: any, currentPath: string) {
	const config = getConfig(pinia);
	const ownRoleOnly = config.users_own_role_only === true;
	const allowed = new Set((config.users_allowed_role_ids || []).map(String));
	const explicitHidden = new Set((config.users_hidden_role_ids || []).map(String));

	document.querySelectorAll(`[${ROLE_ATTR}]`).forEach((node) => {
		node.removeAttribute(ROLE_ATTR);
		(node as HTMLElement).style.removeProperty('display');
	});

	if (!ownRoleOnly && explicitHidden.size === 0) return;

	const root = findUsersNavRoot();
	if (!root) return;

	const marked = new Set<HTMLElement>();

	const markIfHidden = (roleId: string | null, el: HTMLElement | null) => {
		if (!roleId || !el || marked.has(el)) return;
		if (!shouldHideRoleId(roleId, ownRoleOnly, allowed, explicitHidden)) return;
		hideRow(el, roleId);
		marked.add(el);
	};

	// 1) Anchors (older builds / settings deep-links)
	root.querySelectorAll('a[href*="/users/roles/"]').forEach((anchor) => {
		const roleId = roleIdFromHref(anchor.getAttribute('href'));
		const row =
			(anchor.closest('.v-list-item') as HTMLElement | null) ||
			(anchor.closest('.v-list-group') as HTMLElement | null) ||
			(anchor as HTMLElement);
		markIfHidden(roleId, row);
	});

	// 2) Explicit data attributes Directus or themes may set
	root.querySelectorAll('[data-value], [data-role], [data-role-id], [data-id]').forEach((node) => {
		const el = node as HTMLElement;
		const candidates = [
			el.getAttribute('data-value'),
			el.getAttribute('data-role'),
			el.getAttribute('data-role-id'),
			el.getAttribute('data-id'),
		];
		for (const raw of candidates) {
			if (!raw || !UUID_RE.test(raw)) continue;
			const row =
				(el.closest('.v-list-group') as HTMLElement | null) ||
				(el.closest('.v-list-item') as HTMLElement | null) ||
				el;
			markIfHidden(raw, row);
			break;
		}
	});

	// 3) Active role route: hide non-allowed siblings when we can identify the
	// active row (class contains "active") and map other clickable rows by
	// comparing against allowed set size — only useful with explicit hidden ids
	// when own-role-only already filtered the API list this is a soft backup.
	const path = String(currentPath || '').replace(/^\/admin/, '') || '/';
	const pathMatch = path.match(/^\/users\/roles\/([^/?#]+)/);
	const activeRoleId = pathMatch?.[1] && pathMatch[1] !== '+' ? pathMatch[1] : null;

	if (explicitHidden.size > 0 || (ownRoleOnly && allowed.size > 0)) {
		const clickableRows = root.querySelectorAll(
			'.v-list-group > .v-list-item.clickable, .v-list-item.clickable, .v-list-group.clickable',
		);

		clickableRows.forEach((node) => {
			const el = node as HTMLElement;
			if (marked.has(el) || el.hasAttribute(ROLE_ATTR)) return;

			// Skip filter tabs (Active / Suspended / etc.) — they sit above the role tree
			const text = (el.textContent || '').trim().toLowerCase();
			if (
				text === 'active users' ||
				text === 'suspended users' ||
				text === 'invited users' ||
				text === 'all users' ||
				text.startsWith('active users') ||
				text.startsWith('suspended') ||
				text.startsWith('invited') ||
				text.startsWith('all users')
			) {
				return;
			}

			// If this row is the active role detail selection, keep it when allowed
			const isActive = el.classList.contains('active') || el.getAttribute('aria-current') === 'page';
			if (isActive && activeRoleId) {
				markIfHidden(activeRoleId, el);
				return;
			}

			// Without a role id on the node we cannot safely hide by name alone.
			// API-side roles.read filtering is the primary enforcement.
		});
	}
}

function applyEnforcement(pinia: any, currentPath: string) {
	if (isAdminUser(pinia)) {
		clearModuleNavPanelMarks();
		restoreModuleNavSplit(pinia);
		document.querySelectorAll(`[${ROLE_ATTR}]`).forEach((node) => {
			node.removeAttribute(ROLE_ATTR);
			(node as HTMLElement).style.removeProperty('display');
		});
		ensureStyleEl().textContent = '';
		return;
	}

	applyModuleNavChrome(pinia, currentPath);

	const moduleId = extractModuleIdFromPath(currentPath);
	if (moduleId === 'users') {
		hideUsersRoleTree(pinia, currentPath);
	}
}

/**
 * Client backup: filter GET /roles JSON using computed settings fields.
 * Users nav builds its tree from this response (clickable rows, no hrefs), so
 * server `roles.read` is primary; this covers races / cached client paths.
 */
function filterRolesResponseBody(body: any, pinia: any): any {
	if (isAdminUser(pinia)) return body;
	if (!body || !Array.isArray(body.data)) return body;

	const config = getConfig(pinia);
	const ownRoleOnly = config.users_own_role_only === true;
	const allowed = new Set((config.users_allowed_role_ids || []).map(String));
	const hidden = new Set((config.users_hidden_role_ids || []).map(String));

	if (!ownRoleOnly && hidden.size === 0) return body;

	const kept = body.data.filter((row: any) => {
		const id = row?.id != null ? String(row.id) : '';
		if (!id) return true;
		if (hidden.has(id)) return false;
		if (ownRoleOnly && !allowed.has(id)) return false;
		return true;
	});

	const keptIds = new Set(kept.map((row: any) => String(row.id)));

	return {
		...body,
		data: kept.map((row: any) => {
			const parent = row?.parent;
			if (parent == null || parent === '') return row;
			if (keptIds.has(String(parent))) return row;
			return { ...row, parent: null };
		}),
	};
}

function isRolesListUrl(url: string): boolean {
	try {
		const parsed = new URL(url, window.location.origin);
		const path = parsed.pathname.replace(/\/$/, '');
		return /\/roles$/.test(path) && !/\/roles\//.test(path);
	} catch {
		return /\/roles(\?|$)/.test(url) && !/\/roles\//.test(url);
	}
}

function installRolesClientFilter(pinia: any): void {
	if ((window as any).__mpRolesClientFilterInstalled) return;
	(window as any).__mpRolesClientFilterInstalled = true;

	const proto = XMLHttpRequest.prototype;
	const nativeOpen = proto.open;
	const nativeSend = proto.send;
	const responseTextDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
	const responseDesc = Object.getOwnPropertyDescriptor(proto, 'response');
	const nativeResponseTextGet = responseTextDesc?.get;
	const nativeResponseGet = responseDesc?.get;

	if (!nativeResponseTextGet) return;

	proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
		(this as any).__mpRolesUrl = typeof url === 'string' ? url : String(url);
		(this as any).__mpRolesMethod = method;
		return nativeOpen.call(this, method, url, ...(rest as [boolean]));
	};

	proto.send = function (this: XMLHttpRequest, ...args: any[]) {
		const url = String((this as any).__mpRolesUrl || '');
		const method = String((this as any).__mpRolesMethod || 'GET').toUpperCase();

		if (method === 'GET' && isRolesListUrl(url)) {
			let cached: string | null = null;

			Object.defineProperty(this, 'responseText', {
				configurable: true,
				enumerable: true,
				get: () => {
					const raw = nativeResponseTextGet.call(this);
					if (this.readyState !== 4) return raw;
					if (cached != null) return cached;
					if (this.status < 200 || this.status >= 300 || !raw) {
						cached = raw;
						return raw;
					}
					try {
						const parsed = JSON.parse(raw);
						const next = filterRolesResponseBody(parsed, pinia);
						cached = next === parsed ? raw : JSON.stringify(next);
					} catch {
						cached = raw;
					}
					return cached;
				},
			});

			if (nativeResponseGet) {
				Object.defineProperty(this, 'response', {
					configurable: true,
					enumerable: true,
					get: () => {
						const responseType = this.responseType;
						if (responseType && responseType !== 'text' && responseType !== '') {
							return nativeResponseGet.call(this);
						}
						return (this as any).responseText;
					},
				});
			}
		}

		return nativeSend.apply(this, args as []);
	};
}

export function installUsersNavEnforcer(): void {
	if (typeof window === 'undefined') return;
	if ((window as any)[ENFORCER_FLAG]) return;

	const started = Date.now();

	const timer = window.setInterval(() => {
		const appEl = document.querySelector('#app') as any;
		const app = appEl?.__vue_app__;
		const router = app?.config?.globalProperties?.$router;
		const pinia = getPinia(app);

		if (!app || !router || !pinia) {
			if (Date.now() - started > 45000) {
				window.clearInterval(timer);
			}
			return;
		}

		window.clearInterval(timer);
		(window as any)[ENFORCER_FLAG] = true;

		installRolesClientFilter(pinia);

		let scheduled = false;
		const run = (path?: string) => {
			if (scheduled) return;
			scheduled = true;
			window.requestAnimationFrame(() => {
				scheduled = false;
				try {
					const current =
						path ||
						router.currentRoute?.value?.path ||
						router.currentRoute?.path ||
						window.location.pathname;
					applyEnforcement(pinia, String(current || '/'));
				} catch {
					// ignore
				}
			});
		};

		run();

		router.afterEach((to: { path: string }) => {
			window.setTimeout(() => run(to.path), 0);
			window.setTimeout(() => run(to.path), 120);
			window.setTimeout(() => run(to.path), 400);
		});

		const observer = new MutationObserver(() => run());
		const observeRoot = () => {
			const target =
				document.querySelector('#module-navigation') ||
				document.querySelector('aside.module-nav') ||
				document.querySelector('#navigation .module-nav') ||
				document.querySelector('#navigation') ||
				document.body;
			observer.observe(target, { childList: true, subtree: true });
		};

		observeRoot();
		window.setInterval(observeRoot, 5000);
	}, 150);
}
