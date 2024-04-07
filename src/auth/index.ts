import argon2 from 'argon2';
import { consumeToken, createToken, validateToken } from './tokens';
import type { Cookie, User, UserParams, Session, Model } from './types';
import mongoose from 'mongoose';
export const SESSION_COOKIE_NAME = 'auth_sessions';

// argon2 attributes
const argon2Attributes = {
	type: argon2.argon2id, // Using Argon2id variant for a balance between Argon2i and Argon2d
	timeCost: 2, // Number of iterations
	memoryCost: 2 ** 12, //using memory cost of 2^12 = 4MB
	parallelism: 2, // Number of execution threads
	saltLength: 16 // Salt length in bytes
} as { secret?: any };

export class Auth {
	private User: Model;
	private Token: Model;
	private Session: Model;

	constructor({ User, Token, Session }) {
		// Initialize the User, Token, and Session models
		this.User = User;
		this.Token = Token;
		this.Session = Session;
	}

	async createUser({ email, password, username, role, lastAuthMethod, is_registered }: Omit<User, UserParams>) {
		// Generate a unique ID for the user
		const id = new mongoose.Types.ObjectId();

		// Hash the password
		let hashed_password: string | undefined = undefined;
		if (password) {
			hashed_password = await argon2.hash(password, argon2Attributes);
		}

		// Create the User
		const user = (
			await this.User.insertMany({
				_id: id, // Use the generated ID from mongoose
				email,
				password: hashed_password,
				username,
				role,
				lastAuthMethod,
				is_registered
			})
		)?.[0];

		// Return the user object
		return user as User;
	}

	async updateUserAttributes(user: User, attributes: Partial<User>) {
		// Check if password needs updating
		if (attributes.password) {
			// Hash the password with argon2
			attributes.password = await argon2.hash(attributes.password, argon2Attributes);
		}
		// Update the user attributes
		await this.User.updateOne({ _id: user._id }, { $set: attributes });
	}

	// Delete the user from the database
	async deleteUser(id: string) {
		await this.User.deleteOne({ _id: id });
	}

	// Session Valid for 1 Hr, and only one session per device
	async createSession({ user_id, expires = 60 * 60 * 1000 }: { user_id: string; expires?: number }) {
		//console.log('createSession called', user_id, expires);

		// Generate a unique ID for the user from mongoose
		const id = new mongoose.Types.ObjectId();

		// Create the User session
		const session = await this.Session.create({
			_id: id, // Use the generated ID from mongoose
			user_id,
			expires: Date.now() + expires //Calculate expiration timestamp
		});

		// console.log('Created session:', session);

		// Return the session object
		return session as Session;
	}

	createSessionCookie(session: Session): Cookie {
		// Create a cookie object tht expires in 1 year
		const cookie: Cookie = {
			name: SESSION_COOKIE_NAME,
			value: session._id,
			attributes: {
				sameSite: 'lax',
				path: '/',
				httpOnly: true,
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // expires in 1 year
				secure: false
			}
		};

		// Return the cookie object
		return cookie;
	}

	async checkUser(fields: { email?: string; id?: string }): Promise<User | null>;

	async checkUser(fields: { email: string; id: string }): Promise<User | null> {
		// Find the user document
		const user = await this.User.findOne(fields);

		// Return the user object or null if not found
		return user;
	}

	// Get User by ID
	async getUserCount(): Promise<number> {
		return await this.User.countDocuments();
	}

	// Get All Users
	async getAllUsers(): Promise<User[]> {
		const users = await this.User.find({});
		return users;
	}

	// Delete the User Session
	async destroySession(session_id: string) {
		await this.Session.deleteOne({ _id: session_id });
	}

	// Login
	async login(email: string, password: string): Promise<User | null> {
		// Find the user document
		const user = await this.User.findOne({ email });

		// Check if user exists and password matches
		if (user && (await argon2.verify(user.password, password, argon2Attributes))) {
			// Delete the _id field before returning
			delete user._id;
			return { ...user };
		}

		// User not found or password mismatch
		return null;
	}

	// LogOut
	async logOut(session_id: string) {
		await this.Session.deleteOne({ _id: session_id }); // Delete this session
	}

	// Validate User session
	async validateSession(session_id: string): Promise<User | null> {
		// console.log('validateSession called', session_id);

		// Convert string to ObjectId
		const session_id_object = new mongoose.Types.ObjectId(session_id);

		// Retrieve the session data based on session_id
		const session = await this.Session.findOne({ _id: session_id_object });

		// Retrieve the corresponding user record based on user_id
		const user = await this.User.findOne({ _id: session.user_id });

		// Check if the user record exists
		if (!user) {
			console.error('User record not found for user_id:', session.user_id);
			return null;
		}

		// Delete the _id field before returning
		delete user._id;

		// Return the user object
		return user;
	}

	// async validateSession(session_id: string): Promise<User | null> {
	// 	console.log('validateSession called', session_id);
	// 	const resp = (
	// 		await this.Session.aggregate([
	// 			{
	// 				$match: {
	// 					_id: new mongoose.Types.ObjectId(session_id)
	// 				}
	// 			},

	// 			{
	// 				$lookup: {
	// 					from: this.User.collection.name,
	// 					localField: 'user_id',
	// 					foreignField: '_id',
	// 					as: 'user'
	// 				}
	// 			},
	// 			{
	// 				$unwind: '$user'
	// 			}
	// 		])
	// 	)?.[0];

	// 	console.log('resp', resp);
	// 	// Check if the user record exists
	// 	if (!resp || !resp.user) {
	// 		console.error('User record not found for user_id:', resp?.user?._id);
	// 		return null;
	// 	}

	// 	if (!resp) return null;
	// 	resp.user._id && delete resp.user._id;
	// 	// Return the user object
	// 	return resp.user;
	// }

	// Create a token, default expires in 30 days
	async createToken(user_id: string, expires = 60 * 60 * 1000) {
		return await createToken(this.Token, user_id, expires);
	}

	// Validate the token
	async validateToken(token: string, user_id: string) {
		return await validateToken(this.Token, token, user_id);
	}

	// Consume the token
	async consumeToken(token: string, user_id: string) {
		// Consume the token
		return await consumeToken(this.Token, token, user_id);
	}

	async invalidateAllUserSessions(user_id: string) {
		// Get all sessions for the given user ID
		const sessions = await this.Session.find({ user_id });

		// Delete all the sessions
		await Promise.all(sessions.map((session) => this.Session.deleteOne({ _id: session._id })));
	}

	async updateKeyPassword(providerId: string, providerUserId: string, newPassword: string) {
		// Get the key document for the given provider ID and provider user ID
		const user = await this.User.findOne({ providerId, providerUserId });

		// If no key was found, return an error
		if (!user) {
			return { status: false, message: 'Key not found' };
		}

		// Update the password for the key
		user.password = newPassword;

		// Save the updated key document
		await user.save();

		// Return a success message
		return { status: true, message: 'Password updated successfully' };
	}
}