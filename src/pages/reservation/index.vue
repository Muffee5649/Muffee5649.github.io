<script lang="ts" setup>
defineOptions({
  name: 'Reservation',
})
definePage({
  style: {
    navigationBarTitleText: '%reservation.title%',
  },
})
</script>

<template>
  <view class="flex flex-col items-center pt-24">
    <view class="i-carbon-calendar text-12 text-gray-200" />
    <view class="mt-3 text-sm text-gray-400">
      {{ $t('reservation.placeholder') }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
