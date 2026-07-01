<template>
  <div class="inline-flex items-center">
    <!-- Error modal -->
    <UModal v-model:open="errorModalOpen" :title="$t('error-modal-title')" :close="true">
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
      :description="$t('import-slideover-description')">
      <template #body>
        <div class="flex flex-col gap-6 m-3">
          <div class="flex flex-col gap-4">
            <template v-if="!importResultUrl">

              <div class="flex items-center justify-center">
                <div style="width: 300px; height: 65px; position: relative;">
                  <span
                    class="absolute left-0 right-0 top-0 bottom-0 flex items-center justify-center rounded-sm bg-accented"
                    style="z-index:0;">
                    {{ $t('captcha-loading') }}
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
                  {{ $t('import-captcha-description') }}
                </div>
                <div>
                  {{ $t('import-link-expiry') }}
                </div>
                <div class="mt-2">
                  {{ $t('import-zip-fallback') }}
                </div>
              </div>

            </template>
            <template v-else>
              <div class="flex items-center justify-center">
                <UInput icon="i-lucide-folder-git-2" v-model="importResultUrl" readonly
                  class="font-mono max-w-sm flex-1" size="lg" ref="importLinkInput" @focus="selectImportLinkText">
                  <template #trailing>
                    <UTooltip :text="$t('copy-to-clipboard')" :content="{ side: 'right' }">
                      <UButton color="neutral" variant="link" size="sm" icon="i-lucide-copy"
                        :aria-label="$t('copy-to-clipboard')" @click="copyImportLink" />
                    </UTooltip>
                  </template>
                </UInput>
              </div>

              <div class="flex flex-col items-center justify-center mt-4 gap-2">
                <div class="text-sm text-toned">
                  {{
                    $t('import-repo-created-at', { date: new Date(decodeTime(navigation.build.repoId)) })
                  }}
                </div>
                <div class="text-sm text-toned">
                  {{
                    $t('import-repo-expires-at', {
                      date: new Date(decodeTime(navigation.build.repoId) + 24 * 60 * 60 * 1000)
                    })
                  }}
                </div>
                <UButton size="sm" color="neutral" variant="outline" @click="resetImportFlow">
                  {{ $t('create-another-repo') }}
                </UButton>
              </div>
            </template>
          </div>

          <USeparator />

          <div class="text-sm text-toned flex flex-col gap-1 justify-center items-center text-center px-2">
            <span>
              <UIcon name="i-lucide-triangle-alert" class="size-6 text-warning inline-block" />
              {{ $t('no-guarantee') }}
            </span>
            <i18n path="report-issues" tag="span">
              <template #githubRepo="{ githubRepoLabel }">
                <ULink href="https://github.com/genteure/zmk-wizard/issues" class="underline" target="_blank">
                  {{ githubRepoLabel }}
                </ULink>
              </template>
              <template #discord="{ discordLabel }">
                <ULink href="https://zmk.dev/community/discord/invite" class="underline" target="_blank">
                  {{ discordLabel }}
                </ULink>
              </template>
            </i18n>
          </div>

          <UStepper orientation="vertical" :items="stepperItems" disabled model-value="0" class="w-full" />
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
const toast = useToast();
const keyboard = useKeyboardStore();
const navigation = useNavigationStore();

const dropdownOpen = ref(false);
const errorModalOpen = ref(false);
const validationErrorGroups = ref<Record<string, string[]>>({});
const validatedData = ref<Keyboard | null>(null);

const slideoverOpen = ref(false);
const isBuilding = ref(false);
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
          ? $t('error-group-part', { index: partIndex, name: part.name })
          : $t('error-group-part-simple', { index: partIndex });
      } else {
        groupName = $t('error-group-general');
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

  captchaToken.value = '';
}

function resetImportFlow() {
  navigation.build.repoId = '';
  captchaToken.value = '';
}

async function submitBuild() {
  if (!validatedData.value || !captchaToken.value) return;

  isBuilding.value = true;
  navigation.build.repoId = '';

  try {
    const { data, error } = await actions.buildRepository({
      keyboard: validatedData.value,
      captcha: captchaToken.value,
    });

    if (error) {
      const isCaptcha = error.message?.toLowerCase().includes('captcha');
      toast.add({
        title: isCaptcha ? $t('captcha-error-title') : $t('build-error-title'),
        description: $t('import-failed', { message: error.message }),
        color: isCaptcha ? 'warning' : 'error',
        icon: isCaptcha ? 'i-lucide-shield-off' : 'i-lucide-alert-circle',
      });
      return;
    }

    navigation.build.repoId = data.repoId;
  } catch (e) {
    toast.add({
      title: $t('network-error-title'),
      description: $t('import-unexpected-error', { message: (e as Error).message }),
      color: 'error',
      icon: 'i-lucide-wifi-off',
    });
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
    title: $t('step1-title'),
    description: $t('step1-desc')
  },
  {
    title: $t('step2-title'),
    description: $t('step2-desc')
  },
  {
    title: $t('step3-title'),
    description: $t('step3-desc')
  },
  {
    title: $t('step4-title'),
    description: $t('step4-desc')
  },
  {
    title: $t('step5-title'),
    description: $t('step5-desc')
  },
]);
</script>

<ftl locale="en">
build = Build
build-download = Download ZIP Archive
build-import-link = Create Import Link
import-slideover-description = Get a link to a hosted git repository with your keyboard configuration
import-generate-link = Generate Link

step1-title = Get Your Import Link
step1-desc = We host a temporary git repository with your custom keyboard configuration. The repository is kept for 24 hours on our server.

step2-title = Import to GitHub
step2-desc = Import the repository to your GitHub account, and wait for the import to complete. It should take less than 5 minutes.

step3-title = Trigger Build
step3-desc = Go to the Actions tab of the imported repository, find the workflow named "Build ZMK firmware", trigger a new build by clicking the "Run workflow" button.

step4-title = Test The Firmware
step4-desc = Once the build is complete, download the firmware from the latest build artifact, flash it to your keyboard, and test it out! The default A, B, C... keymap is perfect for testing all keys.

step5-title = Customize Your Keyboard
step5-desc = After confirming the default build works, you can start customizing keymap and build parameters. Enjoy your keyboard!

error-modal-title = Validation Errors

captcha-error-title = Captcha Verification Failed
build-error-title = Build Request Failed
network-error-title = Network Error

captcha-loading = Loading Captcha...
import-captcha-description = Creating hosted repository is captcha protected to prevent abuse.
import-link-expiry = Repository link expires after 24 hours.
import-zip-fallback = Not working? You can also download the configuration as a ZIP archive.
copy-to-clipboard = Copy to clipboard
import-repo-created-at = Created: { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric") }
import-repo-expires-at = Expires: { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric") }
create-another-repo = Create Another Repository
error-group-part = Keyboard Part { $index } ({ $name })
error-group-part-simple = Keyboard Part { $index }
error-group-general = General
import-failed = Failed to build: { $message }
import-unexpected-error = Unexpected error: { $message }
no-guarantee = Not all configuration combinations are guaranteed to work.
report-issues = Please report any issues with the generated firmware in { $githubRepo } or in { $discord }.
  .github-repo-label = our GitHub repository
  .discord-label = ZMK Community Discord
</ftl>

<ftl locale="zh-CN">
build = 生成
build-download = 下载 ZIP 压缩包
build-import-link = 创建导入链接
import-slideover-description = 获取一个包含你的键盘配置的托管 git 仓库链接
import-generate-link = 生成链接

step1-title = 获取导入链接
step1-desc = 我们提供一个临时的 git 仓库来存放你的键盘配置。该仓库将在服务器上保留 24 小时。

step2-title = 导入到 GitHub
step2-desc = 将仓库导入到你的 GitHub 账号，并等待导入完成。整个过程应该不超过 5 分钟。

step3-title = 触发构建
step3-desc = 进入导入的仓库的 Actions 页面，找到 “Build ZMK firmware” 工作流，点击 “Run workflow” 按钮触发构建。

step4-title = 测试固件
step4-desc = 构建完成后，从最新的构建产物中下载固件，刷入键盘并进行测试！默认的 A、B、C... 键位非常适合测试按键是否正常工作。

step5-title = 定制你的键盘
step5-desc = 测试完生成的默认配置一切正常后，你可以开始定制键位和构建参数。享受你的键盘吧！

error-modal-title = 验证错误

captcha-error-title = 验证码验证失败
build-error-title = 构建请求失败
network-error-title = 网络错误

captcha-loading = 验证加载中...
import-captcha-description = 为防滥用，创建托管 git 仓库需要完成验证码。
import-link-expiry = 仓库链接在 24 小时后过期。
import-zip-fallback = 出现问题？你也可以下载配置的 ZIP 压缩包。
copy-to-clipboard = 复制到剪贴板
import-repo-created-at = 创建于: { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric") }
import-repo-expires-at = 过期于: { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric") }
create-another-repo = 再创建一个仓库
error-group-part = 键盘分体 { $index } ({ $name })
error-group-part-simple = 键盘分体 { $index }
error-group-general = 通用
import-failed = 构建失败: { $message }
import-unexpected-error = 意外错误: { $message }
no-guarantee = 并非所有配置组合都保证能正常工作。
report-issues = 如果在生成的固件存在问题，请通过 { $githubRepo } 或 { $discord } 反馈。
  .github-repo-label = GitHub 仓库
  .discord-label = ZMK 社区 Discord
</ftl>

<ftl locale="ja">
build = 生成
build-download = ZIP アーカイブをダウンロード
build-import-link = インポートリンクを作成
import-slideover-description = キーボード設定を含むホストされた git リポジトリへのリンクを取得します。
import-generate-link = リンクを生成

step1-title = インポートリンクを取得
step1-desc = カスタムキーボード設定を保持する一時的な git リポジトリを提供します。リポジトリはサーバー上に 24 時間保存されます。

step2-title = GitHub にインポート
step2-desc = リポジトリを GitHub アカウントにインポートし、インポートが完了するまでお待ちください。通常 5 分以内に完了します。

step3-title = ビルドをトリガー
step3-desc = インポートしたリポジトリの Actions タブに移動し、「Build ZMK firmware」というワークフローを見つけ、「Run workflow」ボタンをクリックして新しいビルドをトリガーします。

step4-title = ファームウェアをテスト
step4-desc = ビルドが完了したら、最新のビルドアーティファクトからファームウェアをダウンロードし、キーボードに書き込んでテストしてください！デフォルトの A, B, C... キーマップはすべてのキーのテストに最適です。

step5-title = キーボードをカスタマイズ
step5-desc = デフォルトビルドが動作することを確認したら、キーマップとビルドパラメータのカスタマイズを始められます。キーボードをお楽しみください！

error-modal-title = 検証エラー

captcha-error-title = キャプチャ認証失敗
build-error-title = ビルドリクエスト失敗
network-error-title = ネットワークエラー

captcha-loading = キャプチャ読み込み中...
import-captcha-description = 悪用を防ぐため、ホストリポジトリの作成はキャプチャで保護されています。
import-link-expiry = リポジトリのリンクは24時間後に失効します。
import-zip-fallback = うまくいかない場合は、ZIPアーカイブとして設定をダウンロードすることもできます。
copy-to-clipboard = クリップボードにコピー
import-repo-created-at = 作成: { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric") }
import-repo-expires-at = 有効期限: { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric") }
create-another-repo = 別のリポジトリを作成
error-group-part = キーボードパート { $index } ({ $name })
error-group-part-simple = キーボードパート { $index }
error-group-general = 全般
import-failed = ビルドに失敗しました: { $message }
import-unexpected-error = 予期しないエラー: { $message }
no-guarantee = 設定の組み合わせによっては正常に動作しない場合があります。
report-issues = 生成されたファームウェアに問題がある場合は、{ $githubRepo } または { $discord } で報告をお願いします。
  .github-repo-label = GitHub リポジトリ
  .discord-label = ZMK コミュニティ Discord
</ftl>
