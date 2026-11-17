<script setup lang="ts">
import { onAppShow, onHide, onLaunch } from '@dcloudio/uni-app'
import { getCurrentInstance, onMounted, onUnmounted } from 'vue'
import { UNAUTHORIZED_EVENT } from '@/http/supabase'
import { t } from '@/locale/index'
import { navigateToInterceptor } from '@/router/interceptor'
import { permission } from '@/router/permission'
import { useTokenStore } from '@/store/token'
import { tabbarStore } from '@/tabbar/store'
import { toLoginPage } from '@/utils/toLoginPage'

const { proxy } = (getCurrentInstance() || {}) as any
const router = proxy?.$router

router && permission.install(router)

const tokenStore = useTokenStore()

/** 同时多个请求返回 401 时，只处理一次 */
let handlingUnauthorized = false

/** 401：清理登录态并跳转登录页 */
async function handleUnauthorized() {
  if (handlingUnauthorized) {
    return
  }
  handlingUnauthorized = true
  try {
    // 本来就没有登录态（如公开接口返回 401），不打断游客浏览
    if (!tokenStore.tokenInfo.accessToken) {
      return
    }
    uni.showToast({
      title: t('auth.error.sessionExpired'),
      icon: 'none',
    })
    await tokenStore.logout()
    toLoginPage()
  }
  finally {
    setTimeout(() => {
      handlingUnauthorized = false
    }, 1000)
  }
}

onLaunch((options) => {
  // console.log('App.vue onLaunch', options)
  uni.$on(UNAUTHORIZED_EVENT, handleUnauthorized)
})

onAppShow((options) => {
  // console.log('App.vue onShow', options)
  // 处理直接进入页面路由的情况：如h5直接输入路由、微信小程序分享后进入等
  // https://github.com/unibest-tech/unibest/issues/192
  if (options?.path) {
    navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  }
  else {
    navigateToInterceptor.invoke({ url: '/' })
  }
})
onHide(() => {
  // console.log('App Hide')
})

// #ifdef H5
function syncTabbarWhenPageVisible() {
  if (document.visibilityState === 'visible') {
    tabbarStore.syncCurIdxByCurrentPageAsync()
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', syncTabbarWhenPageVisible)
  window.addEventListener('pageshow', syncTabbarWhenPageVisible)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', syncTabbarWhenPageVisible)
  window.removeEventListener('pageshow', syncTabbarWhenPageVisible)
})
// #endif
</script>

<style lang="scss">

</style>
