import { promises as fs } from 'fs';
import { createJiti } from 'jiti';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

import type { Keyboard } from '../src/types/keyboard';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixturesRoot = path.join(repoRoot, 'examples', 'json');

const jiti = createJiti(import.meta.url, {
  cache: false,
  alias: {
    '~': path.join(repoRoot, 'src'),
    'virtual:version': path.join(__dirname, 'virtual-version-shim.ts'),
  },
});

// Deferred import so we can attach aliases for virtual modules and paths.
const { createZMKConfig } = await jiti.import('~/export') as typeof import('~/export');
const { KeyboardSchema } = await jiti.import('~/types/keyboard') as typeof import('~/types/keyboard');
const { ValidatedKeyboardSchema } = await jiti.import('~/lib/validators') as typeof import('~/lib/validators');
const { createGitRepository } = await jiti.import('~/lib/gitrepo') as typeof import('~/lib/gitrepo');

type BuildFiles = Record<string, string | Uint8Array>;

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'list':
      await handleList();
      return;
    case 'generate':
      await handleGenerate(args);
      return;
    case 'generate-all':
      await handleGenerateAll(args);
      return;
    case 'git':
      await handleGenerateGit(args);
      return;
    default:
      printUsage();
      process.exit(1);
  }
}

async function handleList(): Promise<void> {
  const files = await listFixtures();

  const listJson = JSON.stringify(files);
  console.log(listJson);
  await writeOutput('json-files', listJson);
}

async function listFixtures(): Promise<string[]> {
  const nested = await walkForJson(fixturesRoot);
  return Array.from(new Set(nested.map(toPosixRelative))).sort();
}

async function handleGenerate(args: string[]): Promise<void> {
  const [fixturePath, destRoot] = args;
  if (!fixturePath || !destRoot) {
    console.error('Usage: pnpm run smoke generate <fixture.json> <destDir>');
    process.exit(1);
  }

  console.log(`Generating repo for fixture ${fixturePath} into ${destRoot}...`);

  const keyboard = await readKeyboardFixture(fixturePath);
  const files = createZMKConfig(keyboard);
  const matrixJson = buildMatrixJson(files);

  console.log('Generated files:');
  for (const relativePath of Object.keys(files).sort()) {
    console.log(` - ${relativePath}`);
  }

  await writeVirtualRepo(files, destRoot);
  console.log(`Wrote files to ${destRoot}`);

  await writeOutput('build_matrix', matrixJson);
  console.log('Build matrix JSON:');
  console.log(matrixJson);
}

interface FixturePlanEntry {
  path: string;
  directory: string;
  matrix: unknown;
}

async function handleGenerateAll(args: string[]): Promise<void> {
  const [destRoot] = args;
  if (!destRoot) {
    console.error('Usage: pnpm run smoke generate-all <destDir>');
    process.exit(1);
  }

  const fixturePaths = await listFixtures();
  const plan: FixturePlanEntry[] = [];
  const usedDirectories = new Set<string>();
  const westManifests: unknown[] = [];

  for (const fixturePath of fixturePaths) {
    const directory = uniqueFixtureDirectory(fixturePath, usedDirectories);

    console.log(`Generating repo for fixture ${fixturePath} into ${destRoot}/${directory}...`);

    const keyboard = await readKeyboardFixture(fixturePath);
    const files = createZMKConfig(keyboard);
    const matrixJson = buildMatrixJson(files);

    const westYaml = files['config/west.yml'];
    if (typeof westYaml !== 'string') {
      throw new Error(`Fixture ${fixturePath} did not generate a string config/west.yml`);
    }
    westManifests.push(YAML.parse(westYaml));

    const fixtureDest = path.join(destRoot, directory);
    await writeVirtualRepo(files, fixtureDest);
    await fs.writeFile(path.join(fixtureDest, 'build-matrix.json'), `${matrixJson}\n`, 'utf8');

    plan.push({ path: fixturePath, directory, matrix: JSON.parse(matrixJson) });
    console.log(`Wrote files to ${fixtureDest}`);
  }

  await fs.mkdir(destRoot, { recursive: true });
  await fs.writeFile(
    path.join(destRoot, 'fixtures.txt'),
    `${plan.map(fixture => fixture.directory).join('\n')}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(destRoot, 'test-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  const mergedWestYaml = YAML.stringify(mergeWestManifests(westManifests));
  await fs.mkdir(path.join(destRoot, 'config'), { recursive: true });
  await fs.writeFile(path.join(destRoot, 'config', 'west.yml'), `${mergedWestYaml}\n`, 'utf8');
  console.log(`Generated ${plan.length} fixture repositories and a merged west workspace in ${destRoot}`);
}

function uniqueFixtureDirectory(fixturePath: string, usedDirectories: Set<string>): string {
  const base = fixturePath
    .replace(/\.json$/i, '')
    .split('/')
    .map(segment => segment.replace(/[^a-zA-Z0-9._-]+/g, '_') || '_')
    .join('/');

  let directory = base;
  for (let index = 2; usedDirectories.has(directory); index++) {
    directory = `${base}-${index}`;
  }
  usedDirectories.add(directory);
  return directory;
}

interface WestManifest {
  manifest: {
    defaults: unknown;
    remotes: unknown[];
    projects: unknown[];
    self: unknown;
  };
}

function mergeWestManifests(manifests: unknown[]): WestManifest {
  if (manifests.length === 0) {
    throw new Error('No west manifests to merge');
  }

  const parsed = manifests.map((manifest): WestManifest => {
    if (
      typeof manifest !== 'object'
      || manifest === null
      || !('manifest' in manifest)
      || typeof manifest.manifest !== 'object'
      || manifest.manifest === null
    ) {
      throw new Error('Invalid west.yml structure generated by templating');
    }

    const west = manifest.manifest as Partial<WestManifest['manifest']>;
    if (
      west.defaults === undefined
      || west.self === undefined
      || !Array.isArray(west.remotes)
      || !Array.isArray(west.projects)
    ) {
      throw new Error('Invalid west.yml defaults/remotes/projects generated by templating');
    }
    return {
      manifest: {
        defaults: west.defaults,
        remotes: west.remotes,
        projects: west.projects,
        self: west.self,
      },
    };
  });

  const defaults = parsed.map(west => stableJson(west.manifest.defaults));
  if (new Set(defaults).size !== 1) {
    throw new Error('Fixtures use different west manifest defaults; cannot share one compile workspace');
  }

  const remotes = new Map<string, unknown>();
  for (const west of parsed) {
    for (const remote of west.manifest.remotes) {
      const entry = remote as Record<string, unknown>;
      const name = String(entry.name ?? '');
      const existing = remotes.get(name);
      if (existing !== undefined && stableJson(existing) !== stableJson(remote)) {
        throw new Error(`Conflicting west remote definitions for "${name}"`);
      }
      remotes.set(name, remote);
    }
  }

  const projects = new Map<string, unknown>();
  for (const west of parsed) {
    for (const project of west.manifest.projects) {
      const entry = project as Record<string, unknown>;
      const name = String(entry.name ?? '');
      const existing = projects.get(name);
      if (existing !== undefined && stableJson(existing) !== stableJson(project)) {
        throw new Error(`Conflicting west project definitions for "${name}"`);
      }
      projects.set(name, project);
    }
  }

  return {
    manifest: {
      defaults: parsed[0].manifest.defaults,
      remotes: Array.from(remotes.values()),
      projects: Array.from(projects.values()),
      self: parsed[0].manifest.self,
    },
  };
}

function stableJson(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(sorted);
}

async function handleGenerateGit(args: string[]): Promise<void> {
  const [fixturePath, destRoot] = args;
  if (!fixturePath || !destRoot) {
    console.error('Usage: pnpm run smoke git <fixture.json> <destDir>');
    process.exit(1);
  }

  console.log(`Generating git repo for fixture ${fixturePath} into ${destRoot}...`);

  const keyboard = await readKeyboardFixture(fixturePath);
  const configFiles = createZMKConfig(keyboard);
  const gitFiles = await createGitRepository(configFiles);

  console.log('Generated git repository structure:');
  for (const relativePath of Object.keys(gitFiles).sort()) {
    console.log(` - ${relativePath}`);
  }

  await writeVirtualRepo(gitFiles, destRoot);
  console.log(`Wrote git repository to ${destRoot}`);
}

function printUsage(): void {
  console.error(`Usage: pnpm run smoke <command>

Commands:
  list                             List fixture JSON files
  generate <fixture.json> <destDir>  Generate repo files into destDir and emit build matrix JSON
  generate-all <destDir>           Generate all fixture repos plus the compile test plan into destDir
  git <fixture.json> <destDir>  Generate a local git repository into destDir from a fixture
`);
}

async function readKeyboardFixture(fixturePath: string): Promise<Keyboard> {
  const absolutePath = path.isAbsolute(fixturePath)
    ? fixturePath
    : path.join(fixturesRoot, fixturePath);

  let parsed: unknown;
  try {
    const content = await fs.readFile(absolutePath, 'utf8');
    parsed = JSON.parse(content);
  }
  catch (error) {
    console.error(`Failed to read fixture ${fixturePath}:`, error);
    process.exit(1);
  }

  // First pass: base schema validation (missing fields, type errors)
  const schema = KeyboardSchema.safeParse(parsed);
  if (!schema.success) {
    const issues = schema.error.errors
      .map(
        (issue: { path: (string | number)[]; message: string }) =>
          `${issue.path.join('.')}: ${issue.message}`,
      )
      .join('\n');
    console.error(`Invalid keyboard fixture ${fixturePath} (schema):\n${issues}`);
    process.exit(1);
  }

  // Second pass: enhanced validation with superRefine rules (name collisions,
  // module conflicts, pin constraints, controller-specific limits)
  const validated = ValidatedKeyboardSchema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map(
        (issue: { path: (string | number)[]; message: string }) =>
          `${issue.path.join('.')}: ${issue.message}`,
      )
      .join('\n');
    console.error(`Invalid keyboard fixture ${fixturePath} (validation):\n${issues}`);
    process.exit(1);
  }
  return schema.data;
}

async function walkForJson(dir: string): Promise<string[]> {
  const found: string[] = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      }
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        found.push(full);
      }
    }
  }

  return found;
}

async function writeVirtualRepo(files: BuildFiles, destRoot: string): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const fullPath = path.join(destRoot, relative);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    if (typeof content === 'string') {
      await fs.writeFile(fullPath, content, 'utf8');
    }
    else {
      await fs.writeFile(fullPath, content);
    }
  }
}

async function writeOutput(key: string, value: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await fs.appendFile(outputPath, `${key}=${value}\n`);
}

function buildMatrixJson(files: BuildFiles): string {
  const buildYaml = files['build.yaml'];
  if (!buildYaml) {
    throw new Error('build.yaml not generated by templating');
  }

  // Pre-processing to enable optional (commented-out) builds:
  // Split into lines and find `---` document separator.
  // For all lines after it, if the line starts with `#`, remove one `#`.
  const lines = buildYaml.split('\n');
  const documentStartIndex = lines.findIndex(line => line === '---');

  for (let i = documentStartIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      lines[i] = line.slice(1);
    }
  }

  const processedYaml = lines.join('\n');
  const parsed = YAML.parse(processedYaml);

  if (
    typeof parsed !== 'object'
    || parsed === null
    || Array.isArray(parsed)
    || !('include' in parsed)
  ) {
    throw new Error('build.yaml does not have expected structure');
  }

  // Remove settings_reset entries — they are identical across all builds
  // and failures would indicate a ZMK issue, not a fixture issue.
  if (Array.isArray(parsed.include)) {
    parsed.include = parsed.include.filter(
      (entry: Record<string, unknown>) => {
        if (typeof entry !== 'object' || entry === null) return true;
        if (!('shield' in entry)) return true;
        if (typeof entry.shield !== 'string') return true;
        return !(entry.shield as string).includes('settings_reset');
      },
    );
  }

  return JSON.stringify(parsed);
}

function toPosixRelative(p: string): string {
  const rel = path.relative(fixturesRoot, p);
  return rel.split(path.sep).join('/');
}

await main();
