<template>
  <div class="inline-flex items-center">
    <!-- Error modal -->
    <UModal
      v-model:open="errorModalOpen"
      :title="$t('error-modal-title')"
      :close="true"
    >
      <template #body>
        <div class="flex flex-col gap-4 text-sm">
          <div
            v-for="(errors, groupName) in validationErrorGroups"
            :key="groupName"
          >
            <h4 class="font-semibold text-sm mb-1.5">
              {{ groupName }}
            </h4>
            <ul class="list-disc list-inside space-y-1">
              <li
                v-for="err in errors"
                :key="err"
                class="text-error leading-relaxed"
              >
                {{ err }}
              </li>
            </ul>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Keymap layout confirmation modal -->
    <LayoutConfirmModal
      v-model:open="confirmModalOpen"
      :keys="keyboard.layout"
      @confirm="onLayoutConfirmed"
      @edit="onEditLayout"
    />

    <!-- Preview modal -->
    <UModal
      v-model:open="previewModalOpen"
      :title="$t('preview-title')"
      :close="true"
      :ui="{ content: 'max-w-5xl' }"
    >
      <template #body>
        <div class="flex h-[65vh] overflow-hidden rounded-lg border border-default bg-muted/30">
          <div class="w-60 shrink-0 overflow-y-auto border-r border-default bg-muted/20">
            <UTree
              size="sm"
              :items="previewTreeItems"
              @select="(e: any, item: any) => onPreviewFileSelect(item)"
            />
          </div>
          <div class="flex-1 min-w-0 min-h-0 flex flex-col">
            <div
              class="text-sm text-toned font-mono truncate shrink-0 border-b border-default px-3 py-1.5"
              :class="selectedFilePath ? 'visible' : 'invisible'"
            >
              {{ selectedFilePath ?? $t('preview-select-file') }}
            </div>
            <UTextarea
              readonly
              class="w-full h-full font-mono text-xs"
              size="sm"
              :ui="{ base: 'h-full resize-none font-mono text-xs' }"
              :value="selectedFileContent"
              :placeholder="$t('preview-select-file')"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Commit changes modal (edit-existing-repository flow) -->
    <UModal
      v-model:open="commitModalOpen"
      :title="$t('modal-title')"
      :description="commitRepositoryLabel"
      :close="!isCommitting"
      :ui="{ content: 'max-w-5xl' }"
    >
      <template #body>
        <!-- Session expired mid-save: the work is snapshotted in this tab
             and the user only needs to sign in again. -->
        <div
          v-if="workflow.sessionExpired"
          class="flex flex-col gap-4"
        >
          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :title="$t('session-expired-title')"
            :description="$t('session-expired-description')"
          />
          <div class="flex flex-wrap items-center justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :label="$t('not-now')"
              :disabled="reauthBusy"
              @click="dismissSessionExpired"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-download"
              :label="$t('build-download')"
              :disabled="reauthBusy"
              @click="downloadZip"
            />
            <UButton
              color="primary"
              icon="i-lucide-log-in"
              :label="$t('sign-in-and-save')"
              :loading="reauthBusy"
              @click="reauthAndResume"
            />
          </div>
        </div>

        <div
          v-else
          class="flex flex-col gap-4"
        >
          <UFormField
            :label="$t('message-label')"
            name="commitMessage"
          >
            <UInput
              v-model="commitMessage"
              class="w-full"
              :maxlength="100"
              :disabled="isCommitting"
            />
          </UFormField>

          <div class="flex flex-col gap-2 min-h-0">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold">
                {{ $t('diff-title') }}
              </h3>
              <span
                v-if="commitFileChanges.length > 0"
                class="text-sm text-toned"
              >
                {{
                  $t('diff-summary', {
                    added: commitDiffSummary.added,
                    modified: commitDiffSummary.modified,
                    deleted: commitDiffSummary.deleted,
                  })
                }}
              </span>
            </div>

            <UAlert
              v-if="commitPreviewStale"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              :title="$t('commit-conflict-title')"
              :description="$t('commit-conflict-description')"
            />

            <div class="h-96">
              <div
                v-if="commitPreviewLoading"
                class="flex h-full items-center justify-center gap-2 text-sm text-toned"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-4 animate-spin"
                />
                {{ $t('diff-loading') }}
              </div>

              <div
                v-else-if="commitPreviewError"
                class="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto"
              >
                <UAlert
                  class="w-full"
                  color="error"
                  variant="soft"
                  icon="i-lucide-alert-circle"
                  :title="$t('diff-failed')"
                  :description="commitPreviewError"
                />
                <UButton
                  color="primary"
                  variant="soft"
                  icon="i-lucide-refresh-cw"
                  :label="$t('diff-retry')"
                  @click="loadCommitPreview"
                />
              </div>

              <div
                v-else-if="commitFileChanges.length === 0"
                class="flex h-full items-center justify-center rounded-lg border border-dashed border-default bg-muted/40 px-4 py-6 text-sm text-toned"
              >
                {{ $t('no-changes') }}
              </div>

              <div
                v-else
                class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-default bg-muted/30 sm:flex-row"
              >
                <div
                  class="max-h-64 shrink-0 overflow-y-auto border-b border-default bg-muted/20 sm:h-full sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r"
                >
                  <button
                    v-for="change in commitFileChanges"
                    :key="change.path"
                    :class="selectedChangePath === change.path ? 'bg-accented text-highlighted' : 'text-toned hover:bg-muted/60'"
                    :title="change.path"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
                    type="button"
                    @click="selectedChangePath = change.path"
                  >
                    <span
                      class="w-4 shrink-0 text-center font-mono text-sm font-bold"
                      :class="statusClass(change.status)"
                    >
                      {{ statusSymbol(change.status) }}
                    </span>
                    <span class="min-w-0 truncate font-mono text-xs">
                      {{ change.path }}
                    </span>
                  </button>
                </div>

                <div class="flex min-w-0 min-h-0 flex-1 flex-col">
                  <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-1.5">
                    <span class="min-w-0 truncate font-mono text-sm text-toned">
                      {{ selectedChangePath }}
                    </span>
                    <span
                      v-if="commitSelectedChange"
                      class="shrink-0 text-sm font-semibold"
                      :class="statusClass(commitSelectedChange.status)"
                    >
                      {{ statusLabel(commitSelectedChange.status) }}
                    </span>
                  </div>

                  <div
                    :key="selectedChangePath ?? ''"
                    class="min-h-0 flex-1 overflow-auto"
                  >
                    <div class="min-w-max font-mono text-xs leading-relaxed">
                      <template
                        v-for="(group, i) in commitDiffGroups"
                        :key="i"
                      >
                        <div
                          v-if="group.kind === 'change'"
                          class="flex"
                        >
                          <span
                            class="w-6 shrink-0 select-none pr-2 text-right"
                            :class="diffLineMarkerClass(group.type)"
                          >
                            {{ diffLineMarker(group.type) }}
                          </span>
                          <span
                            class="whitespace-pre"
                            :class="diffLineTextClass(group.type)"
                          >
                            {{ group.value || '\u00A0' }}
                          </span>
                        </div>
                        <div
                          v-else
                          class="select-none px-3 py-0.5 text-center text-muted"
                        >
                          ⋯ {{ $t('diff-collapsed-lines', { count: group.count }) }} ⋯
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :label="$t('cancel')"
              :disabled="isCommitting"
              @click="commitModalOpen = false"
            />
            <UButton
              color="primary"
              :label="$t('confirm')"
              icon="i-lucide-git-commit-horizontal"
              :loading="isCommitting"
              :disabled="!validatedData || !commitMessage.trim() || !commitPreviewReady || commitPreviewLoading || commitFileChanges.length === 0 || isCommitting"
              @click="submitCommit"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UDropdownMenu
      v-model:open="dropdownOpen"
      size="lg"
      :items="menuItems"
      :content="{ align: 'end', sideOffset: 8 }"
      @update:open="onDropdownOpenChange"
    >
      <UButton
        color="primary"
        size="xl"
        variant="outline"
        :loading="isBuilding"
        :aria-label="$t(workflow.isEditing ? 'build-save' : 'build')"
        :icon="workflow.isEditing ? 'i-lucide-save' : 'i-lucide-hammer'"
        :ui="{ leadingIcon: isBuilding ? 'size-6' : 'size-6 sm:hidden' }"
      >
        <span class="hidden sm:inline">
          {{ $t(workflow.isEditing ? 'build-save' : 'build') }}
        </span>
      </UButton>
    </UDropdownMenu>

    <!-- Import link slideover -->
    <USlideover
      v-model:open="slideoverOpen"
      :title="$t('build-import-link')"
      side="right"
      class="max-w-xl"
      :description="$t('import-slideover-description')"
    >
      <template #body>
        <div class="flex flex-col gap-6 m-3">
          <div class="flex flex-col gap-4">
            <template v-if="!importResultUrl">
              <div class="flex items-center justify-center">
                <div style="width: 300px; height: 65px; position: relative;">
                  <span
                    class="absolute left-0 right-0 top-0 bottom-0 flex items-center justify-center rounded-sm bg-accented"
                    style="z-index:0;"
                  >
                    {{ $t('captcha-loading') }}
                  </span>

                  <div
                    v-if="slideoverOpen"
                    class="absolute left-0 right-0 top-0 bottom-0"
                    style="z-index:1;"
                  >
                    <VueTurnstile
                      v-model="captchaToken"
                      :site-key="PUBLIC_TURNSTILE_SITEKEY"
                      theme="auto"
                      size="normal"
                      @expired="captchaToken = ''"
                    />
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-center pt-2">
                <UButton
                  :label="$t('import-generate-link')"
                  color="primary"
                  size="lg"
                  :loading="isBuilding"
                  :disabled="isBuilding || !captchaToken"
                  @click="submitBuild"
                />
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
                <UInput
                  ref="importLinkInput"
                  v-model="importResultUrl"
                  icon="i-lucide-folder-git-2"
                  readonly
                  class="font-mono max-w-sm flex-1"
                  size="lg"
                  @focus="selectImportLinkText"
                >
                  <template #trailing>
                    <UTooltip
                      :text="$t('copy-to-clipboard')"
                      :content="{ side: 'right' }"
                    >
                      <UButton
                        color="neutral"
                        variant="link"
                        size="sm"
                        icon="i-lucide-copy"
                        :aria-label="$t('copy-to-clipboard')"
                        @click="copyImportLink"
                      />
                    </UTooltip>
                  </template>
                </UInput>
              </div>

              <div class="flex flex-col items-center justify-center mt-4 gap-2 text-sm text-toned">
                <div>
                  <i18n
                    path="import-instructions"
                    tag="span"
                  >
                    <template #importUrl>
                      <ULink
                        href="https://github.com/new/import"
                        class="underline"
                        target="_blank"
                      >
                        https://github.com/new/import
                      </ULink>
                    </template>
                  </i18n>
                </div>
                <i18n
                  path="recommended-repo-name"
                  tag="div"
                >
                  <template #name>
                    <code class="font-mono font-semibold">{{ recommendedRepoName }}</code>
                  </template>
                </i18n>
                <div>
                  <ULink
                    href="/docs/next-steps/"
                    class="underline"
                    target="_blank"
                  >
                    {{ $t('import-next-steps') }}
                  </ULink>
                </div>
              </div>

              <div class="flex flex-col items-center justify-center mt-4 gap-2 text-sm text-toned">
                <div>
                  {{
                    $t('import-repo-created-at', { date: new Date(decodeTime(navigation.build.repoId)) })
                  }}
                </div>
                <div>
                  {{
                    $t('import-repo-expires-at', {
                      date: new Date(decodeTime(navigation.build.repoId) + 24 * 60 * 60 * 1000),
                    })
                  }}
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="outline"
                  @click="resetImportFlow"
                >
                  {{ $t('create-another-repo') }}
                </UButton>
              </div>
            </template>
          </div>

          <USeparator />

          <div class="text-sm text-toned flex flex-col gap-1 justify-center items-center text-center px-2">
            <span>
              <UIcon
                name="i-lucide-triangle-alert"
                class="size-6 text-warning inline-block"
              />
              {{ $t('no-guarantee') }}
            </span>
            <i18n
              path="report-issues"
              tag="span"
            >
              <template #githubRepo="{ githubRepoLabel }">
                <ULink
                  href="https://github.com/genteure/zmk-wizard/issues"
                  class="underline"
                  target="_blank"
                >
                  {{ githubRepoLabel }}
                </ULink>
              </template>
              <template #discord="{ discordLabel }">
                <ULink
                  href="https://zmk.dev/community/discord/invite"
                  class="underline"
                  target="_blank"
                >
                  {{ discordLabel }}
                </ULink>
              </template>
            </i18n>
          </div>

          <UStepper
            orientation="vertical"
            :items="stepperItems"
            disabled
            model-value="0"
            class="w-full"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, StepperItem, TreeItem } from '@nuxt/ui';
import { actions } from 'astro:actions';
import { PUBLIC_TURNSTILE_SITEKEY } from 'astro:env/client';
import { useFluent } from 'fluent-vue';
import JSZip from 'jszip';
import { decodeTime } from 'ulidx';
import { computed, nextTick, onMounted, ref, toRaw, watch } from 'vue';
import VueTurnstile from 'vue-turnstile';
import { createZMKConfig } from '~/export';
import type { DiffLineType, DiffPreviewGroup } from '~/lib/diffPreview';
import type { RepositoryFileChange } from '~/lib/repoChanges';
import { ValidatedKeyboardSchema } from '~/lib/validators';
import type { Key, Keyboard } from '~/types';
import { clearEditorDraft, saveEditorDraft } from '../editorDraft';
import { useGithubFlow } from '../githubFlow';
import { useKeyboardStore, useNavigationStore } from '../stores';
import { useWorkflowStore } from '../workflow';
import LayoutConfirmModal from './LayoutConfirmModal.vue';

const { $t } = useFluent();
const toast = useToast();
const keyboard = useKeyboardStore();
const navigation = useNavigationStore();
const workflow = useWorkflowStore();
const flow = useGithubFlow();

const recommendedRepoName = computed(() => `zmk-config-${keyboard.shield}`);
const previewModalOpen = ref(false);
const selectedFilePath = ref<string | null>(null);

const previewFiles = computed(() => {
  if (!validatedData.value) return {};
  try {
    return createZMKConfig(validatedData.value);
  }
  catch (e) {
    console.error('Error generating preview files:', e);
    return {};
  }
});

const previewTreeItems = computed(() => {
  return buildPreviewTree(previewFiles.value);
});

const selectedFileContent = computed(() => {
  if (!selectedFilePath.value) return '';
  return previewFiles.value[selectedFilePath.value] ?? '';
});

interface PreviewNode {
  name: string;
  fullPath: string;
  icon?: string;
}

interface PreviewFileNode extends PreviewNode {
  type: 'file';
}

interface PreviewFolderNode extends PreviewNode {
  type: 'folder';
  children: Record<string, PreviewFileNode | PreviewFolderNode>;
}

type PreviewEntry = PreviewFileNode | PreviewFolderNode;

/** Tree item with repo file path (custom fields set in buildPreviewTree). */
type PreviewTreeItem = TreeItem & { fullPath: string; children?: PreviewTreeItem[] };

interface IconRule {
  icon: string;
  match(name: string, fullPath: string): boolean;
}

const FILE_ICON_RULES: IconRule[] = [
  { icon: 'material-icon-theme:svg', match: (_, p) => p.endsWith('.svg') },
  { icon: 'material-icon-theme:readme', match: n => n.startsWith('README') },
  { icon: 'material-icon-theme:markdown', match: (_, p) => p.endsWith('.md') },
  {
    icon: 'material-icon-theme:github-actions-workflow',
    match: (_, p) => /^\.github\/(?:workflows|actions)\/.+\.ya?ml$/.test(p),
  },
  { icon: 'material-icon-theme:yaml', match: (_, p) => p.endsWith('.yml') || p.endsWith('.yaml') },
  { icon: 'material-icon-theme:json', match: (_, p) => p.endsWith('.json') },
  { icon: 'i-lucide-file-cog', match: (n, p) => n.startsWith('Kconfig') || p.endsWith('.conf') },
  { icon: 'i-lucide-file-braces-corner', match: (_, p) => p.endsWith('.overlay') || p.endsWith('.dtsi') || p.endsWith('.keymap') },
];

function getFileIcon(name: string, fullPath: string): string {
  return FILE_ICON_RULES.find(r => r.match(name, fullPath))?.icon || 'i-lucide-file';
}

const FOLDER_ICON_RULES: IconRule[] = [
  { icon: 'material-icon-theme:folder-github', match: (_, p) => p === '.github' },
  { icon: 'material-icon-theme:folder-gh-workflows', match: (_, p) => p === '.github/workflows' },
  { icon: 'material-icon-theme:folder-src', match: n => n === 'boards' },
  { icon: 'material-icon-theme:folder-config', match: n => n === 'config' },
  { icon: 'material-icon-theme:folder-meta', match: n => n === 'zephyr' },
];

function getFolderIcon(name: string, fullPath: string): string | undefined {
  return FOLDER_ICON_RULES.find(r => r.match(name, fullPath))?.icon;
}

function buildPreviewTree(files: Record<string, string>): PreviewTreeItem[] {
  const root: Record<string, PreviewEntry> = {};

  for (const fullPath of Object.keys(files).sort()) {
    const parts = fullPath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const partialPath = parts.slice(0, i + 1).join('/');

      if (isLast) {
        current[name] = { name, fullPath, type: 'file', icon: getFileIcon(name, fullPath) };
      }
      else {
        const existing = current[name];
        if (!existing || existing.type === 'file') {
          current[name] = {
            name,
            fullPath: partialPath,
            type: 'folder',
            icon: getFolderIcon(name, partialPath),
            children: {},
          };
        }
        current = (current[name] as PreviewFolderNode).children;
      }
    }
  }

  function toItems(obj: Record<string, PreviewEntry>): PreviewTreeItem[] {
    return Object.entries(obj)
      .sort(([, a], [, b]) => {
        if (a.type === b.type) return 0;
        return a.type === 'file' ? 1 : -1;
      })
      .map(([key, val]) => {
        if (val.type === 'file') {
          return { label: key, fullPath: val.fullPath, icon: val.icon } as PreviewTreeItem;
        }
        return {
          label: key,
          fullPath: val.fullPath,
          defaultExpanded: true,
          icon: val.icon,
          children: toItems(val.children),
        } as PreviewTreeItem;
      });
  }

  function collapseSingleFolders(items: PreviewTreeItem[]): PreviewTreeItem[] {
    return items.flatMap((item) => {
      if (!item.children) return [item];
      const collapsed = collapseSingleFolders(item.children);
      // merge: single child that's itself a folder (has children)
      if (collapsed.length === 1 && collapsed[0].children) {
        const mergedLabel = item.label + '/' + collapsed[0].label;
        // Prefer the child's icon (more specific path) for the merged node
        const mergedIcon = collapsed[0].icon ?? item.icon;
        return [{
          ...item,
          label: mergedLabel,
          fullPath: collapsed[0].fullPath ?? item.fullPath,
          icon: mergedIcon,
          children: collapsed[0].children,
        } as PreviewTreeItem];
      }
      return [{ ...item, children: collapsed } as PreviewTreeItem];
    });
  }

  return collapseSingleFolders(toItems(root));
}

function onPreviewFileSelect(item: PreviewTreeItem) {
  // Folders have children — clicking them should not change the preview
  if (!item || item.children || !item.fullPath) return;
  selectedFilePath.value = item.fullPath;
}

function openPreview() {
  dropdownOpen.value = false;
  selectedFilePath.value = null;
  previewModalOpen.value = true;
}

const dropdownOpen = ref(false);
const errorModalOpen = ref(false);
const confirmModalOpen = ref(false);
const validationErrorGroups = ref<Record<string, string[]>>({});
const validatedData = ref<Keyboard | null>(null);
/** Hash of the key layout the user last accepted via the confirmation modal. */
let acceptedLayoutHash: string | null = null;

/** Compute a hash of physical-layout props (order, position, rotation, size) to detect layout changes. */
function computePhysicalLayoutHash(keys: Key[]): string {
  return JSON.stringify(keys.map(k => [k.id, k.x, k.y, k.w, k.h, k.r, k.rx, k.ry]));
}

const slideoverOpen = ref(false);
const isBuilding = ref(false);
const captchaToken = ref('');
const commitModalOpen = ref(false);
const isCommitting = ref(false);
/** Bound to the store so the message survives the editor remount that
 *  follows a re-authentication. */
const commitMessage = computed({
  get: () => workflow.commitMessage,
  set: (value: string) => { workflow.commitMessage = value; },
});
/** Re-authentication request started from the session-expired prompt. */
const reauthBusy = ref(false);
const commitFileChanges = ref<CommitFileChange[]>([]);
const commitPreviewLoading = ref(false);
const commitPreviewError = ref<string | null>(null);
/** Commit the current diff was generated from; required to commit. */
const commitBaseOid = ref<string | null>(null);
/** True only after a preview finished successfully. The commit button is
 *  gated on this, so a failed or stale preview can never be committed. */
const commitPreviewReady = ref(false);
/** Set when the server rejected a commit because the branch moved. */
const commitPreviewStale = ref(false);
const selectedChangePath = ref<string | null>(null);
const importLinkInput = ref<{ $el?: Element } | null>(null);
const importResultUrl = computed(() => {
  if (!navigation.build.repoId) return '';
  const baseUrl = window.location.origin;
  return `${baseUrl}/repo/${navigation.build.repoId}.git`;
});

type CommitChangeStatus = RepositoryFileChange['status'];

type CommitFileChange = {
  path: string;
  status: CommitChangeStatus;
  diff: DiffPreviewGroup[];
};

type CommitDiffLine = { type: DiffLineType; value: string };
type CommitDiffGroup = DiffPreviewGroup;

const commitDiffSummary = computed(() => {
  const summary = { added: 0, modified: 0, deleted: 0 };
  for (const change of commitFileChanges.value) {
    summary[change.status] += 1;
  }
  return summary;
});

const commitSelectedChange = computed(() =>
  commitFileChanges.value.find(change => change.path === selectedChangePath.value) ?? null,
);

/** `owner/repo@branch` shown as the commit modal subtitle. */
const commitRepositoryLabel = computed(() => {
  const repository = workflow.editingRepository;
  return repository ? `${repository.fullName}@${repository.defaultBranch}` : undefined;
});

const commitDiffGroups = computed<CommitDiffGroup[]>(() =>
  commitSelectedChange.value?.diff ?? [],
);

function statusSymbol(status: CommitChangeStatus): string {
  switch (status) {
    case 'added': return '+';
    case 'deleted': return '−';
    case 'modified': return '~';
  }
}

function statusLabel(status: CommitChangeStatus | undefined): string {
  switch (status) {
    case 'added': return $t('file-added');
    case 'deleted': return $t('file-deleted');
    case 'modified': return $t('file-modified');
    default: return '';
  }
}

function statusClass(status: CommitChangeStatus): string {
  switch (status) {
    case 'added': return 'text-success';
    case 'deleted': return 'text-error';
    case 'modified': return 'text-warning';
  }
}

function diffLineMarker(type: CommitDiffLine['type']): string {
  switch (type) {
    case 'add': return '+';
    case 'remove': return '−';
    case 'context': return ' ';
  }
}

function diffLineMarkerClass(type: CommitDiffLine['type']): string {
  switch (type) {
    case 'add': return 'text-success';
    case 'remove': return 'text-error';
    case 'context': return 'text-muted';
  }
}

function diffLineTextClass(type: CommitDiffLine['type']): string {
  switch (type) {
    case 'add': return 'bg-success/10 text-success';
    case 'remove': return 'bg-error/10 text-error';
    case 'context': return 'text-default';
  }
}

/**
 * Business-validate the keyboard and cache the result for the build/save
 * actions. Returns false after showing the grouped error modal, so callers
 * can stop. Extracted from the dropdown handler because the commit modal is
 * also opened directly when a draft is restored after re-authentication.
 */
function validateKeyboard(): boolean {
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
      }
      else {
        groupName = $t('error-group-general');
      }

      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(issue.message);
    }

    validationErrorGroups.value = groups;
    errorModalOpen.value = true;
    validatedData.value = null;
    dropdownOpen.value = false;
    return false;
  }

  validatedData.value = result.data as unknown as Keyboard;
  return true;
}

function onDropdownOpenChange(open: boolean) {
  if (!open) return;

  if (!validateKeyboard()) return;

  // When editing an existing repository, skip the pre-build keymap layout
  // confirmation and let the user go straight to the save menu.
  if (workflow.isEditing) {
    return;
  }

  if (acceptedLayoutHash !== null && computePhysicalLayoutHash(keyboard.layout) === acceptedLayoutHash) {
    return;
  }

  dropdownOpen.value = false;
  confirmModalOpen.value = true;
}

function onLayoutConfirmed() {
  acceptedLayoutHash = computePhysicalLayoutHash(keyboard.layout);
  dropdownOpen.value = true;
}

function onEditLayout() {
  navigation.$patch({ activeTab: 'layout', activePart: null });
}

function downloadZip() {
  if (!validatedData.value) return;
  dropdownOpen.value = false;
  try {
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

    selfPromoToast();
  }
  catch (e) {
    console.error('Error generating ZIP:', e);
    toast.add({
      color: 'error',
      title: $t('download-zip-failed'),
      description: e instanceof Error ? e.message : String(e),
    });
  }
}

function openImportSlideover() {
  if (workflow.isEditing) return;
  dropdownOpen.value = false;
  slideoverOpen.value = true;

  captchaToken.value = '';
}

function openCommit() {
  if (!workflow.isEditing || !workflow.editingRepository) return;
  if (!validateKeyboard()) return;
  if (!commitMessage.value.trim()) {
    commitMessage.value = $t('commit-message-default');
  }
  dropdownOpen.value = false;
  commitPreviewStale.value = false;
  commitModalOpen.value = true;
  // A previous attempt already proved the session is dead: show the
  // reconnect prompt instead of hitting the API again.
  if (workflow.sessionExpired) return;
  void loadCommitPreview();
}

/**
 * The GitHub session died mid-save. Keep the work in this tab, snapshot it
 * so it survives the OAuth redirect, and leave the commit modal open in a
 * "sign in again" state rather than dropping the user at the picker.
 */
function handleSessionExpired() {
  const repository = workflow.editingRepository;
  if (repository && validatedData.value) {
    saveEditorDraft({
      repository,
      keyboard: toRaw(validatedData.value),
      commitMessage: commitMessage.value,
    });
  }
  workflow.expireSession();
}

async function reauthAndResume() {
  if (reauthBusy.value) return;
  reauthBusy.value = true;
  try {
    const result = await flow.beginAuth({
      intent: 'login',
      returnScreen: 'editor',
      returnMode: 'edit',
    });
    if (!result.ok) {
      toast.add({
        color: 'error',
        title: $t('login-failed'),
        description: result.message,
      });
      return;
    }
    window.location.assign(result.authorizeUrl);
  }
  finally {
    reauthBusy.value = false;
  }
}

/**
 * Close the reconnect prompt without signing in. The editor keeps the work
 * and the draft stays in this tab, so reopening "Save Changes" offers the
 * same prompt again.
 */
function dismissSessionExpired() {
  commitModalOpen.value = false;
  commitFileChanges.value = [];
  commitPreviewError.value = null;
  commitPreviewReady.value = false;
  commitBaseOid.value = null;
  commitPreviewStale.value = false;
  selectedChangePath.value = null;
}

async function loadCommitPreview() {
  const repository = workflow.editingRepository;
  if (!validatedData.value || !repository) return;

  commitPreviewLoading.value = true;
  commitPreviewError.value = null;
  commitPreviewReady.value = false;
  commitBaseOid.value = null;
  commitFileChanges.value = [];
  selectedChangePath.value = null;

  try {
    const { data, error } = await actions.githubPreviewChanges({
      owner: repository.owner.login,
      repo: repository.name,
      keyboard: validatedData.value,
    });

    if (error) {
      if (error.code === 'UNAUTHORIZED') {
        handleSessionExpired();
        return;
      }
      commitPreviewError.value = error.message;
      return;
    }

    commitFileChanges.value = data?.changes ?? [];
    commitBaseOid.value = data?.baseOid ?? null;
    commitPreviewReady.value = commitBaseOid.value !== null;
    if (commitFileChanges.value.length > 0) {
      selectedChangePath.value = commitFileChanges.value[0].path;
    }
  }
  catch (error) {
    commitPreviewError.value = error instanceof Error ? error.message : String(error);
  }
  finally {
    commitPreviewLoading.value = false;
  }
}

async function submitCommit() {
  const repository = workflow.editingRepository;
  const baseOid = commitBaseOid.value;
  if (!validatedData.value || !repository || !commitMessage.value.trim()) return;
  if (!baseOid || !commitPreviewReady.value) return;

  isCommitting.value = true;
  try {
    const { data, error } = await actions.githubCommitChanges({
      owner: repository.owner.login,
      repo: repository.name,
      commitMessage: commitMessage.value.trim(),
      baseOid,
      keyboard: validatedData.value,
    });

    if (error) {
      if (error.code === 'UNAUTHORIZED') {
        handleSessionExpired();
        return;
      }
      if (error.code === 'CONFLICT') {
        // Someone else changed the repository between preview and commit.
        // Keep the modal and the commit message, refresh the diff, and make
        // the user approve the new state before the next attempt.
        commitPreviewStale.value = true;
        toast.add({
          color: 'warning',
          title: $t('commit-conflict-title'),
          description: $t('commit-conflict-description'),
          icon: 'i-lucide-triangle-alert',
        });
        await loadCommitPreview();
        return;
      }
      toast.add({
        color: 'error',
        title: $t('commit-failed'),
        description: error.message,
        icon: 'i-lucide-alert-circle',
      });
      return;
    }

    commitPreviewStale.value = false;
    commitModalOpen.value = false;
    // The saved state is now the baseline; there is nothing left to resume.
    clearEditorDraft();
    toast.add({
      color: 'success',
      title: $t('commit-succeeded'),
      description: $t('commit-succeeded-desc', { fullName: repository.fullName }),
      icon: 'i-lucide-check',
      actions: [
        {
          label: $t('view-on-github'),
          href: data.commitHtmlUrl,
          target: '_blank',
        },
      ],
      duration: 0,
    });
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: $t('commit-failed'),
      description: error instanceof Error ? error.message : String(error),
      icon: 'i-lucide-alert-circle',
    });
  }
  finally {
    isCommitting.value = false;
  }
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

    selfPromoToast();
  }
  catch (e) {
    toast.add({
      title: $t('network-error-title'),
      description: $t('import-unexpected-error', { message: (e as Error).message }),
      color: 'error',
      icon: 'i-lucide-wifi-off',
    });
  }
  finally {
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

function selfPromoToast() {
  toast.add({
    title: $t('promo-title'),
    description: $t('promo-desc'),
    color: 'primary',
    icon: 'i-lucide-heart',
    actions: [
      {
        label: $t('promo-action-label'),
        href: 'https://github.com/Genteure/zmk-wizard',
        target: '_blank',
      },
    ],
    duration: 0, // 0 means it won't auto-dismiss
  });
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

// A draft restored after re-authentication asks the editor to reopen the
// save dialog so the user lands back where the expired session interrupted
// them, with a fresh diff against the current branch head.
onMounted(() => {
  if (!workflow.resumeCommit) return;
  workflow.resumeCommit = false;
  void nextTick(() => { openCommit(); });
});

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const primary: DropdownMenuItem = workflow.isEditing
    ? {
        label: $t('build-save-changes'),
        icon: 'i-lucide-git-commit-horizontal',
        color: 'primary',
        class: 'font-semibold',
        onSelect() { openCommit(); },
      }
    : {
        label: $t('build-import-link'),
        icon: 'i-lucide-link',
        color: 'primary',
        class: 'font-semibold',
        onSelect() { openImportSlideover(); },
      };

  const separator: DropdownMenuItem = { type: 'separator' };
  const preview: DropdownMenuItem = {
    label: $t('build-preview'),
    icon: 'i-lucide-eye',
    class: 'text-toned',
    onSelect() { openPreview(); },
  };
  const download: DropdownMenuItem = {
    label: $t('build-download'),
    icon: 'i-lucide-download',
    class: 'text-toned',
    onSelect() { downloadZip(); },
  };

  return [[primary, separator, preview, download]];
});

const stepperItems = computed<StepperItem[]>(() => [
  {
    title: $t('step1-title'),
    description: $t('step1-desc'),
  },
  {
    title: $t('step2-title'),
    description: $t('step2-desc'),
  },
  {
    title: $t('step3-title'),
    description: $t('step3-desc'),
  },
  {
    title: $t('step4-title'),
    description: $t('step4-desc'),
  },
  {
    title: $t('step5-title'),
    description: $t('step5-desc'),
  },
]);
</script>

<ftl locale="en">
build = Build
build-save = Save Changes
build-download = Download ZIP Archive
build-import-link = Create Import Link
build-save-changes = Save Changes to GitHub
build-preview = Preview Generated Files
preview-title = Files Preview
preview-select-file = Select a file to preview
import-slideover-description = Get a link to a hosted git repository with your keyboard configuration
recommended-repo-name = Recommended repository name: { $name }
import-generate-link = Generate Link

step1-title = Get Your Import Link
step1-desc = We host a temporary git repository with your custom keyboard configuration. The repository is kept for 24 hours on our server.

step2-title = Import to GitHub
step2-desc = Import the repository to your GitHub account, and wait for the import to complete. It should take less than 5 minutes.

step3-title = Run the Build
step3-desc = Go to the Actions tab of the imported repository, find the workflow named "Build ZMK firmware", and click the "Run workflow" button to start a build.

step4-title = Test the Firmware
step4-desc = Once the build is complete, download the firmware from the latest build artifact, flash it onto your keyboard, and test it out! The default A, B, C... keymap is perfect for testing all keys.

step5-title = Customize Your Keyboard
step5-desc = After confirming the default build works, you can start customizing keymap and build parameters. Enjoy your keyboard!

error-modal-title = Validation Errors

modal-title = Commit Changes
message-label = Commit Message
commit-message-default = Update keyboard configuration via Shield Wizard
confirm = Commit
diff-title = Changes
diff-loading = Loading changes…
diff-failed = Could not load changes
diff-retry = Try Again
no-changes = No changes to save. Edit the keyboard configuration first.
session-expired-title = GitHub session expired
session-expired-description = Sign in again to save your changes. Your edits are kept in this tab, and you can review the diff before saving.
sign-in-and-save = Sign In and Save
not-now = Not Now
diff-summary = { $added } added · { $modified } modified · { $deleted } deleted
diff-collapsed-lines = { $count ->
  [1] { $count } unchanged line
  *[other] { $count } unchanged lines
}
file-added = Added
file-modified = Modified
file-deleted = Deleted
commit-conflict-title = Repository changed
commit-conflict-description = Someone changed this repository after the changes were loaded. Review the updated diff and commit again.
commit-failed = Could not save changes
commit-succeeded = Changes Saved
commit-succeeded-desc = Saved to { $fullName }
view-on-github = View Commit on GitHub

captcha-error-title = Captcha Verification Failed
build-error-title = Build Request Failed
network-error-title = Network Error
download-zip-failed = Could not download the ZIP archive

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
import-instructions = Import at { $importUrl }
import-next-steps = What to do next?

report-issues = Please report any issues with the generated firmware in { $githubRepo } or in { $discord }.
  .github-repo-label = our GitHub repository
  .discord-label = ZMK Community Discord

promo-title = Give Shield Wizard for ZMK a star!
promo-desc = If you enjoy using Shield Wizard for ZMK, please consider starring the project on GitHub!
promo-action-label = Open on GitHub
</ftl>

<ftl locale="zh-CN">
build = 生成
build-save = 保存修改
build-download = 下载 ZIP 压缩包
build-import-link = 创建导入链接
build-save-changes = 保存修改到 GitHub
build-preview = 预览生成的文件
preview-title = 文件预览
preview-select-file = 选择文件进行预览
import-slideover-description = 获取一个包含你的键盘配置的托管 git 仓库链接
import-generate-link = 生成链接
recommended-repo-name = 建议的仓库名称: { $name }

step1-title = 获取导入链接
step1-desc = 我们提供一个临时的 git 仓库来存放你的键盘配置。该仓库将在服务器上保留 24 小时。

step2-title = 导入到 GitHub
step2-desc = 将仓库导入到你的 GitHub 账号，并等待导入完成。整个过程应该不超过 5 分钟。

step3-title = 运行构建
step3-desc = 打开导入仓库的 Actions 页面，找到名为 “Build ZMK firmware” 的工作流，点击 “Run workflow” 按钮开始构建。

step4-title = 测试固件
step4-desc = 构建完成后，从最新的构建产物中下载固件，刷入键盘并进行测试。默认的 A、B、C... 键位很适合用来逐个测试按键。

step5-title = 定制你的键盘
step5-desc = 测试完生成的默认配置一切正常后，你可以开始定制键位和构建参数。享受你的键盘吧！

error-modal-title = 验证错误

modal-title = 提交变更
message-label = 提交信息
commit-message-default = 通过 Shield Wizard 更新键盘配置
confirm = 提交变更
diff-title = 变更
diff-loading = 正在加载变更…
diff-failed = 无法加载变更
diff-retry = 重试
no-changes = 没有可提交的变更。请先编辑键盘配置。
session-expired-title = GitHub 登录已过期
session-expired-description = 请重新登录以保存修改。改动会保留在当前标签页，保存前还可以再检查一次变更。
sign-in-and-save = 重新登录并保存
not-now = 暂不
diff-summary = 新增 { $added } · 修改 { $modified } · 删除 { $deleted }
diff-collapsed-lines = { $count } 行未变更
file-added = 新增
file-modified = 修改
file-deleted = 删除
commit-conflict-title = 仓库已发生变化
commit-conflict-description = 生成变更后，仓库已被其他人修改。请查看更新后的变更内容，然后重新提交。
commit-failed = 提交失败
commit-succeeded = 变更已提交
commit-succeeded-desc = 已提交到 { $fullName }
view-on-github = 在 GitHub 上查看提交

captcha-error-title = 验证码验证失败
build-error-title = 构建请求失败
network-error-title = 网络错误
download-zip-failed = 下载 ZIP 压缩包失败

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
import-instructions = 在 { $importUrl } 导入仓库
import-next-steps = 接下来做什么？

promo-title = 给 Shield Wizard for ZMK 点个星吧！
promo-desc = 如果 Shield Wizard for ZMK 对你有帮助，请考虑在 GitHub 上为项目点个星！
promo-action-label = 在 GitHub 上打开
</ftl>

<ftl locale="ja">
build = 生成
build-save = 変更を保存
build-download = ZIP アーカイブをダウンロード
build-import-link = インポートリンクを作成
build-save-changes = GitHub に変更を保存
build-preview = 生成されたファイルをプレビュー
preview-title = ファイルプレビュー
preview-select-file = プレビューするファイルを選択
import-slideover-description = キーボード設定を含むホストされた git リポジトリへのリンクを取得します。
import-generate-link = リンクを生成
recommended-repo-name = 推奨リポジトリ名: { $name }

step1-title = インポートリンクを取得
step1-desc = カスタムキーボード設定を保持する一時的な git リポジトリを提供します。リポジトリはサーバー上に 24 時間保存されます。

step2-title = GitHub にインポート
step2-desc = リポジトリを GitHub アカウントにインポートし、インポートが完了するまでお待ちください。通常 5 分以内に完了します。

step3-title = ビルドを実行
step3-desc = インポートしたリポジトリの Actions タブを開き、「Build ZMK firmware」というワークフローを見つけて「Run workflow」ボタンをクリックするとビルドが始まります。

step4-title = ファームウェアをテスト
step4-desc = ビルドが完了したら、最新のビルド成果物からファームウェアをダウンロードし、キーボードに書き込んで動作を確認してください。デフォルトの A, B, C... キーマップは、すべてのキーを試すのにちょうどよい配列です。

step5-title = キーボードをカスタマイズ
step5-desc = デフォルトビルドが動作することを確認したら、キーマップとビルドパラメータのカスタマイズを始められます。キーボードをお楽しみください！

error-modal-title = 検証エラー

modal-title = 変更をコミット
message-label = コミットメッセージ
commit-message-default = Shield Wizard でキーボード設定を更新
confirm = コミット
diff-title = 変更内容
diff-loading = 変更内容を読み込み中…
diff-failed = 変更内容を読み込めませんでした
diff-retry = 再試行
no-changes = コミットする変更はありません。先にキーボード設定を編集してください。
session-expired-title = GitHub のセッションが切れました
session-expired-description = 変更を保存するには、もう一度サインインしてください。編集内容はこのタブに保持され、保存前に差分を確認できます。
sign-in-and-save = サインインして保存
not-now = 後で
diff-summary = 追加 { $added } 件 · 変更 { $modified } 件 · 削除 { $deleted } 件
diff-collapsed-lines = 変更のない { $count } 行
file-added = 追加
file-modified = 変更
file-deleted = 削除
commit-conflict-title = リポジトリが更新されました
commit-conflict-description = 変更を読み込んだ後に、他の人によってリポジトリが更新されました。更新された差分を確認して、もう一度コミットしてください。
commit-failed = 変更をコミットできませんでした
commit-succeeded = 変更をコミットしました
commit-succeeded-desc = { $fullName } にコミットしました
view-on-github = GitHub でコミットを表示

captcha-error-title = キャプチャ認証失敗
build-error-title = ビルドリクエスト失敗
network-error-title = ネットワークエラー
download-zip-failed = ZIP アーカイブをダウンロードできませんでした

captcha-loading = キャプチャ読み込み中...
import-captcha-description = 悪用を防ぐため、ホストリポジトリの作成はキャプチャで保護されています。
import-link-expiry = リポジトリのリンクは24時間後に失効します。
import-zip-fallback = うまくいかない場合は、ZIP アーカイブとして設定をダウンロードすることもできます。
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
import-instructions = { $importUrl } でインポート
import-next-steps = この後どうする？

promo-title = Shield Wizard for ZMK にスターしよう！
promo-desc = Shield Wizard for ZMK を楽しんで使ってくれたら、GitHub でプロジェクトにスターを付けてもらえると嬉しいです。
promo-action-label = GitHub リポジトリを開く
</ftl>
