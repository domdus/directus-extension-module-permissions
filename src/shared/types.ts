export type ModuleBarModule = {
	type: 'module';
	id: string;
	enabled: boolean;
	locked?: boolean;
};

export type ModuleBarLink = {
	type: 'link';
	id: string;
	url: string;
	icon: string;
	name: string;
	enabled: boolean;
	locked?: boolean;
};

export type ModuleBarItem = ModuleBarModule | ModuleBarLink;

export type ModulePermissionVisibility = 'hide' | 'show';

export type ModulePermissionRule = {
	/** Matches module_bar item id */
	id: string;
	visibility: ModulePermissionVisibility;
	roles: string[];
	policies: string[];
	/** When true, client guard blocks deep links if ACL disables the module */
	block_routes: boolean;
};

/**
 * Hide/show a Content-module collection in the nav while keeping read permissions.
 * `id` is the collection name (e.g. `articles`).
 */
export type CollectionPermissionRule = {
	id: string;
	visibility: ModulePermissionVisibility;
	roles: string[];
	policies: string[];
	/** When true, client guard blocks /content/<collection> deep links */
	block_routes: boolean;
};

/** Known Directus `#sidebar` / `sidebar-detail` panel ids */
export type SidebarPanelId =
	| 'layout'
	| 'archive'
	| 'refresh'
	| 'export'
	| 'revisions'
	| 'comments'
	| 'shares'
	| 'flows'
	| 'activity';

export type SidebarPanelRule = {
	/** sidebar-detail id (or `activity` for the Activity Log footer) */
	id: SidebarPanelId | string;
	visibility: ModulePermissionVisibility;
	roles: string[];
	policies: string[];
};

export type SidebarChromeMode = 'default' | 'collapsed' | 'hidden';

/**
 * First match wins (list order). Empty roles+policies = catch-all.
 * Controls the whole right sidebar chrome (not individual panels).
 */
export type SidebarModeRule = {
	id: string;
	mode: Exclude<SidebarChromeMode, 'default'>;
	roles: string[];
	policies: string[];
};

/**
 * First matching entry (by list order) wins.
 * Empty roles+policies = catch-all default for non-admins (place last).
 */
export type HomePathRule = {
	id: string;
	/** App path, e.g. `/files` or `/content/collections/posts` (not an external URL) */
	path: string;
	roles: string[];
	policies: string[];
	/**
	 * When true, redirect to this path even if Directus has a `last_page`.
	 * Still does not override an explicit `?redirect=` query.
	 */
	force?: boolean;
};

/** Target who gets "own role only" in Users Module Navigation. Empty roles+policies = catch-all. */
export type UsersOwnRoleOnlyRule = {
	id: string;
	roles: string[];
	policies: string[];
};

/**
 * Hide/show a specific role in the Users module navigation tree.
 * `id` is the role UUID.
 */
export type UsersRoleVisibilityRule = {
	id: string;
	visibility: ModulePermissionVisibility;
	roles: string[];
	policies: string[];
	/** When true, client guard blocks /users/roles/<id> deep links */
	block_routes: boolean;
};

/**
 * Hide Module Navigation (middle column) for listed module ids when user matches.
 * Empty roles+policies = catch-all.
 */
export type HideNavigationRule = {
	id: string;
	/** Module bar ids, e.g. `users`, `content` */
	modules: string[];
	roles: string[];
	policies: string[];
};

export type UsersNavConfig = {
	own_role_only: UsersOwnRoleOnlyRule[];
	roles: UsersRoleVisibilityRule[];
	hide_navigation: HideNavigationRule[];
};

export type ModulePermissionsConfig = {
	version: 1;
	rules: ModulePermissionRule[];
	homes: HomePathRule[];
	collections: CollectionPermissionRule[];
	sidebar_panels: SidebarPanelRule[];
	sidebar_modes: SidebarModeRule[];
	users: UsersNavConfig;
	/**
	 * Computed on settings.read for non-admins only.
	 * Lists module ids whose deep links should be blocked for the current user.
	 */
	blocked_ids?: string[];
	/**
	 * Computed on settings.read for non-admins only.
	 * Collection names hidden from Content nav / optionally blocked for deep links.
	 */
	blocked_collection_ids?: string[];
	/**
	 * Computed on settings.read for non-admins only.
	 * Resolved home path for the current user, or null if none/invalid.
	 */
	home_path?: string | null;
	/**
	 * Computed on settings.read for non-admins only.
	 * When true, client should redirect to `home_path` even if `last_page` is set.
	 */
	home_force?: boolean;
	/**
	 * Computed on settings.read for non-admins only.
	 * Sidebar panel ids to hide in the UI.
	 */
	sidebar_hidden_panels?: string[];
	/**
	 * Computed on settings.read for non-admins only.
	 * Whole-sidebar chrome mode.
	 */
	sidebar_mode?: SidebarChromeMode;
	/** Computed: Users nav should only show own role (+ parents). */
	users_own_role_only?: boolean;
	/** Computed: role ids allowed when own_role_only (own + parents). */
	users_allowed_role_ids?: string[];
	/** Computed: role ids hidden via explicit Users role visibility rules. */
	users_hidden_role_ids?: string[];
	/** Computed: role ids whose /users/roles/:id deep links are blocked. */
	users_blocked_role_ids?: string[];
	/** Computed: module ids where Module Navigation chrome is hidden. */
	navigation_hidden_modules?: string[];
};

export type UserAccessContext = {
	roleIds: string[];
	policyIds: string[];
};

export const MODULE_PERMISSIONS_FIELD = 'module_permissions';

export const SIDEBAR_PANEL_CATALOG: Array<{
	id: SidebarPanelId;
	name: string;
	icon: string;
	context: 'collection' | 'item' | 'both';
}> = [
	{ id: 'layout', name: 'Layout Options', icon: 'layers', context: 'collection' },
	{ id: 'archive', name: 'Archive', icon: 'archive', context: 'collection' },
	{ id: 'refresh', name: 'Auto Refresh', icon: 'sync', context: 'collection' },
	{ id: 'export', name: 'Import / Export', icon: 'import_export', context: 'collection' },
	{ id: 'revisions', name: 'Revisions', icon: 'change_history', context: 'item' },
	{ id: 'comments', name: 'Comments', icon: 'chat_bubble_outline', context: 'item' },
	{ id: 'shares', name: 'Shares', icon: 'share', context: 'item' },
	{ id: 'flows', name: 'Flows', icon: 'bolt', context: 'both' },
	{ id: 'activity', name: 'Activity Log', icon: 'pending_actions', context: 'both' },
];

export const EMPTY_USERS_NAV: UsersNavConfig = {
	own_role_only: [],
	roles: [],
	hide_navigation: [],
};

export const EMPTY_MODULE_PERMISSIONS: ModulePermissionsConfig = {
	version: 1,
	rules: [],
	homes: [],
	collections: [],
	sidebar_panels: [],
	sidebar_modes: [],
	users: { ...EMPTY_USERS_NAV, own_role_only: [], roles: [], hide_navigation: [] },
};
