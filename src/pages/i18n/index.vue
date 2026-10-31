<script lang="ts" setup>
import i18n, { t } from '@/locale/index'
import { setTabbarItem } from '@/tabbar/i18n'
import { testI18n } from '@/utils/i18n'

definePage({
  style: {
    navigationBarTitleText: '%i18n.title%',
  },
})

const current = ref(uni.getLocale())
const user = { name: '张三', detail: { height: 178, weight: '75kg' } }
const languages = [
  {
    value: 'zh-Hans',
    name: '中文',
  },
  {
    value: 'en',
    name: '英文',
  },
]

function radioChange({ value }: { value: string | number | boolean | null }) {
  const locale = String(value) as 'zh-Hans' | 'en'
  current.value = locale
  // 下面2句缺一不可！！！
  uni.setLocale(locale)
  i18n.global.locale = locale

  // 底部tabbar需要重新设置一下
  setTabbarItem()
  // 本页的标题也需要重新设置一下
  uni.setNavigationBarTitle({
    title: t('i18n.title'),
  })
}
</script>

<template>
  <view class="mt-6 center flex-col">
    <view class="p-4 text-red-500 leading-6">
      经过我的测试发现，小程序里面会有2处BUG：
      <view>
        <text class="line-through"> 1. 页面标题多语言不生效 </text>
        <text class="ml-2 text-green-500"> 已解决 </text>
      </view>
      <view>
        <text class="line-through">
          2. 多语言传递的参数不生效，如下 heavy
        </text>
        <text class="ml-2 text-green-500"> 已解决 </text>
        <view class="ml-2 text-green-500">
          把 $t 改为自定义的 t 即可
        </view>
      </view>
    </view>
    <view class="text-green-500">
      多语言测试
    </view>
    <view class="m-4">
      {{ $t("i18n.title") }}
    </view>
    <view class="text-gray-500 italic">
      使用$t: {{ $t("weight", { heavy: 100 }) }}
    </view>
    <view class="m-4">
      {{ $t("weight", { heavy: 100 }) }}
    </view>
    <view class="text-gray-500 italic">
      使用t: {{ t("weight", { heavy: 100 }) }}
    </view>
    <view class="m-4">
      {{ t("weight", { heavy: 100 }) }}
    </view>
    <view class="m-4">
      {{ t("introduction", user) }}
    </view>

    <view class="mt-12 text-green-500">
      切换语言
    </view>
    <wd-radio-group v-model="current" custom-class="mt-4" @change="radioChange">
      <wd-radio
        v-for="item in languages"
        :key="item.value"
        :value="item.value"
        custom-class="my-1"
      >
        {{ item.name }}
      </wd-radio>
    </wd-radio-group>

    <!-- http://localhost:9000/#/pages/index/i18n -->
    <wd-button custom-class="mb-44 mt-20" @click="testI18n">
      测试弹窗
    </wd-button>
  </view>
</template>

<style lang="scss">
//
</style>
