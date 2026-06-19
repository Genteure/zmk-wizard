import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

import { compileTemplate, parse } from 'vue/compiler-sfc';

type CompilerError = {
  message?: string;
  loc?: {
    start?: {
      line?: number;
      column?: number;
    };
  };
  line?: number;
  column?: number;
};

async function listVueFiles(directory: string, files: string[] = []): Promise<string[]> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await listVueFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.vue')) {
      files.push(fullPath);
    }
  }

  return files;
}

function formatError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const compilerError = error as CompilerError;
    const location = compilerError.loc?.start
      ? `${compilerError.loc.start.line}:${compilerError.loc.start.column}`
      : compilerError.line != null && compilerError.column != null
        ? `${compilerError.line}:${compilerError.column}`
        : '';

    return `${compilerError.message ?? 'Unknown Vue compiler error'}${location ? ` (${location})` : ''}`;
  }

  return String(error);
}

const sourceRoot = join(process.cwd(), 'src');
const vueFiles = await listVueFiles(sourceRoot);
const failures: string[] = [];

for (const file of vueFiles) {
  const source = await readFile(file, 'utf8');
  const parsed = parse(source, { filename: file });
  const fileFailures = new Set<string>();

  for (const error of parsed.errors) {
    fileFailures.add(formatError(error));
  }

  if (parsed.descriptor.template) {
    const templateResult = compileTemplate({
      source: parsed.descriptor.template.content,
      filename: file,
      id: file,
    });

    for (const error of templateResult.errors ?? []) {
      fileFailures.add(formatError(error));
    }
  }

  if (fileFailures.size > 0) {
    failures.push(`${relative(process.cwd(), file)}\n  - ${Array.from(fileFailures).join('\n  - ')}`);
  }
}

if (failures.length > 0) {
  console.error('Vue SFC validation failed:');
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log('Vue SFC validation passed: no syntax errors found in any .vue files.');
