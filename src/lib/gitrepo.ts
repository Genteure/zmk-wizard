type VirtualTreeItem = VirtualTreeFolder | VirtualTreeFile;
type VirtualTreeFolder = { type: 'folder'; items: Record<string, VirtualTreeItem> };
type VirtualTreeFile = { type: 'file'; content: string | Uint8Array<ArrayBuffer> };

// ── Byte & hash helpers ──────────────────────────────────────

function concat(arrays: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function toHex(buf: Uint8Array<ArrayBuffer>): string {
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(h: string): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(h.length / 2);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

function u32(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

async function sha1(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-1', data as Uint8Array<ArrayBuffer>));
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(data.slice(0));
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

// CRC-32 (IEEE polynomial) — used by the pack index
const CRC_TABLE: Uint32Array<ArrayBuffer> = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array<ArrayBuffer>): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Git object creation ──────────────────────────────────────

const GIT_TYPE_NUM: Record<string, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };

function convertFlatToTree(vfs: Record<string, string | Uint8Array<ArrayBuffer>>): VirtualTreeFolder {
  const root: VirtualTreeFolder = { type: 'folder', items: {} };
  for (const [path, content] of Object.entries(vfs)) {
    const parts = path.split('/');
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!dir.items[parts[i]]) dir.items[parts[i]] = { type: 'folder', items: {} };
      dir = dir.items[parts[i]] as VirtualTreeFolder;
    }
    dir.items[parts[parts.length - 1]] = { type: 'file', content };
  }
  return root;
}

async function createGitObject(
  type: 'blob' | 'tree' | 'commit',
  body: Uint8Array<ArrayBuffer>
): Promise<{ hash: string; content: Uint8Array<ArrayBuffer> }> {
  const hdr = new TextEncoder().encode(`${type} ${body.length}\0`);
  const content = concat([hdr, body]);
  return { hash: toHex(await sha1(content)), content };
}

async function createGitTree(
  entries: { mode: string; name: string; hash: string }[]
): Promise<{ hash: string; content: Uint8Array<ArrayBuffer> }> {
  // Git sorts tree entries as if directories have '/' appended to their name
  entries.sort((a, b) => {
    const an = a.mode === '40000' ? `${a.name}/` : a.name;
    const bn = b.mode === '40000' ? `${b.name}/` : b.name;
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
  const enc = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (const e of entries) {
    parts.push(enc.encode(`${e.mode} ${e.name}\0`), fromHex(e.hash));
  }
  return createGitObject('tree', concat(parts));
}

async function createGitCommit(
  treeHash: string,
  author: string,
  message: string
): Promise<{ hash: string; content: Uint8Array<ArrayBuffer> }> {
  const ts = Math.floor(Date.now() / 1000);
  const body =
    `tree ${treeHash}\n` +
    `author ${author} ${ts} +0000\n` +
    `committer ${author} ${ts} +0000\n\n` +
    `${message}\n`;
  return createGitObject('commit', new TextEncoder().encode(body));
}

// ── Packfile v2 + Pack Index v2 ──────────────────────────────
//
// Packfile layout:
//   'PACK' (4) | version 2 (4) | object count (4)
//   [ varint header(type, contentSize) | zlib(content) ] × N
//   packfile SHA-1 (20)
//
// Pack index v2 layout:
//   magic '\377tOc' (4) | version 2 (4)
//   fanout table: 256 × uint32
//   SHA-1 table: N × 20 bytes  (sorted ascending by SHA-1)
//   CRC-32 table: N × uint32   (CRC of compressed data in the pack)
//   offset table: N × uint32   (byte offset of each object in the pack)
//   pack SHA-1 (20)
//   index SHA-1 (20)
//
// Key detail: the pack stores the *raw object content* (the bytes that
// come after the "type size\0" header in a loose object).  The pack
// header's type and size fields replace the loose-object header.

/** Encode a 3-bit type and a content size into a variable-length pack header. */
function packObjectHeader(type: number, size: number): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  let byte = (type << 4) | (size & 0x0f);
  let rem = size >> 4;
  if (rem > 0) byte |= 0x80;
  bytes.push(byte & 0xff);
  while (rem > 0) {
    let b = rem & 0x7f;
    rem >>= 7;
    if (rem > 0) b |= 0x80;
    bytes.push(b & 0xff);
  }
  return Uint8Array.from(bytes);
}

interface PackEntry {
  hash: string;
  typeNum: number;
  rawContent: Uint8Array<ArrayBuffer>;   // content without the "type size\0" header
  compressed: Uint8Array<ArrayBuffer>;   // zlib(rawContent)
  packHdr: Uint8Array<ArrayBuffer>;      // variable-length type+size header for the packfile
}

async function buildPackfile(
  allObjects: Map<string, Uint8Array<ArrayBuffer>> // hash → full git object ("type size\0" + content)
): Promise<{ packfile: Uint8Array<ArrayBuffer>; index: Uint8Array<ArrayBuffer>; packHash: string }> {

  // 1. Parse each full object to extract its type and raw content,
  //    then compress just the raw content.
  const entries: PackEntry[] = [];
  for (const [hash, fullContent] of allObjects) {
    const spaceIdx = fullContent.indexOf(0x20);   // end of type name
    const nullIdx = fullContent.indexOf(0x00);    // end of "type size"
    const typeStr = new TextDecoder().decode(fullContent.subarray(0, spaceIdx));
    const typeNum = GIT_TYPE_NUM[typeStr];
    if (typeNum === undefined) continue;
    const rawContent = fullContent.subarray(nullIdx + 1);
    const packHdr = packObjectHeader(typeNum, rawContent.length);
    entries.push({
      hash,
      typeNum,
      rawContent,
      compressed: await deflate(rawContent),
      packHdr,
    });
  }

  // 2. Sort by SHA-1 hex (ascending) — required by the pack index v2 spec.
  entries.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));

  // 3. Build the packfile.
  const packChunks: Uint8Array<ArrayBuffer>[] = [
    new TextEncoder().encode('PACK'), // magic
    u32(2),                            // version
    u32(entries.length),               // object count
  ];
  let packOff = 12;
  const offsets = new Map<string, number>();
  for (const e of entries) {
    offsets.set(e.hash, packOff);
    packChunks.push(e.packHdr, e.compressed);
    packOff += e.packHdr.length + e.compressed.length;
  }

  const packBody = concat(packChunks);
  const packSha1 = await sha1(packBody);
  const packfile = concat([packBody, packSha1]);
  const packHash = toHex(packSha1);

  // 4. Build the pack index v2.
  const N = entries.length;
  const fanout = new Uint32Array(256);
  for (const e of entries) {
    const firstByte = parseInt(e.hash.substring(0, 2), 16);
    for (let i = firstByte; i < 256; i++) fanout[i]++;
  }

  const idxChunks: Uint8Array<ArrayBuffer>[] = [
    new Uint8Array([0xff, 0x74, 0x4f, 0x63]), // magic \377tOc
    u32(2),                                     // version 2
  ];
  for (let i = 0; i < 256; i++) idxChunks.push(u32(fanout[i]));      // fanout
  for (const e of entries) idxChunks.push(fromHex(e.hash));           // SHA-1s
  for (const e of entries) idxChunks.push(u32(crc32(concat([e.packHdr, e.compressed]))));  // CRC-32s
  for (const e of entries) idxChunks.push(u32(offsets.get(e.hash)!)); // offsets
  idxChunks.push(packSha1);                                           // pack checksum

  const idxBody = concat(idxChunks);
  const idxSha1 = await sha1(idxBody);
  const index = concat([idxBody, idxSha1]);

  return { packfile, index, packHash };
}

// ── Main export ──────────────────────────────────────────────

export async function createGitRepository(
  files: Record<string, string | Uint8Array<ArrayBuffer>>
): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
  const allObjects = new Map<string, Uint8Array<ArrayBuffer>>();

  async function processTree(node: VirtualTreeItem): Promise<string> {
    if (node.type === 'file') {
      const bytes = typeof node.content === 'string'
        ? new TextEncoder().encode(node.content)
        : node.content;
      const { hash, content } = await createGitObject('blob', bytes);
      allObjects.set(hash, content);
      return hash;
    }
    const entries: { mode: string; name: string; hash: string }[] = [];
    for (const [name, child] of Object.entries(node.items)) {
      const childHash = await processTree(child);
      entries.push({
        mode: child.type === 'file' ? '100644' : '40000',
        name,
        hash: childHash,
      });
    }
    const { hash, content } = await createGitTree(entries);
    allObjects.set(hash, content);
    return hash;
  }

  const rootTreeHash = await processTree(convertFlatToTree(files));

  const author = 'Shield Wizard for ZMK <helpfulguy@zmkwizard.genteure.com>';
  const { hash: commitHash, content: commitContent } = await createGitCommit(
    rootTreeHash,
    author,
    'Initial commit from Shield Wizard for ZMK',
  );
  allObjects.set(commitHash, commitContent);

  const { packfile, index, packHash } = await buildPackfile(allObjects);

  const enc = new TextEncoder();
  return {
    'HEAD': enc.encode('ref: refs/heads/main\n'),
    'refs/heads/main': enc.encode(`${commitHash}\n`),
    'info/refs': enc.encode(`${commitHash}\trefs/heads/main\n`),
    'objects/info/packs': enc.encode(`P pack-${packHash}.pack\n`),
    [`objects/pack/pack-${packHash}.pack`]: packfile,
    [`objects/pack/pack-${packHash}.idx`]: index,
  };
}
