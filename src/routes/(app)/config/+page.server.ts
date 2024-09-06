import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Permissions
import { checkUserPermission } from '@src/auth/permissionCheck';
import { registerPermissions } from '@root/config/permissions';
import { PermissionAction, PermissionType } from '@root/config/permissions';

// System Logger
import logger from '@src/utils/logger';

// Track registered permissions to avoid duplicates
const registeredPermissions = new Set<string>();

// Function to register permissions and avoid duplicates
export function registerPermissions(newPermissions: Permission[]) {
	newPermissions.forEach((permission) => {
		if (!registeredPermissions.has(permission._id)) {
			registeredPermissions.add(permission._id);
			// Add your registration logic here, such as adding to a database or global store
		}
	});
}

// Dynamically register permissions
const permissionConfigs: PermissionConfig[] = [
	{
		_id: 'collectionbuilder',
		name: 'Access Collection Builder',
		description: 'Allows access to the Collection Builder feature.',
		contextId: 'config/collectionbuilder',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	},
	{
		_id: 'graphql',
		name: 'Access GraphQL',
		description: 'Allows access to the GraphQL interface.',
		contextId: 'config/graphql',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	},
	{
		_id: 'imageeditor',
		name: 'Use Image Editor',
		description: 'Allows use of the Image Editor tool.',
		contextId: 'config/imageeditor',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	},
	{
		_id: 'dashboard',
		name: 'Access Dashboard',
		description: 'Allows access to the admin dashboard.',
		contextId: 'config/dashboard',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	},
	{
		_id: 'widgetManagement',
		name: 'Manage Widgets',
		description: 'Allows management of dashboard widgets.',
		contextId: 'config/widgetManagement',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	},
	{
		_id: 'themeManagement',
		name: 'Manage Themes',
		description: 'Allows management of site themes.',
		contextId: 'config/themeManagement',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	},
	{
		_id: 'settings',
		name: 'Manage Settings',
		description: 'Allows management of system settings.',
		contextId: 'config/settings',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	},
	{
		_id: 'accessManagement',
		name: 'Manage Access',
		description: 'Allows management of user access and roles.',
		contextId: 'config/accessManagement',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM
	}
];

// Register permissions once at initialization
registerPermissions(permissionConfigs);

export const load: PageServerLoad = async ({ cookies }) => {
	logger.debug('Starting load function for access management page');

	// Ensure the auth system is initialized
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	const session_id = cookies.get(SESSION_COOKIE_NAME);
	logger.debug(`Session ID retrieved: ${session_id}`);

	// Redirect to login if session ID is missing
	if (!session_id) {
		logger.warn('No session ID found, redirecting to login');
		throw redirect(302, '/login');
	}

	try {
		logger.info(`Validating session with ID: ${session_id}`);
		// Validate the session and retrieve the user
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn(`Invalid session for session_id: ${session_id}`);
			throw redirect(302, '/login');
		}

		logger.info(`Session is valid for user: ${user.email}`);

		// Ensure the user has a role assigned
		const userRole = user.role;
		if (!userRole) {
			logger.warn(`User role is missing for user ${user.email}`);
			throw error(403, 'User role is missing');
		}

		// Register permissions if they haven't been registered yet
		registerPermissions();

		// Prepare the user object for serialization
		const serializableUser = {
			_id: user._id.toString(),
			username: user.username,
			email: user.email,
			role: user.role,
			permissions: user.permissions
		};

		// Fetch all permissions
		const allPermissions = Array.from(registeredPermissions);
		logger.debug(`Fetched permissions: ${JSON.stringify(allPermissions)}`);

		const permissions: Record<string, { hasPermission: boolean; isRateLimited?: boolean }> = {};

		// Check permissions for each config
		for (const key in permissionConfigs) {
			const config = permissionConfigs[key];
			let hasPermission = false;

			if (userRole.toLowerCase() === 'admin') {
				hasPermission = true; // Admins should always have permission
			} else {
				// Check user permission for non-admin roles
				const permissionCheck = await checkUserPermission(serializableUser, config);
				hasPermission = permissionCheck.hasPermission;
			}

			permissions[config.contextId] = { hasPermission };
			logger.debug(`Permission check for ${config.contextId}: ${hasPermission}`);
		}

		return {
			user: serializableUser,
			permissions,
			permissionConfigs,
			allPermissions
		};
	} catch (err) {
		// Log the error and additional debugging information
		logger.error('Error during the load function:', {
			error: err instanceof Error ? err.message : JSON.stringify(err),
			stack: err instanceof Error ? err.stack : null
		});
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		throw redirect(302, '/login');
	}
};
