/**
 * @file src/databases/mongodb/mongoDBAdapter.ts
 * @description MongoDB adapter for CMS database operations and user preferences.
 *
 * This module provides an implementation of the `dbInterface` for MongoDB, handling:
 * - MongoDB connection management with retry mechanism
 * - CRUD operations for collections, drafts, revisions, and widgets
 * - Management of media storage and retrieval
 * - User, role, and permission management
 * - Management of system preferences including user screen sizes and layout preferences
 *
 * Key Features:
 * - Automatic reconnection with retry logic for MongoDB
 * - Schema definitions and model creation for various collections (e.g., Drafts, Revisions, Widgets)
 * - Handling of media files with a schema for different media types
 * - Management of authentication-related models (e.g., User, Token, Session)
 * - Default and custom theme management with database operations
 * - User preferences storage and retrieval, including layout and screen size information
 *
 * Usage:
 * This adapter is utilized when the CMS is configured to use MongoDB, providing a
 * database-agnostic interface for various database operations within the CMS.
 * The adapter supports complex queries, schema management, and handles error logging
 * and connection retries.
 */

import { privateEnv } from '@root/config/private';

// Stores
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';
import type { ScreenSize } from '@stores/screenSizeStore';
import type { UserPreferences, WidgetPreference } from '@src/stores/userPreferences';

// Database
import mongoose from 'mongoose';
import type { dbInterface } from '../dbInterface';

// System Logs
import logger from '@src/utils/logger';

import { UserSchema } from '@src/auth/mongoDBAuth/userAdapter';
import { TokenSchema } from '@src/auth/mongoDBAuth/tokenAdapter';
import { SessionSchema } from '@src/auth/mongoDBAuth/sessionAdapter';

// Theme
import { DEFAULT_THEME } from '@src/utils/utils';

// Define the media schema (assuming it's defined similarly to other schemas)
const mediaSchema = new mongoose.Schema(
	{
		url: String, // The URL of the media
		altText: String, // The alt text for the media
		createdAt: { type: Date, default: Date.now }, // The date the media was created
		updatedAt: { type: Date, default: Date.now } // The date the media was last updated
	},
	{ timestamps: true, collection: 'media' } // Explicitly set the collection name
);

// Define the Draft schema
const DraftSchema = new mongoose.Schema(
	{
		originalDocumentId: mongoose.Schema.Types.ObjectId, // The ID of the original document
		content: mongoose.Schema.Types.Mixed, // The content of the draft
		createdAt: { type: Date, default: Date.now }, // The date the draft was created
		updatedAt: { type: Date, default: Date.now }, // The date the draft was last updated
		status: { type: String, enum: ['draft', 'published'], default: 'draft' }, // The status of the draft
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'auth_users' } // The user who created the draft
	},
	{ collection: 'collection_drafts' } // Explicitly set the collection name
);

// Create Draft model
const Draft = mongoose.models.Draft || mongoose.model('Draft', DraftSchema);

// Define the Revision schema
const RevisionSchema = new mongoose.Schema(
	{
		documentId: mongoose.Schema.Types.ObjectId, // The ID of the document
		content: mongoose.Schema.Types.Mixed, // The content of the revision
		createdAt: { type: Date, default: Date.now }, // The date the revision was created
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'auth_users' } // The user who created the revision
	},
	{ collection: 'collection_revisions' } // Explicitly set the collection name
);

// Create Revision model
const Revision = mongoose.models.Revision || mongoose.model('Revision', RevisionSchema);

// Define the Widget schema
const widgetSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true }, // Name of the widget
		isActive: { type: Boolean, default: true }, // Whether the widget is active or not
		createdAt: { type: Date, default: Date.now }, // When the widget was created
		updatedAt: { type: Date, default: Date.now } // When the widget was last updated
	},
	{ timestamps: true, collection: 'system_widgets' } // Explicitly set the collection name
);

// Create Widget model
const Widget = mongoose.models.Widget || mongoose.model('Widget', widgetSchema);

export interface ThemeDocument extends Document {
	name: string;
	path: string;
	isDefault: boolean;
	createdAt: Date;
	updatedAt: Date;
}

// Define the Theme schema
const ThemeSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true }, // Name of the theme
		path: { type: String, required: true }, // Path to the theme file
		isDefault: { type: Boolean, default: false }, // Whether the theme is the default theme
		createdAt: { type: Date, default: Date.now }, // Creation timestamp
		updatedAt: { type: Date, default: Date.now } // Last updated timestamp
	},
	{ collection: 'system_themes' } // Explicitly set the collection name
);

// Create Theme model
const Theme = mongoose.models.Theme || mongoose.model('Theme', ThemeSchema);

// Define the System Preferences schema for user layout and screen size
const SystemPreferencesSchema = new mongoose.Schema(
	{
		userId: String, // User identifier
		preferences: {
			type: Map,
			of: [
				{
					id: String, // Component ID
					component: String, // Component type or name
					label: String, // Label for the component
					x: Number, // X position on the screen
					y: Number, // Y position on the screen
					w: Number, // Width of the component
					h: Number, // Height of the component
					min: { w: Number, h: Number }, // Minimum size constraints
					max: { w: Number, h: Number }, // Maximum size constraints
					movable: Boolean, // Whether the component can be moved
					resizable: Boolean, // Whether the component can be resized
					screenSize: { type: String, enum: ['mobile', 'tablet', 'desktop'] } // Screen size context
				}
			]
		}
	},
	{ collection: 'system_preferences' }
);

const SystemPreferences = mongoose.models.SystemPreferences || mongoose.model('SystemPreferences', SystemPreferencesSchema);

// Define the VirtualFolder schema
const VirtualFolderSchema = new mongoose.Schema({
	name: { type: String, required: true },
	parent: { type: mongoose.Schema.Types.ObjectId, ref: 'VirtualFolder' },
	path: { type: String, required: true }
});

const VirtualFolder = mongoose.model('VirtualFolder', VirtualFolderSchema);

export class MongoDBAdapter implements dbInterface {
	private unsubscribe: Unsubscriber | undefined;
	private collectionsInitialized = false;

	// Connect to MongoDB
	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		logger.debug('Attempting to connect to MongoDB...');
		const isAtlas = privateEnv.DB_HOST.startsWith('mongodb+srv');
		// Construct the connection string
		const connectionString = isAtlas
			? privateEnv.DB_HOST // Use DB_HOST as full connection string for Atlas
			: `${privateEnv.DB_HOST}:${privateEnv.DB_PORT}`; // Local/Docker connection
		while (attempts > 0) {
			try {
				await mongoose.connect(connectionString, {
					authSource: isAtlas ? undefined : 'admin', // Only use authSource for local connection
					user: privateEnv.DB_USER,
					pass: privateEnv.DB_PASSWORD,
					dbName: privateEnv.DB_NAME,
					maxPoolSize: privateEnv.DB_POOL_SIZE || 5
				});
				// Inform about successful connection
				logger.debug(`MongoDB adapter connected successfully to ${privateEnv.DB_NAME}`);

				return; // Connection successful, exit loop
			} catch (error) {
				attempts--;
				const err = error as Error;
				logger.error(`MongoDB adapter failed to connect. Attempts left: ${attempts}. Error: ${err.message}`);

				if (attempts <= 0) {
					const errorMsg = 'Failed to connect to the database after maximum retries.';
					logger.error(errorMsg);
					throw new Error(`MongoDB adapter failed to connect after maximum retries. Error: ${err.message}`);
				}

				// Wait before retrying only if more attempts remain
				await new Promise((resolve) => setTimeout(resolve, privateEnv.DB_RETRY_DELAY || 3000));
			}
		}
	}

	// Generate an ID using ObjectId
	generateId(): string {
		return new mongoose.Types.ObjectId().toString();
	}

	// Get collection models
	async getCollectionModels(): Promise<any> {
		logger.debug('getCollectionModels called');

		if (this.collectionsInitialized) {
			logger.debug('Collections already initialized, skipping reinitialization.');
			return mongoose.models;
		}

		return new Promise<any>((resolve, reject) => {
			this.unsubscribe = collections.subscribe(async (collections) => {
				if (collections) {
					const collectionsModels: { [key: string]: mongoose.Model<any> } = {};
					// Map to collection names only
					const collectionNames = Object.values(collections).map((collection) => collection.name);
					logger.debug('Collections found:', { collectionNames });

					for (const collection of Object.values(collections)) {
						if (!collection.name) {
							logger.warn('Collection without a name encountered:', { collection });
							continue;
						}

						logger.debug(`Setting up collection model for ${collection.name}`);

						const schemaObject = new mongoose.Schema(
							{
								createdAt: Date,
								updatedAt: Date,
								createdBy: String,
								revisionsEnabled: Boolean,
								translationStatus: {}
							},
							{
								typeKey: '$type',
								strict: true, // Enable strict mode
								timestamps: true,
								collection: collection.name.toLowerCase() // Explicitly set the collection name to avoid duplicates
							}
						);

						if (mongoose.models[collection.name]) {
							logger.debug(`Collection model for ${collection.name} already exists.`);
						} else {
							logger.debug(`Creating new collection model for ${collection.name}.`);
							collectionsModels[collection.name] = mongoose.model(collection.name, schemaObject);

							await mongoose.connection.createCollection(collection.name.toLowerCase());
							logger.info(`Collection ${collection.name} created.`);
						}

						logger.info(`Collection model for ${collection.name} set up successfully.`);
					}

					if (this.unsubscribe) {
						this.unsubscribe();
					}
					this.unsubscribe = undefined;
					this.collectionsInitialized = true;
					logger.info('MongoDB adapter collection models setup complete.');
					resolve(collectionsModels);
				} else {
					logger.warn('No collections found to set up models.');
					reject(new Error('No collections found to set up models.'));
				}
			});
		});
	}

	// Set up authentication models
	setupAuthModels(): void {
		try {
			if (!mongoose.models['auth_tokens']) {
				mongoose.model('auth_tokens', TokenSchema);
				logger.debug('Auth tokens model created.');
			} else {
				logger.debug('Auth tokens model already exists.');
			}

			if (!mongoose.models['auth_users']) {
				mongoose.model('auth_users', UserSchema);
				logger.debug('Auth users model created.');
			} else {
				logger.debug('Auth users model already exists.');
			}

			if (!mongoose.models['auth_sessions']) {
				mongoose.model('auth_sessions', SessionSchema);
				logger.debug('Auth sessions model created.');
			} else {
				logger.debug('Auth sessions model already exists.');
			}
			logger.info('Authentication models set up successfully.');
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to set up authentication models: ${err.message}`, { error: err });
			throw new Error(`Failed to set up authentication models: ${err.message}`);
		}
	}

	// Set up media models
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		mediaSchemas.forEach((schemaName) => {
			if (!mongoose.models[schemaName]) {
				mongoose.model(schemaName, mediaSchema);
				logger.debug(`Media model for ${schemaName} created.`);
			}
		});
		logger.info('Media models set up successfully.');
	}

	// Set up widget models
	setupWidgetModels(): void {
		if (!mongoose.models['system_widgets']) {
			mongoose.model('system_widgets', widgetSchema);
			logger.debug('Widget model for system_widgets created.');
		} else {
			logger.debug('Widget model already exists.');
		}
		logger.info('Widget models set up successfully.');
	}

	async getAllWidgets(): Promise<any[]> {
		try {
			return await Widget.find().lean().exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching all widgets: ${err.message}`);
			throw new Error(`Error fetching all widgets: ${err.message}`);
		}
	}

	// Set default theme
	async setDefaultTheme(themeName: string): Promise<void> {
		try {
			// First, unset the current default theme
			await Theme.updateMany({}, { $set: { isDefault: false } });

			// Then, set the new default theme
			const result = await Theme.updateOne({ name: themeName }, { $set: { isDefault: true } });

			if (result.modifiedCount === 0) {
				throw new Error(`Theme with name ${themeName} not found.`);
			}

			logger.info(`Theme ${themeName} set as default successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error setting default theme: ${err.message}`);
			throw new Error(`Error setting default theme: ${err.message}`);
		}
	}

	// Fetch default theme
	async getDefaultTheme(): Promise<ThemeDocument> {
		try {
			logger.debug('Attempting to fetch the default theme from the database...');
			let theme = await Theme.findOne({ isDefault: true }).lean<ThemeDocument>().exec();

			if (theme) {
				logger.info(`Default theme found: ${theme.name}`);
				return theme;
			}

			const count = await Theme.countDocuments();
			if (count === 0) {
				logger.warn('Theme collection is empty. Inserting default theme.');
				await this.storeThemes([DEFAULT_THEME]);
				theme = await Theme.findOne({ isDefault: true }).lean<ThemeDocument>().exec();
			}

			if (!theme) {
				logger.warn('No default theme found in database. Using DEFAULT_THEME constant.');
				return DEFAULT_THEME as ThemeDocument;
			}

			return theme;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching default theme: ${err.message}`);
			throw new Error(`Error fetching default theme: ${err.message}`);
		}
	}

	// Store themes in the database
	async storeThemes(themes: { name: string; path: string; isDefault?: boolean }[]): Promise<void> {
		try {
			// If there's a default theme in the new themes, unset the current default
			if (themes.some((theme) => theme.isDefault)) {
				await Theme.updateMany({}, { $set: { isDefault: false } });
			}

			await Theme.insertMany(
				themes.map((theme) => ({
					name: theme.name,
					path: theme.path,
					isDefault: theme.isDefault || false,
					createdAt: new Date(),
					updatedAt: new Date()
				})),
				{ ordered: false }
			); // Use ordered: false to ignore duplicates
			logger.info(`Stored ${themes.length} themes in the database.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error storing themes: ${err.message}`);
			throw new Error(`Error storing themes: ${err.message}`);
		}
	}

	// Fetch all themes
	async getAllThemes(): Promise<any[]> {
		try {
			return await Theme.find().lean().exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching all themes: ${err.message}`);
			throw new Error(`Error fetching all themes: ${err.message}`);
		}
	}

	// Install a new widget
	async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
		try {
			const widget = new Widget({
				...widgetData,
				isActive: widgetData.isActive ?? false,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			await widget.save();
			logger.info(`Widget ${widgetData.name} installed successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error installing widget: ${err.message}`);
			throw new Error(`Error installing widget: ${err.message}`);
		}
	}

	// Fetch all widgets
	async getWidgets(): Promise<any[]> {
		try {
			return await Widget.find().lean().exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching widgets: ${err.message}`);
			throw new Error(`Error fetching widgets: ${err.message}`);
		}
	}

	// Fetch active widgets
	async getActiveWidgets(): Promise<string[]> {
		try {
			const widgets = await Widget.find({ isActive: true }).lean().exec();
			return widgets.map((widget) => widget.name);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching active widgets: ${err.message}`);
			throw new Error(`Error fetching active widgets: ${err.message}`);
		}
	}

	// Activate a widget
	async activateWidget(widgetName: string): Promise<void> {
		try {
			const result = await Widget.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: new Date() } }).exec();

			if (result.modifiedCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or already active.`);
			}

			logger.info(`Widget ${widgetName} activated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error activating widget: ${err.message}`);
			throw new Error(`Error activating widget: ${err.message}`);
		}
	}

	// Deactivate a widget
	async deactivateWidget(widgetName: string): Promise<void> {
		try {
			const result = await Widget.updateOne({ name: widgetName }, { $set: { isActive: false, updatedAt: new Date() } }).exec();

			if (result.modifiedCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or already inactive.`);
			}

			logger.info(`Widget ${widgetName} deactivated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error deactivating widget: ${err.message}`);
			throw new Error(`Error deactivating widget: ${err.message}`);
		}
	}

	// Update a widget
	async updateWidget(widgetName: string, updateData: any): Promise<void> {
		try {
			const result = await Widget.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: new Date() } }).exec();

			if (result.modifiedCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or no changes applied.`);
			}

			logger.info(`Widget ${widgetName} updated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating widget: ${err.message}`);
			throw new Error(`Error updating widget: ${err.message}`);
		}
	}

	// Implementing findOne method
	async findOne(collection: string, query: object): Promise<any> {
		try {
			const model = mongoose.models[collection];
			if (!model) {
				logger.error(`Collection ${collection} does not exist.`);
				throw new Error(`Collection ${collection} does not exist.`);
			}
			return await model.findOne(query).lean().exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Error in findOne for collection ${collection}: ${err.message}`, { error: err });
			throw err;
		}
	}

	// Implementing findMany method
	async findMany(collection: string, query: object): Promise<any[]> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`findMany failed. Collection ${collection} does not exist.`);
			throw new Error(`findMany failed. Collection ${collection} does not exist.`);
		}
		return model.find(query).lean().exec();
	}

	// Implementing insertOne method
	async insertOne(collection: string, doc: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`insertOne failed. Collection ${collection} does not exist.`);
			throw new Error(`insertOne failed. Collection ${collection} does not exist.`);
		}
		try {
			return await model.create(doc);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error inserting document into ${collection}: ${err.message}`);
			throw new Error(`Error inserting document into ${collection}: ${err.message}`);
		}
	}

	// Implementing insertMany method
	async insertMany(collection: string, docs: object[]): Promise<any[]> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`insertMany failed. Collection ${collection} does not exist.`);
			throw new Error(`insertMany failed. Collection ${collection} does not exist.`);
		}
		return model.insertMany(docs);
	}

	// Implementing updateOne method
	async updateOne(collection: string, query: object, update: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`updateOne failed. Collection ${collection} does not exist.`);
			throw new Error(`updateOne failed. Collection ${collection} does not exist.`);
		}
		return model.updateOne(query, update).exec();
	}

	// Implementing updateMany method
	async updateMany(collection: string, query: object, update: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`updateMany failed. Collection ${collection} does not exist.`);
			throw new Error(`updateMany failed. Collection ${collection} does not exist.`);
		}
		return model.updateMany(query, update).exec();
	}

	// Implementing deleteOne method
	async deleteOne(collection: string, query: object): Promise<number> {
		const model = mongoose.models[collection];
		if (!model) {
			throw new Error(`Collection ${collection} not found`);
		}
		return model.deleteOne(query).then((result) => result.deletedCount);
	}

	// Implementing deleteMany method
	async deleteMany(collection: string, query: object): Promise<number> {
		const model = mongoose.models[collection];
		if (!model) {
			throw new Error(`Collection ${collection} not found`);
		}
		return model.deleteMany(query).then((result) => result.deletedCount);
	}

	// Implementing countDocuments method
	async countDocuments(collection: string, query?: object): Promise<number> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`countDocuments failed. Collection ${collection} does not exist.`);
			throw new Error(`countDocuments failed. Collection ${collection} does not exist.`);
		}
		return model.countDocuments(query).exec();
	}

	// Create a new draft
	async createDraft(content: any, originalDocumentId: string, userId: string) {
		try {
			const draft = new Draft({
				originalDocumentId,
				content,
				createdBy: userId
			});
			await draft.save();
			return draft;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error creating draft: ${err.message}`, { error: err });
			throw err;
		}
	}

	// Update a draft
	async updateDraft(draftId: string, content: any) {
		try {
			const draft = await Draft.findById(draftId);
			if (!draft) throw new Error('Draft not found');
			draft.content = content;
			draft.updatedAt = new Date();
			await draft.save();
			return draft;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating draft: ${err.message}`, { error: err });
			throw err;
		}
	}

	// Get drafts
	async publishDraft(draftId: string) {
		try {
			const draft = await Draft.findById(draftId);
			if (!draft) throw new Error('Draft not found');
			draft.status = 'published';
			await draft.save();

			const revision = new Revision({
				documentId: draft.originalDocumentId,
				content: draft.content,
				createdBy: draft.createdBy
			});
			await revision.save();
			return draft;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error publishing draft: ${err.message}`, { error: err });
			throw err;
		}
	}

	// Get drafts
	async getDraftsByUser(userId: string) {
		return await Draft.find({ createdBy: userId }).lean().exec();
	}

	// Create a new revision
	async createRevision(documentId: string, content: any, userId: string) {
		const revision = new Revision({
			documentId,
			content,
			createdBy: userId
		});
		await revision.save();
		return revision;
	}

	// Get revisions
	async getRevisions(documentId: string) {
		return await Revision.find({ documentId }).sort({ createdAt: -1 }).lean().exec();
	}

	// Get recent last 5 collections
	async getLastFiveCollections(): Promise<any[]> {
		const collections = Object.keys(mongoose.models);
		const recentCollections: any[] = [];

		for (const collectionName of collections) {
			const model = mongoose.models[collectionName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
			recentCollections.push({ collectionName, recentDocs });
		}

		return recentCollections;
	}

	// Get logged in users
	async getLoggedInUsers(): Promise<any[]> {
		const sessionModel = mongoose.models['auth_sessions'];
		return await sessionModel.find({ active: true }).lean().exec();
	}

	// Get CMS data
	async getCMSData(): Promise<any> {
		// Implement your CMS data fetching logic here
		// This is a placeholder and should be replaced with actual implementation
		return {};
	}

	// Get recent last 5 media documents
	async getLastFiveMedia(): Promise<any[]> {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const recentMedia: any[] = [];

		for (const schemaName of mediaSchemas) {
			const model = mongoose.models[schemaName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
			recentMedia.push({ schemaName, recentDocs });
			logger.debug(`Fetched recent media documents for ${schemaName}`);
		}
		return recentMedia;
	}

	// Create or update user preferences
	async setUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
		logger.debug(`Setting user preferences for userId: ${userId}`);

		await SystemPreferences.updateOne({ userId }, { $set: { preferences } }, { upsert: true });
	}

	// Retrieves system preferences for a specific user.
	async getSystemPreferences(userId: string): Promise<UserPreferences | null> {
		try {
			const preferences = await SystemPreferences.findOne({ userId }).exec();
			return preferences ? preferences.preferences : null;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to retrieve system preferences for user ${userId}. Error: ${err.message}`);
			throw new Error(`Failed to retrieve system preferences: ${err.message}`);
		}
	}

	// Updates system preferences for a specific user.
	async updateSystemPreferences(userId: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void> {
		try {
			await SystemPreferences.findOneAndUpdate({ userId }, { $set: { screenSize, preferences } }, { new: true, upsert: true }).exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to update system preferences for user ${userId}. Error: ${err.message}`);
			throw new Error(`Failed to update system preferences: ${err.message}`);
		}
	}

	// Clears system preferences for a specific user
	async clearSystemPreferences(userId: string): Promise<void> {
		try {
			await SystemPreferences.deleteOne({ userId }).exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to clear system preferences for user ${userId}. Error: ${err.message}`);
			throw new Error(`Failed to clear system preferences: ${err.message}`);
		}
	}

	// Create a virtual folder in database
	async createVirtualFolder(folderData: { name: string; parent?: string; path: string }): Promise<any> {
		const folder = new VirtualFolder(folderData);
		return await folder.save();
	}

	async getVirtualFolders(): Promise<any[]> {
		return await VirtualFolder.find().lean();
	}

	async getVirtualFolderContents(folderId: string): Promise<any[]> {
		const folder = await VirtualFolder.findById(folderId);
		if (!folder) throw new Error('Folder not found');

		const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
		const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId: folder._id }).lean());
		const results = await Promise.all(mediaPromises);
		return results.flat();
	}

	async updateVirtualFolder(folderId: string, updateData: { name?: string; parent?: string }): Promise<any> {
		return await VirtualFolder.findByIdAndUpdate(folderId, updateData, { new: true });
	}

	async deleteVirtualFolder(folderId: string): Promise<boolean> {
		const result = await VirtualFolder.findByIdAndDelete(folderId);
		return !!result;
	}

	async moveMediaToFolder(mediaId: string, folderId: string): Promise<boolean> {
		const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
		for (const type of mediaTypes) {
			const result = await mongoose.model(type).findByIdAndUpdate(mediaId, { folderId });
			if (result) return true;
		}
		return false;
	}

	async getAllMedia(): Promise<any[]> {
		// Implement fetching all media files
		const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const mediaPromises = mediaTypes.map((type) => this.findMany(type, {}));
		const results = await Promise.all(mediaPromises);
		return results.flat().map((item) => ({
			...item,
			_id: item._id.toString(),
			type: item.type || 'unknown'
		}));
	}

	async deleteMedia(mediaId: string): Promise<boolean> {
		// Implement media deletion logic
		const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		for (const type of mediaTypes) {
			const result = await this.deleteOne(type, { _id: mediaId });
			if (result > 0) return true;
		}
		return false;
	}

	async getMediaInFolder(folderId: string): Promise<any[]> {
		const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
		const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId }).lean());
		const results = await Promise.all(mediaPromises);
		return results.flat();
	}

	// Clean up and disconnect from MongoDB
	async disconnect(): Promise<void> {
		try {
			await mongoose.disconnect();
			logger.info('MongoDB adapter connection closed.');
		} catch (error) {
			const err = error as Error;
			logger.error(`Error disconnecting from MongoDB: ${err.message}`, { error: err });
			throw err;
		}
	}
}