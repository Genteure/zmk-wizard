<template>
  <div class="inline-flex items-center">
    <!-- Error modal -->
    <UModal v-model:open="errorModalOpen" title="Validation Errors" :close="true">
      <template #body>
        <div class="flex flex-col gap-4 text-sm">
          <div v-for="(errors, groupName) in validationErrorGroups" :key="groupName">
            <h4 class="font-semibold text-sm mb-1.5">{{ groupName }}</h4>
            <ul class="list-disc list-inside space-y-1">
              <li v-for="err in errors" :key="err" class="text-error leading-relaxed">{{ err }}</li>
            </ul>
          </div>
        </div>
      </template>
    </UModal>

    <UDropdownMenu v-model:open="dropdownOpen" size="lg" :items="menuItems" :content="{ align: 'end', sideOffset: 8 }"
      @update:open="onDropdownOpenChange">
      <UButton color="primary" size="xl" variant="outline" :loading="isBuilding">
        {{ $t('build') }}
      </UButton>
    </UDropdownMenu>


    <!-- Import link slideover -->
    <USlideover v-model:open="slideoverOpen" :title="$t('build-import-link')" side="right" class="max-w-xl"
      description="Get a link to a hosted git repository with your keyboard configuration">
      <template #body>
        <div class="flex h-full flex-col gap-6 m-4">

          <div class="flex flex-col gap-4">
            <template v-if="!importResultUrl">

              <div class="flex items-center justify-center">
                <div style="width: 300px; height: 65px; position: relative;">
                  <span
                    class="absolute left-0 right-0 top-0 bottom-0 flex items-center justify-center rounded-sm bg-accented"
                    style="z-index:0;">
                    Loading Captcha...
                  </span>

                  <div v-if="slideoverOpen" class="absolute left-0 right-0 top-0 bottom-0" style="z-index:1;">
                    <VueTurnstile v-model="captchaToken" :site-key="PUBLIC_TURNSTILE_SITEKEY" theme="auto" size="normal"
                      @expired="captchaToken = ''" />
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-center pt-2">
                <UButton :label="$t('import-generate-link')" color="primary" size="lg" :loading="isBuilding"
                  :disabled="isBuilding || !captchaToken" @click="submitBuild" />
              </div>

              <div class="text-xs text-toned flex flex-col gap-1 justify-center items-center text-center px-2">
                <div>
                  Creating hosted repository is captcha protected to prevent abuse.
                </div>
                <div>
                  Repository link expires after 24 hours.
                </div>
                <div class="mt-2">
                  Not working? You can also download the configuration as a ZIP archive.
                </div>
              </div>

            </template>
            <template v-else>
              <!-- <div class="flex items-center gap-2 py-1">
                < -- <span class="min-w-0 flex-1 truncate font-mono text-sm text-primary">{{ importResultUrl }}</span> -- >
                <UInput v-model="importResultUrl" readonly class="flex-1 min-w-0 font-mono text-sm" />
                <UButton icon="i-lucide-copy" size="sm" color="neutral" variant="ghost" class="shrink-0"
                  @click="copyImportLink" />
              </div> -->

              <div class="flex items-center justify-center">

                <UInput icon="i-lucide-folder-git-2" v-model="importResultUrl" readonly
                  class="font-mono max-w-sm flex-1" size="lg" ref="importLinkInput" @focus="selectImportLinkText">
                  <template #trailing>
                    <UTooltip text="Copy to clipboard" :content="{ side: 'right' }">
                      <UButton color="neutral" variant="link" size="sm" icon="i-lucide-copy"
                        aria-label="Copy to clipboard" @click="copyImportLink" />
                    </UTooltip>
                  </template>
                </UInput>
              </div>

              <div class="flex flex-col items-center justify-center mt-4 gap-2">
                <div class="text-sm text-toned">
                  Repository created at {{
                    new Date(decodeTime(navigation.build.repoId)).toISOString() }}
                </div>
                <div class="text-sm text-toned">
                  Repository link expires at {{
                    new Date(decodeTime(navigation.build.repoId) + 24 * 60 * 60 * 1000).toISOString() }}
                </div>
                <UButton size="sm" color="neutral" variant="outline" @click="resetImportFlow">
                  Create Another Repository
                </UButton>
              </div>

              <!-- <p class="text-xs text-toned">[Placeholder: link note]</p> -->

              <div class="flex items-center justify-end gap-2 pt-2">
                <!-- <UButton :label="$t('close')" color="neutral" variant="ghost" @click="slideoverOpen = false" /> -->
                <!-- <UButton :label="$t('create-import-link')" color="primary" variant="outline" @click="resetImportFlow" /> -->
              </div>

            </template>
          </div>


          <!-- Placeholder for additional content -->

          <UStepper orientation="vertical" :items="stepperItems" disabled model-value="0" class="w-full" />

          <div class="border-t border-default pt-4" v-for="i in 6" :key="i">
            Lorem ipsum dolor sit amet, consectetur adipisicing elit. Facere cupiditate consequuntur hic. Non
            perferendis minima
            commodi necessitatibus. Ipsum, perspiciatis laboriosam a vel, rem cum iste modi aliquid perferendis ut
            incidunt.
          </div>

          <div class="border-t border-default pt-4 pb-8">
            <h3 class="text-base font-semibold">[Placeholder: bottom section title]</h3>
            <p class="mt-1 text-sm text-toned">[Placeholder: static instructions intro]</p>

            <div class="mt-4 flex flex-col gap-3">
              <p class="text-sm font-medium">[Placeholder: section label]</p>
              <div class="flex items-start gap-3">
                <span class="text-xs font-semibold text-toned shrink-0 mt-0.5">1.</span>
                <div>
                  <p class="text-sm font-medium">[Placeholder step 1 title]</p>
                  <p class="text-xs text-toned">[Placeholder step 1 description]</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <span class="text-xs font-semibold text-toned shrink-0 mt-0.5">2.</span>
                <div>
                  <p class="text-sm font-medium">[Placeholder step 2 title]</p>
                  <p class="text-xs text-toned">[Placeholder step 2 description]</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <span class="text-xs font-semibold text-toned shrink-0 mt-0.5">3.</span>
                <div>
                  <p class="text-sm font-medium">[Placeholder step 3 title]</p>
                  <p class="text-xs text-toned">[Placeholder step 3 description]</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, StepperItem } from '@nuxt/ui';
import type { Keyboard } from '~/types';
import { useFluent } from 'fluent-vue';
import { computed, nextTick, ref, watch } from 'vue';
import VueTurnstile from 'vue-turnstile';
import { PUBLIC_TURNSTILE_SITEKEY } from 'astro:env/client';
import { actions } from 'astro:actions';
import JSZip from 'jszip';
import { useKeyboardStore, useNavigationStore } from '../stores';
import { ValidatedKeyboardSchema } from '~/lib/validators';
import { createZMKConfig } from '~/export';
import { decodeTime } from 'ulidx';

const { $t } = useFluent();
const keyboard = useKeyboardStore();
const navigation = useNavigationStore();

const dropdownOpen = ref(false);
const errorModalOpen = ref(false);
const validationErrorGroups = ref<Record<string, string[]>>({});
const validatedData = ref<Keyboard | null>(null);

const slideoverOpen = ref(false);
const isBuilding = ref(false);
const importError = ref<string | null>(null);
const captchaToken = ref('');
const importLinkInput = ref<{ $el?: Element } | null>(null);
const importResultUrl = computed(() => {
  if (!navigation.build.repoId) return '';
  const baseUrl = window.location.origin;
  return `${baseUrl}/repo/${navigation.build.repoId}.git`;
});

function onDropdownOpenChange(open: boolean) {
  if (!open) return;

  const result = ValidatedKeyboardSchema.safeParse(keyboard.$state);

  if (!result.success) {
    // Group errors: part-specific → by part name, others → General
    const groups: Record<string, string[]> = {};

    for (const issue of result.error.issues) {
      const path = issue.path;
      let groupName: string;
      if (path[0] === 'parts' && typeof path[1] === 'number') {
        const partIndex = path[1];
        const part = keyboard.parts[partIndex];
        groupName = part?.name
          ? `Keyboard Part ${partIndex} (${part.name})`
          : `Keyboard Part ${partIndex}`;
      } else {
        groupName = 'General';
      }

      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(issue.message);
    }

    validationErrorGroups.value = groups;
    errorModalOpen.value = true;
    validatedData.value = null;
    dropdownOpen.value = false;
    return;
  }

  validatedData.value = result.data as unknown as Keyboard;
}
function downloadZip() {
  if (!validatedData.value) return;
  dropdownOpen.value = false;
  const files = createZMKConfig(validatedData.value);
  const zip = new JSZip();
  for (const [filePath, content] of Object.entries(files)) {
    zip.file(filePath, content);
  }
  zip.generateAsync({ type: 'blob' }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zmk-config-${validatedData.value!.shield}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function openImportSlideover() {
  dropdownOpen.value = false;
  slideoverOpen.value = true;
  importError.value = null;
  captchaToken.value = '';
}


function resetImportFlow() {
  navigation.build.repoId = '';
  importError.value = null;
  captchaToken.value = '';
}

async function submitBuild() {
  if (!validatedData.value || !captchaToken.value) return;

  isBuilding.value = true;
  importError.value = null;
  navigation.build.repoId = '';

  try {
    const { data, error } = await actions.buildRepository({
      keyboard: validatedData.value,
      captcha: captchaToken.value,
    });

    if (error) {
      importError.value = `Failed to build: ${error.message}`;
      return;
    }

    navigation.build.repoId = data.repoId;
  } catch (e) {
    importError.value = `Unexpected error: ${(e as Error).message}`;
  } finally {
    isBuilding.value = false;
  }
}

function copyImportLink() {
  navigator.clipboard.writeText(importResultUrl.value);
}

function selectImportLinkText(event: FocusEvent) {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    target.select();
  }
}

function focusLinkInputAndMoveCursorToEnd() {
  const input = importLinkInput.value?.$el?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.blur();
}

watch(importResultUrl, async (link) => {
  if (!link || !slideoverOpen.value) return;
  await nextTick();
  focusLinkInputAndMoveCursorToEnd();
});

watch(slideoverOpen, async (isOpen) => {
  if (!isOpen || !importResultUrl.value) return;
  await nextTick();
  focusLinkInputAndMoveCursorToEnd();
});

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: $t('build-import-link'),
      icon: 'i-lucide-link',
      color: 'primary',
      class: 'font-semibold',
      onSelect() { openImportSlideover(); },
    },
    {
      type: 'separator',
    },
    {
      label: $t('build-download'),
      icon: 'i-lucide-download',
      class: 'text-toned',
      onSelect() { downloadZip(); },
    },
  ],
]);

const stepperItems = computed<StepperItem[]>(() => [
  {
    title: 'Complete Captcha',
  },
  {
    title: 'Import to GitHub',
  },
  {
    title: 'Trigger Build',
  },
  {
    title: 'Test Your Firmware',
  },
]);
</script>

<ftl locale="en">
build = Build
build-download = Download ZIP Archive
build-import-link = Create Import Link
import-generate-link = Generate Link
</ftl>

<ftl locale="zh-CN">
build = 生成
build-download = 下载 ZIP 压缩包
build-import-link = 创建导入链接
import-generate-link = 生成链接
</ftl>

<ftl locale="ja">
build = 生成
build-download = ZIP アーカイブをダウンロード
build-import-link = インポートリンクを作成
import-generate-link = リンクを生成
</ftl>
