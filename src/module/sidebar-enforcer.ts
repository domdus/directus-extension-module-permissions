import { normalizeConfig } from '../shared/evaluate';
import {
	MODULE_PERMISSIONS_FIELD,
	SIDEBAR_PANEL_CATALOG,
	type ModulePermissionsConfig,
	type SidebarChromeMode,
} from '../shared/types';

const ENFORCER_FLAG = '__modulePermissionsSidebarEnforcerInstalled';
const STYLE_ID = 'mp-sidebar-enforcer-styles';
const HIDDEN_CLASS = 'mp-sidebar-hidden';
const PANEL_ATTR = 'data-mp-sidebar-panel-hidden';

const PANEL_ICON_BY_ID = new Map(SIDEBAR_PANEL_CATALOG.map((panel) => [panel.id, panel.icon]));

type LooseStore = {
	currentUser?: {
		admin_access?: boolean;
	} | null;
	settings?: {
		[MODULE_PERMISSIONS_FIELD]?: ModulePermissionsConfig | null;
	} | null;
	collapsed?: boolean;
	collapse?: () => void;
	sidebarOpen?: boolean;
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

function getHiddenPanels(pinia: any): string[] {
	const config = getConfig(pinia);
	if (Array.isArray(config.sidebar_hidden_panels)) {
		return config.sidebar_hidden_panels.map(String);
	}
	return [];
}

function getSidebarMode(pinia: any): SidebarChromeMode {
	const config = getConfig(pinia);
	if (config.sidebar_mode === 'collapsed' || config.sidebar_mode === 'hidden') {
		return config.sidebar_mode;
	}
	return 'default';
}

function ensureStyleEl(): HTMLStyleElement {
	let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
	if (el) return el;

	el = document.createElement('style');
	el.id = STYLE_ID;
	document.head.appendChild(el);
	return el;
}

function buildPanelCss(panelIds: string[]): string {
	if (!panelIds.length) return '';

	const rules: string[] = [];

	for (const id of panelIds) {
		const safe = CSS.escape(id);
		rules.push(`.accordion-item:has(#${safe}) { display: none !important; }`);
		rules.push(`.accordion-item[data-value="${safe}"] { display: none !important; }`);
		rules.push(`.accordion-section:has(#${safe}) { display: none !important; }`);
		rules.push(`.v-list-group:has(#${safe}) { display: none !important; }`);
		rules.push(`[${PANEL_ATTR}="${safe}"] { display: none !important; }`);

		// Activity Log footer (Directus ≤11.x notifications-preview)
		if (id === 'activity') {
			rules.push(`#sidebar .notifications-preview { display: none !important; }`);
		}
	}

	return rules.join('\n');
}

function buildChromeCss(mode: SidebarChromeMode): string {
	if (mode !== 'hidden') return '';

	return `
html.${HIDDEN_CLASS} #sidebar {
	display: none !important;
	width: 0 !important;
	min-width: 0 !important;
	overflow: hidden !important;
	pointer-events: none !important;
}
html.${HIDDEN_CLASS} .sidebar-button,
html.${HIDDEN_CLASS} button.sidebar-toggle,
html.${HIDDEN_CLASS} .header-bar .sidebar-toggle,
html.${HIDDEN_CLASS} [data-sidebar-toggle] {
	display: none !important;
}
`.trim();
}

function markHidden(node: Element | null | undefined, id: string) {
	if (!node || !(node instanceof HTMLElement)) return;
	node.setAttribute(PANEL_ATTR, id);
	node.style.display = 'none';
}

function iconNameFromNode(node: Element): string | null {
	const material = node.querySelector?.('.material-icons, .material-symbols-outlined, .material-symbols-rounded');
	if (material?.textContent) {
		const name = material.textContent.trim();
		if (name) return name;
	}

	const labeled = node.querySelector?.('[data-icon], [aria-label]');
	const dataIcon = labeled?.getAttribute('data-icon') || labeled?.getAttribute('aria-label');
	if (dataIcon) return dataIcon.trim();

	const vIcon = node.classList?.contains('v-icon') ? node : node.querySelector?.('.v-icon');
	if (vIcon?.textContent) {
		const name = vIcon.textContent.trim();
		if (name && name.length < 64 && !name.includes('\n')) return name;
	}

	return null;
}

function hideLegacySidebarDetailByIcon(panelId: string, iconName: string) {
	const sidebar = document.querySelector('#sidebar');
	if (!sidebar) return;

	const toggles = sidebar.querySelectorAll('.toggle, button.accordion-trigger, .sidebar-detail > button');

	toggles.forEach((toggle) => {
		const found = iconNameFromNode(toggle);
		if (found !== iconName) return;

		markHidden(toggle as HTMLElement, panelId);

		let sibling = toggle.nextElementSibling;
		while (sibling) {
			if (
				sibling.classList.contains('toggle') ||
				sibling.classList.contains('accordion-item') ||
				sibling.classList.contains('accordion-trigger')
			) {
				break;
			}

			if (
				sibling.classList.contains('content') ||
				sibling.classList.contains('scroll-container') ||
				sibling.classList.contains('accordion-content') ||
				(sibling instanceof HTMLElement && sibling.getAttribute('data-state'))
			) {
				markHidden(sibling, panelId);
			}

			sibling = sibling.nextElementSibling;
		}

		const host = toggle.closest('.sidebar-detail');
		if (host && host !== toggle) markHidden(host as HTMLElement, panelId);
	});
}

function hideActivityLogPanel(panelId: string) {
	if (panelId !== 'activity') return;

	document.querySelectorAll('#sidebar .notifications-preview').forEach((node) => {
		markHidden(node, panelId);
	});

	// Fallback when the preview wrapper class differs across versions
	document.querySelectorAll('#sidebar .sidebar-button, #sidebar button.sidebar-button').forEach((btn) => {
		if (iconNameFromNode(btn) !== 'pending_actions') return;
		const host = (btn.closest('.notifications-preview') as HTMLElement | null) || (btn as HTMLElement);
		markHidden(host, panelId);
	});
}

function hidePanelNodes(panelIds: string[]) {
	const wanted = new Set(panelIds);

	document.querySelectorAll(`[${PANEL_ATTR}]`).forEach((node) => {
		const id = node.getAttribute(PANEL_ATTR);
		if (!id || !wanted.has(id)) {
			node.removeAttribute(PANEL_ATTR);
			(node as HTMLElement).style.removeProperty('display');
		}
	});

	for (const id of panelIds) {
		const byId =
			document.getElementById(id) ||
			(document.querySelector(`.accordion-item[data-value="${CSS.escape(id)}"]`) as HTMLElement | null);

		if (byId) {
			const section =
				(byId.closest('.accordion-item') as HTMLElement | null) ||
				(byId.closest('.accordion-section') as HTMLElement | null) ||
				(byId.closest('.v-list-group') as HTMLElement | null) ||
				(byId.classList?.contains('accordion-item') ? byId : null) ||
				(byId.parentElement as HTMLElement | null);

			markHidden(section, id);
		}

		const icon = PANEL_ICON_BY_ID.get(id as any) || null;
		if (icon) hideLegacySidebarDetailByIcon(id, icon);

		hideActivityLogPanel(id);
	}
}

function applyChrome(pinia: any, mode: SidebarChromeMode) {
	const root = document.documentElement;

	if (mode === 'hidden') {
		root.classList.add(HIDDEN_CLASS);
		return;
	}

	root.classList.remove(HIDDEN_CLASS);

	if (mode === 'collapsed') {
		const sidebarStore = getStoreState(pinia, 'sidebar-store');
		try {
			sidebarStore?.collapse?.();
		} catch {
			// ignore
		}

		// Directus ≤11.x uses appStore.sidebarOpen
		const appStore = getStoreState(pinia, 'appStore');
		try {
			if (appStore && 'sidebarOpen' in appStore) {
				appStore.sidebarOpen = false;
			}
		} catch {
			// ignore
		}
	}
}

function applyEnforcement(pinia: any) {
	if (isAdminUser(pinia)) {
		ensureStyleEl().textContent = '';
		document.documentElement.classList.remove(HIDDEN_CLASS);
		document.querySelectorAll(`[${PANEL_ATTR}]`).forEach((node) => {
			node.removeAttribute(PANEL_ATTR);
			(node as HTMLElement).style.removeProperty('display');
		});
		return;
	}

	const panels = getHiddenPanels(pinia);
	const mode = getSidebarMode(pinia);
	const style = ensureStyleEl();
	style.textContent = `${buildPanelCss(panels)}\n${buildChromeCss(mode)}`;

	hidePanelNodes(panels);
	applyChrome(pinia, mode);
}

export function installSidebarEnforcer(): void {
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

		let scheduled = false;
		const run = () => {
			if (scheduled) return;
			scheduled = true;
			window.requestAnimationFrame(() => {
				scheduled = false;
				try {
					applyEnforcement(pinia);
				} catch {
					// ignore
				}
			});
		};

		run();

		router.afterEach(() => {
			window.setTimeout(run, 0);
			window.setTimeout(run, 120);
			window.setTimeout(run, 400);
		});

		const observer = new MutationObserver(() => {
			run();
		});

		const observeRoot = () => {
			const sidebar = document.querySelector('#sidebar');
			const target = sidebar || document.body;
			observer.observe(target, { childList: true, subtree: true });
		};

		observeRoot();
		window.setInterval(observeRoot, 5000);

		// Keep force-collapsed sticky if the user tries to expand
		window.setInterval(() => {
			try {
				if (isAdminUser(pinia)) return;
				if (getSidebarMode(pinia) !== 'collapsed') return;

				const sidebarStore = getStoreState(pinia, 'sidebar-store');
				if (sidebarStore && sidebarStore.collapsed === false) {
					sidebarStore.collapse?.();
				}

				const appStore = getStoreState(pinia, 'appStore');
				if (appStore && appStore.sidebarOpen === true) {
					appStore.sidebarOpen = false;
				}
			} catch {
				// ignore
			}
		}, 400);
	}, 150);
}
