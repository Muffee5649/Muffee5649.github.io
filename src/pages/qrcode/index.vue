<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { DiningTableService } from '@/service/ordering'
import type { DiningTableQrItem } from '@/service/ordering'
import { ServiceError } from '@/service/shared'

defineOptions({
  name: 'Qrcode',
})

definePage({
  style: {
    navigationBarTitleText: '%qrcode.title%',
    enablePullDownRefresh: true,
  },
})

const toast = useToast()
const dialog = useDialog()

const loading = ref(false)
const tables = ref<DiningTableQrItem[]>([])
/** 餐桌 id → 小程序码（base64 data URL） */
const codes = ref<Record<number, string>>({})
/** 小程序码生成中 */
const codeLoading = ref(false)
/** 正在重新生成令牌的餐桌 id */
const rotatingId = ref<number | null>(null)

/** 二维码放大预览 */
const previewVisible = ref(false)
const previewTable = ref<DiningTableQrItem | null>(null)
const saving = ref(false)

/** 是否已生成任意一张小程序码 */
const hasAnyCode = computed(() => tables.value.some(table => !!codes.value[table.id]))

/** 放大预览的小程序码 */
const previewCode = computed(() =>
  previewTable.value ? codes.value[previewTable.value.id] ?? '' : '',
)

/** 小程序码展示尺寸：按两列卡片宽度自适应，避免小屏溢出 */
const qrSize = computed(() => {
  const cardWidth = (uni.getSystemInfoSync().windowWidth - 24 - 12) / 2
  return Math.floor(Math.min(160, Math.max(96, cardWidth - 32)))
})

/** 放大预览尺寸 */
const previewSize = computed(() => {
  return Math.floor(Math.min(uni.getSystemInfoSync().windowWidth - 120, 260))
})

/** 状态圆点颜色（类名字符串供 UnoCSS 静态提取） */
const STATUS_DOT: Record<DiningTableQrItem['status'], string> = {
  idle: 'bg-emerald-500',
  reserved: 'bg-amber-500',
  occupied: 'bg-primary',
  disabled: 'bg-gray-300',
}

function tableTypeLabel(table: DiningTableQrItem): string {
  return table.tableType ? t(`home.type.${table.tableType}`) : t('home.type.uncategorized')
}

/** 批量生成小程序码并按餐桌 id 回填 */
async function generateCodes(targets: DiningTableQrItem[]) {
  const pending = targets.filter(table => !!table.qrToken)
  if (!pending.length) {
    return
  }

  const result = await DiningTableService.getWxacodes(pending.map(table => table.qrToken))
  const tokenToId = new Map(pending.map(table => [table.qrToken, table.id]))
  const next = { ...codes.value }
  Object.entries(result).forEach(([token, url]) => {
    const id = tokenToId.get(token)
    if (id) {
      next[id] = url
    }
  })
  codes.value = next
}

/** 生成并提示失败原因 */
async function refreshCodes(targets: DiningTableQrItem[]) {
  if (!targets.length || codeLoading.value) {
    return
  }

  codeLoading.value = true
  try {
    await generateCodes(targets)
  }
  catch (error) {
    console.log('小程序码生成失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('qrcode.codeFailed'))
  }
  finally {
    codeLoading.value = false
  }
}

async function loadTables() {
  loading.value = true
  try {
    const result = await DiningTableService.getQrList()
    tables.value = result.records
    codes.value = {}
  }
  catch (error) {
    console.log('桌号二维码加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('qrcode.loadFailed'))
  }
  finally {
    loading.value = false
  }

  if (tables.value.length) {
    await refreshCodes(tables.value)
  }
}

/** 重新生成令牌：旧小程序码立即失效，需重新打印 */
async function rotateToken(table: DiningTableQrItem) {
  if (rotatingId.value !== null) {
    return
  }

  const result = await dialog.confirm({
    title: t('qrcode.rotateConfirmTitle'),
    msg: t('qrcode.rotateConfirmMsg'),
  })
  if (result.action !== 'confirm') {
    return
  }

  rotatingId.value = table.id
  try {
    const token = await DiningTableService.rotateQrToken(table.id)
    table.qrToken = token
    codes.value = { ...codes.value, [table.id]: '' }

    const generated = await DiningTableService.getWxacodes([token])
    if (generated[token]) {
      codes.value = { ...codes.value, [table.id]: generated[token] }
    }
    toast.success(t('qrcode.rotateSuccess'))
  }
  catch (error) {
    console.log('二维码重新生成失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('qrcode.rotateFailed'))
  }
  finally {
    rotatingId.value = null
  }
}

function openPreview(table: DiningTableQrItem) {
  if (!codes.value[table.id]) {
    return
  }
  previewTable.value = table
  previewVisible.value = true
}

// #ifdef H5
/** H5：给图片加白边，便于打印裁切 */
async function addWhitePadding(dataUrl: string, padding: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width + padding * 2
      canvas.height = image.height + padding * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas unavailable'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, padding, padding)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error('image load failed'))
    image.src = dataUrl
  })
}

/** H5：下载带白边的小程序码 */
async function downloadCode(dataUrl: string, fileName: string) {
  const padded = await addWhitePadding(dataUrl, 48)
  const link = document.createElement('a')
  link.href = padded
  link.download = `${fileName}.png`
  link.click()
}
// #endif

// #ifdef MP-WEIXIN
/** 小程序：base64 写入本地临时文件后保存到相册 */
function writeTempPng(dataUrl: string, fileName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
    uni.getFileSystemManager().writeFile({
      filePath,
      data: dataUrl.split(',')[1] ?? '',
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: reject,
    })
  })
}
// #endif

/** 保存二维码图片 */
async function savePreviewQr() {
  const table = previewTable.value
  const code = previewCode.value
  if (!table || !code || saving.value) {
    return
  }

  saving.value = true
  const fileName = `table-${table.tableNo}`
  try {
    // #ifdef H5
    await downloadCode(code, fileName)
    // #endif

    // #ifdef MP-WEIXIN
    const filePath = await writeTempPng(code, `${fileName}.png`)
    await new Promise<void>((resolve, reject) => {
      uni.saveImageToPhotosAlbum({
        filePath,
        success: () => resolve(),
        fail: reject,
      })
    })
    // #endif

    toast.success(t('qrcode.saveSuccess'))
  }
  catch (error) {
    console.log('二维码保存失败', error)
    toast.error(t('qrcode.saveFailed'))
  }
  finally {
    saving.value = false
  }
}

onLoad(() => {
  loadTables()
})

onPullDownRefresh(() => {
  loadTables().finally(() => uni.stopPullDownRefresh())
})
</script>

<template>
  <view class="min-h-screen bg-gray-100 pb-6">
    <!-- 说明 -->
    <view class="bg-primary px-4 pb-4 pt-3">
      <view class="text-base text-white font-bold">
        {{ $t('qrcode.title') }}
      </view>
      <view class="mt-1 text-2xs text-white/80">
        {{ $t('qrcode.desc') }}
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && !tables.length" class="flex justify-center py-16">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <wd-empty v-else-if="!tables.length" :tip="$t('qrcode.empty')" custom-class="!py-16" />

    <template v-else>
      <!-- 小程序码生成失败提示 -->
      <view
        v-if="!hasAnyCode && !codeLoading"
        class="mx-3 mt-3 flex items-center justify-between rounded-2 bg-white px-3 py-2"
      >
        <text class="text-2xs text-gray-400">{{ $t('qrcode.codeFailed') }}</text>
        <view class="text-2xs text-primary active:opacity-70" @tap="refreshCodes(tables)">
          {{ $t('qrcode.retry') }}
        </view>
      </view>

      <!-- 桌号小程序码卡片 -->
      <view class="grid grid-cols-2 gap-3 px-3 pt-3 lg:grid-cols-4 sm:grid-cols-3">
        <view
          v-for="table in tables"
          :key="table.id"
          class="flex flex-col items-center rounded-3 bg-white p-3"
          :class="table.status === 'disabled' ? 'opacity-60' : ''"
        >
          <view class="w-full flex items-center justify-between gap-1">
            <text class="truncate text-sm text-gray-800 font-bold">
              {{ table.tableNo }}
            </text>
            <view class="flex shrink-0 items-center gap-1 text-3xs text-gray-400">
              <view class="h-1.5 w-1.5 rounded-full" :class="STATUS_DOT[table.status]" />
              {{ $t(`home.status.${table.status}`) }}
            </view>
          </view>
          <view class="mt-0.5 w-full truncate text-3xs text-gray-400">
            {{ table.capacity ? t('ordering.table.capacity', { count: table.capacity }) : tableTypeLabel(table) }}
          </view>

          <view
            class="mt-2 flex items-center justify-center rounded-2 bg-white p-1 active:opacity-70"
            @tap="openPreview(table)"
          >
            <image
              v-if="codes[table.id]"
              :src="codes[table.id]"
              mode="aspectFit"
              :style="{ width: `${qrSize}px`, height: `${qrSize}px` }"
            />
            <view
              v-else
              class="flex flex-col items-center justify-center gap-1 text-3xs text-gray-300"
              :style="{ width: `${qrSize}px`, height: `${qrSize}px` }"
            >
              <wd-loading v-if="codeLoading" size="20px" />
              <template v-else>
                <view class="i-ri-image-line text-xl" />
                {{ $t('qrcode.codeFailed') }}
              </template>
            </view>
          </view>

          <view class="mt-2 w-full truncate text-center text-3xs text-gray-300">
            {{ $t('qrcode.previewHint') }}
          </view>

          <view
            class="mt-2 flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-2xs text-gray-500 active:opacity-70"
            @tap="rotateToken(table)"
          >
            <view class="i-ri-refresh-line text-12px" />
            {{ rotatingId === table.id ? $t('qrcode.rotating') : $t('qrcode.rotate') }}
          </view>
        </view>
      </view>
    </template>

    <!-- 放大预览：白底留边，可保存到相册 -->
    <wd-popup v-model="previewVisible" position="center">
      <view class="max-w-320px w-[86vw] flex flex-col items-center rounded-4 bg-white px-5 pb-5 pt-4">
        <view class="text-base text-gray-800 font-bold">
          {{ previewTable?.tableNo }}
        </view>
        <view class="mt-1 text-2xs text-gray-400">
          {{ $t('qrcode.previewTip') }}
        </view>
        <view class="mt-3 rounded-2 bg-white p-4">
          <image
            v-if="previewCode"
            :src="previewCode"
            mode="aspectFit"
            show-menu-by-longpress
            :style="{ width: `${previewSize}px`, height: `${previewSize}px` }"
          />
          <view
            v-else
            class="flex items-center justify-center"
            :style="{ width: `${previewSize}px`, height: `${previewSize}px` }"
          >
            <wd-loading />
          </view>
        </view>

        <!-- #ifdef H5 || MP-WEIXIN -->
        <wd-button
          type="primary"
          :loading="saving"
          :disabled="!previewCode"
          custom-class="!mt-4 !w-full"
          @click="savePreviewQr"
        >
          {{ saving ? $t('qrcode.saving') : $t('qrcode.save') }}
        </wd-button>
        <!-- #endif -->

        <!-- #ifndef H5 || MP-WEIXIN -->
        <view class="mt-4 text-2xs text-gray-400">
          {{ $t('qrcode.saveManual') }}
        </view>
        <!-- #endif -->
      </view>
    </wd-popup>

    <wd-toast />
    <wd-dialog />
  </view>
</template>
