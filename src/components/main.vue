<template>
  <UApp :locale="localeMap[nav.locale]">
    <div class="isolate">
      <App />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import App from './app.vue';
import { fluent, localeBundleMap, localeMap } from './locales';
import { useNavigationStore } from './stores';

const nav = useNavigationStore();

watch(
  () => nav.locale,
  (newLocale) => {
    document.documentElement.setAttribute('lang', newLocale);
    const newBundle = localeBundleMap[newLocale];
    fluent.bundles = [newBundle, localeBundleMap['en']]; // Fallback to English for missing translations
  },
  { immediate: true }
);

// Set initial locale based on browser settings
type SupportedLocale = keyof typeof localeMap;
for (const lang of navigator.languages) {
  if (lang in localeMap) {
    nav.locale = lang as SupportedLocale;
    break;
  }

  let baseLang = lang.split('-')[0];
  if (baseLang === 'zh') {
    baseLang = 'zh-CN';
  }

  if (baseLang in localeMap) {
    nav.locale = baseLang as SupportedLocale;
    break;
  }
}

</script>
