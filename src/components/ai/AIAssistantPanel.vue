<template>
  <div class="ai-assistant-panel">
    <div v-if="loading" class="ai-panel-loading">AI özetleniyor...</div>
    <div v-else-if="error" class="ai-panel-error">AI özet alınamadı: {{ error }}</div>
    <div v-else class="ai-panel-content">
      <slot name="header">
        <h3>Yapay Zeka Asistanı</h3>
      </slot>
      <div v-if="summary">
        <p>{{ summary }}</p>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { getOrderSummaryForAI, getStockSummaryForAI, getPurchaseSummaryForAI, getProductionSummaryForAI, getPlanningSummaryForAI, getNotesSummaryForAI, getReportsSummaryForAI } from '@/services/ai-service';

const props = defineProps({
  module: { type: String, required: true },
  id: { type: [String, Number], default: null },
});

const summary = ref('');
const loading = ref(false);
const error = ref('');

const fetchSummary = async () => {
  loading.value = true;
  error.value = '';
  try {
    let result;
    switch (props.module) {
      case 'orders':
        result = await getOrderSummaryForAI(props.id);
        break;
      case 'inventory':
        result = await getStockSummaryForAI();
        break;
      case 'purchasing':
        result = await getPurchaseSummaryForAI();
        break;
      case 'production':
        result = await getProductionSummaryForAI();
        break;
      case 'planning':
        result = await getPlanningSummaryForAI();
        break;
      case 'notes':
        result = await getNotesSummaryForAI();
        break;
      case 'reports':
        result = await getReportsSummaryForAI();
        break;
      default:
        result = { summary: 'Modül için AI özeti bulunamadı.' };
    }
    summary.value = result.summary || JSON.stringify(result);
  } catch (e) {
    error.value = e.message || 'Bilinmeyen hata';
  } finally {
    loading.value = false;
  }
};

onMounted(fetchSummary);
watch(() => [props.module, props.id], fetchSummary);
</script>

<style scoped>
.ai-assistant-panel {
  background: #f8fafd;
  border: 1px solid #e0e6ed;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}
.ai-panel-loading {
  color: #888;
}
.ai-panel-error {
  color: #c00;
}
</style>
