import type {
	CollectionPermissionRule,
	HideNavigationRule,
	HomePathRule,
	ModuleBarItem,
	ModulePermissionRule,
	ModulePermissionsConfig,
	SidebarChromeMode,
	SidebarModeRule,
	SidebarPanelRule,
	UserAccessContext,
	UsersNavConfig,
	UsersOwnRoleOnlyRule,
	UsersRoleVisibilityRule,
} from './types';
import { EMPTY_MODULE_PERMISSIONS, EMPTY_USERS_NAV } from './types';

/** Normalize an in-app path; returns null when falsy/unsafe/external. */
export function normalizeAppPath(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;

	let path = raw.trim();
	if (!path) return null;

	if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
	if (path.startsWith('//')) return null;

	path = path.split('#')[0] ?? path;
	if (!path) return null;

	if (!path.startsWith('/')) {
		path = `/${path}`;
	}

	if (path === '/admin') {
		path = '/';
	} else if (path.startsWith('/admin/')) {
		path = path.slice('/admin'.length) || '/';
	}

	if (path.includes('..')) return null;
	if (path.length > 512) return null;

	path = path.replace(/\/{2,}/g, '/');

	return path;
}

export function isValidHomePath(raw: unknown): boolean {
	return normalizeAppPath(raw) !== null;
}

function normalizeVisibilityRule<T extends { id: string; visibility?: string; roles?: string[]; policies?: string[]; block_routes?: boolean }>(
	rule: T,
): {
	id: string;
	visibility: 'hide' | 'show';
	roles: string[];
	policies: string[];
	block_routes: boolean;
} {
	return {
		id: String(rule.id),
		visibility: rule.visibility === 'show' ? 'show' : 'hide',
		roles: Array.isArray(rule.roles) ? rule.roles.map(String) : [],
		policies: Array.isArray(rule.policies) ? rule.policies.map(String) : [],
		block_routes: rule.block_routes !== false,
	};
}

function normalizeUsersConfig(raw: unknown): UsersNavConfig {
	if (!raw || typeof raw !== 'object') {
		return {
			own_role_only: [],
			roles: [],
			hide_navigation: [],
		};
	}

	const candidate = raw as Partial<UsersNavConfig>;

	const ownRoleOnly = Array.isArray(candidate.own_role_only)
		? candidate.own_role_only
				.filter((rule): rule is UsersOwnRoleOnlyRule => Boolean(rule && typeof rule === 'object' && rule.id))
				.map((rule) => ({
					id: String(rule.id),
					roles: Array.isArray(rule.roles) ? rule.roles.map(String) : [],
					policies: Array.isArray(rule.policies) ? rule.policies.map(String) : [],
				}))
		: [];

	const roles = Array.isArray(candidate.roles)
		? candidate.roles
				.filter((rule): rule is UsersRoleVisibilityRule => Boolean(rule && typeof rule === 'object' && rule.id))
				.map((rule) => normalizeVisibilityRule(rule))
		: [];

	const hideNavigation = Array.isArray(candidate.hide_navigation)
		? candidate.hide_navigation
				.filter((rule): rule is HideNavigationRule => Boolean(rule && typeof rule === 'object' && rule.id))
				.map((rule) => ({
					id: String(rule.id),
					modules: Array.isArray(rule.modules)
						? rule.modules.map(String).filter(Boolean)
						: [],
					roles: Array.isArray(rule.roles) ? rule.roles.map(String) : [],
					policies: Array.isArray(rule.policies) ? rule.policies.map(String) : [],
				}))
				.filter((rule) => rule.modules.length > 0)
		: [];

	return {
		own_role_only: ownRoleOnly,
		roles,
		hide_navigation: hideNavigation,
	};
}

export function normalizeConfig(raw: unknown): ModulePermissionsConfig {
	if (!raw || typeof raw !== 'object') {
		return {
			...EMPTY_MODULE_PERMISSIONS,
			rules: [],
			homes: [],
			collections: [],
			sidebar_panels: [],
			sidebar_modes: [],
			users: { ...EMPTY_USERS_NAV, own_role_only: [], roles: [], hide_navigation: [] },
		};
	}

	const candidate = raw as Partial<ModulePermissionsConfig>;
	const rules = Array.isArray(candidate.rules)
		? candidate.rules
				.filter((rule): rule is ModulePermissionRule => Boolean(rule && typeof rule === 'object' && rule.id))
				.map((rule) => normalizeVisibilityRule(rule))
		: [];

	const homes = Array.isArray(candidate.homes)
		? candidate.homes
				.filter((home): home is HomePathRule => Boolean(home && typeof home === 'object' && home.id))
				.map((home) => ({
					id: String(home.id),
					path: typeof home.path === 'string' ? home.path : '',
					roles: Array.isArray(home.roles) ? home.roles.map(String) : [],
					policies: Array.isArray(home.policies) ? home.policies.map(String) : [],
					force: home.force === true,
				}))
				.filter((home) => isValidHomePath(home.path))
		: [];

	const collections = Array.isArray(candidate.collections)
		? candidate.collections
				.filter((rule): rule is CollectionPermissionRule => Boolean(rule && typeof rule === 'object' && rule.id))
				.map((rule) => normalizeVisibilityRule(rule))
		: [];

	const sidebarPanels = Array.isArray(candidate.sidebar_panels)
		? candidate.sidebar_panels
				.filter((rule): rule is SidebarPanelRule => Boolean(rule && typeof rule === 'object' && rule.id))
				.map((rule) => ({
					id: String(rule.id),
					visibility: (rule.visibility === 'show' ? 'show' : 'hide') as 'hide' | 'show',
					roles: Array.isArray(rule.roles) ? rule.roles.map(String) : [],
					policies: Array.isArray(rule.policies) ? rule.policies.map(String) : [],
				}))
		: [];

	const sidebarModes = Array.isArray(candidate.sidebar_modes)
		? candidate.sidebar_modes
				.filter((rule): rule is SidebarModeRule => Boolean(rule && typeof rule === 'object' && rule.id && rule.mode))
				.map((rule) => ({
					id: String(rule.id),
					mode: rule.mode === 'hidden' ? ('hidden' as const) : ('collapsed' as const),
					roles: Array.isArray(rule.roles) ? rule.roles.map(String) : [],
					policies: Array.isArray(rule.policies) ? rule.policies.map(String) : [],
				}))
		: [];

	const users = normalizeUsersConfig(candidate.users);

	const blockedIds = Array.isArray(candidate.blocked_ids) ? candidate.blocked_ids.map(String) : undefined;
	const blockedCollectionIds = Array.isArray(candidate.blocked_collection_ids)
		? candidate.blocked_collection_ids.map(String)
		: undefined;
	const homePath =
		candidate.home_path === null
			? null
			: typeof candidate.home_path === 'string'
				? normalizeAppPath(candidate.home_path)
				: undefined;
	const homeForce = typeof candidate.home_force === 'boolean' ? candidate.home_force : undefined;
	const sidebarHiddenPanels = Array.isArray(candidate.sidebar_hidden_panels)
		? candidate.sidebar_hidden_panels.map(String)
		: undefined;
	const sidebarMode =
		candidate.sidebar_mode === 'collapsed' || candidate.sidebar_mode === 'hidden' || candidate.sidebar_mode === 'default'
			? candidate.sidebar_mode
			: undefined;
	const usersOwnRoleOnly =
		typeof candidate.users_own_role_only === 'boolean' ? candidate.users_own_role_only : undefined;
	const usersAllowedRoleIds = Array.isArray(candidate.users_allowed_role_ids)
		? candidate.users_allowed_role_ids.map(String)
		: undefined;
	const usersHiddenRoleIds = Array.isArray(candidate.users_hidden_role_ids)
		? candidate.users_hidden_role_ids.map(String)
		: undefined;
	const usersBlockedRoleIds = Array.isArray(candidate.users_blocked_role_ids)
		? candidate.users_blocked_role_ids.map(String)
		: undefined;
	const navigationHiddenModules = Array.isArray(candidate.navigation_hidden_modules)
		? candidate.navigation_hidden_modules.map(String)
		: undefined;

	return {
		version: 1,
		rules,
		homes,
		collections,
		sidebar_panels: sidebarPanels,
		sidebar_modes: sidebarModes,
		users,
		...(blockedIds ? { blocked_ids: blockedIds } : {}),
		...(blockedCollectionIds ? { blocked_collection_ids: blockedCollectionIds } : {}),
		...(homePath !== undefined ? { home_path: homePath } : {}),
		...(homeForce !== undefined ? { home_force: homeForce } : {}),
		...(sidebarHiddenPanels ? { sidebar_hidden_panels: sidebarHiddenPanels } : {}),
		...(sidebarMode ? { sidebar_mode: sidebarMode } : {}),
		...(usersOwnRoleOnly !== undefined ? { users_own_role_only: usersOwnRoleOnly } : {}),
		...(usersAllowedRoleIds ? { users_allowed_role_ids: usersAllowedRoleIds } : {}),
		...(usersHiddenRoleIds ? { users_hidden_role_ids: usersHiddenRoleIds } : {}),
		...(usersBlockedRoleIds ? { users_blocked_role_ids: usersBlockedRoleIds } : {}),
		...(navigationHiddenModules ? { navigation_hidden_modules: navigationHiddenModules } : {}),
	};
}

/**
 * Knex may return JSON columns as strings (MySQL / SQLite). Directus ItemsService
 * already parses them, which is why payload-based reads worked on Directus 11.
 */
export function parseStoredJson(raw: unknown): unknown {
	if (typeof raw !== 'string') return raw;

	const trimmed = raw.trim();
	if (!trimmed) return null;
	if (trimmed[0] !== '{' && trimmed[0] !== '[') return raw;

	try {
		return JSON.parse(trimmed);
	} catch {
		return raw;
	}
}

export function parsePermissionsField(raw: unknown): ModulePermissionsConfig {
	return normalizeConfig(parseStoredJson(raw));
}

export function isStoredConfigEmpty(config: ModulePermissionsConfig): boolean {
	return (
		(config.rules?.length ?? 0) === 0 &&
		(config.homes?.length ?? 0) === 0 &&
		(config.collections?.length ?? 0) === 0 &&
		(config.sidebar_panels?.length ?? 0) === 0 &&
		(config.sidebar_modes?.length ?? 0) === 0 &&
		(config.users?.own_role_only?.length ?? 0) === 0 &&
		(config.users?.roles?.length ?? 0) === 0 &&
		(config.users?.hide_navigation?.length ?? 0) === 0
	);
}

export function ruleHasTargets(rule: { roles?: string[]; policies?: string[] }): boolean {
	return (rule.roles?.length ?? 0) > 0 || (rule.policies?.length ?? 0) > 0;
}

export function userMatchesRule(
	rule: { roles?: string[]; policies?: string[] },
	context: UserAccessContext,
): boolean {
	if (!ruleHasTargets(rule)) return false;

	const roleSet = new Set(context.roleIds);
	const policySet = new Set(context.policyIds);

	if ((rule.roles || []).some((roleId) => roleSet.has(roleId))) return true;
	if ((rule.policies || []).some((policyId) => policySet.has(policyId))) return true;

	return false;
}

/**
 * Returns true when the module/collection/sidebar panel/users-role should be forced hidden/disabled for this user.
 */
export function shouldForceDisable(
	rule: ModulePermissionRule | CollectionPermissionRule | SidebarPanelRule | UsersRoleVisibilityRule | undefined,
	context: UserAccessContext,
): boolean {
	if (!rule || !ruleHasTargets(rule)) return false;

	const matches = userMatchesRule(rule, context);

	if (rule.visibility === 'hide' && matches) return true;
	if (rule.visibility === 'show' && !matches) return true;

	return false;
}

export function applyModulePermissions(
	moduleBar: ModuleBarItem[] | null | undefined,
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): ModuleBarItem[] {
	if (!Array.isArray(moduleBar)) return [];

	const rules = normalizeConfig(config).rules;
	const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
	const result: ModuleBarItem[] = [];

	for (const item of moduleBar) {
		const rule = rulesById.get(item.id);
		const forceOff = shouldForceDisable(rule, context);

		// Directus module-bar always renders `type: "link"` entries and ignores
		// `enabled` for them (e.g. Documentation → docs.directus.io). Remove the
		// entry entirely when globally disabled or ACL-hidden.
		if (item.type === 'link') {
			if (item.enabled === false || forceOff) continue;
			result.push({ ...item });
			continue;
		}

		if (forceOff) {
			result.push({ ...item, enabled: false });
		} else {
			result.push({ ...item });
		}
	}

	return result;
}

/**
 * Force `meta.hidden` on collections matching ACL rules (UI only — permissions unchanged).
 */
export function applyCollectionVisibility(
	collections: any[] | null | undefined,
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): any[] {
	if (!Array.isArray(collections)) return [];

	const rules = normalizeConfig(config).collections;
	const rulesById = new Map(rules.map((rule) => [rule.id, rule]));

	return collections.map((item) => {
		const name = item?.collection || item?.meta?.collection;
		if (!name) return item;

		const rule = rulesById.get(String(name));
		if (!shouldForceDisable(rule, context)) return item;

		const next = { ...item };
		next.meta = { ...(item.meta || {}), hidden: true };
		if ('hidden' in next) next.hidden = true;
		return next;
	});
}

export function getBlockedModuleIds(
	moduleBar: ModuleBarItem[] | null | undefined,
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): string[] {
	if (!Array.isArray(moduleBar)) return [];

	const rules = normalizeConfig(config).rules;
	const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
	const blocked: string[] = [];

	for (const item of moduleBar) {
		const rule = rulesById.get(item.id);
		if (!shouldForceDisable(rule, context)) continue;
		if (rule && rule.block_routes === false) continue;
		blocked.push(item.id);
	}

	return blocked;
}

/** Collection names that should block /content/<name> deep links for this user. */
export function getBlockedCollectionIds(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): string[] {
	const rules = normalizeConfig(config).collections;
	const blocked: string[] = [];

	for (const rule of rules) {
		if (!shouldForceDisable(rule, context)) continue;
		if (rule.block_routes === false) continue;
		blocked.push(rule.id);
	}

	return blocked;
}

export function resolveHomeLanding(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): { path: string; force: boolean } | null {
	const homes = normalizeConfig(config).homes;
	if (!homes.length) return null;

	const specific = homes.filter((home) => ruleHasTargets(home));
	const catchAll = homes.filter((home) => !ruleHasTargets(home));

	for (const home of specific) {
		if (!userMatchesRule(home, context)) continue;
		const path = normalizeAppPath(home.path);
		if (path) return { path, force: home.force === true };
	}

	for (const home of catchAll) {
		const path = normalizeAppPath(home.path);
		if (path) return { path, force: home.force === true };
	}

	return null;
}

export function resolveHomePath(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): string | null {
	return resolveHomeLanding(config, context)?.path ?? null;
}

export function resolveHomeForce(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): boolean {
	return resolveHomeLanding(config, context)?.force === true;
}

/** Sidebar panel ids that should be hidden for this user. */
export function getHiddenSidebarPanels(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): string[] {
	const rules = normalizeConfig(config).sidebar_panels;
	const hidden: string[] = [];

	for (const rule of rules) {
		if (!shouldForceDisable(rule, context)) continue;
		hidden.push(String(rule.id));
	}

	return hidden;
}

/** Whole-sidebar chrome mode for this user (`default` if none match). */
export function resolveSidebarMode(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): SidebarChromeMode {
	const modes = normalizeConfig(config).sidebar_modes;
	if (!modes.length) return 'default';

	const specific = modes.filter((rule) => ruleHasTargets(rule));
	const catchAll = modes.filter((rule) => !ruleHasTargets(rule));

	for (const rule of specific) {
		if (!userMatchesRule(rule, context)) continue;
		return rule.mode;
	}

	if (catchAll[0]) return catchAll[0].mode;
	return 'default';
}

/** Whether Users nav should restrict to own role (+ parents). First match / catch-all. */
export function resolveUsersOwnRoleOnly(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): boolean {
	const rules = normalizeConfig(config).users.own_role_only;
	if (!rules.length) return false;

	const specific = rules.filter((rule) => ruleHasTargets(rule));
	const catchAll = rules.filter((rule) => !ruleHasTargets(rule));

	for (const rule of specific) {
		if (userMatchesRule(rule, context)) return true;
	}

	return catchAll.length > 0;
}

/** Role ids allowed when own_role_only is active (already includes parent walk in context). */
export function getUsersAllowedRoleIds(context: UserAccessContext): string[] {
	return [...context.roleIds];
}

/** Role ids hidden via explicit Users role visibility rules. */
export function getHiddenUsersRoleIds(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): string[] {
	const rules = normalizeConfig(config).users.roles;
	const hidden: string[] = [];

	for (const rule of rules) {
		if (!shouldForceDisable(rule, context)) continue;
		hidden.push(String(rule.id));
	}

	return hidden;
}

/** Role ids whose /users/roles/:id deep links should be blocked. */
export function getBlockedUsersRoleIds(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): string[] {
	const rules = normalizeConfig(config).users.roles;
	const blocked: string[] = [];

	for (const rule of rules) {
		if (!shouldForceDisable(rule, context)) continue;
		if (rule.block_routes === false) continue;
		blocked.push(String(rule.id));
	}

	return blocked;
}

/** Module ids where Module Navigation chrome should be hidden. */
export function getNavigationHiddenModules(
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): string[] {
	const rules = normalizeConfig(config).users.hide_navigation;
	const modules = new Set<string>();

	const specific = rules.filter((rule) => ruleHasTargets(rule));
	const catchAll = rules.filter((rule) => !ruleHasTargets(rule));

	for (const rule of specific) {
		if (!userMatchesRule(rule, context)) continue;
		for (const moduleId of rule.modules) modules.add(String(moduleId));
	}

	for (const rule of catchAll) {
		for (const moduleId of rule.modules) modules.add(String(moduleId));
	}

	return [...modules];
}

/** Extract role id from `/users/roles/<role>/...` app paths. */
export function extractUsersRoleFromPath(path: string): string | null {
	const normalized = normalizeAppPath(path);
	if (!normalized) return null;

	const segments = normalized.split('/').filter(Boolean);
	if (segments[0] !== 'users') return null;
	if (segments[1] !== 'roles') return null;
	if (!segments[2] || segments[2] === '+') return null;
	return segments[2];
}

/** Whether a role id should remain visible in Users nav for this user. */
export function isUsersRoleVisible(
	roleId: string,
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): boolean {
	const normalized = normalizeConfig(config);
	const ownRoleOnly = resolveUsersOwnRoleOnly(normalized, context);
	const allowed = new Set(getUsersAllowedRoleIds(context));
	const hidden = new Set(getHiddenUsersRoleIds(normalized, context));

	if (hidden.has(String(roleId))) return false;
	if (ownRoleOnly && !allowed.has(String(roleId))) return false;
	return true;
}

/** Filter a roles payload list for Users-nav ACL (id field required). */
export function filterRolesForUserVisibility(
	roles: any[] | null | undefined,
	config: ModulePermissionsConfig | null | undefined,
	context: UserAccessContext,
): any[] {
	if (!Array.isArray(roles)) return [];

	const normalized = normalizeConfig(config);
	const ownRoleOnly = resolveUsersOwnRoleOnly(normalized, context);
	const hasExplicit = (normalized.users?.roles?.length ?? 0) > 0;

	if (!ownRoleOnly && !hasExplicit) return roles;

	const kept = roles.filter((row) => {
		const id = row?.id;
		if (!id) return true;
		return isUsersRoleVisible(String(id), normalized, context);
	});

	const keptIds = new Set(kept.map((row) => String(row.id)).filter(Boolean));

	// Orphans whose parent was filtered out must surface at the root, or the
	// Users nav tree (groupBy parent) drops them entirely.
	return kept.map((row) => {
		const parent = row?.parent;
		if (parent == null || parent === '') return row;
		if (keptIds.has(String(parent))) return row;
		return { ...row, parent: null };
	});
}

export function isPathBlocked(path: string | null | undefined, blocked: Set<string> | string[]): boolean {
	const normalized = normalizeAppPath(path);
	if (!normalized || normalized === '/') return false;

	const blockedSet = blocked instanceof Set ? blocked : new Set(blocked);
	const moduleId = extractModuleIdFromPath(normalized);
	if (!moduleId) return false;
	return blockedSet.has(moduleId);
}

export function extractModuleIdFromPath(path: string): string | null {
	const normalized = normalizeAppPath(path);
	if (!normalized || normalized === '/') return null;

	const segments = normalized.split('/').filter(Boolean);
	return segments[0] || null;
}

/** Extract collection name from `/content/<collection>/...` app paths. */
export function extractContentCollectionFromPath(path: string): string | null {
	const normalized = normalizeAppPath(path);
	if (!normalized) return null;

	const segments = normalized.split('/').filter(Boolean);
	if (segments[0] !== 'content') return null;
	if (!segments[1] || segments[1] === '+') return null;
	return segments[1];
}

export function buildSafeRedirectCandidates(options: {
	homePath?: string | null;
	moduleBar?: ModuleBarItem[] | null;
	blocked: Set<string> | string[];
	blockedCollections?: Set<string> | string[];
	fromPath?: string | null;
}): string[] {
	const blockedSet = options.blocked instanceof Set ? options.blocked : new Set(options.blocked);
	const blockedCollections =
		options.blockedCollections instanceof Set
			? options.blockedCollections
			: new Set(options.blockedCollections || []);
	const from = normalizeAppPath(options.fromPath);
	const fromModule = from ? extractModuleIdFromPath(from) : null;
	const seen = new Set<string>();
	const candidates: string[] = [];

	const push = (raw: string | null | undefined) => {
		const path = normalizeAppPath(raw);
		if (!path) return;
		if (seen.has(path)) return;
		if (from && path === from) return;
		if (isPathBlocked(path, blockedSet)) return;

		const contentCollection = extractContentCollectionFromPath(path);
		if (contentCollection && blockedCollections.has(contentCollection)) return;

		const moduleId = extractModuleIdFromPath(path);
		if (fromModule && moduleId && moduleId === fromModule && blockedSet.has(fromModule)) return;

		seen.add(path);
		candidates.push(path);
	};

	push(options.homePath);

	if (Array.isArray(options.moduleBar)) {
		for (const item of options.moduleBar) {
			if (item.type !== 'module') continue;
			if (!item.enabled) continue;
			if (item.id === 'module-permissions') continue;
			if (blockedSet.has(item.id)) continue;
			push(`/${item.id}`);
		}
	}

	if (!seen.has('/')) {
		candidates.push('/');
	}

	return candidates;
}

export function serializeModuleBar(items: ModuleBarItem[]): ModuleBarItem[] {
	return items.map((item) => {
		if (item.type === 'link') {
			const { type, id, name, url, icon, enabled, locked } = item;
			return { type, id, name, url, icon, enabled, locked };
		}

		const { type, id, enabled, locked } = item;
		return { type, id, enabled, locked };
	});
}

/** Persistable config — never write computed fields */
export function serializePermissionsConfig(raw: unknown): ModulePermissionsConfig {
	const normalized = normalizeConfig(raw);
	return {
		version: 1,
		rules: normalized.rules,
		homes: normalized.homes.map((home) => ({
			id: home.id,
			path: normalizeAppPath(home.path) || home.path,
			roles: home.roles,
			policies: home.policies,
			force: home.force === true,
		})),
		collections: normalized.collections,
		sidebar_panels: normalized.sidebar_panels,
		sidebar_modes: normalized.sidebar_modes,
		users: {
			own_role_only: normalized.users.own_role_only,
			roles: normalized.users.roles,
			hide_navigation: normalized.users.hide_navigation,
		},
	};
}
