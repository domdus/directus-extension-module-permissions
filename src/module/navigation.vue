<template>
	<v-list nav>
		<v-list-item to="/module-permissions/modules">
			<v-list-item-icon>
				<v-icon name="view_sidebar" class="icon-flip-x" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Modules" />
			</v-list-item-content>
		</v-list-item>

		<v-list-item to="/module-permissions/sidebar">
			<v-list-item-icon>
				<v-icon name="view_sidebar" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Sidebar" />
			</v-list-item-content>
		</v-list-item>

		<v-list-item to="/module-permissions/content">
			<v-list-item-icon>
				<v-icon name="box" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Content" />
			</v-list-item-content>
		</v-list-item>

		<v-list-item to="/module-permissions/users">
			<v-list-item-icon>
				<v-icon name="people_alt" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Users" />
			</v-list-item-content>
		</v-list-item>

		<v-list-item to="/module-permissions/start-page">
			<v-list-item-icon>
				<v-icon name="home" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Start Page" />
			</v-list-item-content>
		</v-list-item>

		<v-divider />

		<v-list-item to="/module-permissions/settings">
			<v-list-item-icon>
				<v-icon name="settings" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Settings" />
			</v-list-item-content>
		</v-list-item>
	</v-list>
</template>

<script setup lang="ts">
// Navigation for Module Permissions views
</script>

<style scoped>
.icon-flip-x {
	transform: scaleX(-1);
}
</style>
