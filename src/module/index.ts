import { defineModule } from '@directus/extensions-sdk';
import CollectionsView from './collections-view.vue';
import ModulesView from './modules-view.vue';
import SettingsView from './settings-view.vue';
import SidebarView from './sidebar-view.vue';
import StartPageView from './start-page-view.vue';
import UsersView from './users-view.vue';
import { installRouteGuard } from './route-guard';
import { installSidebarEnforcer } from './sidebar-enforcer';
import { installUsersNavEnforcer } from './users-nav-enforcer';

// App extension bundle loads for every Data Studio session — install guards/enforcers globally.
installRouteGuard();
installSidebarEnforcer();
installUsersNavEnforcer();

export default defineModule({
	id: 'module-permissions',
	name: 'Module Permissions',
	icon: 'security',
	routes: [
		{
			path: '',
			redirect: '/module-permissions/modules',
		},
		{
			path: 'modules',
			component: ModulesView,
		},
		{
			path: 'navigation',
			redirect: '/module-permissions/modules',
		},
		{
			path: 'sidebar',
			component: SidebarView,
		},
		{
			path: 'content',
			component: CollectionsView,
		},
		{
			path: 'collections',
			redirect: '/module-permissions/content',
		},
		{
			path: 'users',
			component: UsersView,
		},
		{
			path: 'start-page',
			component: StartPageView,
		},
		{
			path: 'home-paths',
			redirect: '/module-permissions/start-page',
		},
		{
			path: 'settings',
			component: SettingsView,
		},
		{
			path: 'cleanup',
			redirect: '/module-permissions/settings',
		},
	],
	preRegisterCheck(user) {
		return user?.admin_access === true;
	},
});
