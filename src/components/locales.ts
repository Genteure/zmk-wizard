import { FluentBundle } from '@fluent/bundle';
import { en, ja, zh_cn } from '@nuxt/ui/locale';
import { createFluentVue } from 'fluent-vue';

export const localeMap = {
  en,
  'zh-CN': zh_cn,
  ja,
} as const;

export const locales = Object.values(localeMap);

export type LocaleKey = keyof typeof localeMap;

export const localeBundleMap = {
  en: new FluentBundle('en'),
  'zh-CN': new FluentBundle('zh-CN'),
  ja: new FluentBundle('ja'),
} satisfies Record<LocaleKey, FluentBundle>;

export const fluent = createFluentVue({
  bundles: [localeBundleMap.en],
});
