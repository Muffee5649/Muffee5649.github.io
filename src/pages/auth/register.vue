<script lang="ts" setup>
import { reactive } from 'vue'
import { useToast } from '@wot-ui/ui'
import { LOGIN_PAGE } from '@/router/config'
import { AuthService } from '@/service/auth'
import { useUserStore } from '@/store/user'

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
  // 关闭邮箱确认后 signUp 会直接返回会话，同步用户资料并返回上一页
  if (data.session) {
    await useUserStore().fetchUserInfo()
    toast.success('注册成功')
    uni.navigateBack()
    return
  }
  toast.show({
    msg: '注册成功，请登录',
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
      placeholder="邮箱（用于资料展示）"
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
