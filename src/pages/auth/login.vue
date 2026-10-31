<script lang="ts" setup>
import { reactive } from 'vue'
import { useToast } from '@wot-ui/ui'
import { useTokenStore } from '@/store/token'

definePage({
  style: {
    navigationBarTitleText: '登录',
  },
})

const tokenStore = useTokenStore()
const toast = useToast()

const form = reactive({
  account: '',
  password: '',
})

async function doLogin() {
  if (tokenStore.hasLogin) {
    uni.navigateBack()
    return
  }
  if (!form.account || !form.password) {
    toast.error('请输入账号和密码')
    return
  }
  try {
    await tokenStore.login({
      account: form.account,
      password: form.password,
    })
    uni.navigateBack()
  }
  catch (error) {
    console.log('登录失败', error)
  }
}
</script>

<template>
  <view class="login px-6">
    <!-- 本页面是非MP的登录页，主要用于 h5 和 APP -->
    <view class="mt-4 text-center">
      登录页
    </view>
    <wd-input
      v-model="form.account"
      placeholder="邮箱或用户名"
      clearable
      custom-class="mt-6"
    />
    <wd-input
      v-model="form.password"
      placeholder="密码"
      show-password
      custom-class="mt-3"
    />
    <wd-button type="primary" size="large" block custom-class="mt-6" @click="doLogin">
      登录
    </wd-button>
    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
