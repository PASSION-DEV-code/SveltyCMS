import { redirect, type Actions, fail } from '@sveltejs/kit';

// Auth
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { Roles } from '@src/auth/types';
import { createNewToken } from '@src/auth/tokens';
import mongoose from 'mongoose';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';
import { Model } from 'mongoose';

// Load function to check if user is authenticated
export async function load(event) {
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

	const isFirstUser = (await auth.getUserCount()) == 0;

	// 	// Superforms Validate addUserForm / change Password
	const addUserForm = await superValidate(event, zod(addUserTokenSchema));
	const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

	if (!user) {
		redirect(302, `/login`);
		return {
			user
		};
	} else {
		return {
			user: user,
			addUserForm,
			changePasswordForm,
			isFirstUser
		};
	}
}
// export async function load(event) {
// 	const allUsers = await getAllUsers();
// 	const tokens = await getTokens();

// 	// Get session data from cookies
// 	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;

// 	// Validate the user's session.
// 	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

// 	// If the user is not logged in, redirect them to the login page.
// 	if (user) redirect(302, `/login`);

// 	const isFirstUser = (await auth.getUserCount()) == 0;

// 	const AUTH_KEY = mongoose.models['auth_key'];
// 	// find user using id
// 	const userKey = await AUTH_KEY.findOne({ user_id: user._id });
// 	user.authMethod = userKey['_id'].split(':')[0];
// 	// If the user is not logged in, redirect them to the login page.
// 	if (user) redirect(302, `/login`);

// 	// Superforms Validate addUserForm / change Password
// 	const addUserForm = await superValidate(event, zod(addUserTokenSchema));
// 	const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

// 	// If user is authenticated, return the data for the page.
// 	return {
// 		user: user,
// 		addUserForm,
// 		changePasswordForm,
// 		isFirstUser,
//
// 	};
// }

// This action adds a new user to the system.
export const actions: Actions = {
	addUser: async ({ request, cookies }) => {
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
		const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

		// Validate addUserForm data
		const addUserForm = await superValidate(request, zod(addUserTokenSchema));

		// If the user is not logged in, redirect them to the login page.
		if (!user || user.role != 'admin') {
			return fail(400, { message: 'you dont have permission to add user' });
		}

		const email = addUserForm.data.email;
		const role = addUserForm.data.role as Roles;
		const expiresIn = addUserForm.data.expiresIn;

		// Calculate expiration time in seconds based on expiresIn value
		let expirationTime: number;

		switch (expiresIn) {
			case '2 hrs':
				expirationTime = 2 * 60 * 60;
				break;
			case '12 hrs': //default expires value
				expirationTime = 12 * 60 * 60;
				break;
			case '2 days':
				expirationTime = 2 * 24 * 60 * 60;
				break;
			case '1 week':
				expirationTime = 7 * 24 * 60 * 60;
				break;
			default:
				// Handle invalid expiresIn value
				return { form: addUserForm, message: 'Invalid value for token validity' };
		}
		if (await auth.checkUser({ email })) {
			return fail(400, { message: 'user already exists' });
		}

		const newUser = await auth.createUser({
			email,
			role,
			lastAuthMethod: 'password',
			is_registered: false
		});

		if (!newUser) return fail(400, { message: 'unknown error' });

		// Issue password token for new user
		const token = await createNewToken(this.Token, newUser._id, email, expirationTime * 1000);
		console.log(token); // send token to user via email

		// Send the token to the user via email.
		await fetch('/api/sendMail', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: email,
				subject: 'userToken',
				message: 'userToken',
				templateName: 'userToken',
				props: {
					email: email,
					token: token,
					role: role,
					expiresIn: expirationTime
				}
			})
		});

		return { form: addUserForm };
	},

	// This action changes the password for the current user.
	changePassword: async ({ request, cookies }) => {
		// Validate the form data.
		const changePasswordForm = await superValidate(request, zod(changePasswordSchema));
		const password = changePasswordForm.data.password;
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
		const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

		// The user's session is invalid.
		if (!user) {
			return { form: changePasswordForm, message: 'User does not exist or session expired' };
		}

		// Update the user's authentication method.
		await auth.updateUserAttributes(user, { password: password, lastAuthMethod: 'password' });

		// Return the form data.
		return { form: changePasswordForm };
	},

	deleteUser: async (event) => {
		const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
		const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

		if (!user || user.role != 'admin') {
			return fail(403);
		}
		const data = await event.request.formData();
		const ids = data.getAll('id');
		for (const id of ids) {
			auth.deleteUser(id as string);
		}
	},

	editUser: async (event) => {
		const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
		const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

		if (!user || user.role != 'admin') {
			return fail(403);
		}
		const data = await event.request.formData();
		const infos = data.getAll('info');

		for (const info_json of infos) {
			const info = JSON.parse(info_json as string) as { id: string; field: 'email' | 'role' | 'name'; value: string };

			const user = await auth.checkUser({ _id: info.id });
			console.log(user);
			user &&
				auth.updateUserAttributes(user, {
					[info.field]: info.value
				});
		}
	}
};
