<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { Ellipsis } from "@lucide/vue";
defineProps<{ label: string; contextOnly?: boolean; items: { label: string; action: () => void; danger?: boolean; disabled?: boolean }[] }>();
const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const panel = ref<HTMLDivElement | null>(null);
const position = ref({ left: '0px', top: '0px' });
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus(); }
async function toggle() {
  if (open.value) { close(); return; }
  const rect = trigger.value!.getBoundingClientRect();
  await showAt(rect.left, rect.bottom + 6);
}
async function openAt(event: MouseEvent | KeyboardEvent) {
  event.preventDefault();
  trigger.value = event.currentTarget as HTMLElement;
  const rect = trigger.value.getBoundingClientRect();
  const pointer = event instanceof MouseEvent;
  await showAt(pointer ? event.clientX : rect.left, pointer ? event.clientY : rect.bottom);
}
async function showAt(left: number, top: number) {
  position.value = { left: `${Math.max(12, Math.min(left, window.innerWidth - 224))}px`, top: `${top}px` };
  open.value = true;
  await nextTick();
  if (!panel.value) return;
  const height = panel.value.getBoundingClientRect().height;
  position.value.top = `${Math.max(12, Math.min(top, window.innerHeight - height - 12))}px`;
  panel.value.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}
function outside(event: PointerEvent) { if (!trigger.value?.contains(event.target as Node) && !panel.value?.contains(event.target as Node)) close(); }
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(true); }
  if (event.key === 'Tab') close();
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
function dismiss() { close(); }
defineExpose({ openAt, close });
watch(open, (value, _previous, onCleanup) => {
  if (!value) return;
  document.addEventListener('pointerdown', outside); window.addEventListener('resize', dismiss); document.addEventListener('scroll', dismiss, true);
  onCleanup(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', dismiss, true); });
});
</script>
<template>
  <button v-if="!contextOnly" ref="trigger" class="action-menu-trigger" :aria-label="label" :title="label" aria-haspopup="menu" :aria-expanded="open" @click.stop="toggle" @dblclick.stop><Ellipsis :size="18" /></button>
  <Teleport to="body"><div v-if="open" ref="panel" class="action-popover" :style="position" role="menu" :aria-label="label" @keydown.stop="keyboard"><button v-for="(item, index) in items" :key="index" role="menuitem" :disabled="item.disabled" :class="{ destructive: item.danger }" @click="close(true); item.action()">{{ item.label }}</button></div></Teleport>
</template>
