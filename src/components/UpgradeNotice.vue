<script setup>
defineProps({
  title: { type: String, default: '功能升级中' },
  label: { type: String, default: '' },
})
</script>

<template>
  <div class="page">
    <section class="upgrade">
      <p class="eyebrow">{{ label || '功能暂时不可用' }}</p>
      <h1>{{ title }}</h1>
      <p>该功能正在升级维护中，请稍后再试。如有疑问请联系管理员。</p>
    </section>
  </div>
</template>

<style scoped>
.upgrade {
  margin-top: 48px;
  padding: 40px 28px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(27, 36, 48, 0.72);
  text-align: center;
  box-shadow: var(--shadow);
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--warn);
  font-size: 0.9rem;
  letter-spacing: 0.06em;
}

h1 {
  margin: 0 0 12px;
  font-size: 1.8rem;
}

p:last-child {
  margin: 0;
  color: var(--muted);
}

@media (max-width: 768px) {
  .upgrade {
    margin-top: 24px;
    padding: 28px 16px;
  }

  h1 {
    font-size: 1.4rem;
  }
}
</style>
