import { z } from 'astro/zod';
import { ActionError, defineAction } from 'astro:actions';
import { createTarGzipStream } from 'nanotar';
import { ulid } from 'ulidx';
import { createGitRepository } from '~/lib/gitrepo';
import { getRepoKV } from '~/lib/kv';
import { createZMKConfig } from '~/export';
import { ValidatedKeyboardSchema } from '~/lib/validators';
import { TURNSTILE_SECRET } from 'astro:env/server';

export const server = {
  buildRepository: defineAction({
    input: z.object({
      keyboard: ValidatedKeyboardSchema,
      captcha: z.string(),
    }),
    async handler(input) {
      // captcha validation — skip verification when TURNSTILE_SECRET is not configured
      // (e.g. local dev without the secret set)
      if (TURNSTILE_SECRET) {
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: TURNSTILE_SECRET,
            response: input.captcha,
          }),
        });
        const verifyJson = await verifyRes.json() as { success: boolean; [key: string]: unknown };
        if (!verifyJson.success) {
          const msg = "Captcha validation failed: " + ((verifyJson["error-codes"] as string[])?.join(", ") || "unknown error");
          console.log(msg);
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: msg,
          });
        }
      } else if (import.meta.env.DEV) {
        // add 3 sec delay if running locally in dev mode without captcha secret
        console.log("Dev mode: adding delay to simulate captcha verification");
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 3000);
        await promise;
      }

      console.log("Building repository for keyboard:", input.keyboard.name);
      const keyboardConfig = createZMKConfig(input.keyboard);
      const gitRepo = await createGitRepository(keyboardConfig);

      gitRepo[".shield-wizard.json"] = new TextEncoder().encode(JSON.stringify(input.keyboard) + "\n");

      const tarStream = createTarGzipStream(
        Object
          .entries(gitRepo)
          .map(
            ([filePath, content]) => ({
              name: filePath,
              data: content,
            })
          )
      )

      const kv = getRepoKV();
      const repoId = ulid();
      console.log("Storing repository in KV with id:", repoId);
      await kv.setData(repoId, tarStream);

      return {
        repoId,
      }
    }
  }),
}
