import { select } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { Title } from './cli-installer.js';

// Function to dynamically import the configuration files
async function importConfig(filePath) {
	if (fs.existsSync(filePath)) {
		try {
			const configModule = await import(filePath);
			return configModule.default;
		} catch (error) {
			console.error(pc.red(`Error importing configuration file: ${error.message}`));
		}
	} else {
		console.log(pc.yellow(`Configuration file not found: ${filePath}`));
	}
	return {};
}

// Creates or overwrites a backup of a config file.
function createBackup(filePath) {
	const backupPath = path.join(process.cwd(), 'config', `${path.basename(filePath, '.ts')}.backup.ts`);
	try {
		fs.copyFileSync(filePath, backupPath);
		console.log(pc.blue(`Backup created at ${backupPath}`));
	} catch (error) {
		console.error(pc.red(`Failed to create backup: ${error.message}`));
	}
}

export const startOrInstallPrompt = async () => {
	// SveltyCMS Title
	Title();

	// Define the paths for the configuration files
	const privateConfigPath = path.join(process.cwd(), 'config', 'private.ts');
	const publicConfigPath = path.join(process.cwd(), 'config', 'public.ts');

	// Initialize configuration data objects
	let privateConfigData = {};
	let publicConfigData = {};

	// Check if the required files exist
	const privateExists = fs.existsSync(privateConfigPath);
	const publicExists = fs.existsSync(publicConfigPath);

	// Create backups and import configuration files only if they exist
	if (privateExists) {
		createBackup(privateConfigPath);
		privateConfigData = await importConfig(privateConfigPath);
	}
	if (publicExists) {
		createBackup(publicConfigPath);
		publicConfigData = await importConfig(publicConfigPath);
	}

	// Determine the message and options based on the existence of configuration files
	let message;
	let options;

	// Only add the 'Start' option if both files exist
	if (privateExists && publicExists) {
		message = pc.green('Configuration found. What would you like to do?');
		options = [
			{ value: 'install', label: 'Configure SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'start', label: 'Start SvelteCMS', hint: 'Launch your SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	} else {
		message = pc.yellow("No configuration files found. Let's get started with your setup.");
		options = [
			{ value: 'install', label: 'Setup your SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	}

	return select({
		message,
		options
	});
};