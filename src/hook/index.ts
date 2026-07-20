import { defineHook } from '@directus/extensions-sdk';
import {
	applyCollectionVisibility,
	applyModulePermissions,
	filterRolesForUserVisibility,
	getBlockedCollectionIds,
	getBlockedModuleIds,
	getBlockedUsersRoleIds,
	getHiddenSidebarPanels,
	getHiddenUsersRoleIds,
	getNavigationHiddenModules,
	getUsersAllowedRoleIds,
	normalizeConfig,
	resolveHomeForce,
	resolveHomePath,
	resolveSidebarMode,
	resolveUsersOwnRoleOnly,
} from '../shared/evaluate';
import {
	EMPTY_MODULE_PERMISSIONS,
	MODULE_PERMISSIONS_FIELD,
	type ModuleBarItem,
	type ModulePermissionsConfig,
	type UserAccessContext,
} from '../shared/types';

type Accountability = {
	admin?: boolean | null;
	user?: string | null;
	role?: string | null;
	roles?: string[] | null;
};

async function resolveUserAccessContext(
	database: any,
	accountability: Accountability | null | undefined,
): Promise<UserAccessContext> {
	const roleIds = new Set<string>();
	const policyIds = new Set<string>();

	if (!accountability?.user && !accountability?.role) {
		return { roleIds: [], policyIds: [] };
	}

	if (accountability.role) {
		roleIds.add(accountability.role);
	}

	if (Array.isArray(accountability.roles)) {
		for (const roleId of accountability.roles) {
			if (roleId) roleIds.add(String(roleId));
		}
	}

	for (const startRole of [...roleIds]) {
		let current: string | null = startRole;

		for (let depth = 0; depth < 25 && current; depth++) {
			const row = await database('directus_roles').select('parent').where({ id: current }).first();
			if (!row?.parent) break;
			const parentId = String(row.parent);
			if (roleIds.has(parentId)) break;
			roleIds.add(parentId);
			current = parentId;
		}
	}

	const query = database('directus_access').select('policy');

	query.where((qb: any) => {
		let hasClause = false;

		if (accountability.user) {
			qb.where({ user: accountability.user });
			hasClause = true;
		}

		if (roleIds.size > 0) {
			if (hasClause) qb.orWhereIn('role', [...roleIds]);
			else qb.whereIn('role', [...roleIds]);
		}
	});

	const accessRows = await query;

	for (const row of accessRows || []) {
		if (row?.policy) policyIds.add(String(row.policy));
	}

	return {
		roleIds: [...roleIds],
		policyIds: [...policyIds],
	};
}

function getSettingsRows(payload: unknown): Record<string, any>[] | null {
	if (Array.isArray(payload)) return payload;
	if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
		return (payload as any).data;
	}
	return null;
}

function getCollectionsPayload(payload: unknown): { list: any[]; wrap?: (list: any[]) => unknown } | null {
	if (Array.isArray(payload)) {
		return { list: payload, wrap: (list) => list };
	}

	if (payload && typeof payload === 'object') {
		if (Array.isArray((payload as any).data)) {
			return {
				list: (payload as any).data,
				wrap: (list) => ({ ...(payload as any), data: list }),
			};
		}
	}

	return null;
}

async function readModulePermissionsConfig(database: any): Promise<ModulePermissionsConfig> {
	try {
		const row = await database('directus_settings').select(MODULE_PERMISSIONS_FIELD).first();
		return normalizeConfig(row?.[MODULE_PERMISSIONS_FIELD]);
	} catch {
		return { ...EMPTY_MODULE_PERMISSIONS };
	}
}

async function ensureModulePermissionsField(services: any, getSchema: () => Promise<any>, database: any, logger: any) {
	try {
		const hasColumn = await database.schema.hasColumn('directus_settings', MODULE_PERMISSIONS_FIELD);

		if (hasColumn) {
			const existingMeta = await database('directus_fields')
				.where({ collection: 'directus_settings', field: MODULE_PERMISSIONS_FIELD })
				.first();

			if (existingMeta) return;
		}

		const schema = await getSchema();
		const { FieldsService } = services;
		const fieldsService = new FieldsService({
			schema,
			accountability: { admin: true },
		});

		const existingFields = await fieldsService.readAll('directus_settings');
		const alreadyRegistered = existingFields?.some((field: any) => field.field === MODULE_PERMISSIONS_FIELD);

		if (alreadyRegistered && hasColumn) return;

		if (!hasColumn || !alreadyRegistered) {
			await fieldsService.createField('directus_settings', {
				field: MODULE_PERMISSIONS_FIELD,
				type: 'json',
				meta: {
					collection: 'directus_settings',
					field: MODULE_PERMISSIONS_FIELD,
					special: ['cast-json'],
					interface: 'input-code',
					hidden: true,
					readonly: false,
					width: 'full',
					note: 'Managed by Module Permissions extension. Do not edit manually.',
				},
				schema: {
					default_value: JSON.stringify(EMPTY_MODULE_PERMISSIONS),
				},
			});

			logger.info(`[module-permissions] Created directus_settings.${MODULE_PERMISSIONS_FIELD}`);
		}
	} catch (error: any) {
		const message = String(error?.message || error || '');
		if (/already exists|duplicate|SQLITE_ERROR/i.test(message)) {
			logger.warn(`[module-permissions] Field ensure skipped: ${message}`);
			return;
		}

		logger.error(`[module-permissions] Failed to ensure field: ${message}`);
	}
}

function getRolesPayload(payload: unknown): { list: any[]; wrap?: (list: any[]) => unknown } | null {
	if (Array.isArray(payload)) {
		return { list: payload, wrap: (list) => list };
	}

	if (payload && typeof payload === 'object') {
		if (Array.isArray((payload as any).data)) {
			return {
				list: (payload as any).data,
				wrap: (list) => ({ ...(payload as any), data: list }),
			};
		}
	}

	return null;
}

export default defineHook(({ filter, action, init }, { services, database, getSchema, logger }) => {
	let fieldReady: Promise<void> | null = null;

	const ensureOnce = () => {
		if (!fieldReady) {
			fieldReady = ensureModulePermissionsField(services, getSchema, database, logger);
		}
		return fieldReady;
	};

	init('app.before', async () => {
		await ensureOnce();
	});

	action('server.start', async () => {
		await ensureOnce();
	});

	filter('settings.read', async (payload: unknown, _meta: unknown, context: any) => {
		await ensureOnce();

		const accountability: Accountability | null = context?.accountability ?? null;

		if (accountability?.admin) {
			return payload;
		}

		const rows = getSettingsRows(payload);
		if (!rows?.length) return payload;

		const access = await resolveUserAccessContext(database, accountability);

		for (const row of rows) {
			if (!row || typeof row !== 'object') continue;

			const config = normalizeConfig(row[MODULE_PERMISSIONS_FIELD]) as ModulePermissionsConfig;
			const moduleBar = row.module_bar as ModuleBarItem[] | undefined;

			row.module_bar = applyModulePermissions(moduleBar, config, access);

			const ownRoleOnly = resolveUsersOwnRoleOnly(config, access);

			row[MODULE_PERMISSIONS_FIELD] = {
				version: 1,
				rules: [],
				homes: [],
				collections: [],
				sidebar_panels: [],
				sidebar_modes: [],
				users: { own_role_only: [], roles: [], hide_navigation: [] },
				blocked_ids: getBlockedModuleIds(moduleBar, config, access),
				blocked_collection_ids: getBlockedCollectionIds(config, access),
				home_path: resolveHomePath(config, access),
				home_force: resolveHomeForce(config, access),
				sidebar_hidden_panels: getHiddenSidebarPanels(config, access),
				sidebar_mode: resolveSidebarMode(config, access),
				users_own_role_only: ownRoleOnly,
				...(ownRoleOnly ? { users_allowed_role_ids: getUsersAllowedRoleIds(access) } : {}),
				users_hidden_role_ids: getHiddenUsersRoleIds(config, access),
				users_blocked_role_ids: getBlockedUsersRoleIds(config, access),
				navigation_hidden_modules: getNavigationHiddenModules(config, access),
			} satisfies ModulePermissionsConfig;
		}

		return payload;
	});

	filter('collections.read', async (payload: unknown, _meta: unknown, context: any) => {
		await ensureOnce();

		const accountability: Accountability | null = context?.accountability ?? null;
		if (accountability?.admin) {
			return payload;
		}

		const wrapped = getCollectionsPayload(payload);
		if (!wrapped?.list?.length) return payload;

		const config = await readModulePermissionsConfig(database);
		if (!config.collections.length) return payload;

		const access = await resolveUserAccessContext(database, accountability);
		const nextList = applyCollectionVisibility(wrapped.list, config, access);
		return wrapped.wrap ? wrapped.wrap(nextList) : nextList;
	});

	/**
	 * Users module navigation loads roles via GET /roles.
	 * Filter the list for non-admins so own-role-only / role visibility rules apply.
	 * Skip system/public reads (no user) — empty context + catch-all would wipe all roles.
	 */
	filter('roles.read', async (payload: unknown, _meta: unknown, context: any) => {
		await ensureOnce();

		const accountability: Accountability | null = context?.accountability ?? null;
		if (!accountability?.user || accountability.admin) {
			return payload;
		}

		const wrapped = getRolesPayload(payload);
		if (!wrapped?.list?.length) return payload;

		const config = await readModulePermissionsConfig(database);
		const access = await resolveUserAccessContext(database, accountability);
		const ownRoleOnly = resolveUsersOwnRoleOnly(config, access);

		if (!ownRoleOnly && !(config.users?.roles?.length > 0)) {
			return payload;
		}

		const nextList = filterRolesForUserVisibility(wrapped.list, config, access);
		return wrapped.wrap ? wrapped.wrap(nextList) : nextList;
	});

	filter('settings.update', async (payload: any, _meta: unknown, context: any) => {
		const accountability: Accountability | null = context?.accountability ?? null;

		if (accountability?.admin) {
			return payload;
		}

		if (!payload || typeof payload !== 'object') {
			return payload;
		}

		if (MODULE_PERMISSIONS_FIELD in payload) {
			delete payload[MODULE_PERMISSIONS_FIELD];
		}

		if ('module_bar' in payload) {
			delete payload.module_bar;
		}

		return payload;
	});
});
