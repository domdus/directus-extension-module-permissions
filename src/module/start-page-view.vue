<template>
	<private-view title="Start Page" icon="home">
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
					Start pages define where matched users land after login. By default they only apply when Directus
					has no last page. Enable <strong>Force Redirect</strong> to ignore
					<code>last_page</code>. Explicit <code>?redirect=</code> links still win.
				</p>
			</sidebar-detail>
		</template>

		<div :class="pageClass">
			<div v-if="loading" class="loading">
				<v-progress-circular indeterminate />
			</div>

			<template v-else>
				<p class="page-intro">
					Define where users land after login, and prefer that path for safe redirects away from blocked
					modules. First match wins (drag to reorder); leave roles and policies empty for a catch-all default.
					Without force, this does not override a user’s <code>last_page</code>. Enable force to redirect even when a
					last page exists. Explicit <code>?redirect=</code> always wins.
				</p>

				<draggable v-model="homeItems" item-key="id" handle=".drag-handle" :animation="150" class="list">
					<template #item="{ element }">
						<v-list-item block dense clickable class="module-row enabled" @click="editHome(element.id)">
							<v-icon class="drag-handle" name="drag_handle" @click.stop />
							<v-icon class="icon" name="home" />
							<div class="info">
								<div class="name">{{ element.path }}</div>
								<div class="to">{{ homeSummary(element) }}</div>
							</div>
							<div class="row-actions" @click.stop>
								<v-button icon x-small secondary @click="editHome(element.id)">
									<v-icon name="edit" />
								</v-button>
								<v-button icon x-small secondary @click="removeHome(element.id)">
									<v-icon name="close" />
								</v-button>
							</div>
						</v-list-item>
					</template>
				</draggable>

				<v-button class="add-link" @click="editHome('+')">Add Start Page</v-button>
			</template>
		</div>

		<v-drawer
			:model-value="homeEditing !== null"
			title="Start Page"
			icon="home"
			@update:model-value="onHomeDrawerToggle"
			@cancel="closeHomeEditor"
		>
			<template #actions>
				<v-button v-tooltip.bottom="'Apply'" :disabled="homeSaveDisabled" icon rounded @click="saveHome">
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="homeDraft" class="drawer-content">
				<p class="hint">
					Use an in-app path such as <code>/files</code> or <code>/content</code>. External URLs are rejected.
				</p>

				<div class="field">
					<label>Path</label>
					<v-input v-model="homeDraft.path" placeholder="/content" />
				</div>

				<div class="field checkbox-field">
					<v-checkbox
						v-model="homeDraft.force"
						label="Force Redirect (ignore users last page prop)"
					/>
				</div>

				<div class="field">
					<label>Roles</label>
					<v-select
						v-model="homeDraft.roles"
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
						v-model="homeDraft.policies"
						multiple
						:items="policyOptions"
						item-text="text"
						item-value="value"
						placeholder="Select policies (optional)"
					/>
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
	homeItems,
	roleOptions,
	policyOptions,
	homeEditing,
	homeDraft,
	homeSaveDisabled,
	homeSummary,
	editHome,
	closeHomeEditor,
	onHomeDrawerToggle,
	saveHome,
	removeHome,
	ensureLoaded,
	save,
} = useModulePermissions();

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

.page-intro {
	margin: 0 0 24px;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.page-intro code {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 0.9em;
}

.section-hint {
	margin-bottom: 24px;
}

.section-hint code,
.hint code {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 0.9em;
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
}

.to {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 12px;
	opacity: 0.75;
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

.checkbox-field {
	margin-top: -4px;
}

.hint,
.sidebar-text {
	margin: 0;
	line-height: 1.5;
	color: var(--theme--foreground);
}

.sidebar-text code {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 0.9em;
}
</style>
