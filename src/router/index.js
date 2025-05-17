import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/store/auth';

// Layouts
// import DefaultLayout from '@/layouts/DefaultLayout.vue'; // DefaultLayout zaten App.vue içinde ele alınıyor
// import BlankLayout from '@/layouts/BlankLayout.vue'; // BlankLayout zaten App.vue içinde ele alınıyor

// Views
const LoginView = () => import('@/modules/auth/views/LoginView.vue');
const Dashboard = () => import('@/modules/dashboard/views/DashboardView.vue');
const OrderListView = () => import('@/modules/orders/views/OrderListView.vue');
const OrderDetailView = () => import('@/modules/orders/views/OrderDetailView.vue');
const OrderCreationView = () => import('@/modules/orders/views/OrderCreationView.vue'); // Bu satırı geri ekledim
const ProductionOverview = () => import('@/modules/production/views/ProductionOverview.vue'); // Üretim İzleme/Genel Bakış
const PlanningDashboard = () => import('@/modules/planning/views/PlanningDashboard.vue'); // Üretim Planlaması
const TechnicalView = () => import('@/modules/technical/views/TechnicalView.vue'); // Corrected path and component
const SettingsView = () => import('@/modules/settings/views/SettingsView.vue'); // Dosya adı SettingsGeneral.vue -> SettingsView.vue olarak düzeltildi.
const NotFound = () => import('@/components/NotFound.vue');
const InventoryList = () => import('@/modules/inventory/views/InventoryList.vue'); // Stok Yönetimi (Liste)
const MaterialsView = () => import('@/modules/inventory/views/MaterialsView.vue'); // Malzemeler
const StockView = () => import('@/modules/inventory/views/StockView.vue'); // Stok Durumu Detayları (Belki bu InventoryList ile birleştirilebilir)
const PurchasingView = () => import('@/modules/purchasing/views/PurchasingView.vue'); // Tedarikçiler/Satın Alma
const ReportsView = () => import('@/modules/reports/views/ReportsView.vue'); // Raporlar (Genel)
const AiDashboardView = () => import('@/components/ai/AIInsightsDashboard.vue');

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { layout: 'blank', requiresAuth: false },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard,
    meta: { requiresAuth: true },
  },
  {
    path: '/orders',
    name: 'Orders',
    component: OrderListView,
    meta: { requiresAuth: true },
  },
  {
    path: '/orders/:id',
    name: 'OrderDetail',
    component: OrderDetailView,
    meta: { requiresAuth: true },
  },
  {
    path: '/orders/create',
    name: 'OrderCreate',
    component: OrderCreationView, // Bu route'u geri ekledim
    meta: { requiresAuth: true },
  },
  {
    path: '/inventory',
    name: 'Inventory', // Stok Yönetimi Ana Sayfası (Genel Bakış)
    component: InventoryList, // Veya daha genel bir InventoryDashboard.vue olabilir
    meta: { requiresAuth: true },
  },
  {
    path: '/materials',
    name: 'Materials', // Malzemeler Sayfası
    component: MaterialsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/stock', // Stok Detayları için ayrı bir yol olabilir veya Inventory altında bir alt yol
    name: 'Stock',
    component: StockView,
    meta: { requiresAuth: true },
  },
  {
    path: '/reports', // Raporlar ana sayfası
    name: 'Reports',
    component: ReportsView, // Bu genel bir rapor görüntüleme sayfası olmalı
    meta: { requiresAuth: true },
  },
  // Sipariş Raporları ve Üretim Raporları için özel yollar eklenebilir
  // Örnek: /reports/orders, /reports/production
  // Veya ReportsView içinde sekmelerle/filtrelerle yönetilebilir.
  {
    path: '/production', // Üretim İzleme/Genel Bakış
    name: 'Production',
    component: ProductionOverview,
    meta: { requiresAuth: true },
  },
  {
    path: '/planning', // Üretim Planlaması
    name: 'Planning',
    component: PlanningDashboard,
    meta: { requiresAuth: true },
  },
  {
    path: '/technical',
    name: 'Technical',
    component: TechnicalView,
    meta: { requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView, // Komponent adı SettingsGeneral -> SettingsView olarak düzeltildi.
    meta: { requiresAuth: true },
  },
  {
    path: '/purchasing', // Tedarikçiler/Satın Alma
    name: 'Purchasing',
    component: PurchasingView,
    meta: { requiresAuth: true },
  },
  {
    path: '/ai-dashboard',
    name: 'AiDashboard',
    component: AiDashboardView,
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
    meta: { layout: 'blank', requiresAuth: false },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // Vite için BASE_URL kullanımı
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // Ensure the auth store is initialized before checking authentication state.
  if (!authStore.sessionInitialized) { 
      await authStore.initialize(); 
  }
  
  const isAuthenticated = authStore.isAuthenticated;
  const requiresAuth = to.meta.requiresAuth !== false; // Default to true if not specified

  if (requiresAuth && !isAuthenticated) {
    if (to.name !== 'Login') {
      next({ name: 'Login', query: { redirect: to.fullPath } });
    } else {
      next(); // Already on login page, allow
    }
  } else if (isAuthenticated && to.name === 'Login') {
    // If authenticated and trying to access Login page, redirect to Dashboard
    next({ name: 'Dashboard' });
  } else {
    next(); // Allow navigation
  }
});

export default router;
