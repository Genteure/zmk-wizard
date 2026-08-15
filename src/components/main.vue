<template>
  <UApp :locale="localeMap[nav.locale]">
    <div class="isolate">
      <App />
      <LayoutImportChoiceModal
        v-model:open="importChoiceOpen"
        :result="pendingImportChoice"
        @select="applyImportChoice"
      />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef, toRaw, watch } from 'vue';
import type { Key } from '~/types';
import App from './app.vue';
import LayoutImportChoiceModal from './editor/utils/LayoutImportChoiceModal.vue';
import type { ImportedLayout } from './editor/utils/layouthelper';
import { clearLayoutHash, extractLayoutChoiceFromHash } from './editor/utils/urlImport';
import { fluent, localeBundleMap, localeMap } from './locales';
import { useKeyboardStore, useNavigationStore } from './stores';

const nav = useNavigationStore();

const importChoiceOpen = ref(false);
// shallowRef: candidates are only replaced wholesale; deep reactivity would
// wrap the Key arrays in proxies that structuredClone rejects.
const pendingImportChoice = shallowRef<ImportedLayout | null>(null);

function applyImportedKeys(keys: Key[]) {
  const keyboard = useKeyboardStore();
  keyboard.$patch({ layout: structuredClone(toRaw(keys)) });
  keyboard.sortLayout();
  nav.activeTab = 'layout';
}

function applyImportChoice(choice: 'original' | 'generated') {
  const pending = pendingImportChoice.value;
  if (!pending) return;

  const keys = choice === 'original' ? pending.original : pending.generated;
  if (!keys) return;

  applyImportedKeys(keys);
  importChoiceOpen.value = false;
  pendingImportChoice.value = null;
  clearLayoutHash();
}

// Auto-import a KLE layout passed in the URL hash (e.g. from kle-ng via
// `#kle=<lz-compressed>`), then show it on the Layout tab.
onMounted(() => {
  try {
    const parsed = extractLayoutChoiceFromHash();
    if (parsed) {
      if (parsed.hasRowCol && parsed.original) {
        pendingImportChoice.value = parsed;
        importChoiceOpen.value = true;
        nav.activeTab = 'layout';
        // Keep the hash until the user confirms a choice, so a refresh while
        // the modal is open does not lose the pending import.
        return;
      }

      applyImportedKeys(parsed.generated);
    }
  }
  catch (err) {
    console.error('Failed to import layout from URL hash:', err);
  }

  clearLayoutHash();
});

watch(
  () => nav.locale,
  (newLocale) => {
    document.documentElement.setAttribute('lang', newLocale);
    const newBundle = localeBundleMap[newLocale];
    fluent.bundles = [newBundle, localeBundleMap['en']]; // Fallback to English for missing translations
  },
  { immediate: true },
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
