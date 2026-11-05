import { readFileSync } from 'node:fs';

export const SUPPORTED_FORMAT = 1;

export function loadPresets(file) {
  const none = (warning) => ({ presets: {}, warning });
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return none('未找到 presets.json，预设不可用');
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return none('presets.json 格式无效');
  }
  const v = data?.formatVersion;
  if (!Number.isInteger(v) || typeof data.presets !== 'object' || data.presets === null) {
    return none('presets.json 格式无效');
  }
  if (v > SUPPORTED_FORMAT) return none(`预设格式已更新（formatVersion ${v}），请升级 ccpm`);
  return { presets: data.presets, warning: null };
}

export function expandPreset(presets, name) {
  if (!Object.hasOwn(presets, name)) throw new Error(`未知预设: ${name}`);
  const out = new Set();
  const walk = (n, stack) => {
    if (stack.includes(n)) throw new Error(`预设循环包含: ${[...stack, n].join(' -> ')}`);
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
    if (pluginNames.has(name)) errors.push(`预设 ${name} 与插件重名`);
    for (const item of def.plugins) {
      if (!pluginNames.has(item) && !Object.hasOwn(presets, item)) {
        errors.push(`预设 ${name} 引用了不存在的 ${item}`);
      }
    }
    try {
      expandPreset(presets, name);
    } catch (e) {
      if (e.message.startsWith('预设循环包含')) errors.push(e.message);
    }
  }
  return errors;
}
