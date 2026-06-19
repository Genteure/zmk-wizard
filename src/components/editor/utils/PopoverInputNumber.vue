<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useNavigationStore } from '~/components/stores';

const nav = useNavigationStore();

type NumberType = 'float' | 'integer';

const props = defineProps<{
  inputType: NumberType;
  title?: string;
}>();

const model = defineModel<number | null>({ default: null });

const buttonLabel = computed(() => {
  if (model.value === null) return '—';
  if (props.inputType === 'integer') return model.value.toString();

  return model.value.toLocaleString(nav.locale, {
    minimumFractionDigits: 1,
  });
});
const step = computed(() => (props.inputType === 'float' ? 0.1 : 1));
const formatOptions = computed(() => (props.inputType === 'float' ? { minimumFractionDigits: 1 } : {}));

const isOpen = ref(false);
const localModelCache = ref<number | null>(model.value);

const closeOnEnter = (_event: KeyboardEvent) => {
  isOpen.value = false;
};

watch(isOpen, (open) => {
  if (open) {
    localModelCache.value = model.value;
  } else {
    model.value = localModelCache.value;
  }
});
</script>

<template>
  <UButton v-if="!isOpen" :label="buttonLabel" :title="props.title" :aria-label="props.title" color="neutral"
    variant="ghost" class="w-full justify-center" @click="isOpen = true" />
  <UPopover v-else v-model:open="isOpen" arrow modal>
    <!-- format model number according to input type for display in the button label -->
    <UButton :label="buttonLabel" :title="props.title" :aria-label="props.title" color="neutral" variant="ghost"
      class="w-full justify-center" />
    <template #content>
      <div class="p-2 w-40">
        <UInputNumber :step="step" :step-snapping="false" :format-options="formatOptions" invertWheelChange
          class="w-full" v-model="localModelCache" @keydown.enter="closeOnEnter" />
      </div>
    </template>
  </UPopover>
</template>
