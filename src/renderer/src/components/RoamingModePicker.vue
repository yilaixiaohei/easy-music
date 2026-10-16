<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Check, ChevronDown, Compass, Heart, Sparkles } from "@lucide/vue";
import type { RoamingMode } from "../../../shared/contracts";

const props = defineProps<{ modelValue: RoamingMode; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [mode: RoamingMode] }>();
const options = [
  { value: "DEFAULT", label: "默认模式", description: "按你的口味，遇见好音乐", icon: Sparkles },
  { value: "FAMILIAR", label: "熟悉模式", description: "重逢熟悉的旋律", icon: Heart },
  { value: "EXPLORE", label: "探索模式", description: "多一点新鲜，发现不同", icon: Compass },
] as const;
const selected = computed(() => options.find((item) => item.value === props.modelValue)!);
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
async function show() {
  if (props.disabled) return;
  open.value = true;
  await nextTick();
  root.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
}
function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function choose(value: RoamingMode) {
  close(true);
  if (value !== props.modelValue) emit("update:modelValue", value);
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    if (!open.value) { void show(); return; }
    const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
      (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}
function onFocusout(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) close();
}
watch(() => props.disabled, (disabled) => { if (disabled) close(); });
onMounted(() => document.addEventListener("pointerdown", outside));
onUnmounted(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <div ref="root" class="roaming-mode-picker" @keydown="onKeydown" @focusout="onFocusout">
    <button ref="trigger" class="roaming-mode-trigger" :disabled="disabled"
      aria-label="私人漫游推荐模式" aria-haspopup="menu" :aria-expanded="open"
      @click="open ? close() : show()">
      <component :is="selected.icon" :size="15" />
      <span>{{ selected.label }}</span>
      <ChevronDown :size="14" :class="{ 'chevron-open': open }" />
    </button>
    <div v-if="open" class="roaming-mode-menu" role="menu" aria-label="选择漫游模式">
      <p class="roaming-mode-caption">选择你的漫游方式</p>
      <button v-for="option in options" :key="option.value" role="menuitemradio"
        :aria-checked="option.value === modelValue" class="roaming-mode-option"
        :class="{ selected: option.value === modelValue }" @click="choose(option.value)">
        <span class="roaming-option-icon"><component :is="option.icon" :size="18" /></span>
        <span class="roaming-option-copy"><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
        <Check v-if="option.value === modelValue" :size="16" />
      </button>
    </div>
  </div>
</template>
