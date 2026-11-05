import { t } from './i18n/index.js';
import { readFileSync } from 'node:fs';

export const SUPPORTED_FORMAT = 1;

export function loadPresets(file) {
  const none = (warning) => ({ presets: {}, warning });
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return none(null); // 没有 presets.json：这个 marketplace 不用预设
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return none(t('presets.json 格式无效'));
  }
  const v = data?.formatVersion;
  if (!Number.isInteger(v) || typeof data.presets !== 'object' || data.presets === null) {
    return none(t('presets.json 格式无效'));
  }
  if (v > SUPPORTED_FORMAT) return none(t('预设格式已更新（formatVersion {0}），请升级 ccpm', v));
  return { presets: data.presets, warning: null };
}

export function expandPreset(presets, name) {
  if (!Object.hasOwn(presets, name)) throw new Error(t('未知预设: {0}', name));
  const out = new Set();
  const walk = (n, stack) => {
    if (stack.includes(n)) throw new Error(t('预设循环包含: {0}', [...stack, n].join(' -> ')));
    for (const item of presets[n].plugins) {
      if (Object.hasOwn(presets, item)) walk(item, [...stack, n]);
      else out.add(item);
    }
  };
  walk(name, []);
  return [...out];
}

export function validatePresets(presets, pluginNames) {
  const errors = [];
  for (const [name, def] of Object.entries(presets)) {
    if (pluginNames.has(name)) errors.push(t('预设 {0} 与插件重名', name));
    for (const item of def.plugins) {
      if (!pluginNames.has(item) && !Object.hasOwn(presets, item)) {
        errors.push(t('预设 {0} 引用了不存在的 {1}', name, item));
      }
    }
    try {
      expandPreset(presets, name);
    } catch (e) {
      if (e.message.startsWith(t('预设循环包含'))) errors.push(e.message);
    }
  }
  return errors;
}
