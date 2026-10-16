import type { AudioQuality } from "./contracts";
export const audioQualityOptions: { value: AudioQuality; label: string }[] = [
  { value: "standard", label: "标准" },
  { value: "higher", label: "较高" },
  { value: "exhigh", label: "极高" },
  { value: "lossless", label: "无损" },
];
export function isAudioQuality(value: unknown): value is AudioQuality {
  return audioQualityOptions.some(option => option.value === value);
}
export function qualityLabel(value: string): string {
  return audioQualityOptions.find(option => option.value === value)?.label || value;
}
