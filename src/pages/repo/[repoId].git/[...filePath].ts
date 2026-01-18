import { type APIRoute } from "astro";
import { parseTarGzip } from "nanotar";
import { decodeTime, isValid } from "ulidx";
import { ExpirationTtlSeconds, getRepoKV } from "~/lib/kv";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const { params, locals } = context;
  const { repoId = '', filePath = '' } = params;

  if (!isValid(repoId)) {
    return new Response("[Shield Wizard] Invalid repository", {
      status: 404,
      statusText: "Not Found",
    });
  }

  const creationTime = decodeTime(repoId);

  // fast path for root
  if (filePath.trim() === '') {
    const timeText = new Date(creationTime).toISOString();
    const hoursAgo = ((Date.now() - creationTime) / (1000 * 60 * 60));
    const hostname = context.request.headers.get("host") || "shield-wizard.genteure.workers.dev";

    return new Response("[Shield Wizard]\nThere's no web interface for browsing repositories.\n" +
      "Please clone the repository using git, or import to GitHub at https://github.com/new/import\n\n" +
      `Don't know what to do? See https://${hostname}/next-steps\n\n` +
      `This repository was created at ${timeText} (${hoursAgo.toFixed(1)} hours ago)` +
      (hoursAgo < (ExpirationTtlSeconds / 3600)
        ? ` and will be deleted in ${(ExpirationTtlSeconds / 3600 - hoursAgo).toFixed(1)} hours.`
        : ", it has expired and been deleted."),
      {
        status: 404,
        statusText: "Not Found",
      });
  }

  // fast path for expired repositories
  if (Date.now() - creationTime > (ExpirationTtlSeconds * 1000)) {
    return new Response("[Shield Wizard] Link expired or repository does not exist", {
      status: 404,
      statusText: "Not Found",
    });
  }

  // fast path for known files before reading the tar
  const knownFiles = [
    'info/refs',
    'HEAD',
    'refs/heads/main',
    '.shield-wizard.json',
  ];
  if (!knownFiles.includes(filePath)) {
    const pathFragments = filePath.split('/');
    if (pathFragments.length !== 3
      || pathFragments[0] !== 'objects'
      || pathFragments[1].length !== 2
      || pathFragments[2].length !== 38) {
      return new Response("[Shield Wizard] File not found", {
        status: 404,
        statusText: "Not Found",
      });
    }
  }

  const kv = getRepoKV(locals);
  const tarBytes = await kv.getData(repoId);
  if (!tarBytes) {
    return new Response("[Shield Wizard] Repository does not exist", {
      status: 404,
      statusText: "Not Found",
    });
  }

  const files = await parseTarGzip(tarBytes)

  const fileContent = (files.filter(file => file.name === filePath))[0]?.data;
  if (!fileContent) {
    return new Response("[Shield Wizard] File not found", {
      status: 404,
      statusText: "Not Found",
    });
  }

  return new Response(fileContent.slice(0), {
    status: 200,
    headers: {
      "Content-Type":
        filePath.startsWith('objects/')
          ? "application/octet-stream"
          : "text/plain",
      "Cache-Control": `public, max-age=${ExpirationTtlSeconds}, immutable`,
    },
  });
};
