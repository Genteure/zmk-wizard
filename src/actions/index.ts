import { z } from 'astro/zod';
import { ActionError, defineAction } from 'astro:actions';
import { TURNSTILE_SECRET } from 'astro:env/server';
import { createTarGzipStream, type TarFileInput } from 'nanotar';
import { ulid } from 'ulidx';
import { createGitRepository } from '~/lib/gitrepo';
import { getRepoKV } from '~/lib/kv';
import { createZMKConfig } from '~/lib/templating';
import { validateKeyboard } from '~/lib/validators';
import { KeyboardSchema } from '~/typedef';

export const server = {
  buildRepository: defineAction({
    input: z.object({
      keyboard: KeyboardSchema,
      captcha: z.string(),
    }),
    async handler(input, context) {
      if (!input.captcha) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Captcha must be solved",
        });
      }

      if (TURNSTILE_SECRET) {
        // Validate with Cloudflare Turnstile API
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: TURNSTILE_SECRET,
            response: input.captcha,
            // TODO remoteip: context.request?.headers.get("CF-Connecting-IP")
          }),
        });
        const verifyJson = await verifyRes.json() as { success: boolean;[key: string]: any };
        if (!verifyJson.success) {
          const msg = "Captcha validation failed: " + (verifyJson["error-codes"]?.join(", ") || "unknown error");
          console.log(msg);
          throw new ActionError({
            code: "UNAUTHORIZED",
            // TODO check best practices for error messages
            // Probably not a good idea to return raw error codes?
            message: msg,
          });
        }
      }

      const errors = validateKeyboard(input.keyboard);
      if (errors.length > 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Keyboard validation failed, invalid keyboard configuration",
        });
      }

      console.log("Building repository for keyboard:", input.keyboard.name);

      const keyboardConfig = createZMKConfig(input.keyboard);
      const gitRepo = await createGitRepository(keyboardConfig);
      const tarStream = createTarGzipStream(
        Object
          .entries(gitRepo)
          .map(
            ([filePath, content]) => ({
              name: filePath,
              data: content,
            }) as TarFileInput
          )
      )

      const kv = getRepoKV(context.locals);
      const repoId = ulid();
      console.log("Storing repository in KV with id:", repoId);
      await kv.setData(repoId, tarStream);

      return {
        repoId,
      }
    }
  }),
}
