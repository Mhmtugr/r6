/**
 * API Servisi
 * Modern REST API entegrasyonu ve mock verileri yönetir
 */

import { useAuthStore } from '@/store/auth';
import appConfig from '@/config'; // Import config instead of using window

class ApiService {
  constructor() {
    // Config dosyasından veya ortam değişkenlerinden al
    this.baseUrl = appConfig.api?.baseUrl || import.meta.env.VITE_API_URL || '/api'; // Use import.meta.env for Vite
    this.mockMode = appConfig.api?.useMockData ?? (import.meta.env.MODE === 'development'); // Default to true in dev if not specified
    this.timeout = appConfig.api?.timeout || 30000;
    this.retryAttempts = appConfig.api?.retryAttempts || 3;
    
    console.log('API Servisi başlatılıyor', { baseUrl: this.baseUrl, mockMode: this.mockMode });
  }
  
  async get(endpoint, params = {}) {
    if (this.mockMode) {
      return this.getMockData(endpoint, params);
    }
    
    try {
      const url = new URL(endpoint, this.baseUrl); // Use URL constructor correctly
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this._getHeaders()
      });
      
      return this._handleResponse(response);
    } catch (error) {
      console.error(`GET ${endpoint} başarısız:`, error);
      throw this._handleError(error);
    }
  }
  
  async post(endpoint, data = {}) {
    if (this.mockMode) {
      return this.postMockData(endpoint, data);
    }
    
    try {
      const url = new URL(endpoint, this.baseUrl);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(data)
      });
      
      return this._handleResponse(response);
    } catch (error) {
      console.error(`POST ${endpoint} başarısız:`, error);
      throw this._handleError(error);
    }
  }

  async put(endpoint, data = {}) {
    if (this.mockMode) {
       // PUT için mock veriyi POST gibi ele alabiliriz veya özelleştirebiliriz
      return this.postMockData(endpoint, data, 'PUT'); 
    }
    
    try {
      const url = new URL(endpoint, this.baseUrl);
      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify(data)
      });
      
      return this._handleResponse(response);
    } catch (error) {
      console.error(`PUT ${endpoint} başarısız:`, error);
       throw this._handleError(error);
    }
  }

  async delete(endpoint) {
    if (this.mockMode) {
      return this.deleteMockData(endpoint);
    }
    
    try {
      const url = new URL(endpoint, this.baseUrl);
      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: this._getHeaders()
      });
      
      // DELETE genellikle içerik döndürmez, başarı durumunu kontrol et
      return this._handleResponse(response, true); // Expect no content
    } catch (error) {
      console.error(`DELETE ${endpoint} başarısız:`, error);
       throw this._handleError(error);
    }
  }
  
  _getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json' // Added Accept header
    };

    // Pinia store'u doğrudan burada kullanmak yerine, 
    // dışarıdan inject etmek veya interceptor kullanmak daha iyi olabilir.
    // Şimdilik mevcut yapıyı koruyalım.
    try {
       const authStore = useAuthStore();
       const token = authStore.token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
       }
    } catch (e) {
        console.warn('Auth store could not be accessed outside setup. Ensure Pinia is initialized.');
    }
    
    return headers;
  }
  
  async _handleResponse(response, expectNoContent = false) {
    if (!response.ok) {
       const error = new Error(`HTTP error! Status: ${response.status}`);
       try {
           const errorData = await response.json();
           error.data = errorData;
           error.message = errorData.message || error.message; 
       } catch (e) {
            // JSON parse edilemezse status text'i kullan
           error.message = `${error.message} - ${response.statusText}`;
       }
       
      if (response.status === 401) {
         // Yetkilendirme hatasında logout yap
         try {
        const authStore = useAuthStore();
        authStore.logout();
         } catch (e) { 
            console.warn('Auth store could not be accessed outside setup for logout.');
         }
       }
       throw error; // Hata nesnesini fırlat
    }
    
    if (expectNoContent || response.status === 204) { 
      return; // No content expected or received
    }

    // Başarılı yanıtı JSON olarak parse et
    try {
        return await response.json();
    } catch(e) {
        // JSON parse hatası durumunda boş yanıt veya hata fırlatılabilir
        console.error('API response JSON parse error:', e);
        throw new Error('Invalid JSON response from server');
    }
  }
  
   _handleError(error) {
        // Ağ hatası veya diğer fetch hatalarını işle
        if (!error.response) { // Eğer `_handleResponse` içinden gelmiyorsa (örn: ağ hatası)
             error.message = `Network Error: ${error.message}`;
        }
        // Hata loglanabilir veya global bir hata state'ine gönderilebilir
        // Şimdilik sadece hatayı tekrar fırlatıyoruz
        return error;
   }

  //-----------------------------------------------------
  // Spesifik Endpoint Metodları (R3/apiService.js'den)
  //-----------------------------------------------------

  async getOrders(params = {}) {
    return this.get('/orders', params);
  }

  async getOrderDetails(orderId) {
    return this.get(`/orders/${orderId}`);
  }

  async createOrder(orderData) {
    return this.post('/orders', orderData);
  }

  async updateOrder(orderId, orderData) {
    return this.put(`/orders/${orderId}`, orderData);
  }

  async deleteOrder(orderId) {
    return this.delete(`/orders/${orderId}`);
  }

  async getProductionData() {
    // Bu endpoint daha spesifik olabilir, örn: /production/summary
    return this.get('/production'); 
  }

  async updateProductionStatus(statusData) {
    // Endpoint /production/:id/status veya /production/status olabilir
    return this.put('/production/status', statusData); 
  }

  async getInventory(params = {}) {
     // R3'teki endpoint /stock idi, /inventory daha mantıklı olabilir
    return this.get('/inventory', params); 
  }

  async updateInventoryItem(itemId, itemData) {
    return this.put(`/inventory/${itemId}`, itemData);
  }
  
   // Diğer spesifik metodlar eklenebilir (kullanıcılar, malzemeler vb.)

  //-----------------------------------------------------
  // Mock Veri Yönetimi (Geliştirilmiş)
  //-----------------------------------------------------

  getMockData(endpoint, params) {
    console.log(`[ApiService MOCK] GET request. Path: "${endpoint}", Params:`, JSON.parse(JSON.stringify(params)));
    const url = new URL(endpoint, 'http://mock.url'); 
    let path = url.pathname; 

    if (this.baseUrl && this.baseUrl !== '/' && path.startsWith(this.baseUrl)) {
        path = path.substring(this.baseUrl.length);
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
    }

    // Siparişler - Tüm siparişler
    if (path === '/orders') {
        let filteredOrders = [...this._mockData.orders];
        console.log(`[ApiService MOCK] GET /orders: Returning ${filteredOrders.length} orders. Current _mockData.orders count: ${this._mockData.orders.length}.`);
        console.log(`[ApiService MOCK] GET /orders: Orders being returned (full):`, JSON.parse(JSON.stringify(filteredOrders)));
        return Promise.resolve(JSON.parse(JSON.stringify(filteredOrders))); 
    }

    // Siparişler - Belirli bir siparişin detayı
    const orderDetailMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderDetailMatch) {
        const orderId = orderDetailMatch[1];
        const order = this._mockData.orders.find(o => o.id === orderId);
        return order ? Promise.resolve(JSON.parse(JSON.stringify(order))) : Promise.reject(new Error(`Mock Order Not Found: ${orderId}`));
    }

    // Siparişler - Alt kaynaklar (notlar, zaman çizelgesi, üretim, malzemeler)
    const orderSubResourceMatch = path.match(/^\/orders\/([^/]+)\/(notes|timeline|production|materials)$/);
    if (orderSubResourceMatch) {
        const orderId = orderSubResourceMatch[1];
        const subResource = orderSubResourceMatch[2];
        
        const orderExists = this._mockData.orders.some(o => o.id === orderId);
        if (!orderExists) {
            return Promise.reject(new Error(`Mock Order Not Found for sub-resource query: ${orderId}`));
        }

        const details = this._mockData.orderDetails[orderId];
        if (!details) {
            // Detay yoksa, varsayılan boş yapılar döndür
            console.warn(`Mock orderDetails not found for ${orderId}, returning default empty structure for ${subResource}`);
            switch (subResource) {
                case 'notes': return Promise.resolve([]);
                case 'timeline': return Promise.resolve([]);
                case 'production': return Promise.resolve({ steps: [], data: [] });
                case 'materials': return Promise.resolve([]);
            }
        }

        switch (subResource) {
            case 'notes':
                return Promise.resolve(JSON.parse(JSON.stringify(details.notes || [])));
            case 'timeline':
                return Promise.resolve(JSON.parse(JSON.stringify(details.timeline || [])));
            case 'production':
                return Promise.resolve(JSON.parse(JSON.stringify(details.production || { steps: [], data: [] })));
            case 'materials':
                return Promise.resolve(JSON.parse(JSON.stringify(details.materials || [])));
        }
    }

    // Üretim (Genel)
    if (path === '/production') {
        return Promise.resolve(JSON.parse(JSON.stringify(this._mockData.production))); 
    }
    if (path === '/production/status') { 
         return Promise.resolve({ success: true }); // PUT için mock yanıt
    }

    // Envanter
    if (path === '/inventory') {
        return Promise.resolve(JSON.parse(JSON.stringify(this._mockData.inventory)));
    }
     if (path.startsWith('/inventory/')) {
         return Promise.resolve({ success: true }); // PUT için mock yanıt
     }

    // Dashboard (Örnekler src/api-service.js'den alınabilir)
     if (path === '/dashboard/stats') { 
         return Promise.resolve(this._mockData.dashboardStats); 
     }
     if (path === '/dashboard/order-trend') {
         return Promise.resolve(this._mockData.dashboardOrderTrend);
     }

    // Schedule
    if (path === '/schedule') {
      return Promise.resolve([
        { id: 'task1', title: 'Sipariş #123 Üretimi', start: '2025-05-16', end: '2025-05-20', resourceId: 'machine1', progress: 60 },
        { id: 'task2', title: 'Malzeme Kesimi - Sipariş #124', start: '2025-05-18', end: '2025-05-22', resourceId: 'machine2', progress: 30 },
        { id: 'task3', title: 'Kalite Kontrol - Sipariş #123', start: '2025-05-20', end: '2025-05-21', resourceId: 'qc1', progress: 0 },
      ]);
    }

    // Resources
    if (path === '/resources') {
      return Promise.resolve([
        { id: 'machine1', name: 'CNC Makinesi Alpha', type: 'machine', status: 'active' },
        { id: 'machine2', name: 'Kaynak İstasyonu Beta', type: 'machine', status: 'maintenance' },
        { id: 'qc1', name: 'Kalite Kontrol Alanı', type: 'area', status: 'active' },
        { id: 'user1', name: 'Ahmet Yılmaz', type: 'operator', status: 'active' },
      ]);
    }

    // Active
    if (path === '/active') {
      return Promise.resolve({
        activeOrders: 3,
        productionLinesRunning: 2,
        alerts: 1,
        efficiency: "92%",
        urgentTasks: [
          { id: 'task Urgent1', description: 'Sipariş #122 için acil parça gerekiyor.', priority: 'high' }
        ]
      });
    }

    console.warn(`Mock GET için endpoint bulunamadı: ${endpoint}`);
    return Promise.reject(new Error(`Mock data not found for GET ${endpoint}`));
  }

  postMockData(endpoint, data, method = 'POST') {
    console.log(`[ApiService MOCK] POST/PUT request. Path: ${endpoint}, Method: ${method}, Incoming Data:`, JSON.parse(JSON.stringify(data)));
    const url = new URL(endpoint, 'http://mock.url');
    let path = url.pathname; 

    if (this.baseUrl && this.baseUrl !== '/' && path.startsWith(this.baseUrl)) {
        path = path.substring(this.baseUrl.length);
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
    }

    if (path === '/orders' && method === 'POST') {
      const newOrderDataFromForm = { ...data }; // data is from collectFormData

      const newOrderForList = {}; 

      newOrderForList.id = `order-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      newOrderForList.orderNo = `SIP-${Date.now().toString().slice(-5)}`; 
      newOrderForList.customer = newOrderDataFromForm.customer;

      if (newOrderDataFromForm.cells && newOrderDataFromForm.cells.length > 0) {
        newOrderForList.cellType = newOrderDataFromForm.cells[0].cellType; 
        newOrderForList.quantity = newOrderDataFromForm.cells.reduce((sum, cell) => sum + (parseInt(cell.quantity, 10) || 0), 0);
      } else {
        newOrderForList.cellType = 'N/A';
        newOrderForList.quantity = 0;
      }

      newOrderForList.orderDate = newOrderDataFromForm.orderDate || new Date().toISOString();
      newOrderForList.status = newOrderDataFromForm.status || 'pending';
      newOrderForList.priority = newOrderDataFromForm.priority || 'medium';
      newOrderForList.progress = newOrderDataFromForm.progress || 0;
      newOrderForList.notesCount = 0; 
      newOrderForList.issuesCount = 0; 

      this._mockData.orders.push(newOrderForList);

      this._mockData.orderDetails[newOrderForList.id] = {
        ...newOrderDataFromForm,
        id: newOrderForList.id, 
        orderNo: newOrderForList.orderNo, 
        notes: [],
        timeline: [{ event: 'Sipariş oluşturuldu', date: new Date().toISOString(), type: 'created', user: 'Sistem (Mock)' }],
        production: { steps: [], currentStep: 0, overallProgress: 0, status: 'pending' },
        materials: [],
        documents: [],
      };
      
      console.log(`[ApiService MOCK] POST /orders: Added new order to list. ID: ${newOrderForList.id}. Total orders in _mockData.orders now: ${this._mockData.orders.length}`);
      console.log('[ApiService MOCK] POST /orders: New order object for list:', JSON.parse(JSON.stringify(newOrderForList)));
      console.log('[ApiService MOCK] POST /orders: _mockData.orders current state (full):', JSON.parse(JSON.stringify(this._mockData.orders)));
      
      return Promise.resolve({ success: true, data: JSON.parse(JSON.stringify(newOrderForList)), message: 'Sipariş başarıyla oluşturuldu (mock).' });
    }

    if (path.startsWith('/orders/') && path.endsWith('/notes') && method === 'POST') {
        const orderId = path.split('/')[2];
        if (this._mockData.orderDetails[orderId]) {
            const newNote = { ...data, id: `note-${Date.now()}`, createdAt: new Date().toISOString(), resolved: false };
            this._mockData.orderDetails[orderId].notes.push(newNote);
            return Promise.resolve(JSON.parse(JSON.stringify(newNote)));
        } else {
            return Promise.reject(new Error(`Order details not found for ${orderId} to add note.`));
        }
    }
    // PATCH for /orders/:orderId/notes/:noteId for resolving a note
    const noteResolveMatch = path.match(/^\/orders\/([^/]+)\/notes\/([^/]+)$/);
    if (noteResolveMatch && method === 'PATCH') { // Assuming PATCH is used for updates
        const orderId = noteResolveMatch[1];
        const noteId = noteResolveMatch[2];
        if (this._mockData.orderDetails[orderId] && this._mockData.orderDetails[orderId].notes) {
            const note = this._mockData.orderDetails[orderId].notes.find(n => n.id === noteId);
            if (note) {
                Object.assign(note, data); // Update note with provided data (e.g., { resolved: true })
                return Promise.resolve(JSON.parse(JSON.stringify(note)));
            }
        }
        return Promise.reject(new Error(`Note not found for PATCH: ${orderId}/${noteId}`));
    }
    // PATCH for /orders/:orderId for updating status
    const orderStatusUpdateMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderStatusUpdateMatch && method === 'PATCH') { // Assuming PATCH is used for updates
        const orderId = orderStatusUpdateMatch[1];
        const order = this._mockData.orders.find(o => o.id === orderId);
        if (order) {
            Object.assign(order, data); // Update order with provided data (e.g., { status: 'newStatus' })
            // Potentially update timeline as well
            if (data.status && this._mockData.orderDetails[orderId]) {
                 this._mockData.orderDetails[orderId].timeline.push({
                    id: `tl_status_${Date.now()}`,
                    type: 'status-change',
                    description: `Durum güncellendi: ${data.status}`,
                    timestamp: new Date().toISOString(),
                    user: 'Sistem (Mock)'
                 });
            }
            return Promise.resolve(JSON.parse(JSON.stringify(order)));
        }
        return Promise.reject(new Error(`Order not found for PATCH: ${orderId}`));
    }

    if (path === '/production/status' && method === 'PUT') {
        console.log('Mock production status updated:', data);
        return Promise.resolve({ success: true });
    }
     if (path.startsWith('/inventory/') && method === 'PUT') {
         const itemId = path.split('/')[2];
         console.log(`Mock inventory item ${itemId} updated:`, data);
         return Promise.resolve({ success: true });
     }

    console.warn(`Mock ${method} için endpoint bulunamadı: ${endpoint}`);
    return Promise.resolve({ success: true, message: `Mock ${method} successful`, data });
  }

  deleteMockData(endpoint) {
    console.log(`%cMock DELETE: ${endpoint}`, 'color: red; font-weight: bold;');
     const url = new URL(endpoint, 'http://mock.url');
     let path = url.pathname; 

    if (this.baseUrl && this.baseUrl !== '/' && path.startsWith(this.baseUrl)) {
        path = path.substring(this.baseUrl.length);
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
    }

     if (path.startsWith('/orders/')) {
         const orderId = path.split('/')[2];
         const index = this._mockData.orders.findIndex(o => o.id === orderId);
         if (index > -1) {
             this._mockData.orders.splice(index, 1);
             return Promise.resolve(); 
         } else {
             return Promise.reject(new Error('Mock Order Not Found for DELETE'));
         }
     }
     
     console.warn(`Mock DELETE için endpoint bulunamadı: ${endpoint}`);
     return Promise.resolve(); 
  }

  _mockData = {
      orders: [
          { id: 'order-001', orderNo: 'SIP-2024001', customer: 'AYEDAŞ', cellType: 'RM 36 CB', quantity: 1, orderDate: '2024-01-15T10:00:00Z', status: 'completed', priority: 'high', progress: 100, notesCount: 2, issuesCount: 0 },
          { id: 'order-002', orderNo: 'SIP-2024002', customer: 'ENERJİSA', cellType: 'RM 24 CB', quantity: 3, orderDate: '2024-01-20T11:30:00Z', status: 'in_progress', priority: 'medium', progress: 60, notesCount: 1, issuesCount: 1 },
          { id: 'order-003', orderNo: 'SIP-2024003', customer: 'BEDAŞ', cellType: 'RM 36 OG', quantity: 2, orderDate: '2024-02-01T14:15:00Z', status: 'pending', priority: 'medium', progress: 10, notesCount: 0, issuesCount: 0 },
          { id: 'order-004', orderNo: 'SIP-2024004', customer: 'TEİAŞ', cellType: 'RM 24 OG', quantity: 5, orderDate: '2024-02-05T09:00:00Z', status: 'planned', priority: 'low', progress: 0, notesCount: 0, issuesCount: 0 },
      ],
      orderDetails: {
        'order-001': { notes: [], timeline: [], production: {}, materials: [] },
        'order-002': { notes: [], timeline: [], production: {}, materials: [] },
        'order-003': { notes: [], timeline: [], production: {}, materials: [] },
        'order-004': { notes: [], timeline: [], production: {}, materials: [] },
      },
      production: {
          progress: 75,
          activeOrders: 12,
          completedOrders: 45,
          delayedOrders: 3,
      },
      inventory: [
          { id: 'mat-001', code: '137998%', name: 'Siemens 7SR1003-1JA20-2DA0+ZY20 24VDC', quantity: 2, minStock: 5, status: 'Kritik' },
          { id: 'mat-002', code: '144866%', name: 'KAP-80/190-95 Akım Trafosu', quantity: 3, minStock: 5, status: 'Düşük' },
           { id: 'mat-003', code: '120170%', name: 'M480TB/G-027-95.300UN5 Kablo Başlığı', quantity: 12, minStock: 10, status: 'Yeterli' }
      ],
       dashboardStats: { /* ... */ },
       dashboardOrderTrend: { /* ... */ }
  };
}

// Singleton instance oluştur ve export et
export const apiService = new ApiService();