/**
 * Entry point of the `dev` service (see compose.yaml): install dependencies when needed,
 * build once (tsc + icons/codex files), then recompile on every change and tell n8n to
 * reload the package. The n8n Docker image has no file watcher, so hot reload goes through
 * n8n's `POST /rest/dev/reload` (enabled by N8N_DEV_RELOAD).
 *
 * Dev tooling only: not part of the published package.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';

const RELOAD_URL = process.env.N8N_RELOAD_URL || 'http://n8n:5678/rest/dev/reload';

const lock = 'node_modules/.package-lock.json';
if (!existsSync(lock) || statSync('package-lock.json').mtimeMs > statSync(lock).mtimeMs) {
	run('npm', ['ci', '--no-audit', '--no-fund']);
}
run('npm', ['run', 'build']);
writeFileSync('dist/.ready', '');

const tsc = spawn('npx', ['tsc', '--watch', '--preserveWatchOutput'], {
	stdio: ['ignore', 'pipe', 'inherit'],
});
let initial = true;
tsc.stdout.on('data', (chunk) => {
	const text = chunk.toString();
	process.stdout.write(text);
	if (/Found 0 errors\./.test(text)) {
		// The first pass only repeats the build above.
		if (initial) initial = false;
		else void reload();
	} else if (/Found \d+ errors?\./.test(text)) {
		initial = false;
	}
});
tsc.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT']) {
	process.on(signal, () => tsc.kill(signal));
}

async function reload() {
	try {
		const response = await fetch(RELOAD_URL, { method: 'POST' });
		console.log(response.ok ? 'n8n reloaded the package' : `n8n reload failed: HTTP ${response.status}`);
	} catch (error) {
		console.log(`n8n not reachable for reload (${error.cause?.code ?? error.message})`);
	}
}

function run(command, args) {
	const result = spawnSync(command, args, { stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}
