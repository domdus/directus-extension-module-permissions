<template>
	<private-view title="Users" icon="people_alt">
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
					Control the Users module’s role tree in Module Navigation. Admins are never affected. UI-only — not
					a security boundary.
				</p>
			</sidebar-detail>
		</template>

		<div :class="pageClass">
			<div v-if="loading" class="loading">
				<v-progress-circular indeterminate />
			</div>

			<template v-else>
				<p class="page-intro">
					Filter which roles appear in Users Module Navigation for matched roles/policies.
				</p>

				<v-divider
					class="section-divider"
					large
					:inline-title="false"
					:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
				>
					<template #icon><v-icon name="person" /></template>
					{{ 'Own Role Only' }}
				</v-divider>
				<p class="section-intro">
					Matched users only see their own role (and parent roles) in the Users nav tree. First match wins;
					empty roles and policies = catch-all.
				</p>

				<draggable
					v-model="usersOwnRoleItems"
					item-key="id"
					handle=".drag-handle"
					:animation="150"
					class="list"
				>
					<template #item="{ element }">
						<v-list-item block dense clickable class="module-row enabled" @click="editUsersOwnRole(element.id)">
							<v-icon class="drag-handle" name="drag_handle" @click.stop />
							<v-icon class="icon" name="person" />
							<div class="info">
								<div class="name">Own role only</div>
								<div class="to">{{ usersOwnRoleSummary(element) }}</div>
							</div>
							<div class="row-actions" @click.stop>
								<v-button icon x-small secondary @click="editUsersOwnRole(element.id)">
									<v-icon name="edit" />
								</v-button>
								<v-button icon x-small secondary @click="removeUsersOwnRole(element.id)">
									<v-icon name="close" />
								</v-button>
							</div>
						</v-list-item>
					</template>
				</draggable>

				<v-button class="add-link" @click="editUsersOwnRole('+')">Add Own-Role Rule</v-button>

				<v-divider
					class="section-divider add-margin-top"
					large
					:inline-title="false"
					:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
				>
					<template #icon><v-icon name="badge" /></template>
					{{ 'Role Visibility' }}
				</v-divider>
				<p class="section-intro">
					Hide or show specific roles in the Users nav tree for matched roles/policies. Applied after own-role
					filtering. Optional deep-link blocking covers <code>/users/roles/&lt;id&gt;</code>.
				</p>

				<div v-if="configuredUsersRoles.length === 0" class="empty">No role visibility rules yet.</div>

				<div v-else class="list">
					<v-list-item
						v-for="item in configuredUsersRoles"
						:key="item.id"
						block
						dense
						clickable
						class="module-row enabled"
						@click="openUsersRoleEditor(item.id)"
					>
						<v-icon class="icon" name="badge" />
						<div class="info">
							<div class="name">
								{{ item.name }}
								<v-chip v-if="hasUsersRoleRule(item.id)" x-small class="rule-chip">
									{{ usersRoleRuleSummary(item.id) }}
								</v-chip>
							</div>
							<div class="to">/users/roles/{{ item.id }}</div>
						</div>
						<div class="row-actions" @click.stop>
							<v-button icon x-small secondary @click="openUsersRoleEditor(item.id)">
								<v-icon name="policy" />
							</v-button>
							<v-button icon x-small secondary @click="removeUsersRoleRule(item.id)">
								<v-icon name="close" />
							</v-button>
						</div>
					</v-list-item>
				</div>

				<v-button class="add-link" @click="openUsersRoleEditor('+')">Add Role Rule</v-button>
			</template>
		</div>

		<v-drawer
			:model-value="usersOwnRoleEditing !== null"
			title="Own Role Only"
			icon="person"
			@update:model-value="onUsersOwnRoleDrawerToggle"
			@cancel="closeUsersOwnRoleEditor"
		>
			<template #actions>
				<v-button v-tooltip.bottom="'Apply'" icon rounded @click="saveUsersOwnRole">
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="usersOwnRoleDraft" class="drawer-content">
				<p class="hint">Leave roles and policies empty for a catch-all (place last).</p>

				<div class="field-row">
					<div class="field">
						<label>Roles</label>
						<v-select
							v-model="usersOwnRoleDraft.roles"
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
							v-model="usersOwnRoleDraft.policies"
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

		<v-drawer
			:model-value="usersRoleEditingId !== null"
			:title="usersRoleEditingId === '+' ? 'Add Role Rule' : 'Role Visibility'"
			icon="policy"
			@update:model-value="onUsersRoleDrawerToggle"
			@cancel="closeUsersRoleEditor"
		>
			<template #actions>
				<v-button
					v-tooltip.bottom="'Apply'"
					:disabled="usersRoleSaveDisabled"
					icon
					rounded
					@click="saveUsersRoleRule"
				>
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="usersRoleDraft" class="drawer-content">
				<p class="hint">Pick a role and at least one matching role or policy.</p>

				<div class="field">
					<label>Role to control</label>
					<v-select
						v-model="usersRoleDraft.id"
						:items="availableUsersRoleOptions"
						item-text="text"
						item-value="value"
						:disabled="usersRoleEditingId !== '+'"
						placeholder="Select role"
					/>
				</div>

				<div class="field">
					<label>Visibility</label>
					<div class="visibility-radios">
						<v-radio v-model="usersRoleDraft.visibility" value="hide" label="Hide for matched" block />
						<v-radio v-model="usersRoleDraft.visibility" value="show" label="Show only for matched" block />
					</div>
				</div>

				<div class="field-row">
					<div class="field">
						<label>Roles</label>
						<v-select
							v-model="usersRoleDraft.roles"
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
							v-model="usersRoleDraft.policies"
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
						v-model="usersRoleDraft.block_routes"
						label="Block deep links to /users/roles/<id> when this rule hides it"
					/>
				</div>

				<v-button
					v-if="usersRoleEditingId && usersRoleEditingId !== '+' && hasUsersRoleRule(usersRoleEditingId)"
					secondary
					@click="clearUsersRoleRule"
				>
					Remove rule
				</v-button>
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
	usersOwnRoleItems,
	usersOwnRoleEditing,
	usersOwnRoleDraft,
	configuredUsersRoles,
	availableUsersRoleOptions,
	usersRoleEditingId,
	usersRoleDraft,
	usersRoleSaveDisabled,
	usersOwnRoleSummary,
	hasUsersRoleRule,
	usersRoleRuleSummary,
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

.page-intro,
.section-intro {
	margin: 0 0 24px;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.section-intro {
	margin-bottom: 16px;
}

.section-divider {
	margin-bottom: 12px;
}

.section-divider.add-margin-top {
	margin-top: 40px;
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

.checkbox-field {
	padding-top: 4px;
}

.hint,
.sidebar-text {
	margin: 0;
	line-height: 1.5;
	color: var(--theme--foreground);
}

.hint code,
.sidebar-text code,
.section-intro code {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 0.9em;
}
</style>
