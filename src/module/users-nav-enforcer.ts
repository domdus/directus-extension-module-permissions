import { normalizeConfig, extractModuleIdFromPath } from '../shared/evaluate';
import { MODULE_PERMISSIONS_FIELD, type ModulePermissionsConfig } from '../shared/types';

const ENFORCER_FLAG = '__modulePermissionsUsersNavEnforcerInstalled';
const STYLE_ID = 'mp-users-nav-enforcer-styles';
const HIDDEN_NAV_CLASS = 'mp-module-nav-hidden';
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
	return userStore?.currentUser?.admin_access === true;
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
	// Only the middle Module Navigation column — never the left Module Bar.
	//
	// v12: Module Bar is `#navigation.module-bar` (sibling); middle is
	//      `aside.module-nav` / `#module-navigation`.
	// v11: `#navigation` is an <aside aria-label="Module Navigation"> that
	//      WRAPS module-bar + v-resizeable(.module-nav). Never target that
	//      aside by aria-label — it would hide the outer modules too.
	return `
html.${HIDDEN_NAV_CLASS} aside.module-nav,
html.${HIDDEN_NAV_CLASS} #module-navigation,
html.${HIDDEN_NAV_CLASS} .mobile-nav.module-nav,
html.${HIDDEN_NAV_CLASS} #navigation > .v-resizeable,
html.${HIDDEN_NAV_CLASS} #navigation > .v-resizeable .module-nav,
html.${HIDDEN_NAV_CLASS} #navigation > .module-nav {
	display: none !important;
	width: 0 !important;
	min-width: 0 !important;
	max-width: 0 !important;
	flex: 0 0 0 !important;
	overflow: hidden !important;
	pointer-events: none !important;
	border: none !important;
}

/* Belt-and-suspenders: never collapse the outer module icon rail */
html.${HIDDEN_NAV_CLASS} #navigation.module-bar,
html.${HIDDEN_NAV_CLASS} #navigation > .module-bar,
html.${HIDDEN_NAV_CLASS} .module-bar {
	display: flex !important;
	visibility: visible !important;
	pointer-events: auto !important;
	width: auto !important;
	min-width: unset !important;
	max-width: none !important;
	flex: none !important;
	overflow: visible !important;
}
`.trim();
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

function applyModuleNavChrome(pinia: any, currentPath: string) {
	const root = document.documentElement;
	const config = getConfig(pinia);
	const hiddenModules = new Set((config.navigation_hidden_modules || []).map(String));
	const moduleId = extractModuleIdFromPath(currentPath);

	ensureStyleEl().textContent = buildChromeCss();

	const shouldHide = Boolean(moduleId && hiddenModules.has(moduleId));

	if (shouldHide) {
		root.classList.add(HIDDEN_NAV_CLASS);
	} else {
		root.classList.remove(HIDDEN_NAV_CLASS);
	}

	// Directus 12+: collapse the nav split panel so we don't leave an empty gutter
	try {
		const navBarStore = getStoreState(pinia, 'nav-bar-store') as LooseStore & {
			collapsed?: boolean;
		} | null;
		if (navBarStore && 'collapsed' in navBarStore) {
			if (shouldHide) {
				navBarStore.collapsed = true;
			}
		}
	} catch {
		// ignore
	}
}

function applyEnforcement(pinia: any, currentPath: string) {
	if (isAdminUser(pinia)) {
		document.documentElement.classList.remove(HIDDEN_NAV_CLASS);
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
