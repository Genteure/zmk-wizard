import { FluentBundle, FluentResource } from '@fluent/bundle';
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

// Global terms that are shared across all components.
localeBundleMap.en.addResource(new FluentResource(
  `-controller = Controller
-part = Part
-encoder = Encoder
-kscan = Kscan
-firmware = Firmware
yes = Yes
no = No
cancel = Cancel
none = None
`));

localeBundleMap['zh-CN'].addResource(new FluentResource(
  `-controller = 开发板
-part = 分体
-encoder = 编码器
-kscan = Kscan
-firmware = 固件
yes = 是
no = 否
cancel = 取消
none = 无
`));

localeBundleMap.ja.addResource(new FluentResource(
  `-controller = マイコン
-part = パーツ
-encoder = エンコーダー
-kscan = Kscan
-firmware = ファームウェア
yes = はい
no = いいえ
cancel = キャンセル
none = なし
`));

export const fluent = createFluentVue({
  bundles: [localeBundleMap.en],
});
