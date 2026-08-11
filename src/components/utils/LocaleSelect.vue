<!--
  Modified from https://github.com/nuxt/ui/blob/v4@{2026-Jun-1}/src/runtime/components/locale/LocaleSelect.vue
-->
<script setup lang="ts">
import type { Locale, SelectMenuProps } from '@nuxt/ui';
import { reactiveOmit } from '@vueuse/core';
import { useForwardProps } from 'reka-ui';

export interface LocaleSelectProps extends Omit<SelectMenuProps<Locale<unknown>[], 'code', false>, 'items' | 'modelValue'> {
  locales?: Locale<unknown>[]
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<LocaleSelectProps>(), {
  searchInput: false,
  valueKey: 'code',
  labelKey: 'name',
  locales: () => [],
})

const selectMenuProps = useForwardProps(reactiveOmit(props, 'locales', 'clear'))

const modelValue = defineModel<string>({ required: true })

</script>

<template>
  <USelectMenu v-model="modelValue" v-bind="{ ...selectMenuProps, ...$attrs }"
    :clear="props.clear === false ? undefined : props.clear" :items="locales" />
</template>
