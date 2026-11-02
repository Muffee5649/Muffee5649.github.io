<script lang="ts" setup>
import { onShow } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { languageOptions, RADIUS_BASE_PX, themeColorOptions, useSettingStore } from '@/store/setting'

definePage({
  style: {
    navigationBarTitleText: '%settings.title%',
  },
})

const settingStore = useSettingStore()
const toast = useToast()
const dialog = useDialog()

/** 语言选择面板 */
const actionSheetVisible = ref(false)

/** 圆角滑条草稿值（百分比） */
const radiusDraft = ref(0)
const languageActions = languageOptions.map(item => ({ name: item.name }))

onShow(() => {
  // 小程序页面标题不会随语言切换自动更新，进入页面时按当前语言重新设置
  uni.setNavigationBarTitle({ title: t('settings.title') })
})

/** 当前语言的展示名称 */
const currentLanguageName = computed(
  () => languageOptions.find(item => item.value === settingStore.locale)?.name ?? '',
)

type SettingItemKey = 'themeColor' | 'radius' | 'language'

interface SettingItem {
  key: SettingItemKey
  icon: string
  title: string
}

/** 设置项：图标与标题统一循环渲染，仅内容区域按 key 区分 */
const settingItems: SettingItem[] = [
  { key: 'themeColor', icon: 'i-ri-font-color', title: 'settings.themeColor' },
  { key: 'radius', icon: 'i-ri-rounded-corner', title: 'settings.radius' },
  { key: 'language', icon: 'i-ri-translate', title: 'settings.language' },
]

function handleItemClick(key: SettingItemKey) {
  if (key === 'radius') {
    handleSwitchRadius()
  }
  else if (key === 'language') {
    handleSwitchLanguage()
  }
}

/** 切换主题色 */
function handleSwitchThemeColor(value: string) {
  if (value === settingStore.themeColor) {
    return
  }
  settingStore.setThemeColor(value)
  toast.show(t('settings.switched'))
}

/** 弹窗内拖动滑条调整系统圆角，确认后生效 */
async function handleSwitchRadius() {
  radiusDraft.value = settingStore.radius
  const result = await dialog.confirm({ title: t('settings.radius') })
  if (result.action !== 'confirm') {
    return
  }
  settingStore.setRadius(radiusDraft.value)
  toast.show(t('settings.switched'))
}

/** 打开语言选择面板 */
function handleSwitchLanguage() {
  actionSheetVisible.value = true
}

/** 选择语言并切换 */
function handleLanguageSelect({ index }: { index: number }) {
  const target = languageOptions[index]
  if (!target || target.value === settingStore.locale) {
    return
  }
  settingStore.setLocale(target.value)
  // 切换后立即刷新当前页标题
  uni.setNavigationBarTitle({ title: t('settings.title') })
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
            v-for="color in themeColorOptions"
            :key="color.value"
            class="h-7 w-7 center flex-none rounded-full"
            :style="{ backgroundColor: color.value }"
            @click.stop="handleSwitchThemeColor(color.value)"
          >
            <view v-if="settingStore.themeColor === color.value" class="i-ri-check-line text-14px text-white" />
          </view>
        </view>
        <text v-else-if="item.key === 'radius'">{{ settingStore.radius }}%</text>
        <text v-else>{{ currentLanguageName }}</text>
      </wd-cell>
    </wd-cell-group>

    <wd-action-sheet
      v-model="actionSheetVisible"
      :actions="languageActions"
      @select="handleLanguageSelect"
    />
    <wd-dialog>
      <view class="py-2">
        <view class="flex items-center justify-between text-sm">
          <text class="text-gray-500">{{ t('settings.radiusHint', { px: RADIUS_BASE_PX }) }}</text>
          <text class="text-primary">{{ radiusDraft }}%</text>
        </view>
        <view class="mt-5 px-3">
          <wd-slider v-model="radiusDraft" :min="0" :max="100" :step="1" popover-visible="never" />
        </view>
      </view>
    </wd-dialog>
    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
