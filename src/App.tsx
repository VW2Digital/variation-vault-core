import { Toaster } from "@/components/ui/toaster";
import Index from "./pages/Index";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CartProvider } from "@/contexts/CartContext";

// Páginas públicas críticas (eager - carregam de imediato)
import Catalog from "./pages/Catalog";
import ProductCheckout from "./pages/ProductCheckout";
import Checkout from "./pages/Checkout";
import CartPage from "./pages/CartPage";
import CartCheckout from "./pages/CartCheckout";
import CustomerLogin from "./pages/CustomerLogin";
import CustomerDashboard from "./pages/CustomerDashboard";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import ContactPage from "./pages/ContactPage";
import PaymentLinkCheckout from "./pages/PaymentLinkCheckout";
import FlashCampaignPage from "./pages/FlashCampaignPage";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import RetatrutideRedirect from "./pages/RetatrutideRedirect";

// Admin (lazy - só carrega quando acessado)
const AdminLayout = lazy(() => import("./pages/AdminLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ProductList = lazy(() => import("./pages/ProductList"));
const ProductForm = lazy(() => import("./pages/ProductForm"));
const ProductImportCSV = lazy(() => import("./pages/ProductImportCSV"));
const BannerList = lazy(() => import("./pages/BannerList"));
const SettingsIndex = lazy(() => import("./pages/settings/SettingsIndex"));
const SettingsDesign = lazy(() => import("./pages/settings/SettingsDesign"));
const SettingsColors = lazy(() => import("./pages/settings/SettingsColors"));
const SettingsFonts = lazy(() => import("./pages/settings/SettingsFonts"));
const SettingsCSS = lazy(() => import("./pages/settings/SettingsCSS"));
const SettingsHomePage = lazy(() => import("./pages/settings/SettingsHomePage"));
const SettingsPayment = lazy(() => import("./pages/settings/SettingsPayment"));
const GatewaySettingsPage = lazy(() => import("./pages/settings/payment/GatewaySettingsPage"));
const GatewayAuditLog = lazy(() => import("./pages/settings/payment/GatewayAuditLog"));
const SettingsShipping = lazy(() => import("./pages/settings/SettingsShipping"));
const SettingsCommunication = lazy(() => import("./pages/settings/SettingsCommunication"));
const SettingsFooter = lazy(() => import("./pages/settings/SettingsFooter"));
const SettingsAdvanced = lazy(() => import("./pages/settings/SettingsAdvanced"));
const SettingsAPI = lazy(() => import("./pages/settings/SettingsAPI"));
const SettingsCategories = lazy(() => import("./pages/settings/SettingsCategories"));
const SettingsProductDetails = lazy(() => import("./pages/settings/SettingsProductDetails"));
const SettingsTrustBar = lazy(() => import("./pages/settings/SettingsTrustBar"));
const SettingsBackup = lazy(() => import("./pages/settings/SettingsBackup"));
const SettingsGuides = lazy(() => import("./pages/settings/SettingsGuides"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const UserDetailPage = lazy(() => import("./pages/UserDetailPage"));
const AdminSupportPage = lazy(() => import("./pages/AdminSupportPage"));
const AdminReviewsPage = lazy(() => import("./pages/AdminReviewsPage"));
const PopupList = lazy(() => import("./pages/PopupList"));
const PaymentLogsPage = lazy(() => import("./pages/PaymentLogsPage"));
const GatewayFallbackLogsPage = lazy(() => import("./pages/GatewayFallbackLogsPage"));
const WholesalePricingPage = lazy(() => import("./pages/WholesalePricingPage"));
const WebhookLogsPage = lazy(() => import("./pages/WebhookLogsPage"));
const CartAbandonmentLogsPage = lazy(() => import("./pages/CartAbandonmentLogsPage"));
const PaymentLinksPage = lazy(() => import("./pages/PaymentLinksPage"));
const CouponsPage = lazy(() => import("./pages/CouponsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const AbTestPage = lazy(() => import("./pages/AbTestPage"));
const EmailTemplatesPage = lazy(() => import("./pages/EmailTemplatesPage"));
const EmailLogsPage = lazy(() => import("./pages/EmailLogsPage"));
const EmailEventsPage = lazy(() => import("./pages/EmailEventsPage"));
const BulkEmailPage = lazy(() => import("./pages/BulkEmailPage"));
const UpsellManagerPage = lazy(() => import("./pages/UpsellManagerPage"));
const RecommendationMetricsPage = lazy(() => import("./pages/RecommendationMetricsPage"));
const FlashCampaignsPage = lazy(() => import("./pages/FlashCampaignsPage"));
const FlashCampaignFormPage = lazy(() => import("./pages/FlashCampaignFormPage"));
const FlashCampaignThankYouPage = lazy(() => import("./pages/FlashCampaignThankYouPage"));
const FlashCampaignLeadsPage = lazy(() => import("./pages/FlashCampaignLeadsPage"));
const ResellersPage = lazy(() => import("./pages/ResellersPage"));
const ResellerDetailPage = lazy(() => import("./pages/ResellerDetailPage"));
const CombosManagerPage = lazy(() => import("./pages/CombosManagerPage"));
const ComboCheckout = lazy(() => import("./pages/ComboCheckout"));

import PromoPopup from "./components/PromoPopup";
import { SessionGuard } from "./components/SessionGuard";
import ChatWidgetEmbed from "./components/ChatWidgetEmbed";
import MercadoPagoSecurity from "./components/MercadoPagoSecurity";
import HeadScriptInjector from "./components/HeadScriptInjector";
import MobileBottomNav from "./components/MobileBottomNav";
import LanguageDetectionBanner from "./components/LanguageDetectionBanner";
import ErrorBoundary from "./components/ErrorBoundary";
import ResellerCapture from "./components/ResellerCapture";

const queryClient = new QueryClient();

const AdminFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
    Carregando...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
    <CartProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary silent name="SessionGuard"><SessionGuard /></ErrorBoundary>
        <ErrorBoundary silent name="ResellerCapture"><ResellerCapture /></ErrorBoundary>
        <ErrorBoundary silent name="LanguageDetectionBanner"><LanguageDetectionBanner /></ErrorBoundary>
        <ErrorBoundary silent name="HeadScriptInjector"><HeadScriptInjector /></ErrorBoundary>
        <ErrorBoundary silent name="PromoPopup"><PromoPopup /></ErrorBoundary>
        <ErrorBoundary silent name="ChatWidgetEmbed"><ChatWidgetEmbed /></ErrorBoundary>
        <ErrorBoundary silent name="MercadoPagoSecurity"><MercadoPagoSecurity /></ErrorBoundary>
        <ErrorBoundary name="Routes">
        <Suspense fallback={<AdminFallback />}>
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/catalogo" element={<Catalog />} />
          <Route path="/retatrutide" element={<RetatrutideRedirect />} />
          <Route path="/produto/:id" element={<ProductCheckout />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/carrinho" element={<CartPage />} />
          <Route path="/checkout-carrinho" element={<CartCheckout />} />
          <Route path="/cliente/login" element={<CustomerLogin />} />
          <Route path="/minha-conta" element={<CustomerDashboard />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/recuperar-senha" element={<ForgotPassword />} />
          <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
          <Route path="/termos-de-uso" element={<TermsOfUse />} />
          <Route path="/contato" element={<ContactPage />} />
          <Route path="/pagar/:slug" element={<PaymentLinkCheckout />} />
          <Route path="/combo/:slug" element={<ComboCheckout />} />
          <Route path="/relampago/:slug" element={<FlashCampaignPage />} />
          <Route path="/relampago/:slug/obrigado" element={<FlashCampaignThankYouPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="produtos" element={<ProductList />} />
            <Route path="produtos/novo" element={<ProductForm />} />
            <Route path="produtos/importar" element={<ProductImportCSV />} />
            <Route path="produtos/:id" element={<ProductForm />} />
            <Route path="atacado" element={<WholesalePricingPage />} />
            <Route path="upsells" element={<UpsellManagerPage />} />
            <Route path="combos" element={<CombosManagerPage />} />
            <Route path="combos/:id" element={<CombosManagerPage />} />
            <Route path="metricas-recomendacoes" element={<RecommendationMetricsPage />} />
            <Route path="banners" element={<BannerList />} />
            <Route path="popups" element={<PopupList />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="pedidos/:id" element={<OrderDetailPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="usuarios/:id" element={<UserDetailPage />} />
            <Route path="avaliacoes" element={<AdminReviewsPage />} />
            <Route path="suporte" element={<AdminSupportPage />} />
            <Route path="falhas-pagamento" element={<PaymentLogsPage />} />
            <Route path="fallbacks-gateway" element={<GatewayFallbackLogsPage />} />
            <Route path="webhooks-logs" element={<WebhookLogsPage />} />
            <Route path="carrinho-abandonado" element={<CartAbandonmentLogsPage />} />
            <Route path="links-pagamento" element={<PaymentLinksPage />} />
            <Route path="cupons" element={<CouponsPage />} />
            <Route path="revendedores" element={<ResellersPage />} />
            <Route path="revendedores/:id" element={<ResellerDetailPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="ab-test" element={<AbTestPage />} />
            <Route path="campanhas-relampago" element={<FlashCampaignsPage />} />
            <Route path="campanhas-relampago/nova" element={<FlashCampaignFormPage />} />
            <Route path="campanhas-relampago/:id" element={<FlashCampaignFormPage />} />
            <Route path="campanhas-relampago/:id/leads" element={<FlashCampaignLeadsPage />} />
            <Route path="templates-email" element={<EmailTemplatesPage />} />
            <Route path="logs-email" element={<EmailLogsPage />} />
            <Route path="eventos-email" element={<EmailEventsPage />} />
            <Route path="disparo-emails" element={<BulkEmailPage />} />
            <Route path="configuracoes" element={<SettingsIndex />} />
            <Route path="configuracoes/guias" element={<SettingsGuides />} />
            <Route path="configuracoes/design" element={<SettingsDesign />} />
            <Route path="configuracoes/cores" element={<SettingsColors />} />
            <Route path="configuracoes/fontes" element={<SettingsFonts />} />
            <Route path="configuracoes/css" element={<SettingsCSS />} />
            <Route path="configuracoes/pagina-inicial" element={<SettingsHomePage />} />
            <Route path="configuracoes/pagamento" element={<SettingsPayment />} />
            <Route path="configuracoes/pagamento/auditoria" element={<GatewayAuditLog />} />
            <Route path="configuracoes/pagamento/:gateway" element={<GatewaySettingsPage />} />
            <Route path="configuracoes/logistica" element={<SettingsShipping />} />
            <Route path="configuracoes/comunicacao" element={<SettingsCommunication />} />
            <Route path="configuracoes/rodape" element={<SettingsFooter />} />
            <Route path="configuracoes/avancado" element={<SettingsAdvanced />} />
            <Route path="configuracoes/api" element={<SettingsAPI />} />
            <Route path="configuracoes/categorias" element={<SettingsCategories />} />
            <Route path="configuracoes/detalhes-produto" element={<SettingsProductDetails />} />
            <Route path="configuracoes/trust-bar" element={<SettingsTrustBar />} />
            <Route path="configuracoes/backup" element={<SettingsBackup />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
        <MobileBottomNav />
      </BrowserRouter>
    </TooltipProvider>
    </CartProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
