export const ExpirationTtlSeconds = 60 * 60 * 24; // 24 hours

export function getRepoKV(locals: App.Locals): {
  getData: (key: string) => Promise<ArrayBuffer | null>;
  setData: (key: string, value: ReadableStream) => Promise<void>;
} {
  const gitRepos = locals?.runtime?.env?.GIT_REPOS;
  if (gitRepos) {
    return {
      getData: async (key: string) => {
        return gitRepos.get(key, { type: 'arrayBuffer' });
      },
      setData: async (key: string, value: ReadableStream) => {
        await gitRepos.put(key, value, { expirationTtl: ExpirationTtlSeconds });
      }
    };
  }
  throw new Error("KV binding not found in environment.");
}
