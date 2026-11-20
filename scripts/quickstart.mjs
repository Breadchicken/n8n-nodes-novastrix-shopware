#!/usr/bin/env node
/**
 * Quickstart inside the n8n container (see compose.yaml).
 *
 * Imports a Shopware credential and the example workflows from `examples/workflows` into
 * the running n8n. The `n8n` service runs it with --boot after `n8n start` (docker/n8n-start.sh):
 *
 *   docker compose up -d                                   # first start imports everything
 *   docker compose exec n8n node <package>/scripts/quickstart.mjs   # re-import later
 *   docker compose down -v && docker compose up -d         # start over with empty n8n data
 *
 * The example workflows are imported on the first start only, because re-importing a workflow
 * unpublishes it (and removes the webhooks of a published trigger). The credential is updated on
 * every start when `.env` has SHOPWARE_URL, SHOPWARE_CLIENT_ID and SHOPWARE_CLIENT_SECRET;
 * without them a placeholder is created once. A shop URL on localhost is rewritten to
 * host.docker.internal, so the container reaches a shop running on the host.
 *
 * Dev tooling only: not part of the published package.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name;
const WORKFLOWS = join(REPO, 'examples', 'workflows');
const CREDENTIAL = { id: 'nvsQuickstartCr1', name: 'Shopware (Quickstart)' };

const args = new Set(process.argv.slice(2));
const boot = args.has('--boot');

if (existsSync(join(REPO, '.env'))) {
	process.loadEnvFile(join(REPO, '.env'));
}

const home = join(process.env.N8N_USER_FOLDER || process.env.HOME || '/home/node', '.n8n');
const marker = join(home, '.quickstart');
const firstRun = !existsSync(marker);

const importDir = join(tmpdir(), 'quickstart-import');
rmSync(importDir, { recursive: true, force: true });
mkdirSync(join(importDir, 'workflows'), { recursive: true });

// Credential: imported from the environment every run, or once as a placeholder.
const shop = {
	url: dockerHost(process.env.SHOPWARE_URL ?? ''),
	clientId: process.env.SHOPWARE_CLIENT_ID ?? '',
	clientSecret: process.env.SHOPWARE_CLIENT_SECRET ?? '',
};
const hasShop = Boolean(shop.url && shop.clientId && shop.clientSecret);
if (hasShop || firstRun) {
	const data = hasShop
		? shop
		: { url: 'http://host.docker.internal:8080', clientId: '', clientSecret: '' };
	writeJson(join(importDir, 'credentials.json'), [
		{ ...CREDENTIAL, type: 'shopwareAdminApi', data },
	]);
	n8n('import:credentials', `--input=${join(importDir, 'credentials.json')}`);
	log(hasShop ? `Credential set to ${shop.url}` : 'Placeholder credential created');
}

// Workflows are stored with the npm node type; a locally mounted package registers as CUSTOM.
if (firstRun || !boot) {
	for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith('.json'))) {
		const workflow = JSON.parse(readFileSync(join(WORKFLOWS, file), 'utf8'));
		for (const node of workflow.nodes) {
			node.type = node.type.replace(`${PACKAGE}.`, 'CUSTOM.');
		}
		writeJson(join(importDir, 'workflows', file), workflow);
	}
	n8n('import:workflow', '--separate', `--input=${join(importDir, 'workflows')}`);
	log('Example workflows imported');
}

writeFileSync(marker, 'Created by scripts/quickstart.mjs. Remove the n8n volume to start over.\n');

const next = hasShop
	? ''
	: `\n  Next: open Credentials > "${CREDENTIAL.name}" and enter your shop URL and integration keys\n  (or put them in .env and restart the n8n container).\n`;
log(
	`\nn8n:      http://${process.env.N8N_BIND_ADDRESS || 'localhost'}:${process.env.N8N_PORT || '5678'}\n` +
		`Login:    admin@example.com / Quickstart123!\n${next}`,
);

/** `localhost` inside the container is the container itself; the host is host.docker.internal. */
function dockerHost(url) {
	return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/i, '$1host.docker.internal');
}

function n8n(...command) {
	const result = spawnSync('n8n', command, {
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		// A running n8n (re-import via `docker compose exec`) already holds the task broker port.
		env: { ...process.env, N8N_LOG_LEVEL: 'warn', N8N_RUNNERS_BROKER_PORT: '5680' },
	});
	if (result.status !== 0) {
		fail(`n8n ${command[0]} failed:\n${result.stdout}\n${result.stderr}`);
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
