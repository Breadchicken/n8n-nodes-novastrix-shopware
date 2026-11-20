#!/usr/bin/env node
/**
 * Quickstart for trying the node locally.
 *
 * Creates an isolated n8n home with a login, a Shopware credential and the example workflows
 * from `examples/workflows`, then starts `n8n-node dev` (n8n with this package hot-reloaded).
 * Running it again refreshes the example workflows and keeps everything else.
 *
 *   npm run quickstart              # set up and start
 *   npm run quickstart -- --no-start   # set up only
 *   npm run quickstart -- --reset      # start over with an empty n8n home
 *
 * Shopware access comes from `.env` (see `.env.example`) or the environment:
 * SHOPWARE_URL, SHOPWARE_CLIENT_ID, SHOPWARE_CLIENT_SECRET. Without them a placeholder
 * credential is created that you fill in once in the n8n UI.
 *
 * Dev tooling only: not part of the published package.
 */
import { spawnSync, spawn } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
	lstatSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name;
const WORKFLOWS = join(REPO, 'examples', 'workflows');
const CREDENTIAL = { id: 'nvsQuickstartCr1', name: 'Shopware (Quickstart)' };

// Local dev login. The hash is bcrypt of PASSWORD; n8n only accepts a pre-hashed password here.
const OWNER = {
	email: 'admin@example.com',
	password: 'Quickstart123!',
	hash: '$2a$10$O4oRMg5U1FhXyMoSn1rvXO0y7IbLnGhomnSM23dYL/LJqGh3h4dP.',
};

const args = new Set(process.argv.slice(2));
const isWindows = process.platform === 'win32';

if (existsSync(join(REPO, '.env'))) {
	process.loadEnvFile(join(REPO, '.env'));
}

const defaultHome = join(homedir(), '.n8n-novastrix-shopware');
const home = resolve(process.env.N8N_QUICKSTART_FOLDER || defaultHome);
const marker = join(home, '.quickstart');
const port = process.env.N8N_PORT || '5678';

if (args.has('--reset') && existsSync(home)) {
	// Only delete folders this script created.
	if (!existsSync(marker) && home !== defaultHome) {
		fail(`${home} was not created by the quickstart, refusing to delete it`);
	}
	rmSync(home, { recursive: true, force: true });
	log(`Removed ${home}`);
}

const firstRun = !existsSync(marker);
mkdirSync(home, { recursive: true });
linkPackage();

const importDir = join(home, 'quickstart-import');
rmSync(importDir, { recursive: true, force: true });
mkdirSync(join(importDir, 'workflows'), { recursive: true });

// Credential: imported from the environment every run, or once as a placeholder.
const shop = {
	url: process.env.SHOPWARE_URL ?? '',
	clientId: process.env.SHOPWARE_CLIENT_ID ?? '',
	clientSecret: process.env.SHOPWARE_CLIENT_SECRET ?? '',
};
const hasShop = Boolean(shop.url && shop.clientId && shop.clientSecret);
if (hasShop || firstRun) {
	const data = hasShop ? shop : { url: 'http://localhost:8080', clientId: '', clientSecret: '' };
	writeJson(join(importDir, 'credentials.json'), [
		{ ...CREDENTIAL, type: 'shopwareAdminApi', data },
	]);
	n8n('import:credentials', `--input=${join(importDir, 'credentials.json')}`);
	log(hasShop ? `Credential set to ${shop.url}` : 'Placeholder credential created');
}

// Workflows are stored with the npm node type; a locally linked package registers as CUSTOM.
for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith('.json'))) {
	const workflow = JSON.parse(readFileSync(join(WORKFLOWS, file), 'utf8'));
	for (const node of workflow.nodes) {
		node.type = node.type.replace(`${PACKAGE}.`, 'CUSTOM.');
	}
	writeJson(join(importDir, 'workflows', file), workflow);
}
n8n('import:workflow', '--separate', `--input=${join(importDir, 'workflows')}`);
log('Example workflows imported');

writeFileSync(marker, 'Created by scripts/quickstart.mjs. Safe to delete with --reset.\n');

const next = hasShop
	? ''
	: `\n  Next: open Credentials > "${CREDENTIAL.name}" and enter your shop URL and integration keys\n  (or put them in .env and run the quickstart again).\n`;
log(
	`\nn8n:      http://localhost:${port}\n` +
		`Login:    ${OWNER.email} / ${OWNER.password}\n` +
		`Home:     ${home}\n${next}`,
);

if (args.has('--no-start')) {
	process.exit(0);
}

const dev = spawn('npx', ['n8n-node', 'dev', '--custom-user-folder', home], {
	cwd: REPO,
	stdio: 'inherit',
	shell: isWindows,
	env: {
		...process.env,
		N8N_INSTANCE_OWNER_MANAGED_BY_ENV: 'true',
		N8N_INSTANCE_OWNER_EMAIL: OWNER.email,
		N8N_INSTANCE_OWNER_PASSWORD_HASH: OWNER.hash,
		N8N_INSTANCE_OWNER_FIRST_NAME: 'Quickstart',
		N8N_INSTANCE_OWNER_LAST_NAME: 'Admin',
	},
});
dev.on('exit', (code) => process.exit(code ?? 0));

function linkPackage() {
	const modules = join(home, '.n8n', 'custom', 'node_modules');
	mkdirSync(modules, { recursive: true });
	const link = join(modules, PACKAGE);
	if (!lstatExists(link)) {
		symlinkSync(REPO, link, isWindows ? 'junction' : 'dir');
	}
}

function n8n(...command) {
	const result = spawnSync('npx', ['-y', 'n8n@latest', ...command], {
		cwd: home,
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		shell: isWindows,
		env: { ...process.env, N8N_USER_FOLDER: home, N8N_LOG_LEVEL: 'warn' },
	});
	if (result.status !== 0) {
		fail(`n8n ${command[0]} failed:\n${result.stdout}\n${result.stderr}`);
	}
}

function lstatExists(path) {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

function writeJson(path, value) {
	writeFileSync(path, JSON.stringify(value, null, '\t'));
}

function log(message) {
	console.log(message);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
