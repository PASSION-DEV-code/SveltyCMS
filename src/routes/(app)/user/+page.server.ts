/**
 * @file src/routes/(app)/user/+page.server.ts
 * @description Server-side logic for the user page in the application.
 *
 * This module handles the server-side operations for the user page, including:
 * - User authentication and session management
 * - Role retrieval
 * - Form validation for adding users and changing passwords
 * - First user detection
 * - Dynamic permission registration
 *
 * Features:
 * - Session validation using cookies
 * - User and role information retrieval
 * - Form handling with Superforms
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles authentication for the client-side rendering.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { User, Token } from '@src/auth/types';
import { getAllRoles } from '@root/config/roles';
import { PermissionAction, PermissionType } from '@root/config/permissions';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// Logger
import logger from '@src/utils/logger';

// Import the checkUserPermission function to check permissions
import { checkUserPermission, type PermissionConfig } from '@src/auth/permissionCheck';

// Track registered permissions to avoid duplicates
const registeredPermissions = new Set<string>();

// Dynamically register permissions for user management
const userManagementPermissions: PermissionConfig[] = [
	{
		_id: 'user:manage',
		name: 'Manage Users',
		description: 'Allows management of users.',
		action: PermissionAction.MANAGE,
		type: PermissionType.USER, // Categorize as user-level permission
		contextId: 'config/userManagement'
	}
	// Add more permissions as needed
];

function registerPermissions() {
	// Register permissions only if they haven't been registered already
	userManagementPermissions.forEach((permission) => {
		if (registeredPermissions.has(permission._id)) {
			// If permission already exists, skip the registration
			return;
		}

		// Register the new permission
		registeredPermissions.add(permission._id);
		// Add logic to register the permission in your system, if necessary
		// Example: register in a global permissions store or database
	});
}

export const load: PageServerLoad = async (event) => {
	try {
		const session_id = event.cookies.get(SESSION_COOKIE_NAME);
		logger.debug(`Session ID from cookie: ${session_id}`);

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		let user: User | null = null;
		const roles = getAllRoles(); // Fetch roles from config file
		let isFirstUser = false;
		let allUsers: User[] = [];
		let allTokens: Token[] = [];

		// Check if this is the first user, regardless of session
		const userCount = await auth.getUserCount();
		isFirstUser = userCount === 0;
		logger.debug(`Is first user: ${isFirstUser}`);

		if (session_id) {
			try {
				user = await auth.validateSession({ session_id });
				logger.debug(`User from session: ${JSON.stringify(user)}`);

				if (user) {
					logger.debug(`Roles retrieved: ${JSON.stringify(roles)}`);

					// Register user management permissions
					registerPermissions();

					// Define permission configuration for user management
					const manageUsersPermissionConfig: PermissionConfig = {
						contextId: 'config/userManagement',
						requiredRole: 'admin',
						action: 'manage',
						contextType: 'system'
					};

					// Check if the user has the required permissions
					const hasManageUsersPermission = await checkUserPermission(user, manageUsersPermissionConfig);

					// If the user is an admin or has permission, fetch all users and tokens
					if (user.role === 'admin' || hasManageUsersPermission) {
						try {
							allUsers = await auth.getAllUsers();
							logger.debug(`Retrieved ${allUsers.length} users for admin`);
						} catch (userError) {
							logger.error(`Error fetching all users: ${(userError as Error).message}`);
						}

						try {
							allTokens = await auth.getAllTokens();
							logger.debug(`Retrieved ${allTokens.length} tokens for admin`);
						} catch (tokenError) {
							logger.error(`Error fetching all tokens: ${(tokenError as Error).message}`);
						}
					}
				} else {
					logger.warn('Session is valid but user not found');
				}
			} catch (validationError) {
				logger.error(`Session validation error: ${(validationError as Error).message}`);
			}
		} else {
			logger.warn('No session found');
		}

		const addUserForm = await superValidate(event, zod(addUserTokenSchema));
		const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

		// Prepare user object for return, ensuring _id is a string
		const safeUser = user
			? {
					...user,
					_id: user._id.toString(),
					password: '[REDACTED]' // Ensure password is not sent to client
				}
			: null;

		// Format users and tokens for the admin area
		const formattedUsers = allUsers.map((user) => ({
			_id: user._id.toString(),
			blocked: user.blocked || false,
			avatar: user.avatar || null,
			email: user.email,
			username: user.username || null,
			role: user.role,
			activeSessions: user.lastActiveAt ? 1 : 0, // Placeholder for active sessions
			lastAccess: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null,
			createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
			updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null
		}));

		const formattedTokens = allTokens.map((token) => ({
			user_id: token.user_id,
			blocked: false, // Assuming tokens don't have a 'blocked' status
			email: token.email || '',
			expiresIn: token.expires ? new Date(token.expires).toISOString() : null,
			createdAt: new Date(token.token_id).toISOString(), // Assuming token_id is a timestamp
			updatedAt: new Date(token.token_id).toISOString() // Assuming tokens are not updated
		}));

		return {
			user: safeUser,
			roles: roles.map((role) => ({
				...role,
				_id: role._id.toString()
			})),
			addUserForm,
			changePasswordForm,
			isFirstUser,
			adminData:
				user?.role === 'admin' || hasManageUsersPermission
					? {
							users: formattedUsers,
							tokens: formattedTokens
						}
					: null
		};
	} catch (err) {
		logger.error('Error during load function:', err);
		return { user: null, roles: [], addUserForm: null, changePasswordForm: null, isFirstUser: false, adminData: null };
	}
};
