<template>
  <UModal v-model:open="nav.dialog.info" :close="false" :modal="true" :dismissible="false"
    @close:prevent="onClosePrevent">
    <UButton class="min-w-24 justify-between" color="primary" size="sm" variant="outline" trailing-icon="i-lucide-pen">
      <div class="flex flex-col items-start">
        <span class="text-sm">{{ keyboard.name || 'My Keyboard' }}</span>
        <span class="font-mono">{{ keyboard.shield || 'my_keyboard' }}</span>
      </div>
    </UButton>
    <template #body>
      <div class="flex flex-col gap-2">
        <h1 class="text-center text-lg font-bold text-highlighted">Shield Wizard for ZMK v0.3</h1>
        <p class="text-center text-sm text-toned">{{ $t('subtitle') }}</p>

        <div class="mt-2 flex justify-center">
          <UCard class="w-96">
            <UForm ref="form" :schema="formSchema" :state="formState" class="space-y-4" @submit="onSubmit">

              <UFormField class="w-full" :label="$t('display-name')" :help="$t('display-name-help')" name="name">
                <UInput class="w-full" v-model="formState.name">
                  <template #trailing>
                    <span :class="nameBytes > 16 ? 'text-error' : 'text-muted'">
                      {{ nameBytes }} / 16
                    </span>
                  </template>
                </UInput>
              </UFormField>

              <UFormField class="w-full" :label="$t('shield-name')" :help="$t('shield-name-help')" name="shield">
                <UInput class="w-full" v-model="formState.shield" pattern="[a-z][a-z0-9_]*" />
              </UFormField>

              <UFormField class="w-full" :label="$t('split-part')" name="parts">
                <URadioGroup v-model="formState.parts" class="w-full [&_label]:cursor-pointer" size="sm"
                  indicator="hidden" orientation="horizontal" variant="table" :items="partsItems"
                  :ui="{ item: 'p-2' }" />
              </UFormField>

              <UButton type="submit" color="primary" size="md" class="w-full justify-center"
                :label="$t('continue-to-editor')" trailing-icon="i-lucide-arrow-right" />

            </UForm>
          </UCard>
        </div>

        <div class="flex items-center justify-center gap-4">
          <UColorModeSelect />
          <LocaleSelect :locales="locales" v-model="nav.locale" />
        </div>

        <div class="flex items-center justify-center">
          <ULink href="https://github.com/Genteure/zmk-wizard" target="_blank" class="text-sm text-muted">
            https://github.com/genteure/zmk-wizard
          </ULink>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import { z } from 'astro/zod';
import { useFluent } from 'fluent-vue';
import { computed, reactive, useTemplateRef, watch } from 'vue';

import { useKeyboardStore, useNavigationStore } from '~/components/stores.ts';
import { KeyboardNameSchema, KeyboardPartSchema, ShieldNameSchema, type KeyboardPart } from '~/types';
import { locales } from '../locales';

const { $t } = useFluent()

const partsItems = computed(() => [
  { label: $t('parts-radio-label', { count: 1 }), value: 1 },
  { label: $t('parts-radio-label', { count: 2 }), value: 2 },
  { label: $t('parts-radio-label', { count: 3 }), value: 3 },
  { label: $t('parts-radio-label', { count: 4 }), value: 4 },
  { label: $t('parts-radio-label', { count: 5 }), value: 5 },
])

const form = useTemplateRef('form')

const keyboard = useKeyboardStore();
const nav = useNavigationStore();

const formSchema = z.object({
  name: KeyboardNameSchema,
  shield: ShieldNameSchema,
  parts: z.number().min(1).max(5),
})

type FormSchema = z.output<typeof formSchema>

const formState = reactive<FormSchema>({
  name: '',
  shield: '',
  parts: 1,
})

const nameBytes = computed(() => new TextEncoder().encode(formState.name).length)

async function onClosePrevent() {
  await form.value?.submit?.()
}

watch(
  () => nav.dialog.info,
  (open, _previousOpen) => {
    if (open) {
      // Load current keyboard info into form when dialog opens
      formState.name = keyboard.name
      formState.shield = keyboard.shield
      formState.parts = keyboard.parts.length || 1
      return
    }
  },
  { immediate: true },
)

function nameToShield(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

// On display name changes, if the old shield name is empty or matches the
// old display name converted to shield format, update the shield name
watch(
  () => formState.name,
  (newName, oldName) => {
    const oldShieldFromName = nameToShield(oldName)
    if (!formState.shield || formState.shield === oldShieldFromName) {
      formState.shield = nameToShield(newName)
    }
  },
)

const defaultPartNames = ['left', 'right', 'third', 'fourth', 'fifth']
const defaultUnibodyPartName = 'unibody'

async function onSubmit(event: FormSubmitEvent<FormSchema>) {
  keyboard.name = event.data.name
  keyboard.shield = event.data.shield

  // Update keyboard parts based on selected number of parts
  const targetPartsCount = event.data.parts

  if (keyboard.parts.length !== targetPartsCount) {
    keyboard.$patch((k) => {
      if (targetPartsCount > k.parts.length) {
        // Add new parts if increasing count
        for (let i = k.parts.length; i < targetPartsCount; i++) {
          const p = KeyboardPartSchema.parse({
            name: defaultPartNames[i] || `part${i + 1}`,
            controller: 'nice_nano_v2'
          } as Partial<KeyboardPart>)
          k.parts.push(p)
        }
      } else {
        // Remove extra parts if decreasing count
        k.parts.splice(targetPartsCount)
      }
      if (targetPartsCount === 1) {
        k.parts[0].name = defaultUnibodyPartName
      } else {
        // If changing from unibody to split, rename the existing part to "left"
        if (k.parts[0].name === defaultUnibodyPartName) {
          k.parts[0].name = defaultPartNames[0]
        }
      }
    });
  }

  nav.dialog.info = false
}
</script>

<ftl locale="en">
subtitle = Create ZMK shields for custom keyboards without writing code
display-name = Display Name
display-name-help = Shows up on your computer and phone. Max 16 bytes.
shield-name = Shield Name
shield-name-help = For firmware and file names. Use lowercase letters, numbers, and underscores.
split-part = Split Keyboard Parts
parts-radio-label = {$count ->
  [1] Unibody
  *[other] {$count} Parts
}
continue-to-editor = Continue to Editor
</ftl>

<ftl locale="zh-CN">
subtitle = 免代码为 DIY 键盘生成 ZMK shield
display-name = 显示名字
display-name-help = 显示在电脑和手机上的名字。最长 16 字节。
shield-name = Shield 名
shield-name-help = 用于固件和文件名。使用小写字母、数字和下划线。
split-part = 分体键盘构成
parts-radio-label = {$count ->
  [1] 一体式
  *[other] {$count} 个分体
}
continue-to-editor = 进入编辑器
</ftl>

<ftl locale="ja">
subtitle = コード不要で、自作キーボードのZMKシールドを作成
display-name = 表示名
display-name-help = パソコンやスマートフォンに表示される名前です。最大16バイト。
shield-name = シールド名
shield-name-help = ファームウェアやファイル名に使われる名前です。小文字のアルファベット、数字、アンダースコアを使用してください。
split-part = 分割キーボードの構成
parts-radio-label = {$count ->
  [1] 一体型
  *[other] {$count} パーツ
}
continue-to-editor = エディターに進む
</ftl>
