import { useStores } from '@directus/extensions-sdk';
import { computed, type ComputedRef } from 'vue';

function majorFromVersion(version: unknown): number | null {
	if (typeof version !== 'string' || !version) return null;
	const major = Number.parseInt(version.split('.')[0] || '', 10);
	return Number.isFinite(major) ? major : null;
}

/** v12+ layout needs top content padding; v11 already spaces below the header. */
function needsTopPadding(version: unknown): boolean {
	const major = majorFromVersion(version);
	if (major != null) return major >= 12;

	// Fallback before serverStore hydrates: v12 module bar uses `#navigation.module-bar`.
	if (typeof document === 'undefined') return false;
	return Boolean(
		document.querySelector('#navigation.module-bar') ||
			document.querySelector('aside.module-nav:not(#navigation)'),
	);
}

export function usePageClass(): ComputedRef<string[]> {
	const { useServerStore } = useStores() as {
		useServerStore: () => { info?: { version?: string } };
	};
	const serverStore = useServerStore();

	return computed(() => {
		const classes = ['page'];
		if (needsTopPadding(serverStore?.info?.version)) {
			classes.push('page--padded-top');
		}
		return classes;
	});
}
