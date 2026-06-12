// Re-applies hand edits the regenerated android/ folder needs. Idempotent.
// Runs as part of `npm run sync` (after `cap sync android`).
//  1. SCHEDULE_EXACT_ALARM permission — without it local-notifications v6+
//     schedules inexact, non-waking alarms and closed-app reminders never fire.
//  2. Copies bundled notification tones into res/raw (channels reference them).
//  3. Adds a files-path entry to file_paths.xml (custom sound on Android 9-).
import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
if (!existsSync(android)) { console.error('android/ missing — run `npx cap add android` first'); process.exit(1); }

// 1. manifest permission
const manifestPath = join(android, 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('SCHEDULE_EXACT_ALARM')) {
  manifest = manifest.replace('</manifest>',
    '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n</manifest>');
  writeFileSync(manifestPath, manifest);
  console.log('patched: SCHEDULE_EXACT_ALARM added to AndroidManifest.xml');
} else console.log('ok: SCHEDULE_EXACT_ALARM already in manifest');

// 2. bundled tones -> res/raw
const soundsDir = join(root, 'resources', 'sounds');
const rawDir = join(android, 'app', 'src', 'main', 'res', 'raw');
mkdirSync(rawDir, { recursive: true });
let copied = 0;
for (const f of readdirSync(soundsDir).filter(f => f.endsWith('.wav'))) {
  copyFileSync(join(soundsDir, f), join(rawDir, f));
  copied++;
}
console.log(`ok: ${copied} sound file(s) -> res/raw`);

// 3. files-path for FileProvider (custom sound fallback on Android < 10)
const fpPath = join(android, 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml');
let fp = readFileSync(fpPath, 'utf8');
if (!fp.includes('files-path')) {
  fp = fp.replace('</paths>', '    <files-path name="files" path="." />\n</paths>');
  writeFileSync(fpPath, fp);
  console.log('patched: files-path added to file_paths.xml');
} else console.log('ok: files-path already in file_paths.xml');
