import { t } from '@/locale/index'
import { getCurrentPageI18nKey } from '@/utils'
import { showAlert } from '@/utils/dialog'

/** 非vue 文件使用 i18n */
export function testI18n() {
  // 下面同样生效
  showAlert({
    title: 'i18n 测试',
    msg: t('i18n.title'),
  })
}

/**
 * 按当前语言重新设置当前页面标题
 * 小程序页面标题不会随 uni.setLocale 自动更新，需要每次页面显示时重新设置
 */
export function refreshPageTitle() {
  const title = getCurrentPageI18nKey()
  if (!title) {
    return
  }
  // pages.json 中可能是 %i18n.key% 占位符，也可能直接是普通文案
  const match = title.match(/%(.+?)%/)
  uni.setNavigationBarTitle({ title: match ? t(match[1]) : title })
}
