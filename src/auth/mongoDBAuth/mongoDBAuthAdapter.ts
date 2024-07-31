import { UserModel } from './User';
import { SessionModel } from './Session';
import { TokenModel } from './Token';
import { RoleModel } from './Role';
import { PermissionModel } from './Permission';

import crypto from 'crypto';

// System Logs
import logger from '@src/utils/logger';

// Import types
import type { authDBInterface } from '../authDBInterface';
import type { User, Session, Token, Role, Permission, PermissionAction } from '../types';

// MongoDBAuthAdapter class implementing AuthDBAdapter interface
export class MongoDBAuthAdapter implements authDBInterface {
	// Initialize MongoDBAuthAdapter
	async initializeDefaultRolesAndPermissions(): Promise<void> {
		try {
			const defaultPermissions: Partial<Permission>[] = [
				{
					permission_id: 'create_content',
					name: 'create_content',
					action: 'create',
					contextId: 'global',
					contextType: 'collection',
					description: 'Create new content',
					requiredRole: '' // This will be set after role creation
				},
				{
					permission_id: 'read_content',
					name: 'read_content',
					action: 'read',
					contextId: 'global',
					contextType: 'collection',
					description: 'Read content',
					requiredRole: '' // This will be set after role creation
				},
				{
					permission_id: 'update_content',
					name: 'update_content',
					action: 'write',
					contextId: 'global',
					contextType: 'collection',
					description: 'Update existing content',
					requiredRole: '' // This will be set after role creation
				},
				{
					permission_id: 'delete_content',
					name: 'delete_content',
					action: 'delete',
					contextId: 'global',
					contextType: 'collection',
					description: 'Delete content',
					requiredRole: '' // This will be set after role creation
				},
				{
					permission_id: 'manage_roles',
					name: 'manage_roles',
					action: 'manage_roles',
					contextId: 'global',
					contextType: 'system',
					description: 'Manage roles',
					requiredRole: ''
				},
				{
					permission_id: 'manage_permissions',
					name: 'manage_permissions',
					action: 'manage_permissions',
					contextId: 'global',
					contextType: 'system',
					description: 'Manage permissions',
					requiredRole: ''
				}
			];

			const defaultRoles: Partial<Role>[] = [
				{ name: 'admin', description: 'Administrator with all permissions' },
				{ name: 'developer', description: 'Developer with elevated permissions' },
				{ name: 'editor', description: 'Content editor' },
				{ name: 'user', description: 'Regular user' }
			];

			// Check if roles and permissions already exist
			const existingRoles = await this.getAllRoles();
			const existingPermissions = await this.getAllPermissions();

			logger.debug(`Existing roles: ${existingRoles.length}, Existing permissions: ${existingPermissions.length}`);

			// If no roles or permissions exist, create them
			if (existingRoles.length === 0 && existingPermissions.length === 0) {
				// Create default roles first
				const createdRoles = await Promise.all(defaultRoles.map((roleData) => this.createRole(roleData as Role)));
				logger.debug(`Created ${createdRoles.length} roles`);

				// Now create permissions
				const createdPermissions = await Promise.all(defaultPermissions.map((perm) => this.createPermission(perm as Permission)));
				logger.debug(`Created ${createdPermissions.length} permissions`);

				// Find the admin role
				const adminRole = createdRoles.find((role) => role.name === 'admin');

				if (adminRole) {
					logger.debug(`Admin role found with ID: ${adminRole.role_id}`);
					// Assign all permissions to admin
					for (const perm of createdPermissions) {
						await this.assignPermissionToRole(adminRole.role_id, perm.permission_id);
						logger.debug(`Permission ${perm.permission_id} assigned to role ${adminRole.role_id}`);
					}
				} else {
					throw new Error('Admin role not created');
				}

				logger.info('Default roles and permissions initialized');
			} else {
				logger.info('Roles and permissions already exist, skipping initialization');
			}
		} catch (error) {
			logger.error(`Error initializing default roles and permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Helper method to convert the database result to Session
	private convertToSession(sessionData: any): Session {
		return {
			session_id: sessionData._id.toString(),
			user_id: sessionData.user_id,
			expires: sessionData.expires
		};
	}

	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const user = new UserModel(userData);
			await user.save();
			logger.info(`User created: ${user.email}`);
			return user.toObject() as User;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to create user with email ${userData.email}: ${err.message}`);
			throw error;
		}
	}
	// Update attributes of an existing user
	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<User> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $set: attributes });
			logger.debug(`User attributes updated: ${user_id}`);
			// Return the updated user
			const user = await this.getUserById(user_id);
			if (!user) {
				throw new Error('User not found');
			}
			return user;
		} catch (error) {
			logger.error(`Failed to update user attributes: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Delete a user by ID
	async deleteUser(user_id: string): Promise<void> {
		try {
			await UserModel.deleteOne({ _id: user_id });
			logger.info(`User deleted: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get a user by ID
	async getUserById(user_id: string): Promise<User | null> {
		try {
			const user = await UserModel.findById(user_id);
			logger.debug(`User retrieved by ID: ${user_id}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			logger.error(`Failed to get user by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get a user by email
	async getUserByEmail(email: string): Promise<User | null> {
		try {
			const user = await UserModel.findOne({ email });
			logger.debug(`User retrieved by email: ${email}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			logger.error(`Failed to get user by email: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get all users
	async getAllUsers(): Promise<User[]> {
		try {
			const users = await UserModel.find().lean();
			logger.debug('All users retrieved');
			return users.map((user) => user.toObject() as User);
		} catch (error) {
			logger.error(`Failed to get all users: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get the total number of users
	async getUserCount(): Promise<number> {
		try {
			const count = await UserModel.countDocuments();
			logger.debug(`User count retrieved: ${count}`);
			return count;
		} catch (error) {
			logger.error(`Failed to get user count: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Create a new session for a user
	async createSession(sessionData: { user_id: string; expires: number }): Promise<Session> {
		try {
			const expiresAt = new Date(Date.now() + sessionData.expires);
			const session = new SessionModel({
				user_id: sessionData.user_id,
				expires: expiresAt
			});
			await session.save();
			logger.debug(`Session created for user: ${sessionData.user_id}, expires at: ${expiresAt}`);

			// Convert the Mongoose document to a plain JavaScript object
			const sessionObject = session.toObject();

			// Return the session object with the correct shape
			return {
				session_id: sessionObject._id.toString(),
				user_id: sessionObject.user_id,
				expires: sessionObject.expires
			};
		} catch (error) {
			logger.error(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session> {
		try {
			const newExpiryDate = new Date(Date.now() + newExpiry);
			const updatedSession = await SessionModel.findByIdAndUpdate(session_id, { $set: { expires: newExpiryDate } }, { new: true, lean: true }).exec();

			if (!updatedSession) {
				logger.error(`Session not found for update: ${session_id}`);
				throw new Error('Session not found');
			}

			logger.debug(`Session ${session_id} expiry updated to: ${newExpiryDate}`);
			return this.convertToSession(updatedSession);
		} catch (error) {
			logger.error(`Failed to update session expiry: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<number> {
		try {
			const result = await SessionModel.deleteMany({ expires: { $lte: new Date() } });
			logger.info(`Deleted ${result.deletedCount} expired sessions`);
			return result.deletedCount;
		} catch (error) {
			logger.error(`Failed to delete expired sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Destroy a session by ID
	async destroySession(session_id: string): Promise<void> {
		try {
			await SessionModel.deleteOne({ _id: session_id });
			logger.debug(`Session destroyed: ${session_id}`);
		} catch (error) {
			logger.error(`Failed to destroy session: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Validate a session by ID
	async validateSession(session_id: string): Promise<User | null> {
		try {
			const session = await SessionModel.findById(session_id);
			if (!session || session.expires <= new Date()) {
				if (session) await SessionModel.deleteOne({ _id: session_id });
				logger.warn(`Session invalid or expired: ${session_id}`);
				return null;
			}
			const user = await UserModel.findById(session.user_id);
			logger.debug(`Session validated for user: ${session.user_id}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			logger.error(`Failed to validate session:${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await SessionModel.deleteMany({ user_id });
			logger.debug(`All sessions invalidated for user: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to invalidate all sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get all active sessions for a user
	async getActiveSessions(user_id: string): Promise<Session[]> {
		try {
			const sessions = await SessionModel.find({
				user_id,
				expires: { $gt: new Date() }
			})
				.lean()
				.exec();

			logger.debug(`Active sessions retrieved for user: ${user_id}`);

			return sessions.map(this.convertToSession);
		} catch (error) {
			logger.error(`Failed to get active sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Create a new token for a user
	async createToken(data: { user_id: string; email: string; expires: number }): Promise<string> {
		try {
			const tokenString = crypto.randomBytes(16).toString('hex'); // Generate a secure token string
			const token = new TokenModel({
				user_id: data.user_id,
				token: tokenString,
				email: data.email,
				expires: new Date(Date.now() + data.expires) // Calculate the expiration time from the current time
			});
			await token.save();
			logger.debug(`Token created for user: ${data.user_id}`);
			return tokenString; // Return the newly created token string
		} catch (error) {
			logger.error(`Failed to create token: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Validate a token
	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		try {
			const tokenDoc = await TokenModel.findOne({ token, user_id });
			if (tokenDoc) {
				const message = tokenDoc.expires > new Date() ? 'Token is valid' : 'Token is expired';
				logger.debug(`Token validation result for user: ${user_id}, message: ${message}`);
				return { success: tokenDoc.expires > new Date(), message };
			} else {
				const message = 'Token does not exist';
				logger.warn(`Token validation result for user: ${user_id}, message: ${message}`);
				return { success: false, message };
			}
		} catch (error) {
			logger.error(`Failed to validate token: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		try {
			const tokenDoc = await TokenModel.findOneAndDelete({ token, user_id });
			if (tokenDoc) {
				const message = tokenDoc.expires > new Date() ? 'Token is valid' : 'Token is expired';
				logger.debug(`Token consumed for user: ${user_id}, message: ${message}`);
				return { status: tokenDoc.expires > new Date(), message };
			} else {
				const message = 'Token does not exist';
				logger.warn(`Token consumption result for user: ${user_id}, message: ${message}`);
				return { status: false, message };
			}
		} catch (error) {
			logger.error(`Failed to consume token: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get all tokens
	async getAllTokens(): Promise<Token[]> {
		try {
			const tokens = await TokenModel.find();
			logger.debug('All tokens retrieved');
			return tokens.map((token) => token.toObject() as Token);
		} catch (error) {
			logger.error(`Failed to get all tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Delete expired tokens
	async deleteExpiredTokens(): Promise<number> {
		try {
			const result = await TokenModel.deleteMany({ expires: { $lte: new Date() } });
			logger.debug(`Deleted ${result.deletedCount} expired tokens`);
			return result.deletedCount;
		} catch (error) {
			logger.error(`Failed to delete expired tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Create a new role
	async createRole(roleData: Partial<Role>, currentUserId: string): Promise<Role> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_roles'))) {
			throw new Error('Unauthorized: User does not have permission to manage roles');
		}
		try {
			logger.debug(`Creating role: ${JSON.stringify(roleData)}`);
			const role = new RoleModel(roleData);
			await role.save();
			logger.info(`Role created: ${role.name} with ID: ${role._id}`);
			return role.toObject();
		} catch (error) {
			logger.error(`Failed to create role: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Update a role
	async updateRole(role_id: string, roleData: Partial<Role>, currentUserId: string): Promise<void> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_roles'))) {
			throw new Error('Unauthorized: User does not have permission to manage roles');
		}
		try {
			await RoleModel.updateOne({ _id: role_id }, { $set: roleData });
			logger.debug(`Role updated: ${role_id}`);
		} catch (error) {
			logger.error(`Failed to update role: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Delete a role
	async deleteRole(role_id: string, currentUserId: string): Promise<void> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_roles'))) {
			throw new Error('Unauthorized: User does not have permission to manage roles');
		}
		try {
			await RoleModel.deleteOne({ _id: role_id });
			logger.debug(`Role deleted: ${role_id}`);
		} catch (error) {
			logger.error(`Failed to delete role: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get a role by ID
	async getRoleById(role_id: string): Promise<Role | null> {
		try {
			const role = await RoleModel.findById(role_id).populate('permissions');
			logger.debug(`Role retrieved by ID: ${role_id}`);
			return role ? (role.toObject() as Role) : null;
		} catch (error) {
			logger.error(`Failed to get role by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get a role by name
	async getRoleByName(name: string): Promise<Role | null> {
		try {
			const role = await RoleModel.findOne({ name }).populate('permissions');
			logger.debug(`Role retrieved by name: ${name}`);
			return role ? (role.toObject() as Role) : null;
		} catch (error) {
			logger.error(`Failed to get role by name: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get all roles
	async getAllRoles(): Promise<Role[]> {
		try {
			const roles = await RoleModel.find().populate('permissions');
			logger.debug('All roles retrieved');
			return roles.map((role) => role.toObject() as Role);
		} catch (error) {
			logger.error(`Failed to get all roles: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Create a new permission
	async createPermission(permissionData: Partial<Permission>, currentUserId: string): Promise<Permission> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_permissions'))) {
			throw new Error('Unauthorized: User does not have permission to manage permissions');
		}
		try {
			logger.debug(`Creating permission: ${JSON.stringify(permissionData)}`);
			const permission = new PermissionModel(permissionData);
			await permission.save();
			logger.info(`Permission created: ${permission.name} with ID: ${permission._id}`);
			return permission.toObject();
		} catch (error) {
			logger.error(`Failed to create permission: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Update a permission
	async updatePermission(permission_id: string, permissionData: Partial<Permission>, currentUserId: string): Promise<void> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_permissions'))) {
			throw new Error('Unauthorized: User does not have permission to manage permissions');
		}
		try {
			await PermissionModel.updateOne({ _id: permission_id }, { $set: permissionData });
			logger.debug(`Permission updated: ${permission_id}`);
		} catch (error) {
			logger.error(`Failed to update permission: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Delete a permission
	async deletePermission(permission_id: string, currentUserId: string): Promise<void> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_permissions'))) {
			throw new Error('Unauthorized: User does not have permission to manage permissions');
		}
		try {
			await PermissionModel.deleteOne({ _id: permission_id });
			logger.debug(`Permission deleted: ${permission_id}`);
		} catch (error) {
			logger.error(`Failed to delete permission: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get a permission by ID
	async getPermissionById(permission_id: string): Promise<Permission | null> {
		try {
			const permission = await PermissionModel.findById(permission_id);
			logger.debug(`Permission retrieved by ID: ${permission_id}`);
			return permission ? (permission.toObject() as Permission) : null;
		} catch (error) {
			logger.error(`Failed to get permission by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get a permission by name
	async getPermissionByName(name: string): Promise<Permission | null> {
		try {
			const permission = await PermissionModel.findOne({ name });
			logger.debug(`Permission retrieved by name: ${name}`);
			return permission ? (permission.toObject() as Permission) : null;
		} catch (error) {
			logger.error(`Failed to get permission by name: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get all roles for a permission
	async getRolesForPermission(permission_id: string): Promise<Role[]> {
		try {
			const roles = await RoleModel.find({ permissions: permission_id }).populate('permissions');
			logger.debug(`Roles retrieved for permission: ${permission_id}`);
			return roles.map((role) => role.toObject() as Role);
		} catch (error) {
			logger.error(`Failed to get roles for permission: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get users with a permission
	async getUsersWithPermission(permission_id: string): Promise<User[]> {
		try {
			const users = await UserModel.find({
				$or: [{ permissions: permission_id }, { roles: { $in: await RoleModel.find({ permissions: permission_id }).distinct('_id') } }]
			});
			logger.debug(`Users retrieved with permission: ${permission_id}`);
			return users.map((user) => user.toObject() as User);
		} catch (error) {
			logger.error(`Failed to get users with permission: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Assign a role to a user
	async assignRoleToUser(user_id: string, role_id: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $addToSet: { roles: role_id } });
			logger.debug(`Role ${role_id} assigned to user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to assign role to user: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Remove a role from a user
	async removeRoleFromUser(user_id: string, role_id: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $pull: { roles: role_id } });
			logger.debug(`Role ${role_id} removed from user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to remove role from user: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get all roles for a user
	async getRolesForUser(user_id: string): Promise<Role[]> {
		try {
			const user = await UserModel.findById(user_id).populate('roles');
			logger.debug(`Roles retrieved for user: ${user_id}`);
			return user ? (user.roles as Role[]) : [];
		} catch (error) {
			logger.error(`Failed to get roles for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get users with a role
	async getUsersWithRole(role_id: string): Promise<User[]> {
		try {
			const users = await UserModel.find({ roles: role_id });
			logger.debug(`Users retrieved with role: ${role_id}`);
			return users.map((user) => user.toObject() as User);
		} catch (error) {
			logger.error(`Failed to get users with role: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get all permissions
	async getAllPermissions(): Promise<Permission[]> {
		try {
			const permissions = await PermissionModel.find();
			logger.debug('All permissions retrieved');
			return permissions.map((permission) => permission.toObject() as Permission);
		} catch (error) {
			logger.error(`Failed to get all permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get permissions for a role
	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		try {
			const role = await RoleModel.findById(role_id).populate('permissions');
			logger.debug(`Permissions retrieved for role: ${role_id}`);
			return role ? (role.permissions as Permission[]) : [];
		} catch (error) {
			logger.error(`Failed to get permissions for role: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Assign a permission to a role
	async assignPermissionToRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_roles')) || !(await this.checkUserPermission(currentUserId, 'manage_permissions'))) {
			throw new Error('Unauthorized: User does not have permission to assign permissions to roles');
		}
		try {
			logger.debug(`Attempting to assign permission ${permission_id} to role ${role_id}`);

			// First, check if the role exists
			const roleExists = await RoleModel.exists({ _id: role_id });
			if (!roleExists) {
				logger.warn(`Role ${role_id} not found when assigning permission ${permission_id}`);
				throw new Error(`Role ${role_id} not found`);
			}

			// Then, check if the permission exists
			const permissionExists = await PermissionModel.exists({ _id: permission_id });
			if (!permissionExists) {
				logger.warn(`Permission ${permission_id} not found when assigning to role ${role_id}`);
				throw new Error(`Permission ${permission_id} not found`);
			}

			// If both exist, proceed with the assignment
			const result = await RoleModel.findByIdAndUpdate(
				role_id,
				{ $addToSet: { permissions: permission_id } },
				{ new: true } // This option returns the updated document
			);

			if (result) {
				logger.info(`Permission ${permission_id} successfully assigned to role ${role_id}`);
			} else {
				// This shouldn't happen as we've already checked for existence, but just in case
				logger.warn(`Unexpected: Role ${role_id} not found when assigning permission ${permission_id}`);
				throw new Error(`Unexpected: Role ${role_id} not found`);
			}
		} catch (error) {
			logger.error(`Failed to assign permission ${permission_id} to role ${role_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Remove a permission from a role
	async removePermissionFromRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
		if (!(await this.checkUserPermission(currentUserId, 'manage_roles')) || !(await this.checkUserPermission(currentUserId, 'manage_permissions'))) {
			throw new Error('Unauthorized: User does not have permission to remove permissions from roles');
		}
		try {
			await RoleModel.updateOne({ _id: role_id }, { $pull: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} removed from role ${role_id}`);
		} catch (error) {
			logger.error(`Failed to remove permission from role: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Check user permission
	async checkUserPermission(user_id: string, requiredAction: PermissionAction): Promise<boolean> {
		try {
			const user = await UserModel.findById(user_id).populate({
				path: 'roles',
				populate: { path: 'permissions' }
			});
			if (!user) return false;

			const isAdmin = user.roles?.some((role) => role.name.toLowerCase() === 'admin');
			if (isAdmin) return true;

			const hasDirectPermission = user.permissions?.some((p) => p.action === requiredAction);
			if (hasDirectPermission) return true;

			return user.roles?.some((role) => role.permissions?.some((p) => p.action === requiredAction)) || false;
		} catch (error) {
			logger.error(`Failed to check user permission: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Check user role
	async checkUserRole(user_id: string, role_name: string): Promise<boolean> {
		try {
			const user = await UserModel.findById(user_id).populate('roles');
			if (!user) return false;

			return user.roles?.some((role) => role.name === role_name) || false;
		} catch (error) {
			logger.error(`Failed to check user role: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Assign a permission to a user
	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $addToSet: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} assigned to user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to assign permission to user: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Remove a permission from a user
	async removePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await UserModel.updateOne({ _id: user_id }, { $pull: { permissions: permission_id } });
			logger.debug(`Permission ${permission_id} removed from user ${user_id}`);
		} catch (error) {
			logger.error(`Failed to remove permission from user: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	// Get permissions for a user
	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		try {
			const user = await UserModel.findById(user_id).populate('permissions');
			logger.debug(`Permissions retrieved for user: ${user_id}`);
			return user ? (user.permissions as Permission[]) : [];
		} catch (error) {
			logger.error(`Failed to get permissions for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}
}