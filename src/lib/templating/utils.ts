
import type { Keyboard } from "~/typedef";

export function shieldRootPath(shield: string): string {
  return `boards/shields/${shield}`;
}

export function kconfigShieldPath(shield: string): string {
  return `${shieldRootPath(shield)}/Kconfig.shield`;
}

export function kconfigDefconfigPath(shield: string): string {
  return `${shieldRootPath(shield)}/Kconfig.defconfig`;
}

export function shieldLayoutsFilename(shield: string): string {
  return `${shield}-layouts.dtsi`;
}

export function shieldLayoutsPath(shield: string): string {
  return `${shieldRootPath(shield)}/${shieldLayoutsFilename(shield)}`;
}

export function shieldDtsiFilename(shield: string): string {
  return `${shield}.dtsi`;
}

export function shieldDtsiPath(shield: string): string {
  return `${shieldRootPath(shield)}/${shieldDtsiFilename(shield)}`;
}

export function partOverlayBasename(keyboard: Keyboard, partIndex?: number): string {
  if (keyboard.parts.length === 1 || partIndex === undefined) {
    return keyboard.shield;
  }
  const part = keyboard.parts[partIndex];
  return `${keyboard.shield}_${part.name}`;
}

export function partOverlayPath(keyboard: Keyboard, partIndex?: number): string {
  return `${shieldRootPath(keyboard.shield)}/${partOverlayFilename(keyboard, partIndex)}`;
}

export function boardOverlayPath(keyboard: Keyboard, board: string, partIndex?: number): string {
  return `${shieldRootPath(keyboard.shield)}/boards/${partOverlayBasename(keyboard, partIndex)}/${board}.overlay`;
}

export function dongleOverlayPath(shield: string): string {
  return `${shieldRootPath(shield)}/${dongleOverlayFilename(shield)}`;
}

export function partOverlayFilename(keyboard: Keyboard, partIndex?: number): string {
  return `${partOverlayBasename(keyboard, partIndex)}.overlay`;
}

export function dongleOverlayFilename(shield: string): string {
  return `${shield}_dongle.overlay`;
}

export function centralToPeripheralSnippetName(keyboard: Keyboard): string {
  if (keyboard.parts.length === 1) {
    return `${keyboard.shield.replaceAll('_', '-')}-as-peripheral`;
  }
  return `${keyboard.shield.replaceAll('_', '-')}-${keyboard.parts[0].name}-as-peripheral`;
}

export function centralToPeripheralSnippetRoot(keyboard: Keyboard): string {
  return `snippets/${centralToPeripheralSnippetName(keyboard)}`;
}

export function inputDeviceBaseName(partName: string, deviceIndex: number): string {
  return `${partName}${deviceIndex}`;
}

export function inputDeviceNodeName(baseName: string): string {
  return `input_device_${baseName}`;
}

export function inputSplitNodeName(baseName: string): string {
  return `input_split_${baseName}`;
}

export function inputListenerNodeName(baseName: string): string {
  return `input_listener_${baseName}`;
}
