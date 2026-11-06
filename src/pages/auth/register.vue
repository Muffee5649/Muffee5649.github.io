<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { LOGIN_PAGE } from '@/router/config'
import { AuthService } from '@/service/auth'
import { useUserStore } from '@/store/user'

definePage({
  style: {
    navigationBarTitleText: '%auth.register.title%',
    navigationStyle: 'custom',
  },
})

const form = reactive({
  username: '',
  password: '',
})

const toast = useToast()
const loading = ref(false)

async function doRegister() {
  if (!form.username || !form.password) {
    toast.error(t('auth.register.missingFields'))
    return
  }
  loading.value = true
  try {
    const { data, error } = await AuthService.register({
      username: form.username,
      password: form.password,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    // 关闭邮箱确认后 signUp 会直接返回会话，同步用户资料并返回上一页
    if (data.session) {
      await useUserStore().fetchUserInfo()
      toast.success(t('auth.register.success'))
      uni.navigateBack()
      return
    }
    toast.show({
      msg: t('auth.register.successLogin'),
    })
    uni.redirectTo({
      url: LOGIN_PAGE,
    })
  }
  finally {
    loading.value = false
  }
}

/** 返回登录页 */
function goLogin() {
  uni.redirectTo({
    url: LOGIN_PAGE,
  })
}
</script>

<template>
  <view class="register-page relative h-screen flex flex-col overflow-hidden">
    <!-- 上半部分：主题色渐变背景 -->
    <view class="gradient-hero h-[28%] w-full" />

    <!-- 下半部分：底部弹层风格表单卡 -->
    <view class="sheet flex flex-1 flex-col rounded-t-5 bg-white px-6 pt-8 pb-safe -mt-6">
      <!-- 标题：靠左 -->
      <view class="text-2xl text-gray-900 font-bold">
        {{ $t('auth.register.welcome') }}
      </view>
      <view class="mt-2 text-sm text-gray-400">
        {{ $t('auth.register.subtitle') }}
      </view>

      <!-- 表单 -->
      <wd-input
        v-model="form.username"
        :placeholder="$t('auth.register.usernamePlaceholder')"
        clearable
        custom-class="mt-8"
      >
        <template #prefix>
          <view class="i-carbon-user mr-1 text-18px text-gray-400" />
        </template>
      </wd-input>
      <wd-input
        v-model="form.password"
        :placeholder="$t('auth.register.passwordPlaceholder')"
        show-password
        custom-class="mt-3"
      >
        <template #prefix>
          <view class="i-ri-lock-line mr-1 text-18px text-gray-400" />
        </template>
      </wd-input>

      <wd-button
        type="primary"
        size="large"
        block
        custom-class="!mt-8"
        :loading="loading"
        @click="doRegister"
      >
        {{ $t('auth.register.submit') }}
      </wd-button>

      <!-- 登录引导 -->
      <view class="mt-6 flex justify-center text-sm">
        <text class="text-gray-400">{{ $t('auth.register.toLogin') }}</text>
        <text class="text-primary font-bold active:opacity-70" @tap="goLogin">
          {{ $t('auth.register.loginLink') }}
        </text>
      </view>
    </view>

    <wd-toast />

    <!-- 固定在屏幕底部展示版权信息 -->
    <app-copyright fixed />
  </view>
</template>

<style lang="scss" scoped>
/* 主题色渐变：跟随设置中的动态主题色（--wot-color-theme）变化 */
.gradient-hero {
  /* stylelint-disable-next-line order/properties-order */
  background: linear-gradient(
    160deg,
    rgba(var(--wot-color-theme-rgb, 93, 135, 255), 0.9) 0%,
    rgba(var(--wot-color-theme-rgb, 93, 135, 255), 0.65) 55%,
    rgba(var(--wot-color-theme-rgb, 93, 135, 255), 0.4) 100%
  );
}

/* 底部弹层卡片：柔和阴影 + 上侧圆角，圆角跟随全局圆角设置 */
.sheet {
  box-shadow: 0 -8rpx 40rpx rgba(0, 0, 0, 0.08);
  border-top-left-radius: calc(var(--app-radius, 12px) * 1.6);
  border-top-right-radius: calc(var(--app-radius, 12px) * 1.6);
}
</style>
