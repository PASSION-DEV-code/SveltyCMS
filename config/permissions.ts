/**
 * @file /config/permissions.ts
 * @description Configuration for the Permissions section
 */

import type { Permission } from '@src/auth/types'; // Import Permission type from the centralized types file
import logger from '@src/utils/logger'; // Import your logger here

// Used to categorize permissions based on the type of resource or area they apply to
export enum PermissionType {
	COLLECTION = 'collection', // Collection-related permissions
	USER = 'user', // User-related permissions
	CONFIGURATION = 'configuration', // Configuration-related permissions
	SYSTEM = 'system' // System-wide permissions
}

// Define the various actions that can be associated with permissions.
// These actions represent the operations that users can perform on a resource.
export enum PermissionAction {
	CREATE = 'create', // Grants the ability to create a new resource or record.
	READ = 'read', // Grants the ability to read or view a resource or record.
	UPDATE = 'update', // Grants the ability to modify or update an existing resource or record.
	DELETE = 'delete', // Grants the ability to remove or delete a resource or record.
	MANAGE = 'manage', // Grants overarching control over a resource or area, typically used for admin purposes.
	SHARE = 'share', // Grants the ability to share a resource or record with others, typically used for collaboration.
	ACCESS = 'access' // Grants basic access to a resource or area, typically used for admin purposes.
}

// Using a Set to avoid manual duplicate checks and improve performance
const permissions = new Set<string>(); // Store only the permission IDs (or unique keys) to ensure uniqueness

// Function to register new permissions
export function registerPermission(newPermission: Permission): void {
	if (!newPermission || !newPermission._id) {
		logger.warn('Attempted to register an invalid permission:', newPermission);
		return;
	}

	if (permissions.has(newPermission._id)) {
		logger.info(`Permission "${newPermission.name}" (ID: ${newPermission._id}) already exists. Skipping registration.`);
	} else {
		permissions.add(newPermission._id);
		logger.info(`Permission "${newPermission.name}" (ID: ${newPermission._id}) registered successfully.`);
		// If needed, store or process the permission further here
	}
}

// Function to register multiple permissions
export function registerPermissions(newPermissions: Permission[]): void {
	logger.debug(`Registering multiple permissions: ${newPermissions.length} permissions provided.`);

	// Log the stack trace to see where this function is being called from
	logger.debug('Debug: registerPermissions called', { stack: new Error().stack });

	newPermissions.forEach(registerPermission);
	logger.info(`Total registered permissions after registration: ${permissions.size}`);
}

// Function to get all permissions as an array
export function getAllPermissions(): Permission[] {
	logger.debug('getAllPermissions called, returning all registered permissions.');

	// Assuming full permission objects are stored somewhere else
	// Here, replace this with your logic to retrieve the full Permission objects
	// Example placeholder:
	// return Array.from(permissions).map(id => permissionStore.get(id));

	// Since this code does not actually store the full Permission objects, the return value is a placeholder
	return []; // Modify this line according to your actual implementation
}
