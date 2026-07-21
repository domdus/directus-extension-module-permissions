import {
	buildSafeRedirectCandidates,
	extractContentCollectionFromPath,
	extractModuleIdFromPath,
	extractUsersRoleFromPath,
	getBlockedModuleIds,
	isPathBlocked,
	normalizeAppPath,
	normalizeConfig,
} from '../shared/evaluate';
import { userHasAdminAccess } from '../shared/admin';
import { MODULE_PERMISSIONS_FIELD, type ModuleBarItem, type ModulePermissionsConfig } from '../shared/types';

const GUARD_FLAG = '__modulePermissionsRouteGuardInstalled';
const HOME_ONCE_KEY = 'mp_home_applied';
const MAX_REDIRECT_DEPTH = 4;

type LooseStore = {
	currentUser?: {
		admin_access?: boolean;
		last_page?: string | null;
		role?: string | { id?: string } | null;
	} | null;
	settings?: {
		module_bar?: ModuleBarItem[];
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

function clearHomeOnceFlag(): void {
	try {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.removeItem(HOME_ONCE_KEY);
		}
	} catch {
		// ignore
	}
}

function hasHomeOnceFlag(): boolean {
	try {
		return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(HOME_ONCE_KEY) === '1';
	} catch {
		return false;
	}
}

function markHomeOnceApplied(): void {
	try {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(HOME_ONCE_KEY, '1');
		}
	} catch {
		// ignore
	}
}

function getBlockedIds(pinia: any): Set<string> {
	const settingsStore = getStoreState(pinia, 'settingsStore');
	const settings = settingsStore?.settings;
	if (!settings) return new Set();

	const config = normalizeConfig(settings[MODULE_PERMISSIONS_FIELD]);

	if (Array.isArray(config.blocked_ids) && config.blocked_ids.length > 0) {
		return new Set(config.blocked_ids.map(String));
	}

	const moduleBar = settings.module_bar as ModuleBarItem[] | undefined;
	const userStore = getStoreState(pinia, 'userStore');
	const role = userStore?.currentUser?.role;
	const roleId = typeof role === 'string' ? role : role?.id;
	const roleIds = roleId ? [String(roleId)] : [];

	return new Set(
		getBlockedModuleIds(moduleBar, config, {
			roleIds,
			policyIds: [],
		}),
	);
}

function getBlockedCollections(pinia: any): Set<string> {
	const config = getConfig(pinia);
	if (Array.isArray(config.blocked_collection_ids)) {
		return new Set(config.blocked_collection_ids.map(String));
	}
	return new Set();
}

function getBlockedUsersRoles(pinia: any): Set<string> {
	const config = getConfig(pinia);
	const blocked = new Set<string>();

	if (Array.isArray(config.users_blocked_role_ids)) {
		for (const id of config.users_blocked_role_ids) blocked.add(String(id));
	}

	// Own-role-only: treat non-allowed roles as blocked for deep links
	if (config.users_own_role_only === true) {
		const allowed = new Set((config.users_allowed_role_ids || []).map(String));
		// We only know the allowed set; blocking is applied when the path role is not allowed
		(pinia as any).__mpUsersAllowedRoles = allowed;
	} else {
		(pinia as any).__mpUsersAllowedRoles = null;
	}

	return blocked;
}

function isUsersRoleBlocked(pinia: any, roleId: string, blocked: Set<string>): boolean {
	if (blocked.has(roleId)) return true;
	const allowed = (pinia as any).__mpUsersAllowedRoles as Set<string> | null;
	if (allowed && !allowed.has(roleId)) return true;
	return false;
}

function getHomePath(pinia: any): string | null {
	const config = getConfig(pinia);
	if (typeof config.home_path === 'string') {
		return normalizeAppPath(config.home_path);
	}
	if (config.home_path === null) return null;
	return null;
}

function getHomeForce(pinia: any): boolean {
	const config = getConfig(pinia);
	return config.home_force === true;
}

function hasExplicitRedirectQuery(to: { query?: Record<string, unknown> } | null | undefined): boolean {
	const redirect = to?.query?.redirect;
	if (typeof redirect === 'string' && redirect.trim()) return true;
	if (Array.isArray(redirect) && redirect.some((value) => typeof value === 'string' && value.trim())) return true;
	return false;
}

function findSafeRedirect(
	pinia: any,
	blocked: Set<string>,
	blockedCollections: Set<string>,
	fromPath?: string | null,
): string {
	const settingsStore = getStoreState(pinia, 'settingsStore');
	const moduleBar = settingsStore?.settings?.module_bar;
	const candidates = buildSafeRedirectCandidates({
		homePath: getHomePath(pinia),
		moduleBar,
		blocked,
		blockedCollections,
		fromPath,
	});

	return candidates[0] || '/';
}

function isDefaultLandingPath(path: string): boolean {
	const normalized = normalizeAppPath(path);
	return normalized === '/' || normalized === '/content';
}

function isLoginPath(path: string): boolean {
	const normalized = normalizeAppPath(path) || '';
	return normalized === '/login' || normalized.startsWith('/login/');
}

function tryApplyHomeOnce(
	to: { path: string; query?: Record<string, unknown> },
	pinia: any,
	blocked: Set<string>,
	blockedCollections: Set<string>,
	next: (arg?: string | false | void) => void,
): boolean {
	if (hasHomeOnceFlag()) return false;

	if (isAdminUser(pinia)) return false;

	const userStore = getStoreState(pinia, 'userStore');
	const user = userStore?.currentUser;
	if (!user) return false;

	const home = getHomePath(pinia);
	const force = getHomeForce(pinia);
	const lastPage = normalizeAppPath(user.last_page);
	const current = normalizeAppPath(to.path);

	// Settings may not be hydrated yet — retry on a later navigation.
	if (!home) return false;

	// Explicit ?redirect= on the destination still wins (including over force).
	if (hasExplicitRedirectQuery(to)) {
		markHomeOnceApplied();
		return false;
	}

	if (!force) {
		if (lastPage) {
			markHomeOnceApplied();
			return false;
		}

		if (!isDefaultLandingPath(to.path)) {
			return false;
		}
	}

	const target = home;
	if (!target || target === current) {
		markHomeOnceApplied();
		return false;
	}

	// Don't send users to a start page that is itself blocked.
	if (isPathBlocked(target, blocked)) {
		markHomeOnceApplied();
		return false;
	}

	const contentCollection = extractContentCollectionFromPath(target);
	if (contentCollection && blockedCollections.has(contentCollection)) {
		markHomeOnceApplied();
		return false;
	}

	markHomeOnceApplied();
	next(target);
	return true;
}

function redirectAway(
	toPath: string,
	pinia: any,
	blocked: Set<string>,
	blockedCollections: Set<string>,
	redirectDepth: { value: number },
	next: (arg?: string | false | void) => void,
) {
	if (redirectDepth.value >= MAX_REDIRECT_DEPTH) {
		redirectDepth.value = 0;
		if (normalizeAppPath(toPath) === '/') next();
		else next('/');
		return;
	}

	const redirectTo = findSafeRedirect(pinia, blocked, blockedCollections, toPath);
	const current = normalizeAppPath(toPath);
	const target = normalizeAppPath(redirectTo);

	if (!target || target === current) {
		redirectDepth.value = 0;
		if (current === '/') next();
		else next('/');
		return;
	}

	if (target === '/' && current === '/') {
		redirectDepth.value = 0;
		next();
		return;
	}

	redirectDepth.value += 1;
	next(target);
}

export function installRouteGuard(): void {
	if (typeof window === 'undefined') return;
	if ((window as any)[GUARD_FLAG]) return;

	const started = Date.now();
	const redirectDepth = { value: 0 };

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
		(window as any)[GUARD_FLAG] = true;

		router.beforeEach((to: { path: string; query?: Record<string, unknown> }, _from: unknown, next: (arg?: string | false | void) => void) => {
			try {
				// Logout / login screen: allow a fresh start-page attempt on next auth session.
				if (isLoginPath(to.path)) {
					clearHomeOnceFlag();
					redirectDepth.value = 0;
					next();
					return;
				}

				if (isAdminUser(pinia)) {
					redirectDepth.value = 0;
					next();
					return;
				}

				const userStore = getStoreState(pinia, 'userStore');
				if (!userStore?.currentUser) {
					clearHomeOnceFlag();
					redirectDepth.value = 0;
					next();
					return;
				}

				const blocked = getBlockedIds(pinia);
				const blockedCollections = getBlockedCollections(pinia);
				const blockedUsersRoles = getBlockedUsersRoles(pinia);

				if (tryApplyHomeOnce(to, pinia, blocked, blockedCollections, next)) {
					redirectDepth.value = 0;
					return;
				}

				const contentCollection = extractContentCollectionFromPath(to.path);
				if (contentCollection && blockedCollections.has(contentCollection)) {
					redirectAway(to.path, pinia, blocked, blockedCollections, redirectDepth, next);
					return;
				}

				const usersRole = extractUsersRoleFromPath(to.path);
				if (usersRole && isUsersRoleBlocked(pinia, usersRole, blockedUsersRoles)) {
					redirectAway(to.path, pinia, blocked, blockedCollections, redirectDepth, next);
					return;
				}

				const moduleId = extractModuleIdFromPath(to.path);
				if (!moduleId) {
					redirectDepth.value = 0;
					next();
					return;
				}

				if (moduleId === 'module-permissions') {
					redirectDepth.value = 0;
					next();
					return;
				}

				if (!blocked.has(moduleId)) {
					redirectDepth.value = 0;
					next();
					return;
				}

				redirectAway(to.path, pinia, blocked, blockedCollections, redirectDepth, next);
			} catch {
				redirectDepth.value = 0;
				next();
			}
		});

		router.afterEach(() => {
			redirectDepth.value = 0;
		});
	}, 150);
}
