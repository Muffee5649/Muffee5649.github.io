import { t } from '@/locale/index'
import { showAlert } from '@/utils/dialog'

/** 非vue 文件使用 i18n */
export function testI18n() {
  // 下面同样生效
  showAlert({
    title: 'i18n 测试',
    msg: t('i18n.title'),
  })
}
