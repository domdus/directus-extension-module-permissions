/** Built-in Directus module display fallbacks when extension catalog is unavailable */
export const BUILTIN_MODULE_META: Record<string, { name: string; icon: string }> = {
	content: { name: 'Content', icon: 'box' },
	visual: { name: 'Visual Editor', icon: 'design_services' },
	users: { name: 'User Directory', icon: 'people_alt' },
	files: { name: 'File Library', icon: 'folder' },
	insights: { name: 'Insights', icon: 'insights' },
	settings: { name: 'Settings', icon: 'settings' },
	docs: { name: 'Documentation', icon: 'help' },
	deployments: { name: 'Deployments', icon: 'rocket_launch' },
	activity: { name: 'Activity', icon: 'history' },
};

export function getModuleMeta(id: string, fallback?: { name?: string; icon?: string }) {
	const builtin = BUILTIN_MODULE_META[id];

	return {
		name: fallback?.name || builtin?.name || id,
		icon: fallback?.icon || builtin?.icon || 'box',
	};
}
