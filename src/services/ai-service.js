import { ref, reactive, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import axios from 'axios';
import appConfig from '@/config';
import config from '../config'; // config.js dosyasını import et

// API Anahtarı ve URL Yapılandırması
const API_SERVICE_CONFIG = {
  gemini: {
    apiKey: appConfig.ai?.gemini?.apiKey || import.meta.env.VITE_GEMINI_API_KEY,
    apiUrl: appConfig.ai?.gemini?.apiUrl || 'https://generativelanguage.googleapis.com/v1beta/models',
    modelName: appConfig.ai?.gemini?.modelName || 'gemini-1.5-pro', // Varsayılan model
  },
  openRouter: {
    apiKey: appConfig.ai?.openRouter?.apiKey || import.meta.env.VITE_OPENROUTER_API_KEY, // Correctly use VITE_OPENROUTER_API_KEY
    apiUrl: appConfig.ai?.openRouter?.apiUrl || 'https://openrouter.ai/api/v1',
    defaultModels: appConfig.ai?.openRouter?.defaultModels || {
      chat: 'google/gemini-pro-1.5-exp-03-25', // config.js ile senkronize edildi
      instruct: 'google/gemini-flash-1.5',
      technical: 'google/gemini-pro-1.5-exp-03-25', // config.js ile senkronize edildi
    },
    siteUrl: appConfig.ai?.openRouter?.siteUrl,
    appName: appConfig.ai?.openRouter?.appName,
    modelApiKeys: {
      'deepseek/deepseek-chat-v3-0324:free': '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',
      // Başka modele özel anahtarlarınız varsa buraya ekleyebilirsiniz
    }
  },
  // Diğer AI servisleri buraya eklenebilir (örn: local LLM)
};

// Reactive state for the AI service
const history = ref([]);
const isProcessing = ref(false);
const activeAiServiceRef = ref(appConfig.ai?.activeService || 'openRouter'); // Make active service reactive

// Update ACTIVE_AI_SERVICE to use the ref
const ACTIVE_AI_SERVICE = computed(() => activeAiServiceRef.value);

// Yapay zeka yanıtını işleyen fonksiyon
const parseAIResponse = (rawContent, contentType = 'application/json') => {
  console.debug(`[AI Service] parseAIResponse called with contentType: ${contentType}`);
  console.debug(`[AI Service] Raw content received for parsing: ${typeof rawContent === 'string' ? rawContent.substring(0, 200) + '...' : JSON.stringify(rawContent).substring(0,200) + '...'}`);

  if (typeof rawContent !== 'string') {
    console.warn("[AI Service] parseAIResponse: rawContent is not a string, returning as is.", rawContent);
    return rawContent; // Eğer string değilse, olduğu gibi döndür (belki zaten obje?)
  }

  // Yanıtın JSON olup olmadığını kontrol etmeye çalışalım
  // Basit bir kontrol: '{' ile başlayıp '}' ile bitiyor mu veya '[' ile başlayıp ']' ile bitiyor mu?
  const trimmedContent = rawContent.trim();
  const isLikelyJson = (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
                       (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'));

  if (contentType.includes('json') || isLikelyJson) {
    try {
      const parsed = JSON.parse(trimmedContent);
      console.info("[AI Service] AI response successfully parsed as JSON.");
      return parsed;
    } catch (e) {
      console.warn(`[AI Service] Failed to parse AI response as JSON, even though it seemed like JSON. Error: ${e.message}. Returning raw text.`);
      // JSON olarak parse edilemezse, ham metin olarak döndür.
      // Bu, Markdown veya düz metin yanıtları için önemlidir.
      return trimmedContent; 
    }
  } else {
    // JSON değilse (örneğin text/plain, text/markdown), ham metin olarak döndür.
    console.info("[AI Service] AI response is not JSON (contentType: ${contentType}). Returning raw text.");
    return trimmedContent;
  }
};

// --- GENEL API İSTEK FONKSİYONU ---
const makeApiRequest = async (serviceName, endpoint, payload, method = 'POST') => {
  const serviceConfig = API_SERVICE_CONFIG[serviceName];
  if (!serviceConfig || !serviceConfig.apiKey || !serviceConfig.apiUrl) {
    console.warn(`${serviceName} API anahtarı veya URL bulunamadı. Demo mod kullanılıyor.`);
    return simulateAIResponse(payload.contents ? payload.contents[0]?.parts[0]?.text : payload.messages?.[payload.messages.length - 1]?.content);
  }

  let effectiveApiKey;
  let referer = serviceConfig.siteUrl || 'http://localhost:5173'; // Default referer
  let title = serviceConfig.appName || 'METS AI Assistant';

  if (serviceName === 'openRouter') {
    if (payload && payload.model && serviceConfig.modelApiKeys && serviceConfig.modelApiKeys[payload.model]) {
      effectiveApiKey = serviceConfig.modelApiKeys[payload.model];
      console.log(`[AI Service] Using model-specific API key for ${payload.model}`);
    } else {
      effectiveApiKey = serviceConfig.apiKey || import.meta.env.VITE_OPENROUTER_API_KEY;
      console.log(`[AI Service] Using general OpenRouter API key. Model: ${payload ? payload.model : 'N/A'}`);
    }

    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const hostname = window.location.hostname;
      const origin = window.location.origin;

      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        referer = origin;
      } else {
        referer = serviceConfig.siteUrl || origin;
      }
    }
  } else if (serviceName === 'gemini') {
    effectiveApiKey = serviceConfig.apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  } else {
    effectiveApiKey = serviceConfig.apiKey;
  }

  if (!effectiveApiKey) {
    console.error(`[AI Service] API Key not found for service: ${serviceName} and model: ${payload ? payload.model : 'N/A'}`);
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (serviceName === 'openRouter') {
    if (effectiveApiKey) {
      headers['Authorization'] = `Bearer ${effectiveApiKey}`;
    }
    headers['HTTP-Referer'] = referer;
    headers['X-Title'] = title;
  }

  console.log(`[AI Service] makeApiRequest - Service: ${serviceName}, Model: ${payload?.model}`);
  console.log(`[AI Service] makeApiRequest - API Key being used: ${effectiveApiKey ? 'Anahtar Yüklendi (gizlendi)' : 'API Anahtarı BULUNAMADI!'}`);
  console.log('[AI Service] makeApiRequest - Request Headers:', headers);
  console.log('[AI Service] makeApiRequest - Request Data:', payload);

  try {
    const response = await axios({
      method,
      url: `${serviceConfig.apiUrl}/${endpoint}`,
      data: payload,
      headers,
    });

    if (response.data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return {
        text: response.data.candidates[0].content.parts[0].text,
        success: true,
        raw: response.data,
        source: serviceName,
      };
    }
    if (response.data.choices?.[0]?.message?.content) {
      return {
        text: response.data.choices[0].message.content,
        success: true,
        raw: response.data,
        source: serviceName,
      };
    }
    throw new Error('API yanıtından metin alınamadı veya format tanınmıyor');
  } catch (error) {
    console.error(`${serviceName} API hatası:`, error.response?.data || error.message);
    const demoResponse = await simulateAIResponse(
      payload.contents ? payload.contents[0]?.parts[0]?.text : payload.messages?.[payload.messages.length - 1]?.content, 
      serviceName, 
      error.response?.data || error.message
    );
    history.value.push({
      role: 'assistant',
      content: demoResponse.text,
      source: demoResponse.source,
      isDemo: true,
      timestamp: new Date()
    });
    return demoResponse;
  }
};

// --- GEMINI ÖZEL FONKSİYONLARI ---
const geminiGenerateContent = async (prompt, options = {}) => {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? config.ai?.geminiGenerationConfig?.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? config.ai?.geminiGenerationConfig?.maxOutputTokens ?? 2048,
      topP: options.topP ?? config.ai?.geminiGenerationConfig?.topP ?? 0.8,
      topK: options.topK ?? config.ai?.geminiGenerationConfig?.topK ?? 40,
    },
    safetySettings: config.ai?.geminiSafetySettings || [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };
  return makeApiRequest('gemini', `${API_SERVICE_CONFIG.gemini.modelName}:generateContent`, payload);
};

const geminiChat = async (messages, options = {}) => {
  const formattedMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const payload = {
    contents: formattedMessages,
    generationConfig: {
      temperature: options.temperature ?? config.ai?.gemini?.generationConfig?.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? config.ai?.gemini?.generationConfig?.maxOutputTokens ?? 2048,
      topP: options.topP ?? config.ai?.gemini?.generationConfig?.topP ?? 0.8,
      topK: options.topK ?? config.ai?.gemini?.generationConfig?.topK ?? 40,
    },
    safetySettings: config.ai?.gemini?.safetySettings, 
  };

  return makeApiRequest('gemini', payload);
};

// --- OPENROUTER ÖZEL FONKSİYONLARI ---
const openRouterChatCompletion = async (messages, options = {}) => {
  const model = options.model || API_SERVICE_CONFIG.openRouter.defaultModels.chat;
  const formattedMessages = messages.map(msg => {
    if (msg.content && typeof msg.content === 'string' && msg.image_url) {
      return {
        role: msg.role,
        content: [
          {
            type: "text",
            text: msg.content
          },
          {
            type: "image_url",
            image_url: { url: msg.image_url }
          }
        ]
      };
    }
    return { role: msg.role, content: msg.content };
  });

  const payload = {
    model: model,
    messages: formattedMessages,
    temperature: options.temperature ?? appConfig.ai?.openRouter?.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? appConfig.ai?.openRouter?.maxTokens ?? 2048,
    top_p: options.topP ?? appConfig.ai?.openRouter?.topP ?? 0.8,
  };
  return makeApiRequest('openRouter', 'chat/completions', payload);
};

// --- DEMO MODU İÇİN YANIT SİMÜLASYONU ---
const simulateAIResponse = async (prompt, service = 'Demo AI', errorInfo = null) => {
  console.log(`Demo mod (${service}): AI yanıtı simüle ediliyor. Hata: ${errorInfo ? JSON.stringify(errorInfo) : 'Yok'}`);
  isProcessing.value = true;
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));
  
  let responseText = `Üzgünüm, \"${prompt?.substring(0, 50)}...\" ile ilgili isteğinizi işlerken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.`;
  if (errorInfo) {
    responseText = `API bağlantı sorunu (${service}): ${JSON.stringify(errorInfo)}. Geliştirici konsolunu kontrol edin. Demo yanıt üretiliyor.`;
  }

  if (prompt) {
    const p = prompt.toLowerCase();
    if (p.includes('üretim') || p.includes('imalat')) {
      responseText = 'Demo: Üretim planı %95 tamamlanma oranına sahip. Kalan işler için tahmini süre 2 gün.';
    } else if (p.includes('stok') || p.includes('malzeme')) {
      responseText = 'Demo: Kritik stok seviyesindeki malzemeler: Röle X (10 adet kaldı), Kablo Y (25m kaldı). Siparişleri verildi.';
    } else if (p.includes('sipariş') || p.includes('satış')) {
      responseText = 'Demo: Son 24 saatte 5 yeni sipariş alındı. En büyük sipariş ABC firmasından (15 hücre).';
    } else if (p.includes('merhaba') || p.includes('selam')) {
      responseText = 'Demo: Merhaba! Size nasıl yardımcı olabilirim?';
    } else {
      responseText = `Demo: \"${prompt.substring(0, 60)}...\" sorgunuz için genel bir demo yanıtı üretildi. Gerçek veri için lütfen API bağlantısını kontrol edin.`;
    }
  }

  isProcessing.value = false;
  return {
    text: responseText,
    success: false,
    source: service,
    isDemo: true,
  };
};

// --- DIŞA AKTARILAN SERVİS FONKSİYONLARI ---
export const aiService = {
  sendMessage: async (messageContent, conversationHistoryIgnored = [], options = {}) => {
    isProcessing.value = true;
    let currentMessagePayload;

    if (typeof messageContent === 'string') {
      currentMessagePayload = { role: 'user', content: messageContent };
    } else if (typeof messageContent === 'object' && messageContent.text) {
      currentMessagePayload = {
        role: 'user',
        content: messageContent.text,
        ...(messageContent.image_url && { image_url: messageContent.image_url })
      };
    } else {
      console.error('Invalid messageContent format:', messageContent);
      const errResponse = await simulateAIResponse("Geçersiz mesaj formatı", ACTIVE_AI_SERVICE.value);
      history.value.push({ role: 'user', content: 'Invalid input (see console)', timestamp: new Date() });
      history.value.push({ role: 'assistant', content: errResponse.text, source: errResponse.source, isDemo: true, timestamp: new Date() });
      isProcessing.value = false;
      return errResponse;
    }

    history.value.push({ ...currentMessagePayload, timestamp: new Date() });

    let messagesForApi = [];
    const systemPrompt = appConfig.ai?.systemPrompt || 'Sen MehmetEndustriyelTakip uygulaması için bir asistansın...';
    
    messagesForApi.push({ role: 'system', content: systemPrompt });
    history.value.forEach(msg => {
      if (msg.role !== 'system') {
        messagesForApi.push({ role: msg.role, content: msg.content });
      }
    });

    let response;
    if (ACTIVE_AI_SERVICE.value === 'gemini') {
      response = await geminiChat(messagesForApi, options);
    } else if (ACTIVE_AI_SERVICE.value === 'openRouter') {
      response = await openRouterChatCompletion(messagesForApi, options);
    } else {
      console.warn(`Aktif AI servisi (${ACTIVE_AI_SERVICE.value}) desteklenmiyor... Demo yanıtı kullanılıyor.`);
      response = await simulateAIResponse(currentMessagePayload.content, ACTIVE_AI_SERVICE.value);
    }

    if (response && response.text) {
      history.value.push({
        role: 'assistant',
        content: response.text,
        source: response.source,
        isDemo: response.isDemo || false,
        ...(response.modelPreview && { modelPreview: response.modelPreview }),
        ...(response.relatedDocs && { relatedDocs: response.relatedDocs }),
        ...(response.prediction && { prediction: response.prediction }),
        timestamp: new Date()
      });
    }
    isProcessing.value = false;
    return response;
  },

  ask: async (prompt, options = {}) => {
    if (ACTIVE_AI_SERVICE.value === 'gemini') {
      return geminiGenerateContent(prompt, options);
    } else if (ACTIVE_AI_SERVICE.value === 'openRouter') {
      const messages = [
        { role: 'system', content: appConfig.ai?.systemPrompt || 'Kısa ve öz cevaplar ver.' },
        { role: 'user', content: prompt }
      ];
      return openRouterChatCompletion(messages, { ...options, model: options.model || API_SERVICE_CONFIG.openRouter.defaultModels.instruct });
    } else {
      return simulateAIResponse(prompt, ACTIVE_AI_SERVICE.value);
    }
  },

  getInsights: async (options = {}) => {
    if (isProcessing.value && !options.force) {
      console.warn("[AI Service] getInsights: Zaten bir işlem devam ediyor.");
      return null;
    }

    isProcessing.value = true;
    let insightsData = null;

    try {
      console.info("[AI Service] getInsights çağrıldı, options:", options);
      const cacheKey = `insights_${JSON.stringify(options)}`;

      if (ACTIVE_AI_SERVICE.value === 'gemini') {
        const messages = [
          { role: 'system', content: 'Sen bir endüstriyel üretim ve planlama uzmanısın. Aşağıdaki verileri analiz ederek METS ERP sistemi için kısa ve öz içgörüler oluştur. Her içgörü için başlık, açıklama, kategori (üretim, stok, kalite, analiz, bakım, planlama), önem (high, medium, low) ve ilgili departmanı belirt.' },
          { role: 'user', content: 'Mevcut üretim durumu, stok seviyeleri ve kalite kontrol raporlarına göre içgörüler oluştur.' }
        ];
        const response = await geminiChat(messages, options);
        if (response && response.text) {
          insightsData = parseAIResponse(response.text);
        }
      } else if (ACTIVE_AI_SERVICE.value === 'openRouter') {
        const messages = [
          { role: 'system', content: 'Sen bir endüstriyel üretim ve planlama uzmanısın. Aşağıdaki verileri analiz ederek METS ERP sistemi için kısa ve öz içgörüler oluştur. Her içgörü için başlık, açıklama, kategori (üretim, stok, kalite, analiz, bakım, planlama), önem (high, medium, low) ve ilgili departmanı belirt.' },
          { role: 'user', content: 'Mevcut üretim durumu, stok seviyeleri ve kalite kontrol raporlarına göre içgörüler oluştur.' }
        ];
        const response = await openRouterChatCompletion(messages, options);
        if (response && response.text) {
          insightsData = parseAIResponse(response.text);
        }
      } else {
        console.warn("[AI Service] getInsights: Desteklenmeyen AI servisi. Demo moda geçiliyor.");
        insightsData = getDemoInsights();
      }

      return insightsData;

    } catch (error) {
      console.error("[AI Service] getInsights sırasında genel hata:", error);
      return null;
    } finally {
      isProcessing.value = false;
    }
  },

  analyzeDocument: async (documentFile, options = {}) => {
    isProcessing.value = true;
    if (ACTIVE_AI_SERVICE.value !== 'gemini' && ACTIVE_AI_SERVICE.value !== 'openRouter' || !appConfig.ai.documentProcessing.enabled) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      let analysisText = `Demo: '${documentFile?.name}' adlı doküman analiz edildi.`;
      return {
        success: true, isDemo: true, source: `Demo AI (${ACTIVE_AI_SERVICE.value})`,
        fileName: documentFile?.name, fileType: documentFile?.type, fileSize: documentFile?.size,
        analysis: { summary: analysisText, textExtract: "Lorem ipsum...", keywords: ["demo"] },
        raw: { message: "Simulated document analysis." }
      };
    }
    return {
      success: false, isDemo: true, source: ACTIVE_AI_SERVICE.value,
      message: `analyzeDocument fonksiyonu ${ACTIVE_AI_SERVICE.value} için henüz tam olarak implemente edilmedi.`,
      fileName: documentFile?.name, raw: { note: "Full implementation pending." }
    };
  },
  
  clearHistory: () => {
    history.value = [];
  },

  switchModel: (modelKey) => {
    if (API_SERVICE_CONFIG[modelKey]) {
      activeAiServiceRef.value = modelKey;
      console.log(`AI Service switched to: ${modelKey}`);
      return true;
    } else {
      const availableServices = Object.keys(API_SERVICE_CONFIG);
      if (availableServices.includes(modelKey)) {
        activeAiServiceRef.value = modelKey;
        console.log(`AI Service switched to: ${modelKey}`);
        return true;
      }
      console.warn(`Cannot switch to unknown model/service: ${modelKey}`);
      return false;
    }
  },
  
  getCurrentModel: () => {
    const currentServiceKey = ACTIVE_AI_SERVICE.value;
    if (currentServiceKey === 'gemini') {
      return {
        key: 'gemini',
        name: API_SERVICE_CONFIG.gemini.modelName,
        provider: 'Google Gemini',
        config: API_SERVICE_CONFIG.gemini,
        capabilities: ['chat', 'technical_qna']
      };
    } else if (currentServiceKey === 'openRouter') {
      return {
        key: 'openRouter',
        name: API_SERVICE_CONFIG.openRouter.defaultModels.chat,
        provider: 'OpenRouter',
        config: API_SERVICE_CONFIG.openRouter,
        capabilities: ['chat', 'multi-model', 'document_analysis_beta']
      };
    } else {
      return {
        key: 'demo',
        name: 'Demo AI Model',
        provider: 'Simulated',
        config: {},
        capabilities: ['general_chat']
      };
    }
  },
  
  supportedModels: computed(() => {
    return {
      gemini: {
        key: 'gemini',
        name: API_SERVICE_CONFIG.gemini.modelName || 'Gemini Pro',
        provider: 'Google Gemini',
        capabilities: ['chat', 'qna']
      },
      openRouter: {
        key: 'openRouter',
        name: API_SERVICE_CONFIG.openRouter.defaultModels.chat || 'OpenRouter (Gemini Pro)',
        provider: 'OpenRouter',
        capabilities: ['chat', 'flexible_models']
      }
    };
  }),

  getServiceStatus: () => {
    return {
      activeService: ACTIVE_AI_SERVICE.value,
      isGeminiConfigured: !!(API_SERVICE_CONFIG.gemini.apiKey && API_SERVICE_CONFIG.gemini.apiUrl),
      isOpenRouterConfigured: !!(API_SERVICE_CONFIG.openRouter.apiKey && API_SERVICE_CONFIG.openRouter.apiUrl),
      geminiModel: API_SERVICE_CONFIG.gemini.modelName,
      openRouterChatModel: API_SERVICE_CONFIG.openRouter.defaultModels.chat,
      openRouterInstructModel: API_SERVICE_CONFIG.openRouter.defaultModels.instruct,
    };
  },

  getSystemData: async () => { 
    console.warn("aiService.getSystemData is a placeholder.");
    return { cadModels: [], technicalDocs: [] }; 
  },
  modelComponents: async (modelId) => {
    console.warn("aiService.modelComponents is a placeholder.");
    return { success: false, data: { components: [] } };
  },
  modelMeasurements: async (modelId) => {
    console.warn("aiService.modelMeasurements is a placeholder.");
    return { success: false, data: {} };
  }
};

// --- DEMO İÇGÖRÜLERİ ---
const getDemoInsights = (messages, errorDetails, rawContent = null) => {
  console.warn(`[AI Service] Demo içgörüler oluşturuluyor. Hata: ${errorDetails?.error?.message || 'Bilinmeyen hata'}`, errorDetails);
  const insightsArray = [
    {
      id: 'demo-001',
      title: rawContent ? 'Ham API Yanıtı (Demo)' : 'Demo: Üretim Verimliliği Düştü',
      description: rawContent || 'Son 24 saatte RM36CB modelinin üretim verimliliğinde %15 düşüş gözlendi. Olası nedenler: malzeme tedarik gecikmesi veya makine arızası.',
      category: 'üretim',
      importance: 'high',
      department: 'Üretim Planlama',
      date: new Date().toISOString(),
      predictions: [
        { name: 'Verimlilik Kaybı', value: '-15%', type: 'percent', status: 'critical' },
        { name: 'Etkilenen Siparişler', value: '3', type: 'count', status: 'warning' }
      ],
      actions: ['analyze']
    },
    {
      id: 'demo-002',
      title: 'Demo: Stok Seviyesi Kritik',
      description: 'XMM-0023 numaralı malzemenin stok seviyesi minimum eşiğin altına düştü. Acil tedarik gerekiyor.',
      category: 'stok',
      importance: 'medium',
      department: 'Satın Alma',
      date: new Date(Date.now() - 3600000).toISOString(), // 1 saat önce
      relatedDocuments: [{ id: 'doc-001', name: 'XMM-0023 Tedarikçi Listesi.pdf', type: 'pdf', url: '#' }],
      actions: []
    },
    {
      id: 'demo-003',
      title: 'Demo: Yeni Kalite Kontrol Prosedürü',
      description: 'Yeni ISO 9001:2025 standartlarına uyum için kalite kontrol prosedürleri güncellendi. İlgili personel eğitimi planlanmalı.',
      category: 'kalite',
      importance: 'low',
      department: 'Kalite Yönetimi',
      date: new Date(Date.now() - 86400000).toISOString(), // 1 gün önce
      actions: []
    }
  ];
  // Her zaman { insightsArray: [], value: [] } yapısını döndür, value demo için insightsArray'in kopyası olabilir.
  return { insightsArray, value: insightsArray, error: errorDetails }; 
};

// AI ile entegre çalışacak modül özet ve detay fonksiyonları (yer tutucu)
export async function getOrderSummaryForAI(orderId) {
  // Sipariş modülünden özet veri çeker (örnek veri)
  return apiService.get(`/orders/${orderId}/ai-summary`);
}

export async function getStockSummaryForAI() {
  // Stok modülünden özet veri çeker (örnek veri)
  return apiService.get('/inventory/ai-summary');
}

export async function getPurchaseSummaryForAI() {
  // Satın alma modülünden özet veri çeker (örnek veri)
  return apiService.get('/purchasing/ai-summary');
}

export async function getProductionSummaryForAI() {
  // Üretim modülünden özet veri çeker (örnek veri)
  return apiService.get('/production/ai-summary');
}

export async function getPlanningSummaryForAI() {
  // Planlama modülünden özet veri çeker (örnek veri)
  return apiService.get('/planning/ai-summary');
}

export async function getNotesSummaryForAI() {
  // Not/uyarı modülünden özet veri çeker (örnek veri)
  return apiService.get('/notes/ai-summary');
}

export async function getReportsSummaryForAI() {
  // Raporlama modülünden özet veri çeker (örnek veri)
  return apiService.get('/reports/ai-summary');
}

// Teknik doküman arama ve özetleme için yer tutucu fonksiyonlar
export async function searchDocumentsForAI(query) {
  // Teknik dokümanlarda arama yapar (örnek veri)
  return apiService.get('/documents/ai-search', { query });
}

export async function summarizeDocumentForAI(documentId) {
  // Belirli bir dokümanı özetler (örnek veri)
  return apiService.get(`/documents/${documentId}/ai-summary`);
}

// Composable function to use aiService
export function useAiService() {
  return {
    history: history,
    isProcessing: isProcessing,
    sendMessage: aiService.sendMessage,
    ask: aiService.ask,
    getInsights: aiService.getInsights,
    analyzeDocument: aiService.analyzeDocument,
    getCurrentModel: aiService.getCurrentModel,
    getServiceStatus: aiService.getServiceStatus,
    clearHistory: aiService.clearHistory,
    switchModel: aiService.switchModel,
    supportedModels: aiService.supportedModels,
    getSystemData: aiService.getSystemData,
    modelComponents: aiService.modelComponents,
    modelMeasurements: aiService.modelMeasurements
  };
}

export const sendMessageToAI = async (message, history = [], modelOptions = {}) => {
  if (isProcessing.value) {
    console.warn("[AI Service] sendMessageToAI: Zaten bir işlem devam ediyor.");
    return { success: false, message: "Önceki işlem devam ediyor." };
  }

  isProcessing.value = true;
  let error = null;
  
  const currentModel = ACTIVE_AI_SERVICE.value === 'gemini' ? API_SERVICE_CONFIG.gemini : API_SERVICE_CONFIG.openRouter;
  const service = currentModel.service || ACTIVE_AI_SERVICE.value;
  const modelId = currentModel.modelName || API_SERVICE_CONFIG.openRouter.defaultModels.chat;

  console.info(`[AI Service] sendMessageToAI - Model: ${modelId}, Service: ${service}`);

  try {
    const messages = [
      ...history,
      { role: "user", content: message }
    ];

    const requestData = {
      model: modelId,
      messages: messages,
      temperature: modelOptions.temperature || 0.7,
      max_tokens: modelOptions.maxTokens || 1024,
      top_p: modelOptions.topP || 0.8,
    };

    const response = await makeApiRequest(service, modelId, requestData);

    if (response) {
      let rawContent = null;
      if (service === 'gemini') {
        if (response.candidates && response.candidates.length > 0 && response.candidates[0].content && response.candidates[0].content.parts && response.candidates[0].content.parts.length > 0) {
          rawContent = response.candidates[0].content.parts[0].text;
        }
      } else {
        if (response.choices && response.choices.length > 0 && response.choices[0].message) {
          rawContent = response.choices[0].message.content;
        }
      }

      if (rawContent !== null) {
        const parsedResponse = parseAIResponse(rawContent);
        console.info("[AI Service] Chat response received and parsed/processed.");
        return { success: true, response: parsedResponse };
      } else {
        console.warn("[AI Service] Chat API'den boş veya hatalı formatlı içerik.");
        return { success: false, message: "Yapay zekadan anlamlı bir yanıt alınamadı." };
      }
    } else {
      console.error("[AI Service] Chat API'den boş yanıt.");
      return { success: false, message: "Yapay zeka servisine ulaşılamadı." };
    }

  } catch (err) {
    console.error(`[AI Service] sendMessageToAI sırasında hata: ${err.message}`, err);
    error = err.message || "Mesaj gönderilirken bir hata oluştu.";
    return { success: false, message: error };
  } finally {
    isProcessing.value = false;
  }
};