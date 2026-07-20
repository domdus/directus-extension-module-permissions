import { useApi, useStores } from '@directus/extensions-sdk';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	isValidHomePath,
	normalizeAppPath,
	normalizeConfig,
	serializeModuleBar,
	serializePermissionsConfig,
} from '../../shared/evaluate';
import { getModuleMeta } from '../../shared/module-meta';
import {
	EMPTY_MODULE_PERMISSIONS,
	EMPTY_USERS_NAV,
	MODULE_PERMISSIONS_FIELD,
	SIDEBAR_PANEL_CATALOG,
	type CollectionPermissionRule,
	type HideNavigationRule,
	type HomePathRule,
	type ModuleBarItem,
	type ModuleBarLink,
	type ModulePermissionRule,
	type ModulePermissionsConfig,
	type SidebarModeRule,
	type SidebarPanelRule,
	type UsersOwnRoleOnlyRule,
	type UsersRoleVisibilityRule,
} from '../../shared/types';

export type PreviewItem = ModuleBarItem & {
	to: string;
	name: string;
	icon: string;
};

export type CollectionCatalogItem = {
	collection: string;
	name: string;
	icon: string;
};

function cloneDeep<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Resolve Directus `$t:key` labels (e.g. policy name `$t:public_label`). */
function resolveTranslatedLabel(raw: unknown, translate: (key: string) => string): string {
	if (typeof raw !== 'string') return String(raw ?? '');
	if (!raw.startsWith('$t:')) return raw;

	const key = raw.slice(3).trim();
	if (!key) return raw;

	try {
		const translated = translate(key);
		if (translated && translated !== key) return translated;
	} catch {
		// ignore missing keys
	}

	return key;
}

const loading = ref(true);
const saving = ref(false);
const cleaning = ref(false);
const moduleBar = ref<ModuleBarItem[]>([]);
const permissions = ref<ModulePermissionsConfig>(cloneDeep(EMPTY_MODULE_PERMISSIONS));
const initialModuleBar = ref<ModuleBarItem[]>([]);
const initialPermissions = ref<ModulePermissionsConfig>(cloneDeep(EMPTY_MODULE_PERMISSIONS));
const roleOptions = ref<{ text: string; value: string }[]>([]);
const policyOptions = ref<{ text: string; value: string }[]>([]);

const linkEditing = ref<string | null>(null);
const linkValues = ref<ModuleBarLink | null>(null);
const ruleEditingId = ref<string | null>(null);
const ruleDraft = ref<ModulePermissionRule | null>(null);
const homeEditing = ref<string | null>(null);
const homeDraft = ref<HomePathRule | null>(null);
const collectionCatalog = ref<CollectionCatalogItem[]>([]);
const collectionEditingId = ref<string | null>(null);
const collectionDraft = ref<CollectionPermissionRule | null>(null);
const sidebarPanelEditingId = ref<string | null>(null);
const sidebarPanelDraft = ref<SidebarPanelRule | null>(null);
const sidebarModeEditing = ref<string | null>(null);
const sidebarModeDraft = ref<SidebarModeRule | null>(null);
const usersOwnRoleEditing = ref<string | null>(null);
const usersOwnRoleDraft = ref<UsersOwnRoleOnlyRule | null>(null);
const usersRoleEditingId = ref<string | null>(null);
const usersRoleDraft = ref<UsersRoleVisibilityRule | null>(null);
const hideNavEditing = ref<string | null>(null);
const hideNavDraft = ref<HideNavigationRule | null>(null);

let loadPromise: Promise<void> | null = null;

function patchPermissions(partial: Partial<ModulePermissionsConfig>): ModulePermissionsConfig {
	const currentUsers = permissions.value.users || EMPTY_USERS_NAV;
	return {
		version: 1,
		rules: partial.rules ?? permissions.value.rules ?? [],
		homes: partial.homes ?? permissions.value.homes ?? [],
		collections: partial.collections ?? permissions.value.collections ?? [],
		sidebar_panels: partial.sidebar_panels ?? permissions.value.sidebar_panels ?? [],
		sidebar_modes: partial.sidebar_modes ?? permissions.value.sidebar_modes ?? [],
		users: partial.users
			? {
					own_role_only: partial.users.own_role_only ?? currentUsers.own_role_only ?? [],
					roles: partial.users.roles ?? currentUsers.roles ?? [],
					hide_navigation: partial.users.hide_navigation ?? currentUsers.hide_navigation ?? [],
				}
			: {
					own_role_only: currentUsers.own_role_only ?? [],
					roles: currentUsers.roles ?? [],
					hide_navigation: currentUsers.hide_navigation ?? [],
				},
	};
}

function mergeMissingModules(bar: ModuleBarItem[]): ModuleBarItem[] {
	const knownIds = new Set(bar.filter((item) => item.type === 'module').map((item) => item.id));
	const extras: ModuleBarItem[] = [];

	if (!knownIds.has('module-permissions')) {
		extras.push({ type: 'module', id: 'module-permissions', enabled: true });
	}

	for (const id of ['content', 'users', 'files', 'insights', 'settings']) {
		if (!knownIds.has(id)) {
			extras.push({
				type: 'module',
				id,
				enabled: false,
				locked: id === 'settings' ? true : undefined,
			});
		}
	}

	return [...bar, ...extras];
}

export function useModulePermissions() {
	const api = useApi();
	const { t } = useI18n();
	const { useSettingsStore, useUserStore } = useStores();
	const settingsStore = useSettingsStore();
	const userStore = useUserStore();

	const homeItems = computed<HomePathRule[]>({
		get() {
			return permissions.value.homes || [];
		},
		set(value: HomePathRule[]) {
			permissions.value = patchPermissions({ homes: value });
		},
	});

	const previewItems = computed<PreviewItem[]>({
		get() {
			return moduleBar.value.map((item) => {
				if (item.type === 'link') {
					return {
						...item,
						to: item.url,
						name: item.name,
						icon: item.icon || 'link',
					};
				}

				const meta = getModuleMeta(item.id);
				return {
					...item,
					to: `/${item.id}`,
					name: meta.name,
					icon: meta.icon,
				};
			});
		},
		set(value: PreviewItem[]) {
			moduleBar.value = serializeModuleBar(value);
		},
	});

	const hasEdits = computed(() => {
		return (
			!isEqual(serializeModuleBar(moduleBar.value), serializeModuleBar(initialModuleBar.value)) ||
			!isEqual(serializePermissionsConfig(permissions.value), serializePermissionsConfig(initialPermissions.value))
		);
	});

	const linkSaveDisabled = computed(() => {
		const values = linkValues.value;
		if (!values) return true;
		return !values.name?.trim() || !values.icon?.trim() || !values.url?.trim();
	});

	const homeSaveDisabled = computed(() => {
		const draft = homeDraft.value;
		if (!draft) return true;
		return !isValidHomePath(draft.path);
	});

	function hasRule(id: string): boolean {
		const rule = permissions.value.rules.find((entry) => entry.id === id);
		if (!rule) return false;
		return (rule.roles?.length ?? 0) > 0 || (rule.policies?.length ?? 0) > 0;
	}

	function ruleSummary(id: string): string {
		const rule = permissions.value.rules.find((entry) => entry.id === id);
		if (!rule) return '';
		const count = (rule.roles?.length ?? 0) + (rule.policies?.length ?? 0);
		const visibility = rule.visibility === 'show' ? 'Show' : 'Hide';
		return `${visibility} · ${count}`;
	}

	function homeSummary(home: HomePathRule): string {
		const roleCount = home.roles?.length ?? 0;
		const policyCount = home.policies?.length ?? 0;
		const forceLabel = home.force ? 'Force · ' : '';
		if (roleCount === 0 && policyCount === 0) return `${forceLabel}Catch-all default`;
		return `${forceLabel}${roleCount} role(s) · ${policyCount} polic(ies)`;
	}

	function toggleEnabled(item: PreviewItem, enabled: boolean) {
		moduleBar.value = moduleBar.value.map((entry) =>
			entry.id === item.id ? { ...entry, enabled: Boolean(enabled) } : entry,
		);
	}

	function editLink(id: string) {
		linkEditing.value = id;

		if (id === '+') {
			linkValues.value = {
				id: crypto.randomUUID(),
				type: 'link',
				enabled: true,
				url: '',
				name: '',
				icon: 'link',
			};
			return;
		}

		const existing = moduleBar.value.find((entry) => entry.id === id && entry.type === 'link') as
			| ModuleBarLink
			| undefined;
		linkValues.value = existing ? cloneDeep(existing) : null;
	}

	function closeLinkEditor() {
		linkEditing.value = null;
		linkValues.value = null;
	}

	function onLinkDrawerToggle(open: boolean) {
		if (!open) closeLinkEditor();
	}

	function saveLink() {
		if (!linkValues.value || linkSaveDisabled.value || !linkEditing.value) return;

		if (linkEditing.value === '+') {
			moduleBar.value = [...moduleBar.value, { ...linkValues.value }];
		} else {
			moduleBar.value = moduleBar.value.map((entry) =>
				entry.id === linkEditing.value ? { ...linkValues.value! } : entry,
			);
		}

		closeLinkEditor();
	}

	function removeLink(id: string) {
		moduleBar.value = moduleBar.value.filter((entry) => entry.id !== id);
		permissions.value = patchPermissions({
			rules: permissions.value.rules.filter((rule) => rule.id !== id),
		});
	}

	function editHome(id: string) {
		homeEditing.value = id;

		if (id === '+') {
			homeDraft.value = {
				id: crypto.randomUUID(),
				path: '/content',
				roles: [],
				policies: [],
				force: false,
			};
			return;
		}

		const existing = (permissions.value.homes || []).find((home) => home.id === id);
		homeDraft.value = existing ? cloneDeep(existing) : null;
	}

	function closeHomeEditor() {
		homeEditing.value = null;
		homeDraft.value = null;
	}

	function onHomeDrawerToggle(open: boolean) {
		if (!open) closeHomeEditor();
	}

	function saveHome() {
		if (!homeDraft.value || homeSaveDisabled.value || !homeEditing.value) return;

		const path = normalizeAppPath(homeDraft.value.path);
		if (!path) return;

		const nextHome: HomePathRule = {
			id: homeEditing.value === '+' ? homeDraft.value.id : homeEditing.value,
			path,
			roles: [...(homeDraft.value.roles || [])],
			policies: [...(homeDraft.value.policies || [])],
			force: homeDraft.value.force === true,
		};

		const homes = [...(permissions.value.homes || [])];

		if (homeEditing.value === '+') {
			homes.push(nextHome);
		} else {
			const index = homes.findIndex((home) => home.id === homeEditing.value);
			if (index === -1) homes.push(nextHome);
			else homes[index] = nextHome;
		}

		permissions.value = patchPermissions({ homes });
		closeHomeEditor();
	}

	function removeHome(id: string) {
		permissions.value = patchPermissions({
			homes: (permissions.value.homes || []).filter((home) => home.id !== id),
		});
	}

	function openRuleEditor(item: PreviewItem) {
		ruleEditingId.value = item.id;
		const existing = permissions.value.rules.find((rule) => rule.id === item.id);

		ruleDraft.value = existing
			? cloneDeep(existing)
			: {
					id: item.id,
					visibility: 'hide',
					roles: [],
					policies: [],
					block_routes: true,
				};
	}

	function closeRuleEditor() {
		ruleEditingId.value = null;
		ruleDraft.value = null;
	}

	function onRuleDrawerToggle(open: boolean) {
		if (!open) closeRuleEditor();
	}

	function saveRule() {
		if (!ruleDraft.value || !ruleEditingId.value) return;

		const nextRule = {
			...ruleDraft.value,
			id: ruleEditingId.value,
			roles: [...(ruleDraft.value.roles || [])],
			policies: [...(ruleDraft.value.policies || [])],
			block_routes: ruleDraft.value.block_routes !== false,
		};

		const others = permissions.value.rules.filter((rule) => rule.id !== ruleEditingId.value);

		if (nextRule.roles.length === 0 && nextRule.policies.length === 0) {
			permissions.value = patchPermissions({ rules: others });
		} else {
			permissions.value = patchPermissions({ rules: [...others, nextRule] });
		}

		closeRuleEditor();
	}

	function clearRule() {
		if (!ruleEditingId.value) return;
		permissions.value = patchPermissions({
			rules: permissions.value.rules.filter((rule) => rule.id !== ruleEditingId.value),
		});
		closeRuleEditor();
	}

	function hasCollectionRule(id: string): boolean {
		const rule = (permissions.value.collections || []).find((entry) => entry.id === id);
		if (!rule) return false;
		return (rule.roles?.length ?? 0) > 0 || (rule.policies?.length ?? 0) > 0;
	}

	function collectionRuleSummary(id: string): string {
		const rule = (permissions.value.collections || []).find((entry) => entry.id === id);
		if (!rule) return '';
		const count = (rule.roles?.length ?? 0) + (rule.policies?.length ?? 0);
		const visibility = rule.visibility === 'show' ? 'Show' : 'Hide';
		return `${visibility} · ${count}`;
	}

	function collectionDisplay(id: string): CollectionCatalogItem {
		const meta = collectionCatalog.value.find((entry) => entry.collection === id);
		return {
			collection: id,
			name: meta?.name || id,
			icon: meta?.icon || 'box',
		};
	}

	const configuredCollections = computed(() => {
		return (permissions.value.collections || []).map((rule) => collectionDisplay(rule.id));
	});

	const availableCollectionOptions = computed(() => {
		const used = new Set((permissions.value.collections || []).map((rule) => rule.id));
		const editingId = collectionEditingId.value === '+' ? null : collectionEditingId.value;

		return collectionCatalog.value
			.filter((entry) => !used.has(entry.collection) || entry.collection === editingId)
			.map((entry) => ({
				text: entry.name === entry.collection ? entry.collection : `${entry.name} (${entry.collection})`,
				value: entry.collection,
			}));
	});

	const collectionSaveDisabled = computed(() => {
		const draft = collectionDraft.value;
		if (!draft) return true;
		if (!draft.id?.trim()) return true;
		if ((draft.roles?.length ?? 0) === 0 && (draft.policies?.length ?? 0) === 0) return true;
		return false;
	});

	function openCollectionEditor(collection: string) {
		collectionEditingId.value = collection;

		if (collection === '+') {
			collectionDraft.value = {
				id: '',
				visibility: 'hide',
				roles: [],
				policies: [],
				block_routes: true,
			};
			return;
		}

		const existing = (permissions.value.collections || []).find((rule) => rule.id === collection);
		collectionDraft.value = existing
			? cloneDeep(existing)
			: {
					id: collection,
					visibility: 'hide',
					roles: [],
					policies: [],
					block_routes: true,
				};
	}

	function closeCollectionEditor() {
		collectionEditingId.value = null;
		collectionDraft.value = null;
	}

	function onCollectionDrawerToggle(open: boolean) {
		if (!open) closeCollectionEditor();
	}

	function saveCollectionRule() {
		if (!collectionDraft.value || !collectionEditingId.value || collectionSaveDisabled.value) return;

		const collectionId = String(collectionDraft.value.id).trim();
		if (!collectionId) return;

		const nextRule: CollectionPermissionRule = {
			...collectionDraft.value,
			id: collectionId,
			roles: [...(collectionDraft.value.roles || [])],
			policies: [...(collectionDraft.value.policies || [])],
			block_routes: collectionDraft.value.block_routes !== false,
		};

		const previousId = collectionEditingId.value === '+' ? collectionId : collectionEditingId.value;
		const others = (permissions.value.collections || []).filter(
			(rule) => rule.id !== previousId && rule.id !== collectionId,
		);

		permissions.value = patchPermissions({ collections: [...others, nextRule] });
		closeCollectionEditor();
	}

	function clearCollectionRule() {
		if (!collectionEditingId.value || collectionEditingId.value === '+') return;
		permissions.value = patchPermissions({
			collections: (permissions.value.collections || []).filter((rule) => rule.id !== collectionEditingId.value),
		});
		closeCollectionEditor();
	}

	function removeCollectionRule(id: string) {
		permissions.value = patchPermissions({
			collections: (permissions.value.collections || []).filter((rule) => rule.id !== id),
		});
	}

	const sidebarPanelCatalog = SIDEBAR_PANEL_CATALOG;

	const sidebarModeItems = computed<SidebarModeRule[]>({
		get() {
			return permissions.value.sidebar_modes || [];
		},
		set(value: SidebarModeRule[]) {
			permissions.value = patchPermissions({ sidebar_modes: value });
		},
	});

	function hasSidebarPanelRule(id: string): boolean {
		const rule = (permissions.value.sidebar_panels || []).find((entry) => entry.id === id);
		if (!rule) return false;
		return (rule.roles?.length ?? 0) > 0 || (rule.policies?.length ?? 0) > 0;
	}

	function sidebarPanelRuleSummary(id: string): string {
		const rule = (permissions.value.sidebar_panels || []).find((entry) => entry.id === id);
		if (!rule) return '';
		const count = (rule.roles?.length ?? 0) + (rule.policies?.length ?? 0);
		const visibility = rule.visibility === 'show' ? 'Show' : 'Hide';
		return `${visibility} · ${count}`;
	}

	function openSidebarPanelEditor(panelId: string) {
		sidebarPanelEditingId.value = panelId;
		const existing = (permissions.value.sidebar_panels || []).find((rule) => rule.id === panelId);

		sidebarPanelDraft.value = existing
			? cloneDeep(existing)
			: {
					id: panelId,
					visibility: 'hide',
					roles: [],
					policies: [],
				};
	}

	function closeSidebarPanelEditor() {
		sidebarPanelEditingId.value = null;
		sidebarPanelDraft.value = null;
	}

	function onSidebarPanelDrawerToggle(open: boolean) {
		if (!open) closeSidebarPanelEditor();
	}

	function saveSidebarPanelRule() {
		if (!sidebarPanelDraft.value || !sidebarPanelEditingId.value) return;

		const nextRule: SidebarPanelRule = {
			...sidebarPanelDraft.value,
			id: sidebarPanelEditingId.value,
			roles: [...(sidebarPanelDraft.value.roles || [])],
			policies: [...(sidebarPanelDraft.value.policies || [])],
		};

		const others = (permissions.value.sidebar_panels || []).filter((rule) => rule.id !== sidebarPanelEditingId.value);

		if (nextRule.roles.length === 0 && nextRule.policies.length === 0) {
			permissions.value = patchPermissions({ sidebar_panels: others });
		} else {
			permissions.value = patchPermissions({ sidebar_panels: [...others, nextRule] });
		}

		closeSidebarPanelEditor();
	}

	function clearSidebarPanelRule() {
		if (!sidebarPanelEditingId.value) return;
		permissions.value = patchPermissions({
			sidebar_panels: (permissions.value.sidebar_panels || []).filter((rule) => rule.id !== sidebarPanelEditingId.value),
		});
		closeSidebarPanelEditor();
	}

	function sidebarModeSummary(rule: SidebarModeRule): string {
		const roleCount = rule.roles?.length ?? 0;
		const policyCount = rule.policies?.length ?? 0;
		const modeLabel = rule.mode === 'hidden' ? 'Force hidden' : 'Force collapsed';
		if (roleCount === 0 && policyCount === 0) return `${modeLabel} · Catch-all`;
		return `${modeLabel} · ${roleCount} role(s) · ${policyCount} polic(ies)`;
	}

	function editSidebarMode(id: string) {
		sidebarModeEditing.value = id;

		if (id === '+') {
			sidebarModeDraft.value = {
				id: crypto.randomUUID(),
				mode: 'collapsed',
				roles: [],
				policies: [],
			};
			return;
		}

		const existing = (permissions.value.sidebar_modes || []).find((rule) => rule.id === id);
		sidebarModeDraft.value = existing ? cloneDeep(existing) : null;
	}

	function closeSidebarModeEditor() {
		sidebarModeEditing.value = null;
		sidebarModeDraft.value = null;
	}

	function onSidebarModeDrawerToggle(open: boolean) {
		if (!open) closeSidebarModeEditor();
	}

	function saveSidebarMode() {
		if (!sidebarModeDraft.value || !sidebarModeEditing.value) return;

		const nextRule: SidebarModeRule = {
			id: sidebarModeEditing.value === '+' ? sidebarModeDraft.value.id : sidebarModeEditing.value,
			mode: sidebarModeDraft.value.mode === 'hidden' ? 'hidden' : 'collapsed',
			roles: [...(sidebarModeDraft.value.roles || [])],
			policies: [...(sidebarModeDraft.value.policies || [])],
		};

		const modes = [...(permissions.value.sidebar_modes || [])];

		if (sidebarModeEditing.value === '+') {
			modes.push(nextRule);
		} else {
			const index = modes.findIndex((rule) => rule.id === sidebarModeEditing.value);
			if (index === -1) modes.push(nextRule);
			else modes[index] = nextRule;
		}

		permissions.value = patchPermissions({ sidebar_modes: modes });
		closeSidebarModeEditor();
	}

	function removeSidebarMode(id: string) {
		permissions.value = patchPermissions({
			sidebar_modes: (permissions.value.sidebar_modes || []).filter((rule) => rule.id !== id),
		});
	}

	const usersOwnRoleItems = computed<UsersOwnRoleOnlyRule[]>({
		get() {
			return permissions.value.users?.own_role_only || [];
		},
		set(value: UsersOwnRoleOnlyRule[]) {
			permissions.value = patchPermissions({
				users: {
					...(permissions.value.users || EMPTY_USERS_NAV),
					own_role_only: value,
				},
			});
		},
	});

	function usersOwnRoleSummary(rule: UsersOwnRoleOnlyRule): string {
		const roleCount = rule.roles?.length ?? 0;
		const policyCount = rule.policies?.length ?? 0;
		if (roleCount === 0 && policyCount === 0) return 'Catch-all';
		return `${roleCount} role(s) · ${policyCount} polic(ies)`;
	}

	function editUsersOwnRole(id: string) {
		usersOwnRoleEditing.value = id;
		if (id === '+') {
			usersOwnRoleDraft.value = {
				id: crypto.randomUUID(),
				roles: [],
				policies: [],
			};
			return;
		}
		const existing = (permissions.value.users?.own_role_only || []).find((rule) => rule.id === id);
		usersOwnRoleDraft.value = existing ? cloneDeep(existing) : null;
	}

	function closeUsersOwnRoleEditor() {
		usersOwnRoleEditing.value = null;
		usersOwnRoleDraft.value = null;
	}

	function onUsersOwnRoleDrawerToggle(open: boolean) {
		if (!open) closeUsersOwnRoleEditor();
	}

	function saveUsersOwnRole() {
		if (!usersOwnRoleDraft.value || !usersOwnRoleEditing.value) return;

		const nextRule: UsersOwnRoleOnlyRule = {
			id: usersOwnRoleEditing.value === '+' ? usersOwnRoleDraft.value.id : usersOwnRoleEditing.value,
			roles: [...(usersOwnRoleDraft.value.roles || [])],
			policies: [...(usersOwnRoleDraft.value.policies || [])],
		};

		const list = [...(permissions.value.users?.own_role_only || [])];
		if (usersOwnRoleEditing.value === '+') {
			list.push(nextRule);
		} else {
			const index = list.findIndex((rule) => rule.id === usersOwnRoleEditing.value);
			if (index === -1) list.push(nextRule);
			else list[index] = nextRule;
		}

		permissions.value = patchPermissions({
			users: { ...(permissions.value.users || EMPTY_USERS_NAV), own_role_only: list },
		});
		closeUsersOwnRoleEditor();
	}

	function removeUsersOwnRole(id: string) {
		permissions.value = patchPermissions({
			users: {
				...(permissions.value.users || EMPTY_USERS_NAV),
				own_role_only: (permissions.value.users?.own_role_only || []).filter((rule) => rule.id !== id),
			},
		});
	}

	const configuredUsersRoles = computed(() => {
		return (permissions.value.users?.roles || []).map((rule) => {
			const option = roleOptions.value.find((entry) => entry.value === rule.id);
			return {
				id: rule.id,
				name: option?.text || rule.id,
			};
		});
	});

	const availableUsersRoleOptions = computed(() => {
		const used = new Set((permissions.value.users?.roles || []).map((rule) => rule.id));
		const editingId = usersRoleEditingId.value === '+' ? null : usersRoleEditingId.value;
		return roleOptions.value.filter((entry) => !used.has(entry.value) || entry.value === editingId);
	});

	const usersRoleSaveDisabled = computed(() => {
		const draft = usersRoleDraft.value;
		if (!draft) return true;
		if (!draft.id?.trim()) return true;
		if ((draft.roles?.length ?? 0) === 0 && (draft.policies?.length ?? 0) === 0) return true;
		return false;
	});

	function hasUsersRoleRule(id: string): boolean {
		const rule = (permissions.value.users?.roles || []).find((entry) => entry.id === id);
		if (!rule) return false;
		return (rule.roles?.length ?? 0) > 0 || (rule.policies?.length ?? 0) > 0;
	}

	function usersRoleRuleSummary(id: string): string {
		const rule = (permissions.value.users?.roles || []).find((entry) => entry.id === id);
		if (!rule) return '';
		const count = (rule.roles?.length ?? 0) + (rule.policies?.length ?? 0);
		const visibility = rule.visibility === 'show' ? 'Show' : 'Hide';
		return `${visibility} · ${count}`;
	}

	function openUsersRoleEditor(roleId: string) {
		usersRoleEditingId.value = roleId;
		if (roleId === '+') {
			usersRoleDraft.value = {
				id: '',
				visibility: 'hide',
				roles: [],
				policies: [],
				block_routes: true,
			};
			return;
		}
		const existing = (permissions.value.users?.roles || []).find((rule) => rule.id === roleId);
		usersRoleDraft.value = existing
			? cloneDeep(existing)
			: {
					id: roleId,
					visibility: 'hide',
					roles: [],
					policies: [],
					block_routes: true,
				};
	}

	function closeUsersRoleEditor() {
		usersRoleEditingId.value = null;
		usersRoleDraft.value = null;
	}

	function onUsersRoleDrawerToggle(open: boolean) {
		if (!open) closeUsersRoleEditor();
	}

	function saveUsersRoleRule() {
		if (!usersRoleDraft.value || !usersRoleEditingId.value || usersRoleSaveDisabled.value) return;

		const roleId = String(usersRoleDraft.value.id).trim();
		if (!roleId) return;

		const nextRule: UsersRoleVisibilityRule = {
			...usersRoleDraft.value,
			id: roleId,
			roles: [...(usersRoleDraft.value.roles || [])],
			policies: [...(usersRoleDraft.value.policies || [])],
			block_routes: usersRoleDraft.value.block_routes !== false,
		};

		const previousId = usersRoleEditingId.value === '+' ? roleId : usersRoleEditingId.value;
		const others = (permissions.value.users?.roles || []).filter(
			(rule) => rule.id !== previousId && rule.id !== roleId,
		);

		permissions.value = patchPermissions({
			users: { ...(permissions.value.users || EMPTY_USERS_NAV), roles: [...others, nextRule] },
		});
		closeUsersRoleEditor();
	}

	function clearUsersRoleRule() {
		if (!usersRoleEditingId.value || usersRoleEditingId.value === '+') return;
		permissions.value = patchPermissions({
			users: {
				...(permissions.value.users || EMPTY_USERS_NAV),
				roles: (permissions.value.users?.roles || []).filter((rule) => rule.id !== usersRoleEditingId.value),
			},
		});
		closeUsersRoleEditor();
	}

	function removeUsersRoleRule(id: string) {
		permissions.value = patchPermissions({
			users: {
				...(permissions.value.users || EMPTY_USERS_NAV),
				roles: (permissions.value.users?.roles || []).filter((rule) => rule.id !== id),
			},
		});
	}

	const hideNavItems = computed<HideNavigationRule[]>({
		get() {
			return permissions.value.users?.hide_navigation || [];
		},
		set(value: HideNavigationRule[]) {
			permissions.value = patchPermissions({
				users: { ...(permissions.value.users || EMPTY_USERS_NAV), hide_navigation: value },
			});
		},
	});

	const moduleSelectOptions = computed(() => {
		const fromBar = moduleBar.value
			.filter((item) => item.type === 'module')
			.map((item) => {
				const meta = getModuleMeta(item.id);
				return { text: meta.name || item.id, value: item.id };
			});
		const seen = new Set(fromBar.map((entry) => entry.value));
		for (const id of ['content', 'users', 'files', 'insights', 'settings', 'module-permissions']) {
			if (seen.has(id)) continue;
			const meta = getModuleMeta(id);
			fromBar.push({ text: meta.name || id, value: id });
		}
		return fromBar.sort((a, b) => a.text.localeCompare(b.text));
	});

	const hideNavSaveDisabled = computed(() => {
		const draft = hideNavDraft.value;
		if (!draft) return true;
		return (draft.modules?.length ?? 0) === 0;
	});

	function hideNavSummary(rule: HideNavigationRule): string {
		const modules = (rule.modules || []).join(', ') || '—';
		const roleCount = rule.roles?.length ?? 0;
		const policyCount = rule.policies?.length ?? 0;
		const who =
			roleCount === 0 && policyCount === 0
				? 'Catch-all'
				: `${roleCount} role(s) · ${policyCount} polic(ies)`;
		return `${modules} · ${who}`;
	}

	function editHideNav(id: string) {
		hideNavEditing.value = id;
		if (id === '+') {
			hideNavDraft.value = {
				id: crypto.randomUUID(),
				modules: ['users'],
				roles: [],
				policies: [],
			};
			return;
		}
		const existing = (permissions.value.users?.hide_navigation || []).find((rule) => rule.id === id);
		hideNavDraft.value = existing ? cloneDeep(existing) : null;
	}

	function closeHideNavEditor() {
		hideNavEditing.value = null;
		hideNavDraft.value = null;
	}

	function onHideNavDrawerToggle(open: boolean) {
		if (!open) closeHideNavEditor();
	}

	function saveHideNav() {
		if (!hideNavDraft.value || !hideNavEditing.value || hideNavSaveDisabled.value) return;

		const nextRule: HideNavigationRule = {
			id: hideNavEditing.value === '+' ? hideNavDraft.value.id : hideNavEditing.value,
			modules: [...(hideNavDraft.value.modules || [])].map(String).filter(Boolean),
			roles: [...(hideNavDraft.value.roles || [])],
			policies: [...(hideNavDraft.value.policies || [])],
		};

		const list = [...(permissions.value.users?.hide_navigation || [])];
		if (hideNavEditing.value === '+') {
			list.push(nextRule);
		} else {
			const index = list.findIndex((rule) => rule.id === hideNavEditing.value);
			if (index === -1) list.push(nextRule);
			else list[index] = nextRule;
		}

		permissions.value = patchPermissions({
			users: { ...(permissions.value.users || EMPTY_USERS_NAV), hide_navigation: list },
		});
		closeHideNavEditor();
	}

	function removeHideNav(id: string) {
		permissions.value = patchPermissions({
			users: {
				...(permissions.value.users || EMPTY_USERS_NAV),
				hide_navigation: (permissions.value.users?.hide_navigation || []).filter((rule) => rule.id !== id),
			},
		});
	}

	async function loadRolesAndPolicies() {
		const [rolesRes, policiesRes] = await Promise.all([
			api.get('/roles', { params: { limit: -1, fields: ['id', 'name'], sort: 'name' } }),
			api.get('/policies', { params: { limit: -1, fields: ['id', 'name'], sort: 'name' } }),
		]);

		roleOptions.value = (rolesRes.data?.data || []).map((role: any) => ({
			text: resolveTranslatedLabel(role.name, t),
			value: role.id,
		}));

		policyOptions.value = (policiesRes.data?.data || []).map((policy: any) => ({
			text: resolveTranslatedLabel(policy.name, t),
			value: policy.id,
		}));
	}

	async function loadCollectionCatalog() {
		try {
			const response = await api.get('/collections', {
				params: {
					limit: -1,
				},
			});

			const rows = response.data?.data || [];
			collectionCatalog.value = rows
				.filter((row: any) => {
					const name = row?.collection;
					if (!name || typeof name !== 'string') return false;
					if (name.startsWith('directus_')) return false;
					if (row?.meta?.accountability === null && row?.schema === null) return false; // folders sometimes
					// Keep folders and regular collections that appear in content
					return row?.schema !== null || row?.meta?.singleton === true || row?.meta;
				})
				.map((row: any) => ({
					collection: row.collection,
					name: row.meta?.translations?.[0]?.translation || row.meta?.collection || row.collection,
					icon: row.meta?.icon || (row.schema === null ? 'folder' : 'box'),
				}))
				.sort((a: CollectionCatalogItem, b: CollectionCatalogItem) => a.name.localeCompare(b.name));
		} catch {
			collectionCatalog.value = [];
		}
	}

	async function load() {
		loading.value = true;

		try {
			await settingsStore.hydrate?.();
		} catch {
			// ignore
		}

		try {
			const response = await api.get('/settings', {
				params: {
					fields: ['module_bar', MODULE_PERMISSIONS_FIELD],
				},
			});

			const data = response.data?.data;
			const row = Array.isArray(data) ? data[0] : data;

			const bar = mergeMissingModules(Array.isArray(row?.module_bar) ? cloneDeep(row.module_bar) : []);
			const config = normalizeConfig(row?.[MODULE_PERMISSIONS_FIELD]);

			moduleBar.value = bar;
			permissions.value = config;
			initialModuleBar.value = cloneDeep(bar);
			initialPermissions.value = cloneDeep(config);

			await loadRolesAndPolicies();
			await loadCollectionCatalog();
		} finally {
			loading.value = false;
		}
	}

	function ensureLoaded() {
		if (!loadPromise) {
			loadPromise = load().finally(() => {
				/* keep promise resolved for subsequent mounts */
			});
		}
		return loadPromise;
	}

	async function save() {
		if (!hasEdits.value) return;
		if (userStore.currentUser?.admin_access !== true) return;

		saving.value = true;

		try {
			const payload = {
				module_bar: serializeModuleBar(moduleBar.value),
				[MODULE_PERMISSIONS_FIELD]: serializePermissionsConfig(permissions.value),
			};

			await api.patch('/settings', payload);

			try {
				await settingsStore.hydrate?.();
			} catch {
				// ignore
			}

			initialModuleBar.value = cloneDeep(moduleBar.value);
			initialPermissions.value = cloneDeep(permissions.value);
		} finally {
			saving.value = false;
		}
	}

	/**
	 * Removes only the dedicated `module_permissions` settings field/value.
	 * Does not touch `module_bar` or any other settings.
	 */
	async function cleanupExtensionData(): Promise<{ clearedValue: boolean; deletedField: boolean }> {
		if (userStore.currentUser?.admin_access !== true) {
			throw new Error('Admin access required');
		}

		cleaning.value = true;
		let clearedValue = false;
		let deletedField = false;

		try {
			// 1) Clear stored JSON first (safe even if field delete fails)
			try {
				await api.patch('/settings', {
					[MODULE_PERMISSIONS_FIELD]: null,
				});
				clearedValue = true;
			} catch (error: any) {
				// Field may already be gone — ignore unknown-field style errors
				const status = error?.response?.status;
				const message = String(error?.response?.data?.errors?.[0]?.message || error?.message || '');
				if (status !== 400 && status !== 403 && !/unknown|does not exist|forbidden/i.test(message)) {
					throw error;
				}
			}

			// 2) Delete the dedicated field (own JSON column — not nested in other settings)
			try {
				await api.delete(`/fields/directus_settings/${MODULE_PERMISSIONS_FIELD}`);
				deletedField = true;
			} catch (error: any) {
				const status = error?.response?.status;
				if (status !== 404) {
					throw error;
				}
				// Already removed
				deletedField = true;
			}

			permissions.value = cloneDeep(EMPTY_MODULE_PERMISSIONS);
			initialPermissions.value = cloneDeep(EMPTY_MODULE_PERMISSIONS);
			linkEditing.value = null;
			linkValues.value = null;
			ruleEditingId.value = null;
			ruleDraft.value = null;
			homeEditing.value = null;
			homeDraft.value = null;
			collectionEditingId.value = null;
			collectionDraft.value = null;
			sidebarPanelEditingId.value = null;
			sidebarPanelDraft.value = null;
			sidebarModeEditing.value = null;
			sidebarModeDraft.value = null;
			usersOwnRoleEditing.value = null;
			usersOwnRoleDraft.value = null;
			usersRoleEditingId.value = null;
			usersRoleDraft.value = null;
			hideNavEditing.value = null;
			hideNavDraft.value = null;

			// Allow a fresh load after the hook recreates an empty field
			loadPromise = null;

			try {
				await settingsStore.hydrate?.();
			} catch {
				// ignore
			}

			return { clearedValue, deletedField };
		} finally {
			cleaning.value = false;
		}
	}

	function exportPermissionsConfig() {
		const payload = {
			...serializePermissionsConfig(permissions.value),
			exported_at: new Date().toISOString(),
			extension: 'directus-extension-module-permissions',
		};

		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
		anchor.href = url;
		anchor.download = `module-permissions-${stamp}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function importPermissionsConfig(raw: unknown) {
		if (userStore.currentUser?.admin_access !== true) {
			throw new Error('Admin access required');
		}

		if (!raw || typeof raw !== 'object') {
			throw new Error('Invalid JSON: expected an object');
		}

		const candidate = raw as Record<string, unknown>;
		const source =
			candidate.module_permissions && typeof candidate.module_permissions === 'object'
				? candidate.module_permissions
				: candidate;

		const next = serializePermissionsConfig(source);

		if (
			!Array.isArray(next.rules) ||
			!Array.isArray(next.homes) ||
			!Array.isArray(next.collections) ||
			!Array.isArray(next.sidebar_panels) ||
			!Array.isArray(next.sidebar_modes) ||
			!next.users ||
			!Array.isArray(next.users.own_role_only) ||
			!Array.isArray(next.users.roles) ||
			!Array.isArray(next.users.hide_navigation)
		) {
			throw new Error('Invalid config: missing rules/homes/collections/sidebar/users arrays');
		}

		permissions.value = next;

		await api.patch('/settings', {
			[MODULE_PERMISSIONS_FIELD]: next,
		});

		initialPermissions.value = cloneDeep(next);

		try {
			await settingsStore.hydrate?.();
		} catch {
			// ignore
		}

		// Ensure subsequent loads see the imported data
		loadPromise = null;
	}

	return {
		loading,
		saving,
		cleaning,
		hasEdits,
		previewItems,
		homeItems,
		roleOptions,
		policyOptions,
		linkEditing,
		linkValues,
		linkSaveDisabled,
		ruleEditingId,
		ruleDraft,
		homeEditing,
		homeDraft,
		homeSaveDisabled,
		collectionCatalog,
		configuredCollections,
		availableCollectionOptions,
		collectionEditingId,
		collectionDraft,
		collectionSaveDisabled,
		sidebarPanelCatalog,
		sidebarPanelEditingId,
		sidebarPanelDraft,
		sidebarModeItems,
		sidebarModeEditing,
		sidebarModeDraft,
		usersOwnRoleItems,
		usersOwnRoleEditing,
		usersOwnRoleDraft,
		configuredUsersRoles,
		availableUsersRoleOptions,
		usersRoleEditingId,
		usersRoleDraft,
		usersRoleSaveDisabled,
		hideNavItems,
		hideNavEditing,
		hideNavDraft,
		hideNavSaveDisabled,
		moduleSelectOptions,
		hasRule,
		ruleSummary,
		homeSummary,
		hasCollectionRule,
		collectionRuleSummary,
		hasSidebarPanelRule,
		sidebarPanelRuleSummary,
		sidebarModeSummary,
		usersOwnRoleSummary,
		hasUsersRoleRule,
		usersRoleRuleSummary,
		hideNavSummary,
		toggleEnabled,
		editLink,
		closeLinkEditor,
		onLinkDrawerToggle,
		saveLink,
		removeLink,
		editHome,
		closeHomeEditor,
		onHomeDrawerToggle,
		saveHome,
		removeHome,
		openRuleEditor,
		closeRuleEditor,
		onRuleDrawerToggle,
		saveRule,
		clearRule,
		openCollectionEditor,
		closeCollectionEditor,
		onCollectionDrawerToggle,
		saveCollectionRule,
		clearCollectionRule,
		removeCollectionRule,
		openSidebarPanelEditor,
		closeSidebarPanelEditor,
		onSidebarPanelDrawerToggle,
		saveSidebarPanelRule,
		clearSidebarPanelRule,
		editSidebarMode,
		closeSidebarModeEditor,
		onSidebarModeDrawerToggle,
		saveSidebarMode,
		removeSidebarMode,
		editUsersOwnRole,
		closeUsersOwnRoleEditor,
		onUsersOwnRoleDrawerToggle,
		saveUsersOwnRole,
		removeUsersOwnRole,
		openUsersRoleEditor,
		closeUsersRoleEditor,
		onUsersRoleDrawerToggle,
		saveUsersRoleRule,
		clearUsersRoleRule,
		removeUsersRoleRule,
		editHideNav,
		closeHideNavEditor,
		onHideNavDrawerToggle,
		saveHideNav,
		removeHideNav,
		ensureLoaded,
		save,
		cleanupExtensionData,
		exportPermissionsConfig,
		importPermissionsConfig,
		MODULE_PERMISSIONS_FIELD,
	};
}
