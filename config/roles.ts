/**
 * @file /src/config/roles.ts
 * @description Define roles and permissions for the application
 */

import type { Role } from '@src/auth/types';
import { getAllPermissions } from './permissions';

// Retrieve all permissions and their IDs
const allPermissions = getAllPermissions();
const allPermissionIds = allPermissions.map((p) => p._id);

export const roles: Role[] = [
	{
		_id: 'admin',
		name: 'Administrator',
		description: 'Full access to all system features',
		isAdmin: true, // Admin role is marked with isAdmin: true
		permissions: allPermissionIds // Admin has all permissions by storing all permission IDs
	},
	{
		_id: 'developer',
		name: 'Developer',
		description: 'Developer with some access',
		permissions: [] // Add specific permission IDs as needed
	},
	{
		_id: 'editor',
		name: 'Editor',
		description: 'Can create, read, and update content',
		permissions: [] // Add specific permission IDs as needed
	},
	{
		_id: 'user',
		name: 'User',
		description: 'Can only read content',
		permissions: [] // Add specific permission IDs as needed
	}
];

// Function to get a role by its ID
export function getRoleById(id: string): Role | undefined {
	return roles.find((role) => role._id === id);
}

// Function to get all roles
export function getAllRoles(): Role[] {
	return roles;
}

// Function to add a permission to a role by ID
export function addPermissionToRole(roleId: string, permissionId: string): void {
	const role = getRoleById(roleId);
	if (role && !role.permissions.includes(permissionId)) {
		role.permissions.push(permissionId);
	}
}
