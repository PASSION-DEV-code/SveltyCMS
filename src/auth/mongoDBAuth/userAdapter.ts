/**
 * @file src/auth/mongoDBAuth/userAdapter.ts
 * @description MongoDB adapter for user-related operations.
 *
 * This module provides functionality to:
 * - Create, update, delete, and retrieve users
 * - Manage user schemas and models
 * - Handle user authentication and permissions
 *
 * Features:
 * - CRUD operations for users
 * - User schema definition
 * - Password hashing and verification
 * - Integration with MongoDB through Mongoose
 *
 * Usage:
 * Utilized by the auth system to manage user accounts in a MongoDB database.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// Types
import type { User } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import logger from '@utils/logger';

// Define the User schema
export const UserSchema = new Schema(
	{
		email: { type: String, required: true, unique: true }, // User's email, required field
		password: { type: String }, // User's password, optional field
		role: { type: String, required: true }, // User's role, required field
		permissions: [{ type: String }], // User-specific permissions as names, optional field
		username: String, // User's username, optional field
		firstName: String, // First name of the user
		lastName: String, // Last name of the user
		locale: String, // Locale of the user
		avatar: String, // URL of the user's avatar, optional field
		lastAuthMethod: String, // Last authentication method used by the user, optional field
		lastActiveAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Last time the user was active as Unix timestamp, optional field
		expiresAt: { type: Number }, // Expiry timestamp for the user in seconds, optional field
		isRegistered: Boolean, // Registration status of the user, optional field
		failedAttempts: { type: Number, default: 0 }, // Number of failed login attempts, optional field
		blocked: Boolean, // Whether the user is blocked, optional field
		resetRequestedAt: { type: Number }, // Last time the user requested a password reset as Unix timestamp, optional field
		resetToken: String, // Token for resetting the user's password, optional field
		lockoutUntil: { type: Number }, // Lockout timestamp for the user as Unix timestamp, optional field
		is2FAEnabled: Boolean // Whether the user has 2FA enabled, optional field
	},
	{ timestamps: true }
);

export class UserAdapter implements Partial<authDBInterface> {
	private UserModel: Model<User & Document>;

	constructor() {
		this.UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserSchema);
	}

	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const user = new this.UserModel(userData);
			await user.save();
			logger.info(`User created: ${user.email}`);
			return user.toObject() as User;
		} catch (error) {
			logger.error(`Failed to create user: ${userData.email}`, { error });
			throw new Error(`Failed to create user: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
		}
	}

	// Edit a user
	async updateUserAttributes(user_id: string, userData: Partial<User>): Promise<User> {
		try {
			const user = await this.UserModel.findByIdAndUpdate(user_id, userData, { new: true }).lean();
			if (!user) {
				throw new Error(`User not found for ID: ${user_id}`);
			}
			logger.debug(`User attributes updated: ${user_id}`);
			return user;
		} catch (error) {
			logger.error(`Failed to update user attributes for user ID: ${user_id}`, { error });
			throw new Error(`Failed to update user attributes: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
		}
	}

	// Change user password
	async changePassword(user_id: string, newPassword: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { password: newPassword });
			logger.info(`Password changed for user: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to change password: ${(error as Error).message}`);
			throw error;
		}
	}

	// Block a user
	async blockUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { blocked: true });
			logger.info(`User blocked: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to block user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Unblock a user
	async unblockUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndUpdate(user_id, { blocked: false });
			logger.info(`User unblocked: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to unblock user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete a user
	async deleteUser(user_id: string): Promise<void> {
		try {
			await this.UserModel.findByIdAndDelete(user_id);
			logger.info(`User deleted: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to delete user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a user by ID
	async getUserById(user_id: string): Promise<User | null> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			logger.debug(`User retrieved by ID: ${user_id}`);
			return user ? (user as User) : null;
		} catch (error) {
			logger.error(`Failed to get user by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a user by email
	async getUserByEmail(email: string): Promise<User | null> {
		try {
			const user = await this.UserModel.findOne({ email }).lean();
			logger.debug(`User retrieved by email: ${email}`);
			return user ? (user as User) : null;
		} catch (error) {
			logger.error(`Failed to get user by email: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all users with optional filtering, sorting, and pagination
	async getAllUsers(options?: {
		limit?: number;
		skip?: number;
		sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][];
		filter?: Record<string, unknown>;
	}): Promise<User[]> {
		try {
			let query = this.UserModel.find(options?.filter || {}).lean();

			if (options?.sort) {
				query = query.sort(options.sort as any);
			}
			if (typeof options?.skip === 'number') {
				query = query.skip(options.skip);
			}
			if (typeof options?.limit === 'number') {
				query = query.limit(options.limit);
			}

			const users = await query.exec();
			logger.debug('All users retrieved');
			return users;
		} catch (error) {
			logger.error(`Failed to get all users: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get the count of users
	async getUserCount(filter?: Record<string, unknown>): Promise<number> {
		try {
			const count = await this.UserModel.countDocuments(filter || {});
			logger.debug(`User count retrieved: ${count}`);
			return count;
		} catch (error) {
			logger.error(`Failed to get user count: ${(error as Error).message}`);
			throw error;
		}
	}

	// Fetch the last 5 users who logged in
	async getRecentUserActivities(): Promise<User[]> {
		try {
			const recentUsers = await this.UserModel.find({ lastActiveAt: { $ne: null } })
				.sort({ lastActiveAt: -1 })
				.limit(5)
				.select('email username lastActiveAt')
				.lean();

			logger.debug('Retrieved recent user activities');
			return recentUsers as User[];
		} catch (error) {
			logger.error(`Failed to retrieve recent user activities: ${(error as Error).message}`);
			throw error;
		}
	}

	// Check user role
	async checkUserRole(user_id: string, role_name: string): Promise<boolean> {
		try {
			const user = await this.UserModel.findById(user_id).lean();
			return user?.role === role_name;
		} catch (error) {
			logger.error(`Failed to check user role: ${(error as Error).message}`);
			throw error;
		}
	}
}
