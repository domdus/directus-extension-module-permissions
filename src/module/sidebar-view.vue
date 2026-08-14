<template>
	<private-view title="Sidebar" icon="view_sidebar">
		<template #headline>
			<v-breadcrumb :items="[{ name: 'Module Permissions', to: '/module-permissions/modules' }]" />
		</template>

		<template #navigation>
			<module-navigation />
		</template>

		<template #actions>
			<v-button v-tooltip.bottom="'Save'" :disabled="!hasEdits" :loading="saving" icon rounded @click="save">
				<v-icon name="check" />
			</v-button>
		</template>

		<template #sidebar>
			<sidebar-detail icon="info" title="About" close>
				<p class="sidebar-text">
					Hide individual right-sidebar panels (Layout, Revisions, Comments, …) or force the whole sidebar
					collapsed/hidden for matched roles and policies. Admins are never affected. This is UI-only — not a
					security boundary.
				</p>
			</sidebar-detail>
		</template>

		<div :class="pageClass">
			<div v-if="loading" class="loading">
				<v-progress-circular indeterminate />
			</div>

			<template v-else>
				<v-divider
					class="section-divider"
					large
					:inline-title="false"
					:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
				>
					<template #icon><v-icon name="widgets" /></template>
					Panels
				</v-divider>
				<p class="page-intro">
					Hide or show known Data Studio sidebar panels for matched roles/policies. Collection browse panels
					(Layout, Archive, …) and item panels (Revisions, Comments, …) only appear on the relevant pages.
					Import appears on Insights. Activity Log is the footer control at the bottom of the sidebar
					(Directus 11; replaced by AI Assistant on newer versions when AI is enabled).
				</p>

				<div class="list">
					<v-list-item
						v-for="panel in sidebarPanelCatalog"
						:key="panel.id"
						block
						dense
						clickable
						class="module-row enabled"
						@click="openSidebarPanelEditor(panel.id)"
					>
						<v-icon class="icon" :name="panel.icon" />
						<div class="info">
							<div class="name">
								{{ panel.name }}
								<v-chip v-if="hasSidebarPanelRule(panel.id)" x-small class="rule-chip">
									{{ sidebarPanelRuleSummary(panel.id) }}
								</v-chip>
							</div>
							<div class="to">{{ panel.id }} · {{ contextLabel(panel.context) }}</div>
						</div>
						<div class="row-actions" @click.stop>
							<v-button
								v-tooltip="'Visibility rules'"
								icon
								x-small
								secondary
								@click="openSidebarPanelEditor(panel.id)"
							>
								<v-icon name="policy" />
							</v-button>
						</div>
					</v-list-item>
				</div>

				<v-divider
					class="section-divider add-margin-top"
					large
					:inline-title="false"
					:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
				>
					<template #icon><v-icon name="keyboard_tab" /></template>
					Sidebar Mode
				</v-divider>
				<p class="page-intro">
					Force the whole right sidebar collapsed or hidden. First match wins (drag to reorder); leave roles
					and policies empty for a catch-all. Default behavior applies when nothing matches.
				</p>

				<draggable v-model="sidebarModeItems" item-key="id" handle=".drag-handle" :animation="150" class="list">
					<template #item="{ element }">
						<v-list-item block dense clickable class="module-row enabled" @click="editSidebarMode(element.id)">
							<v-icon class="drag-handle" name="drag_handle" @click.stop />
							<v-icon class="icon" :name="element.mode === 'hidden' ? 'visibility_off' : 'keyboard_tab'" />
							<div class="info">
								<div class="name">{{ element.mode === 'hidden' ? 'Force hidden' : 'Force collapsed' }}</div>
								<div class="to">{{ sidebarModeSummary(element) }}</div>
							</div>
							<div class="row-actions" @click.stop>
								<v-button icon x-small secondary @click="editSidebarMode(element.id)">
									<v-icon name="edit" />
								</v-button>
								<v-button icon x-small secondary @click="removeSidebarMode(element.id)">
									<v-icon name="close" />
								</v-button>
							</div>
						</v-list-item>
					</template>
				</draggable>

				<v-button class="add-link" @click="editSidebarMode('+')">Add Sidebar Mode</v-button>
			</template>
		</div>

		<v-drawer
			:model-value="sidebarPanelEditingId !== null"
			title="Sidebar Panel"
			icon="policy"
			@update:model-value="onSidebarPanelDrawerToggle"
			@cancel="closeSidebarPanelEditor"
		>
			<template #actions>
				<v-button v-tooltip.bottom="'Apply'" icon rounded @click="saveSidebarPanelRule">
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="sidebarPanelDraft" class="drawer-content">
				<p class="hint">
					Leave roles and policies empty to clear the rule. Hiding is client-side only — API access is
					unchanged.
				</p>

				<div class="field">
					<label>Visibility</label>
					<div class="visibility-radios">
						<v-radio v-model="sidebarPanelDraft.visibility" value="hide" label="Hide for matched" block />
						<v-radio
							v-model="sidebarPanelDraft.visibility"
							value="show"
							label="Show only for matched"
							block
						/>
					</div>
				</div>

				<div class="field-row">
					<div class="field">
						<label>Roles</label>
						<v-select
							v-model="sidebarPanelDraft.roles"
							multiple
							:items="roleOptions"
							item-text="text"
							item-value="value"
							placeholder="Select roles"
						/>
					</div>

					<div class="field">
						<label>Policies</label>
						<v-select
							v-model="sidebarPanelDraft.policies"
							multiple
							:items="policyOptions"
							item-text="text"
							item-value="value"
							placeholder="Select policies"
						/>
					</div>
				</div>

				<v-button v-if="hasSidebarPanelRule(sidebarPanelEditingId!)" secondary @click="clearSidebarPanelRule">
					Clear rule
				</v-button>
			</div>
		</v-drawer>

		<v-drawer
			:model-value="sidebarModeEditing !== null"
			title="Sidebar Mode"
			icon="view_sidebar"
			@update:model-value="onSidebarModeDrawerToggle"
			@cancel="closeSidebarModeEditor"
		>
			<template #actions>
				<v-button v-tooltip.bottom="'Apply'" icon rounded @click="saveSidebarMode">
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="sidebarModeDraft" class="drawer-content">
				<p class="hint">
					Collapsed keeps the icon rail (Directus compact sidebar). Hidden removes the sidebar chrome entirely.
					Empty roles and policies = catch-all (place last).
				</p>

				<div class="field">
					<label>Mode</label>
					<v-select
						v-model="sidebarModeDraft.mode"
						:items="[
							{ text: 'Force collapsed', value: 'collapsed' },
							{ text: 'Force hidden', value: 'hidden' },
						]"
					/>
				</div>

				<div class="field-row">
					<div class="field">
						<label>Roles</label>
						<v-select
							v-model="sidebarModeDraft.roles"
							multiple
							:items="roleOptions"
							item-text="text"
							item-value="value"
							placeholder="Select roles (optional)"
						/>
					</div>

					<div class="field">
						<label>Policies</label>
						<v-select
							v-model="sidebarModeDraft.policies"
							multiple
							:items="policyOptions"
							item-text="text"
							item-value="value"
							placeholder="Select policies (optional)"
						/>
					</div>
				</div>
			</div>
		</v-drawer>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import Draggable from 'vuedraggable';
import { useModulePermissions } from './composables/use-module-permissions';
import { usePageClass } from './composables/use-page-class';
import ModuleNavigation from './navigation.vue';

const pageClass = usePageClass();

const {
	loading,
	saving,
	hasEdits,
	roleOptions,
	policyOptions,
	sidebarPanelCatalog,
	sidebarPanelEditingId,
	sidebarPanelDraft,
	sidebarModeItems,
	sidebarModeEditing,
	sidebarModeDraft,
	hasSidebarPanelRule,
	sidebarPanelRuleSummary,
	sidebarModeSummary,
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
	ensureLoaded,
	save,
} = useModulePermissions();

function contextLabel(context: 'collection' | 'item' | 'both' | 'insights'): string {
	if (context === 'collection') return 'collection browse';
	if (context === 'item') return 'item detail';
	if (context === 'insights') return 'Insights';
	return 'collection & item';
}

onMounted(() => {
	ensureLoaded();
});
</script>

<style scoped>
.page {
	padding: var(--content-padding);
	padding-block-end: var(--content-padding-bottom);
	max-width: 720px;
}

.page--flush-top {
	padding-block-start: 0;
}

.loading {
	display: flex;
	justify-content: center;
	padding: 4rem;
}

.section-divider {
	margin-bottom: 12px;
}

.section-divider.add-margin-top {
	margin-top: 40px;
}

.page-intro {
	margin: 0 0 24px;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 12px;
	padding: 0;
}

.module-row.enabled {
	--v-list-item-color: var(--theme--foreground);
}

.drag-handle {
	cursor: grab;
	margin-inline-end: 4px;
	color: var(--theme--foreground-subdued);
}

.icon {
	margin: 0 0.6875rem;
}

.info {
	flex: 1;
	min-width: 0;
}

.name {
	font-weight: 600;
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.to {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 12px;
	opacity: 0.75;
}

.rule-chip {
	font-weight: 500;
}

.row-actions {
	display: flex;
	align-items: center;
	gap: 6px;
}

.add-link {
	margin-top: 4px;
}

.drawer-content {
	padding: var(--content-padding);
	padding-block-end: var(--content-padding-bottom);
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.field label {
	display: block;
	margin-bottom: 8px;
	font-weight: 600;
}

.field-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16px;
	align-items: start;
}

@media (max-width: 520px) {
	.field-row {
		grid-template-columns: 1fr;
	}
}


.visibility-radios {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}

.visibility-radios :deep(.v-radio.block) {
	width: 100%;
	margin: 0;
}

.hint,
.sidebar-text {
	margin: 0;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.hint code,
.sidebar-text code {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 0.9em;
}
</style>
