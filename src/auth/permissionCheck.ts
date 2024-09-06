/**
 * @file src/auth/permissionCheck.ts
 * @description User permission checking utility for server-side routes.
 *
 * Provides a function to check user permissions based on their role and the required permissions for a specific action or resource.
 */

import type { User, PermissionAction, Permission } from './types';
import { PermissionType, getAllPermissions } from '@root/config/permissions'; // Import permissionsArray and PermissionType
import { authAdapter } from '@src/databases/db';
import logger from '@src/utils/logger';

// Define a PermissionConfig interface
export interface PermissionConfig {
	_id: string; // Unique identifier for the permission
	name: string; // Name of the permission
	contextId: string; // Context identifier
	action: PermissionAction; // Action that can be performed
	contextType: PermissionType; // Type of context
	requiredRole?: string; // Optional role requirement
	description?: string; // Optional description of the permission
}

// Cache to store roles and permissions temporarily
const rolePermissionCache = new Map<string, Permission[]>();

// Function to fetch and cache role permissions if not already cached
async function getCachedRolePermissions(role: string): Promise<Permission[]> {
	if (rolePermissionCache.has(role)) {
		return rolePermissionCache.get(role) as Permission[];
	}

	if (!authAdapter) {
		logger.error('Authentication adapter is not initialized.');
		throw new Error('Authentication adapter is not initialized.');
	}

	try {
		const allPermissions = getAllPermissions();
		const userRole = await authAdapter.getRoleByName(role);

		if (!userRole) {
			logger.warn(`Role ${role} not found`);
			return [];
		}

		const rolePermissions = allPermissions.filter((permission) => userRole.permissions.includes(permission._id));

		rolePermissionCache.set(role, rolePermissions);
		return rolePermissions;
	} catch (error) {
		logger.error(`Error fetching role permissions: ${(error as Error).message}`);
		throw error;
	}
}

// Function to check for self-lockout
function checkForSelfLockout(user: User, config: PermissionConfig, userPermissions: Permission[]): boolean {
	if (config.requiredRole !== 'admin' && user.role === config.requiredRole) {
		return userPermissions.every(
			(permission) => permission._id !== config.contextId || permission.action !== config.action || permission.contextType !== config.contextType
		);
	}
	return false;
}

// Main function to check user permissions
export async function checkUserPermission(user: User, config: PermissionConfig): Promise<{ hasPermission: boolean; isRateLimited: boolean }> {
	try {
		if (user.role === 'admin') {
			return { hasPermission: true, isRateLimited: false };
		}

		if (!authAdapter) {
			logger.error('Authentication adapter is not initialized.');
			return { hasPermission: false, isRateLimited: false };
		}

		const userPermissions = await getCachedRolePermissions(user.role);

		if (checkForSelfLockout(user, config, userPermissions)) {
			logger.error(`User ${user.email} attempted a self-lockout by role change`);
			return { hasPermission: false, isRateLimited: false };
		}

		const hasPermission = userPermissions.some(
			(permission) =>
				permission._id === config.contextId &&
				permission.action === config.action &&
				(permission.contextType === config.contextType || permission.contextType === PermissionType.SYSTEM)
		);

		if (!hasPermission) {
			logger.warn(`User ${user.email} lacks required permission for ${config.contextId}`);
		}

		return { hasPermission, isRateLimited: false };
	} catch (error) {
		logger.error(`Error checking user permission: ${(error as Error).message}`);
		return { hasPermission: false, isRateLimited: false };
	}
}
