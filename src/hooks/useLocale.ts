import { readonly, ref } from 'vue'
import i18n, { t } from '@/locale/index'
import { setTabbarItem } from '@/tabbar/i18n'

/** 可选语言 */
export interface LanguageOption {
  /** uniapp 语言标识，如 zh-Hans、en */
  value: string
  /** 展示名称 */
  name: string
}

/** 可选语言列表 */
export const languageList: LanguageOption[] = [
  { value: 'zh-Hans', name: '中文' },
  { value: 'en', name: '英文' },
]

export interface SwitchLocaleOptions {
  /** 切换后刷新导航栏标题使用的 i18n key，不传则不修改标题 */
  titleKey?: string
}

/** 模块级单例，保证所有页面共享当前语言 */
const currentLocale = ref(uni.getLocale())

/**
 * 切换语言（非组件环境也可直接调用）
 * 注意：uni.setLocale 与 i18n.global.locale 缺一不可
 */
export function switchLocale(value: string, options: SwitchLocaleOptions = {}) {
  currentLocale.value = value
  uni.setLocale(value)
  i18n.global.locale = value

  // 原生 tabbar 文案需要手动刷新
  setTabbarItem()

  if (options.titleKey) {
    uni.setNavigationBarTitle({
      title: t(options.titleKey),
    })
  }
}

export function useLocale() {
  return {
    /** 可选语言列表 */
    languageList,
    /** 当前语言（响应式，跨页面共享） */
    locale: readonly(currentLocale),
    /** 切换语言 */
    switchLocale,
  }
}
