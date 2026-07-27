# Module Permissions

Control what non-admin users see in the Directus Data Studio — the left module bar, middle Module Navigation, Content nav, Users role tree, right sidebar, and where they land after login — based on their roles and policies.

## Overview

Directus stores the left module bar as a single project-wide setting. This extension brings back **per-role and per-policy visibility**, and adds similar controls for other Studio areas that often show more than certain teams should see.

Open **Module Permissions** from the left bar (admins only). Rules only affect **non-admin** users. **Administrators always see everything** and are never redirected by these rules.

> **Important:** Most of these controls change what appears in the interface. They are **not a full security lock**. Users may still reach data through the API or permissions if those allow it. Use Directus permissions for real access control; use this extension to tidy and simplify the Studio experience.

## Features

### Modules

Reorder the left module bar, enable or disable entries, add custom links, and hide or show modules for selected roles and policies. Optionally block deep links when a module is hidden. Also hide the middle Module Navigation panel per module for matched roles/policies.

<img alt="Modules settings" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_modules.png" width="800" />

- **Reorder & toggle** the left module bar (same idea as Project Settings → Modules)
- **Add custom links** to the module bar
- **Hide** a module for selected roles/policies, or **show it only** to those roles/policies
- Optionally **block deep links** when a module is hidden (e.g. typing `/users` in the address bar)
- **Hide Module Navigation** — hide the middle navigation column for selected modules when the user matches

### Sidebar

Hide individual right-sidebar panels, or force the whole sidebar collapsed or hidden for matched roles and policies.

<img alt="Sidebar settings" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_sidebar.png" width="800" />

- **Hide individual right-sidebar panels** (Layout Options, Revisions, Comments, Activity Log, and more) for selected roles/policies
- **Force the whole sidebar** collapsed (icons only) or fully hidden
- Purely visual — does not change permissions

### Content

Hide collections from the Content navigation while keeping normal permissions for relations and the API.

<img alt="Content settings" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_content.png" width="800" />

- **Hide collections** from the Content navigation for selected roles/policies
- Collections stay available in relations and the API if permissions allow
- Optionally **block deep links** to hidden collections

### Users

Control which roles appear in the Users module’s navigation tree.

<img alt="Users settings" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_users.png" width="800" />

- **Own Role Only** — matched users only see their own role (and parent roles) in the Users navigation tree
- **Role Visibility** — hide or show specific roles in that tree
- Optionally **block deep links** to hidden role pages

### Start Page

Choose where matched users land after login.

<img alt="Start Page settings" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_startpage.png" width="800" />

- Set where matched users **land after login** (for example `/files` or `/content`)
- Without **Force Redirect**, a user’s saved last page still wins
- With **Force Redirect**, they go to your start page even if they have a last page
- Explicit shared links with `?redirect=` still work as expected

### Settings

- **Export / import** your Module Permissions config as JSON (backup or move between projects)
- **Remove extension data** cleanly before uninstall (only this extension’s settings — not your module bar order)

## How rules work

For most visibility options you pick:

1. **Hide for matched roles/policies** — those people don’t see it  
2. **Show only for matched roles/policies** — everyone else doesn’t see it  

You can match by **role**, **policy**, or both. If either matches, the rule applies.

Some lists (Start Page, Sidebar mode, Own Role Only, Hide Module Navigation) support a **catch-all**: leave roles and policies empty and place the rule last so it applies to everyone who didn’t match an earlier rule.

## Installation

Supports **Directus 9, 10, 11 and 12**.

### npm

```bash
npm install directus-extension-module-permissions
```

Place the package in your Directus `extensions` folder (or install into a project that loads extensions from `node_modules`), then restart Directus.

### Marketplace

Search for **Module Permissions** in **Settings → Marketplace**. This bundle includes an API hook, so some environments only allow App extensions from the Marketplace — use the npm/manual install below if install is blocked.

### Manual Installation

1. Install and build:

```bash
cd directus-extension-module-permissions
npm install
npm run build
```

2. Copy the built package into your Directus `extensions` folder (include `package.json` and the `dist` folder).

3. Restart Directus.

4. In the Data Studio:

   1. Open **Settings → Project Settings → Modules**
   2. Enable **Module Permissions**
   3. Open **Module Permissions** from the left bar

## Getting started

1. Open **Module Permissions** as an admin.
2. Start with **Modules** — reorder the bar and hide modules your Editors or other roles shouldn’t see.
3. Use **Sidebar**, **Content**, and **Users** to simplify those screens for the same roles.
4. Set a **Start Page** if you want a clear landing page after login.
5. Optionally **Export JSON** from Settings so you can restore the config later.

## Tips

- Always pair Studio visibility rules with the right **permissions** in Directus Access Control.
- Test with a non-admin account (or another browser profile) after saving.
- Export your config before major changes or before uninstalling.
- Uninstall cleanup only removes this extension’s data — your normal module bar and other project settings stay intact.

## Examples

<img alt="Insights with modules and navigation hidden" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_clean_insights.png" width="800" />

A focused Insights view: other modules are hidden from the left bar, and the middle Module Navigation column is removed, so the user only sees the dashboard.

<img alt="Content item edit with sidebar hidden" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_collection_no_sidebar.png" width="800" />

Editing a Content item with the right sidebar fully hidden — no collapsed rail and no detail panels — so the form uses the full width.

<img alt="User Directory without roles navigation" src="https://raw.githubusercontent.com/domdus/directus-extension-module-permissions/main/docs/screenshot_user_no_roles_module.png" width="800" />

User Directory for a restricted role: the Users module and its roles tree are not shown in navigation, leaving a simple user detail form without the usual Users chrome.

## License

MIT
