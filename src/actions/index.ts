import { z } from 'astro/zod';
import { ActionError, defineAction } from 'astro:actions';
import { createTarGzipStream } from 'nanotar';
import { ulid } from 'ulidx';
import { createGitRepository } from '~/lib/gitrepo';
import { getRepoKV } from '~/lib/kv';
import { createZMKConfig } from '~/export';
import { ValidatedKeyboardSchema } from '~/lib/validators';
import { FEEDBACK_WEBHOOK_URL, TURNSTILE_SECRET } from 'astro:env/server';

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
        const verifyJson = await verifyRes.json() as { success: boolean;[key: string]: unknown };
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
      } else {
        console.warn("TURNSTILE_SECRET not configured, skipping captcha verification for repository build")
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
  sendFeedback: defineAction({
    input: z.object({
      type: z.enum(['bug', 'feature', 'other']),
      text: z.string().min(1, 'Feedback text is required').max(5000, 'Feedback text is too long'),
      captcha: z.string(),
      keyboardState: z.any().optional(),
      uiState: z.object({
        activeTab: z.string().optional(),
        activePart: z.number().nullable().optional(),
      }).optional(),
    }),
    async handler(input, context) {
      // captcha validation
      if (TURNSTILE_SECRET) {
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: TURNSTILE_SECRET,
            response: input.captcha,
          }),
        });
        const verifyJson = await verifyRes.json() as { success: boolean;[key: string]: unknown };
        if (!verifyJson.success) {
          const msg = "Captcha validation failed: " + ((verifyJson["error-codes"] as string[])?.join(", ") || "unknown error");
          console.log(msg);
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: msg,
          });
        }
      } else if (import.meta.env.DEV) {
        console.log("Dev mode: adding delay to simulate captcha verification");
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 3000);
        await promise;
      } else {
        console.warn("TURNSTILE_SECRET not configured, skipping captcha verification for feedback submission");
      }

      // Build Discord embed
      const typeLabels: Record<string, string> = {
        bug: 'Bug Report',
        feature: 'Feature Request',
        other: 'Other / Not Sure',
      };
      const colorMap: Record<string, number> = {
        bug: 0xf54242,    // red
        feature: 0x42a5f5, // blue
        other: 0x9e9e9e,  // grey
      };

      const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Type', value: typeLabels[input.type] || input.type, inline: true },
      ];
      // Raw Accept-Language header from the request
      const acceptLanguage = context.request.headers.get('Accept-Language');
      if (acceptLanguage) {
        fields.push({ name: 'Locale', value: acceptLanguage, inline: true });
      }
      const host = context.request.headers.get('Host');
      if (host) {
        fields.push({ name: 'Host', value: host, inline: true });
      }
      if (input.uiState?.activeTab) {
        fields.push({ name: 'Active Tab', value: input.uiState.activeTab, inline: true });
      }
      if (input.uiState?.activePart !== undefined && input.uiState.activePart !== null) {
        fields.push({ name: 'Active Part', value: String(input.uiState.activePart), inline: true });
      }

      // Keyboard state: inline summary only; full JSON attached as a file
      const kb = input.keyboardState;
      if (kb) {
        const parts: string[] = [];
        if (kb.name) parts.push(`Name: ${kb.name}`);
        if (kb.shield) parts.push(`Shield: ${kb.shield}`);
        if (kb.layout?.length) parts.push(`Keys: ${kb.layout.length}`);
        if (kb.parts?.length) parts.push(`Parts: ${kb.parts.length}`);

        // if parts is array and parts[n].controller is string, list controllers for each part
        if (Array.isArray(kb.parts)) {
          const controllers: string[] = [];
          (kb.parts as Array<{ controller?: unknown }>).forEach((part, index) => {
            if (typeof part.controller === 'string') {
              controllers.push(`${part.controller}`);
            } else {
              controllers.push(`(unknown)`);
            }
          });
          if (controllers.length) {
            parts.push(`Controllers: ${controllers.join(', ')}`);
          }
        }

        fields.push({ name: 'Keyboard State', value: parts.join('\n') });
      }

      // Feedback text in description (last field, may be large)
      const textValue = input.text.slice(0, 1500);
      fields.push({ name: 'Feedback', value: textValue || '(empty)' });

      const embed = {
        title: '📬 New Feedback',
        color: colorMap[input.type] || 0x9e9e9e,
        fields,
        timestamp: new Date().toISOString(),
      };

      const payload: Record<string, unknown> = { embeds: [embed] };

      if (FEEDBACK_WEBHOOK_URL) {
        try {
          const form = new FormData();
          form.append('payload_json', JSON.stringify(payload));

          // Attach full keyboard state JSON as a file
          if (input.keyboardState) {
            const jsonBlob = new Blob(
              [JSON.stringify(input.keyboardState)],
              { type: 'application/json' },
            );
            form.append('files[0]', jsonBlob, 'keyboard.json');
          }

          const res = await fetch(FEEDBACK_WEBHOOK_URL, {
            method: 'POST',
            body: form,
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => 'unknown');
            console.log(`Feedback webhook failed (${res.status}): ${errText}`);
            throw new Error('Webhook returned non-OK status');
          }
        } catch (error) {
          console.log('Failed to send feedback webhook:', error);
          throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send feedback' });
        }
      } else {
        console.log('FEEDBACK_WEBHOOK_URL not configured, logging feedback:', JSON.stringify(payload));
      }

      return { success: true };
    },
  }),
}
