import { execSync } from 'child_process';

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

export default function versionPlugin() {
  const virtualId = 'virtual:version';
  const resolvedVirtualId = '\0' + virtualId;

  return {
    name: 'vite-plugin-version',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
      return null;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;

      const commit = safeExec('git rev-parse --verify HEAD');
      const short = commit ? safeExec('git rev-parse --short=10 HEAD') : '';
      const branch = safeExec('git rev-parse --abbrev-ref HEAD');
      const tag = safeExec('git describe --tags --abbrev=0');
      const isDirty = !!safeExec('git status --porcelain');
      const date = new Date().toISOString();

      const obj = {
        commit,
        short,
        branch,
        tag,
        dirty: isDirty,
        generatedAt: date,
      };

      return `export const version = ${JSON.stringify(obj, null, 2)};\nexport default version;`;
    },
  };
}
