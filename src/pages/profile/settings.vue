<script lang="ts" setup>
import { useToast } from '@wot-ui/ui'
import { useLocale } from '@/hooks/useLocale'
import { useTheme } from '@/hooks/useTheme'
import { t } from '@/locale/index'

definePage({
  style: {
    navigationBarTitleText: '%settings.title%',
  },
})

const { themeColor, themeList, setThemeColor } = useTheme()
const { locale, languageList, switchLocale } = useLocale()
const toast = useToast()

/** 语言选择面板 */
const actionSheetVisible = ref(false)

const languageActions = languageList.map(item => ({ name: item.name }))

/** 当前语言的展示名称 */
const currentLanguageName = computed(
  () => languageList.find(item => item.value === locale.value)?.name ?? '',
)

type SettingItemKey = 'themeColor' | 'language'

interface SettingItem {
  key: SettingItemKey
  icon: string
  title: string
}

/** 设置项：图标与标题统一循环渲染，仅内容区域按 key 区分 */
const settingItems: SettingItem[] = [
  { key: 'themeColor', icon: 'i-ri-font-color', title: 'settings.themeColor' },
  { key: 'language', icon: 'i-ri-translate', title: 'settings.language' },
]

function handleItemClick(key: SettingItemKey) {
  if (key === 'language') {
    handleSwitchLanguage()
  }
}

/** 切换主题色 */
function handleSwitchThemeColor(value: string) {
  if (value === themeColor.value) {
    return
  }
  setThemeColor(value)
  toast.show(t('settings.switched'))
}

/** 打开语言选择面板 */
function handleSwitchLanguage() {
  actionSheetVisible.value = true
}

/** 选择语言并切换 */
function handleLanguageSelect({ index }: { index: number }) {
  const target = languageList[index]
  if (!target || target.value === locale.value) {
    return
  }
  // 切换后由 switchLocale 立即刷新当前页标题
  switchLocale(target.value, { titleKey: 'settings.title' })
  toast.show(t('settings.switched'))
}
</script>

<template>
  <view class="min-h-screen bg-gray-50 px-3 pt-3">
    <wd-cell-group custom-class="overflow-hidden rounded-3" center>
      <wd-cell
        v-for="item in settingItems"
        :key="item.key"
        :title="$t(item.title)"
        :is-link="item.key !== 'themeColor'"
        @click="handleItemClick(item.key)"
      >
        <template #prefix>
          <view :class="item.icon" class="mr-1 text-xl text-gray-500" />
        </template>
        <view v-if="item.key === 'themeColor'" class="flex items-center justify-end gap-1">
          <view
            v-for="color in themeList"
            :key="color.value"
            class="h-7 w-7 center flex-none rounded-full"
            :style="{ backgroundColor: color.value }"
            @click.stop="handleSwitchThemeColor(color.value)"
          >
            <view v-if="themeColor === color.value" class="i-ri-check-line text-14px text-white" />
          </view>
        </view>
        <text v-else>{{ currentLanguageName }}</text>
      </wd-cell>
    </wd-cell-group>

    <wd-action-sheet
      v-model="actionSheetVisible"
      :actions="languageActions"
      @select="handleLanguageSelect"
    />
    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
