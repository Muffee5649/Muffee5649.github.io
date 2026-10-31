<script lang="ts" setup>
import { reactive } from 'vue'
import { useToast } from '@wot-ui/ui'
import { LOGIN_PAGE } from '@/router/config'
import { AuthService } from '@/service/auth'

definePage({
  style: {
    navigationBarTitleText: '注册',
  },
})

const form = reactive({
  email: '',
  username: '',
  password: '',
})

const toast = useToast()

async function doRegister() {
  if (!form.email || !form.username || !form.password) {
    toast.error('请填写完整的注册信息')
    return
  }
  const { data, error } = await AuthService.register({
    email: form.email,
    username: form.username,
    password: form.password,
  })
  if (error) {
    toast.error(error.message)
    return
  }
  // 开启邮箱确认时不会直接返回会话，需用户点击邮件链接后再登录
  toast.show({
    msg: data.session ? '注册成功' : '注册成功，请先确认邮箱',
  })
  uni.navigateTo({
    url: LOGIN_PAGE,
  })
}
</script>

<template>
  <view class="login px-6">
    <view class="mt-4 text-center">
      注册页
    </view>
    <wd-input
      v-model="form.email"
      placeholder="邮箱"
      clearable
      custom-class="mt-6"
    />
    <wd-input
      v-model="form.username"
      placeholder="用户名（3-20 个字符）"
      clearable
      custom-class="mt-3"
    />
    <wd-input
      v-model="form.password"
      placeholder="密码（不少于 6 位）"
      show-password
      custom-class="mt-3"
    />
    <wd-button type="primary" size="large" block custom-class="mt-6" @click="doRegister">
      注册
    </wd-button>
    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
