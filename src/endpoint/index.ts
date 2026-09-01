import type { Request, Response, NextFunction, Router } from 'express';
import { parsePermissionsField, parseStoredJson, serializePermissionsConfig } from '../shared/evaluate';
import { MODULE_PERMISSIONS_FIELD } from '../shared/types';
import { checkForUpdates } from './update-check';

type EndpointContext = {
	database: any;
	services: any;
	getSchema: () => Promise<any>;
};

function requireAdmin(req: Request, res: Response): boolean {
	const accountability = (req as any).accountability as
		| { admin?: boolean; admin_access?: boolean; role?: { admin_access?: boolean } | string | null }
		| null
		| undefined;
	if (!accountability) {
		res.status(403).json({ errors: [{ message: 'Admin access required' }] });
		return false;
	}
	const isAdmin =
		accountability.admin === true ||
		accountability.admin_access === true ||
		(typeof accountability.role === 'object' && accountability.role?.admin_access === true);
	if (!isAdmin) {
		res.status(403).json({ errors: [{ message: 'Admin access required' }] });
		return false;
	}
	return true;
}

async function readSettingsRow(database: any): Promise<Record<string, any>> {
	try {
		const row = await database('directus_settings').select('module_bar', MODULE_PERMISSIONS_FIELD).first();
		return row || {};
	} catch {
		const row = await database('directus_settings').select('module_bar').first();
		return row || {};
	}
}

function serializeRow(row: Record<string, any>) {
	const moduleBar = parseStoredJson(row.module_bar);
	return {
		module_bar: Array.isArray(moduleBar) ? moduleBar : [],
		[MODULE_PERMISSIONS_FIELD]: parsePermissionsField(row[MODULE_PERMISSIONS_FIELD]),
	};
}

async function writeSettings(context: EndpointContext, data: Record<string, unknown>) {
	const row = await context.database('directus_settings').select('id').first();
	if (row?.id == null) {
		throw new Error('Settings row missing');
	}

	try {
		const schema = await context.getSchema();
		const { ItemsService } = context.services;
		const service = new ItemsService('directus_settings', {
			schema,
			knex: context.database,
			accountability: { admin: true },
		});
		await service.updateOne(row.id, data);
		return;
	} catch {
		await context.database('directus_settings').where({ id: row.id }).update(data);
	}
}

export default {
	id: 'module-permissions',
	handler: (router: Router, context: EndpointContext) => {
		router.get('/update-check', async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!requireAdmin(req, res)) return;
				const force = String(req.query.force || '') === '1';
				const data = await checkForUpdates(force);
				res.json({ data });
			} catch (error) {
				next(error);
			}
		});

		/**
		 * Read module_bar + module_permissions via knex so Directus 11 / 12.2+
		 * field allowlists cannot 403 the admin UI (see issue #1).
		 */
		router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!requireAdmin(req, res)) return;
				const row = await readSettingsRow(context.database);
				res.json({ data: serializeRow(row) });
			} catch (error) {
				next(error);
			}
		});

		router.patch('/config', async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!requireAdmin(req, res)) return;

				const body = (req.body?.data ?? req.body ?? {}) as Record<string, unknown>;
				const patch: Record<string, unknown> = {};

				if ('module_bar' in body) {
					patch.module_bar = body.module_bar;
				}

				if (MODULE_PERMISSIONS_FIELD in body) {
					patch[MODULE_PERMISSIONS_FIELD] = serializePermissionsConfig(body[MODULE_PERMISSIONS_FIELD]);
				}

				if (Object.keys(patch).length === 0) {
					res.status(400).json({ errors: [{ message: 'Nothing to update' }] });
					return;
				}

				try {
					await writeSettings(context, patch);
				} catch (error) {
					if (!('module_bar' in patch) || !(MODULE_PERMISSIONS_FIELD in patch)) {
						throw error;
					}

					await writeSettings(context, { module_bar: patch.module_bar });
					try {
						await writeSettings(context, {
							[MODULE_PERMISSIONS_FIELD]: patch[MODULE_PERMISSIONS_FIELD],
						});
					} catch {
						// Field may have been deleted — module_bar still saved.
					}
				}

				res.json({ data: patch });
			} catch (error) {
				next(error);
			}
		});
	},
};
