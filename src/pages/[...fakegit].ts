import type { APIRoute } from "astro";

export const prerender = true;

// ... because people are mass scanning for git repos on random domains
// putting files in public/.git/ would be easier, but git will not take files
// under another .git directory so we generate those files at build time

// TODO serve some real git data
// TODO host something on prod-git.aws-int.genteure.com

export async function getStaticPaths() {
  return [
    { params: { fakegit: '.git/config' } },
    { params: { fakegit: '.git/HEAD' } },
    { params: { fakegit: '.git/refs/heads/main' } },
  ];
}

export const GET: APIRoute = async (context) => {
  const filePath = context.params.fakegit;

  switch (filePath) {
    case '.git/config':
      return new Response(`[core]
        repositoryformatversion = 0
        filemode = true
        bare = false
        logallrefupdates = true
[remote "origin"]
        url = https://deploy-bot:9552b5638ccd7c92e1fa4821ddffa9d0@prod-git.aws-int.genteure.com/automated-deployments/zmk-wizard-public.git
        fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
        remote = origin
        merge = refs/heads/main
        vscode-merge-base = origin/main
[remote "upstream"]
        url = https://github.com/genteure/zmk-wizard.git
        fetch = +refs/heads/*:refs/remotes/upstream/*
`);
    case '.git/HEAD':
      return new Response("ref: refs/heads/main\n");
    case '.git/refs/heads/main':
      return new Response("0000000000000000000000000000000000000000\n");
    default:
      return new Response("Not Found", { status: 404 });
  }
}
