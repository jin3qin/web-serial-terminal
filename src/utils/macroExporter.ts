/**
 * 快捷指令配置文件导入导出工具。
 *
 * 功能：
 * - 导出：将MacroStorage保存为JSON文件
 * - 导入：从JSON文件加载MacroStorage
 * - 数据校验：确保导入数据格式正确
 */

import type { MacroGroup, MacroShortcut, MacroStorage } from '@/types/serial';
import { formatFileStamp } from '@/utils/format';

/** 导出的配置文件结构 */
export interface MacroExportConfig extends MacroStorage {
  /** 导出时间戳 */
  exportedAt: number;
  /** 导出工具标识 */
  exportedBy: string;
}

/** 导入结果 */
export interface ImportResult {
  success: boolean;
  data?: MacroStorage;
  error?: string;
  stats?: {
    groups: number;
    macros: number;
  };
}

/**
 * 判断是否为普通对象
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 校验并清洗分组数据
 */
function sanitizeGroups(raw: unknown): MacroGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const groups: MacroGroup[] = [];
  for (const item of raw) {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.order === 'number'
    ) {
      groups.push({
        id: item.id,
        name: item.name,
        description: typeof item.description === 'string' ? item.description : undefined,
        order: item.order,
      });
    }
  }

  return groups;
}

/**
 * 校验并清洗快捷指令数据
 */
function sanitizeMacros(raw: unknown): MacroShortcut[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const macros: MacroShortcut[] = [];
  for (const item of raw) {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.label === 'string' &&
      typeof item.payload === 'string' &&
      (item.mode === 'text' || item.mode === 'hex') &&
      typeof item.description === 'string'
    ) {
      macros.push({
        id: item.id,
        label: item.label,
        payload: item.payload,
        mode: item.mode,
        description: item.description,
        groupId: typeof item.groupId === 'string' ? item.groupId : undefined,
      });
    }
  }

  return macros;
}

/**
 * 校验导入的配置数据
 */
export function validateMacroConfig(raw: unknown): ImportResult {
  // 结构校验
  if (!isRecord(raw)) {
    return {
      success: false,
      error: '配置文件格式不正确，请选择有效的JSON文件',
    };
  }

  // 版本校验
  if (raw.version !== 1) {
    return {
      success: false,
      error: '配置文件版本不兼容，请使用最新版本导出的文件',
    };
  }

  // 必要字段校验
  if (!Array.isArray(raw.groups)) {
    return {
      success: false,
      error: '配置文件缺少分组数据',
    };
  }

  if (!Array.isArray(raw.macros)) {
    return {
      success: false,
      error: '配置文件缺少快捷指令数据',
    };
  }

  // 数据清洗
  const groups = sanitizeGroups(raw.groups);
  const macros = sanitizeMacros(raw.macros);

  // 空数据校验
  if (groups.length === 0 && macros.length === 0) {
    return {
      success: false,
      error: '配置文件不包含任何有效数据',
    };
  }

  return {
    success: true,
    data: {
      version: 1,
      groups,
      macros,
    },
    stats: {
      groups: groups.length,
      macros: macros.length,
    },
  };
}

/**
 * 触发浏览器下载JSON文件
 */
function downloadJson(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // 延迟释放，兼容部分浏览器
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 导出快捷指令配置
 *
 * @param storage 当前快捷指令存储数据
 */
export function exportMacroConfig(storage: MacroStorage): void {
  const config: MacroExportConfig = {
    ...storage,
    exportedAt: Date.now(),
    exportedBy: 'Serial Debug Tool v1.0.0',
  };

  const json = JSON.stringify(config, null, 2);
  const fileName = `macros-${formatFileStamp(Date.now())}.json`;

  downloadJson(json, fileName);
}

/**
 * 从文件导入快捷指令配置
 *
 * @param file 用户选择的文件
 * @returns Promise<ImportResult> 导入结果
 */
export function importMacroConfig(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    // 文件类型校验
    if (!file.name.endsWith('.json')) {
      resolve({
        success: false,
        error: '请选择JSON格式的配置文件',
      });
      return;
    }

    // 文件大小限制（1MB）
    if (file.size > 1024 * 1024) {
      resolve({
        success: false,
        error: '配置文件过大，请选择小于1MB的文件',
      });
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const raw = JSON.parse(content);
        const result = validateMacroConfig(raw);
        resolve(result);
      } catch {
        resolve({
          success: false,
          error: '配置文件JSON格式错误，无法解析',
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        error: '文件读取失败，请重试',
      });
    };

    reader.readAsText(file, 'UTF-8');
  });
}