<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Check, ChevronDown } from "@lucide/vue";
import type { AudioQuality } from "../../../shared/contracts";
import { audioQualityOptions, qualityLabel } from "../../../shared/audio-quality";
const props = defineProps<{ modelValue: AudioQuality; actual?: string; compact?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: AudioQuality] }>();
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const position = ref({ left: '0px', top: '0px' });
const title = computed(() => props.actual ? `实际播放：${qualityLabel(props.actual)}；默认选择：${qualityLabel(props.modelValue)}。点击切换音质` : '选择播放音质');
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus(); }
async function show() {
  const rect = trigger.value!.getBoundingClientRect();
  position.value = { left: `${Math.max(12, Math.min(rect.left, window.innerWidth - 232))}px`, top: `${rect.bottom + 6}px` };
  open.value = true;
  await nextTick();
  const height = panel.value?.getBoundingClientRect().height || 0;
  position.value.top = `${Math.max(12, rect.bottom + height + 12 > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6)}px`;
  panel.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
}
function choose(value: AudioQuality) { close(true); if (value !== props.modelValue) emit('update:modelValue', value); }
function outside(event: PointerEvent) { if (!trigger.value?.contains(event.target as Node) && !panel.value?.contains(event.target as Node)) close(); }
function dismiss() { close(); }
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) { event.preventDefault(); event.stopPropagation(); close(true); }
  if (event.key === 'Tab' && open.value) { event.preventDefault(); close(true); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  if (!open.value) { void show(); return; }
  const buttons = [...(panel.value?.querySelectorAll<HTMLButtonElement>('button') || [])];
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
watch(open, (value, _old, cleanup) => {
  if (!value) return;
  document.addEventListener('pointerdown', outside);
  window.addEventListener('resize', dismiss);
  document.addEventListener('scroll', dismiss, true);
  cleanup(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', dismiss, true); });
});
</script>
<template>
  <button ref="trigger" class="quality-picker-trigger" :class="{ compact }" :title="title" :aria-label="compact ? '切换播放音质' : '默认音质'" aria-haspopup="menu" :aria-expanded="open" @click.stop="open ? close() : show()" @keydown="keyboard">{{ qualityLabel(actual || modelValue) }}<ChevronDown :size="compact ? 10 : 13" /></button>
  <Teleport to="body"><div v-if="open" ref="panel" class="quality-picker-menu" :style="position" role="menu" aria-label="选择音质" @keydown="keyboard">
    <p>播放音质</p>
    <button v-for="option in audioQualityOptions" :key="option.value" role="menuitemradio" :aria-checked="modelValue === option.value" :class="{ selected: modelValue === option.value }" @click="choose(option.value)"><span>{{ option.label }}</span><Check v-if="modelValue === option.value" :size="15" /></button>
    <small>实际音质取决于歌曲和账号权益</small>
  </div></Teleport>
</template>
<style scoped>
.quality-picker-trigger { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #e4e8ee; border-radius: 8px; color: #7c8795; font-size: 14px; background: #f5f6f8; }
.quality-picker-trigger.compact { gap: 3px; padding: 1px 4px; margin-left: 5px; border-radius: 3px; font-size: 10px; vertical-align: middle; background: transparent; }
.quality-picker-trigger:hover, .quality-picker-trigger:focus-visible { color: #cf6663; border-color: #e0b6b4; outline: none; }
.quality-picker-menu { position: fixed; z-index: 150; width: 220px; padding: 9px; border: 1px solid #edf0f4; border-radius: 12px; background: #fff; box-shadow: 0 8px 32px #424d6621; }
.quality-picker-menu p { margin: 5px 9px 8px; color: #929baa; font-size: 12px; }
.quality-picker-menu button { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 7px; color: #7c8795; font-size: 14px; }
.quality-picker-menu button.selected { color: #cc6663; background: #faeeec; }
.quality-picker-menu button:hover, .quality-picker-menu button:focus-visible { outline: none; background: #f4f5f7; }
.quality-picker-menu small { display: block; margin: 9px 9px 4px; color: #9ca4af; font-size: 11px; }
</style>
