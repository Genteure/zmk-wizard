import { type VirtualBinaryFolder, type VirtualFolder } from "../typedef";

type VirtualTreeItem = VirtualTreeFolder | VirtualTreeFile;

type VirtualTreeFolder = {
  type: 'folder';
  items: Record<string, VirtualTreeItem>;
};

type VirtualTreeFile = {
  type: 'file';
  content: string | Uint8Array;
};

function convertFlatToTree(vfs: VirtualFolder): VirtualTreeFolder {
  const root: VirtualTreeFolder = {
    type: 'folder',
    items: {}
  };

  for (const [filePath, content] of Object.entries(vfs) as [string, string | Uint8Array][]) {
    const parts = filePath.split('/');
    let currentFolder: VirtualTreeFolder = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!currentFolder.items[part]) {
        currentFolder.items[part] = { type: 'folder', items: {} };
      }
      currentFolder = currentFolder.items[part] as VirtualTreeFolder;
    }

    const fileName = parts[parts.length - 1];
    currentFolder.items[fileName] = {
      type: 'file',
      content: content,
    };
  }

  return root;
}

async function createGitObject(
  type: 'blob' | 'tree' | 'commit',
  content: Uint8Array
): Promise<{ hash: string; content: Uint8Array }> {
  const header = `${type} ${content.length}\0`;
  const headerBytes = new TextEncoder().encode(header);

  const fullContent = new Uint8Array(headerBytes.length + content.length);
  fullContent.set(headerBytes);
  fullContent.set(content, headerBytes.length);

  const hashBuffer = await crypto.subtle.digest('SHA-1', fullContent);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return { hash, content: fullContent };
}

async function createGitTree(
  entries: { mode: string; name: string; hash: string }[]
): Promise<{ hash: string; content: Uint8Array }> {
  entries.sort((a, b) => {
    const aname = a.mode === '40000' ? `${a.name}/` : a.name;
    const bname = b.mode === '40000' ? `${b.name}/` : b.name;
    return aname < bname ? -1 : (aname > bname ? 1 : 0);
  });

  let totalLength = 0;
  const stringParts: Uint8Array[] = [];
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const entryString = `${entry.mode} ${entry.name}\0`;
    const encodedString = encoder.encode(entryString);
    totalLength += encodedString.length + 20;
    stringParts.push(encodedString);
  }

  const treeContent = new Uint8Array(totalLength);
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const strBytes = stringParts[i];

    treeContent.set(strBytes, offset);
    offset += strBytes.length;

    for (let j = 0; j < 40; j += 2) {
      const byte = parseInt(entry.hash.substring(j, j + 2), 16);
      treeContent[offset++] = byte;
    }
  }

  return createGitObject('tree', treeContent);
}

async function createGitCommit(
  treeHash: string,
  author: string,
  message: string
): Promise<{ hash: string; content: Uint8Array }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const timezone = "+0000";

  const commitBody =
    `tree ${treeHash}\n` +
    `author ${author} ${timestamp} ${timezone}\n` +
    `committer ${author} ${timestamp} ${timezone}\n\n` +
    `${message}\n`;

  return createGitObject('commit', new TextEncoder().encode(commitBody));
}

async function deflateData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(data.slice(0));
  writer.close();

  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function createGitRepository(files: VirtualFolder): Promise<VirtualBinaryFolder> {
  const allObjects = new Map<string, Uint8Array>();
  const fileTree = convertFlatToTree(files);

  async function processTree(node: VirtualTreeItem): Promise<string> {
    if (node.type === 'file') {
      const fileContentBytes = typeof node.content === 'string'
        ? new TextEncoder().encode(node.content)
        : node.content;
      const { hash, content } = await createGitObject('blob', fileContentBytes);
      allObjects.set(hash, content);
      return hash;
    } else {
      const entries: { mode: string; name: string; hash: string }[] = [];

      for (const [name, child] of Object.entries(node.items)) {
        const childHash = await processTree(child);
        const mode = child.type === 'file' ? '100644' : '40000';
        entries.push({ mode, name, hash: childHash });
      }

      const { hash, content } = await createGitTree(entries);
      allObjects.set(hash, content);
      return hash;
    }
  }

  const rootTreeHash = await processTree(fileTree);

  // TODO update author?
  // TODO update commit message
  const author = "Shield Wizard for ZMK <helpfulguy@zmkwizard.genteure.com>";
  const { hash: commitHash, content: commitContent } = await createGitCommit(
    rootTreeHash,
    author,
    "Initial commit"
  );
  allObjects.set(commitHash, commitContent);

  const repo: VirtualBinaryFolder = Object.fromEntries([
    ['HEAD', 'ref: refs/heads/main\n'],
    ['refs/heads/main', `${commitHash}\n`],
    ['info/refs', `${commitHash}\trefs/heads/main\n`],
  ].map(([k, v]) => [k, new TextEncoder().encode(v)]));

  for (const [hash, content] of allObjects) {
    const compressed = await deflateData(content);
    repo[`objects/${hash.substring(0, 2)}/${hash.substring(2)}`] = compressed;
  }

  return repo;
}
