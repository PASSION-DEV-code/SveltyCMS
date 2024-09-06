<script lang="ts">
	import { page } from '$app/stores';
	import type { PermissionConfig } from '@src/auth/permissionCheck';

	export let config: PermissionConfig | undefined;

	// Reactive statements
	$: user = $page.data.user;
	$: permissions = $page.data.permissions || {};
	$: permissionData = config?.contextId ? permissions[config.contextId] || {} : {};
	$: isAdmin = user?.role?.isAdmin === true; // Ensure user object has role and check for admin
	$: hasPermission = isAdmin || permissionData.hasPermission || false; // Admins always have permission
	$: isRateLimited = permissionData.isRateLimited || false;

	// Debugging information
	// $: {
	// 	console.debug('PermissionGuard Debug Info:', {
	// 		user,
	// 		config,
	// 		permissions,
	// 		permissionData,
	// 		hasPermission,
	// 		isRateLimited,
	// 		isAdmin
	// 	});
	// }
</script>

<!-- Permission Handling -->
{#if config}
	{#if hasPermission && !isRateLimited}
		<slot />
	{:else if isRateLimited}
		<p class="text-center">Rate limit reached. Please try again later.</p>
	{:else}
		<p class="text-center">You do not have the required permissions to access this content.</p>
	{/if}
{:else}
	<p class="text-center">Permission configuration is missing.</p>
{/if}
