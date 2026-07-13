<template>
  <UApp :locale="localeMap[nav.locale]">
    <div class="isolate">
      <App />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import App from './app.vue';
import { fluent, localeBundleMap, localeMap } from './locales';
import { useKeyboardStore, useNavigationStore } from './stores';
import { extractLayoutFromHash, clearLayoutHash } from './editor/utils/urlImport';

const nav = useNavigationStore();

// Auto-import a KLE layout passed in the URL hash (e.g. from kle-ng via
// `#kle=<lz-compressed>`), then show it on the Layout tab.
onMounted(() => {
  try {
    const keys = extractLayoutFromHash();
    if (keys && keys.length) {
      const keyboard = useKeyboardStore();
      keyboard.$patch({ layout: keys });
      keyboard.sortLayout();
      nav.activeTab = 'layout';
    }
  } catch (err) {
    console.error('Failed to import layout from URL hash:', err);
  } finally {
    clearLayoutHash();
  }
});

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
