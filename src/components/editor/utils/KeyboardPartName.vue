<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import type { FormSubmitEvent } from '@nuxt/ui';
import { z } from 'astro/zod';
import { reactive, ref, useTemplateRef, watch } from 'vue';
import { KeyboardPartSchema } from '~/types';

const { $t } = useFluent();

export interface KeyboardPartNameProps {
  label?: string
  placeholder?: string
  description?: string
}

const props = withDefaults(defineProps<KeyboardPartNameProps>(), {
  label: 'Part Name',
  placeholder: 'Enter part name',
});

const modelValue = defineModel<string>({ required: true });

const open = ref(false);
const form = useTemplateRef('form');

const formSchema = z.object({ value: KeyboardPartSchema.shape.name });
type FormSchema = z.output<typeof formSchema>;
const formState = reactive<FormSchema>({ value: '' });

watch(open, (isOpen) => {
  if (isOpen) formState.value = modelValue.value;
});

function onSubmit(event: FormSubmitEvent<FormSchema>) {
  modelValue.value = event.data.value;
  open.value = false;
}
</script>

<template>
  <UFieldGroup>
    <UInput :model-value="modelValue" readonly class="w-24" @click="open = true" />

    <UPopover v-model:open="open" :content="{ side: 'bottom', sideOffset: 6 }" arrow>
      <UButton icon="i-lucide-pencil" variant="outline" color="neutral" />

      <template #content>
        <div class="p-3 w-64">
          <UForm ref="form" :schema="formSchema" :state="formState" class="flex flex-col gap-3" @submit="onSubmit">
            <UFormField name="value" :label="label" :description="description">
              <UInput v-model="formState.value" :placeholder="placeholder" class="w-full" autofocus
                pattern="[a-z0-9]+" />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton :label="$t('cancel')" color="neutral" variant="ghost" @click="open = false" />
              <UButton type="submit" :label="$t('part-name-save')" />
            </div>
          </UForm>
        </div>
      </template>
    </UPopover>
  </UFieldGroup>
</template>

<ftl locale="en">
part-name-save = Save
</ftl>

<ftl locale="zh-CN">
part-name-save = 保存
</ftl>

<ftl locale="ja">
part-name-save = 保存
</ftl>
