<template>
	<private-view title="Modules" icon="view_sidebar">
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
					Configure the left module bar and optionally hide the middle Module Navigation panel for matched
					roles/policies. Admins are never affected. Deep links are blocked when a rule disables a module
					(unless “Block deep links” is turned off).
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
					:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
				>
					<template #icon><v-icon name="view_sidebar" class="icon-flip-x" /></template>
					{{ 'Module Bar' }}
				</v-divider>
				<p class="page-intro">
					Reorder the left module bar, enable or disable entries, and add custom links — the same controls as
					Project Settings → Modules. Open an item to assign roles or policies that hide or show it for
					non-admin users.
				</p>

				<draggable v-model="previewItems" item-key="id" handle=".drag-handle" :animation="150" class="list">
					<template #item="{ element }">
						<v-list-item
							block
							dense
							clickable
							class="module-row"
							:class="{ enabled: element.enabled }"
							@click="openRuleEditor(element)"
						>
							<v-icon class="drag-handle" name="drag_handle" @click.stop />
							<v-icon class="icon" :name="element.icon" />

							<div class="info">
								<div class="name">
									{{ element.name }}
									<v-chip v-if="hasRule(element.id)" x-small class="rule-chip">
										{{ ruleSummary(element.id) }}
									</v-chip>
								</div>
								<div class="to">{{ element.to }}</div>
							</div>

							<div class="row-actions" @click.stop>
								<v-button
									v-tooltip="'Visibility rules'"
									icon
									x-small
									secondary
									@click="openRuleEditor(element)"
								>
									<v-icon name="policy" />
								</v-button>

								<template v-if="element.type === 'module'">
									<v-icon v-if="element.locked" v-tooltip="'Locked'" name="lock" />
									<v-checkbox
										v-else
										:model-value="element.enabled"
										@update:model-value="toggleEnabled(element, $event)"
									/>
								</template>

								<template v-else>
									<v-button icon x-small secondary @click="editLink(element.id)">
										<v-icon name="edit" />
									</v-button>
									<v-button icon x-small secondary @click="removeLink(element.id)">
										<v-icon name="close" />
									</v-button>
								</template>
							</div>
						</v-list-item>
					</template>
				</draggable>

				<v-button class="add-link" @click="editLink('+')">Add Link</v-button>

				<v-divider
					class="section-divider add-margin-top"
					large
					:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
				>
					<template #icon><v-icon name="menu" /></template>
					{{ 'Hide Module Navigation' }}
				</v-divider>
				<p class="section-intro">
					Hide the middle Module Navigation column for selected modules when the user matches. First matching
					rule’s modules are merged for the user. Empty roles and policies = catch-all.
				</p>

				<draggable v-model="hideNavItems" item-key="id" handle=".drag-handle" :animation="150" class="list">
					<template #item="{ element }">
						<v-list-item block dense clickable class="module-row enabled" @click="editHideNav(element.id)">
							<v-icon class="drag-handle" name="drag_handle" @click.stop />
							<v-icon class="icon" name="menu" />
							<div class="info">
								<div class="name">Hide navigation</div>
								<div class="to">{{ hideNavSummary(element) }}</div>
							</div>
							<div class="row-actions" @click.stop>
								<v-button icon x-small secondary @click="editHideNav(element.id)">
									<v-icon name="edit" />
								</v-button>
								<v-button icon x-small secondary @click="removeHideNav(element.id)">
									<v-icon name="close" />
								</v-button>
							</div>
						</v-list-item>
					</template>
				</draggable>

				<v-button class="add-link" @click="editHideNav('+')">Add Hide-Navigation Rule</v-button>
			</template>
		</div>

		<v-drawer
			:model-value="linkEditing !== null"
			title="Link"
			icon="link"
			@update:model-value="onLinkDrawerToggle"
			@cancel="closeLinkEditor"
		>
			<template #actions>
				<v-button v-tooltip.bottom="'Save'" :disabled="linkSaveDisabled" icon rounded @click="saveLink">
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="linkValues" class="drawer-content">
				<div class="field">
					<label>Name</label>
					<v-input v-model="linkValues.name" placeholder="Enter a name" />
				</div>
				<div class="field">
					<label>Icon</label>
					<v-input v-model="linkValues.icon" placeholder="link" />
				</div>
				<div class="field">
					<label>URL</label>
					<v-input v-model="linkValues.url" placeholder="https://example.com" />
				</div>
			</div>
		</v-drawer>

		<v-drawer
			:model-value="ruleEditingId !== null"
			title="Module Visibility"
			icon="policy"
			@update:model-value="onRuleDrawerToggle"
			@cancel="closeRuleEditor"
		>
			<template #actions>
				<v-button v-tooltip.bottom="'Apply'" icon rounded @click="saveRule">
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="ruleDraft" class="drawer-content">
				<p class="hint">
					Leave roles and policies empty to remove this visibility rule. The module then follows only its
					global enable toggle in the list above.
				</p>

				<div class="field">
					<label>Visibility</label>
					<div class="visibility-radios">
						<v-radio v-model="ruleDraft.visibility" value="hide" label="Hide for matched" block />
						<v-radio v-model="ruleDraft.visibility" value="show" label="Show only for matched" block />
					</div>
				</div>

				<div class="field">
					<label>Roles</label>
					<v-select
						v-model="ruleDraft.roles"
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
						v-model="ruleDraft.policies"
						multiple
						:items="policyOptions"
						item-text="text"
						item-value="value"
						placeholder="Select policies"
					/>
				</div>

				<div class="field checkbox-field">
					<v-checkbox v-model="ruleDraft.block_routes" label="Block deep links when this rule hides the module" />
				</div>

				<v-button v-if="hasRule(ruleEditingId!)" secondary @click="clearRule">Clear rule</v-button>
			</div>
		</v-drawer>

		<v-drawer
			:model-value="hideNavEditing !== null"
			title="Hide Module Navigation"
			icon="menu"
			@update:model-value="onHideNavDrawerToggle"
			@cancel="closeHideNavEditor"
		>
			<template #actions>
				<v-button
					v-tooltip.bottom="'Apply'"
					:disabled="hideNavSaveDisabled"
					icon
					rounded
					@click="saveHideNav"
				>
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="hideNavDraft" class="drawer-content">
				<p class="hint">
					Select modules whose middle navigation panel should be hidden. Empty roles and policies = catch-all.
				</p>

				<div class="field">
					<label>Modules</label>
					<v-select
						v-model="hideNavDraft.modules"
						multiple
						:items="moduleSelectOptions"
						item-text="text"
						item-value="value"
						placeholder="Select modules"
					/>
				</div>

				<div class="field">
					<label>Roles</label>
					<v-select
						v-model="hideNavDraft.roles"
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
						v-model="hideNavDraft.policies"
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
	previewItems,
	roleOptions,
	policyOptions,
	linkEditing,
	linkValues,
	linkSaveDisabled,
	ruleEditingId,
	ruleDraft,
	hasRule,
	ruleSummary,
	toggleEnabled,
	editLink,
	closeLinkEditor,
	onLinkDrawerToggle,
	saveLink,
	removeLink,
	openRuleEditor,
	closeRuleEditor,
	onRuleDrawerToggle,
	saveRule,
	clearRule,
	hideNavItems,
	hideNavEditing,
	hideNavDraft,
	hideNavSaveDisabled,
	moduleSelectOptions,
	hideNavSummary,
	editHideNav,
	closeHideNavEditor,
	onHideNavDrawerToggle,
	saveHideNav,
	removeHideNav,
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

.section-intro {
	margin: 0 0 16px;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.section-divider {
	margin-bottom: 12px;
}

.section-divider.add-margin-top {
	margin-top: 40px;
}

.icon-flip-x {
	transform: scaleX(-1);
}

.list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 12px;
	padding: 0;
}

.module-row {
	--v-list-item-color: var(--theme--foreground-subdued);
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
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
}

.to {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 12px;
	opacity: 0.75;
}

.rule-chip {
	margin-inline-start: 4px;
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
	line-height: 1.5;
	color: var(--theme--foreground);
}

.checkbox-field {
	padding-top: 4px;
}
</style>
