<template>
	<private-view title="Content" icon="box">
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
			<sidebar-detail id="about" icon="info" title="About">
				<p class="sidebar-text">
					Hide specific collections from the Content module navigation while keeping read permissions for
					relations and API access. Optional deep-link blocking covers
					<code>/content/&lt;collection&gt;</code>. Admins are never affected. This is UI visibility only —
					not a security boundary.
				</p>
			</sidebar-detail>
		</template>

		<div :class="pageClass">
			<div v-if="loading" class="loading">
				<v-progress-circular indeterminate />
			</div>

			<template v-else>
				<p class="page-intro">
					Add only the collections that need visibility rules. Unlisted collections keep normal Content
					behavior. Assign roles or policies to hide or show a collection in the nav, and optionally block
					deep links.
				</p>

				<div v-if="configuredCollections.length === 0" class="empty">No collection rules yet.</div>

				<div v-else class="list">
					<v-list-item
						v-for="item in configuredCollections"
						:key="item.collection"
						block
						dense
						clickable
						class="module-row enabled"
						@click="openCollectionEditor(item.collection)"
					>
						<v-icon class="icon" :name="item.icon" />
						<div class="info">
							<div class="name">
								{{ item.name }}
								<v-chip v-if="hasCollectionRule(item.collection)" x-small class="rule-chip">
									{{ collectionRuleSummary(item.collection) }}
								</v-chip>
							</div>
							<div class="to">/content/{{ item.collection }}</div>
						</div>
						<div class="row-actions" @click.stop>
							<v-button
								v-tooltip="'Visibility rules'"
								icon
								x-small
								secondary
								@click="openCollectionEditor(item.collection)"
							>
								<v-icon name="policy" />
							</v-button>
							<v-button
								v-tooltip="'Remove'"
								icon
								x-small
								secondary
								@click="removeCollectionRule(item.collection)"
							>
								<v-icon name="close" />
							</v-button>
						</div>
					</v-list-item>
				</div>

				<v-button class="add-link" @click="openCollectionEditor('+')">Add Collection</v-button>
			</template>
		</div>

		<v-drawer
			:model-value="collectionEditingId !== null"
			:title="collectionEditingId === '+' ? 'Add Collection' : 'Collection Visibility'"
			icon="policy"
			@update:model-value="onCollectionDrawerToggle"
			@cancel="closeCollectionEditor"
		>
			<template #actions>
				<v-button
					v-tooltip.bottom="'Apply'"
					:disabled="collectionSaveDisabled"
					icon
					rounded
					@click="saveCollectionRule"
				>
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="collectionDraft" class="drawer-content">
				<p class="hint">
					Pick a collection and at least one role or policy. Read permissions are never changed here.
				</p>

				<div class="field">
					<label>Collection</label>
					<v-select
						v-model="collectionDraft.id"
						:items="availableCollectionOptions"
						item-text="text"
						item-value="value"
						:disabled="collectionEditingId !== '+'"
						placeholder="Select collection"
					/>
				</div>

				<div class="field">
					<label>Visibility</label>
					<div class="visibility-radios">
						<v-radio v-model="collectionDraft.visibility" value="hide" label="Hide for matched" block />
						<v-radio
							v-model="collectionDraft.visibility"
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
							v-model="collectionDraft.roles"
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
							v-model="collectionDraft.policies"
							multiple
							:items="policyOptions"
							item-text="text"
							item-value="value"
							placeholder="Select policies"
						/>
					</div>
				</div>

				<div class="field checkbox-field">
					<v-checkbox
						v-model="collectionDraft.block_routes"
						label="Block deep links to /content/<collection> when this rule hides it"
					/>
				</div>

				<v-button
					v-if="collectionEditingId && collectionEditingId !== '+' && hasCollectionRule(collectionEditingId)"
					secondary
					@click="clearCollectionRule"
				>
					Remove rule
				</v-button>
			</div>
		</v-drawer>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useModulePermissions } from './composables/use-module-permissions';
import { usePageClass } from './composables/use-page-class';
import ModuleNavigation from './navigation.vue';

const pageClass = usePageClass();

const {
	loading,
	saving,
	hasEdits,
	configuredCollections,
	availableCollectionOptions,
	roleOptions,
	policyOptions,
	collectionEditingId,
	collectionDraft,
	collectionSaveDisabled,
	hasCollectionRule,
	collectionRuleSummary,
	openCollectionEditor,
	closeCollectionEditor,
	onCollectionDrawerToggle,
	saveCollectionRule,
	clearCollectionRule,
	removeCollectionRule,
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

.empty {
	margin-bottom: 12px;
	color: var(--theme--foreground);
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
	line-height: 1.5;
	color: var(--theme--foreground);
}

.sidebar-text code,
.hint code {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 0.9em;
}

.checkbox-field {
	padding-top: 4px;
}
</style>
