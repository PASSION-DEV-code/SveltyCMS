/**
 * @file src/auth/drizzelDBAuth/Schema.ts
 * @description Drizzle ORM schema definitions for authentication-related tables.
 *
 * This module defines the database schema for:
 * - Users
 * - Sessions
 * - Tokens
 *
 * Features:
 * - Table definitions using Drizzle ORM syntax
 * - Relationships between tables
 * - Index definitions for optimized queries
 *
 * Usage:
 * Imported by the Drizzle auth adapter to create and interact with the database schema
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Define the Users table
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	password: text('password'),
	role: text('role').notNull(),
	username: text('username'),
	firstName: text('first_name'),
	lastName: text('last_name'),
	locale: text('locale'),
	avatar: text('avatar'),
	lastAuthMethod: text('last_auth_method'),
	lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }),
	isRegistered: integer('is_registered', { mode: 'boolean' }),
	failedAttempts: integer('failed_attempts').default(0),
	blocked: integer('blocked', { mode: 'boolean' }).default(false),
	resetRequestedAt: integer('reset_requested_at', { mode: 'timestamp' }),
	resetToken: text('reset_token'),
	lockoutUntil: integer('lockout_until', { mode: 'timestamp' }),
	is2FAEnabled: integer('is_2fa_enabled', { mode: 'boolean' }).default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Define the Sessions table
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	expires: integer('expires', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Define the Tokens table
export const tokens = sqliteTable('tokens', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	token: text('token').notNull(),
	type: text('type').notNull(),
	expires: integer('expires', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Create indexes for optimizing queries
export const indexes = {
	userIndex: index(users, ['email']),
	sessionUserIdIndex: index(sessions, ['userId']),
	tokenUserIdIndex: index(tokens, ['userId'])
};
