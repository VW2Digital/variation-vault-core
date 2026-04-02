import { Toaster } from "@/components/ui/toaster";
import Index from "./pages/Index";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CartProvider } from "@/contexts/CartContext";
import Login from "./pages/Login";
import AdminLayout from "./pages/AdminLayout";
import Dashboard from "./pages/Dashboard";
import ProductList from "./pages/ProductList";
import ProductForm from "./pages/ProductForm";
import ProductCheckout from "./pages/ProductCheckout";
import Catalog from "./pages/Catalog";
import TestimonialList from "./pages/TestimonialList";
import BannerList from "./pages/BannerList";
import SettingsIndex from "./pages/settings/SettingsIndex";
import SettingsDesign from "./pages/settings/SettingsDesign";
import SettingsColors from "./pages/settings/SettingsColors";
import SettingsFonts from "./pages/settings/SettingsFonts";
import SettingsCSS from "./pages/settings/SettingsCSS";
import SettingsHomePage from "./pages/settings/SettingsHomePage";
import SettingsPayment from "./pages/settings/SettingsPayment";
import SettingsShipping from "./pages/settings/SettingsShipping";
import SettingsCommunication from "./pages/settings/SettingsCommunication";
import SettingsFooter from "./pages/settings/SettingsFooter";
import SettingsAdvanced from "./pages/settings/SettingsAdvanced";
import OrdersPage from "./pages/OrdersPage";
import UsersPage from "./pages/UsersPage";
import Checkout from "./pages/Checkout";
import CustomerLogin from "./pages/CustomerLogin";
import CustomerDashboard from "./pages/CustomerDashboard";
import CartPage from "./pages/CartPage";
import CartCheckout from "./pages/CartCheckout";
import ResetPassword from "./pages/ResetPassword";
import AdminSupportPage from "./pages/AdminSupportPage";
import AdminReviewsPage from "./pages/AdminReviewsPage";
import PopupList from "./pages/PopupList";
import PaymentLogsPage from "./pages/PaymentLogsPage";
import CartAbandonmentLogsPage from "./pages/CartAbandonmentLogsPage";
import PaymentLinksPage from "./pages/PaymentLinksPage";
import PaymentLinkCheckout from "./pages/PaymentLinkCheckout";
import PromoPopup from "./components/PromoPopup";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import ContactPage from "./pages/ContactPage";
import { SessionGuard } from "./components/SessionGuard";
import ChatWidgetEmbed from "./components/ChatWidgetEmbed";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
    <CartProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionGuard />
        <PromoPopup />
        <ChatWidgetEmbed />
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/catalogo" element={<Catalog />} />
          <Route path="/produto/:id" element={<ProductCheckout />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/carrinho" element={<CartPage />} />
          <Route path="/checkout-carrinho" element={<CartCheckout />} />
          <Route path="/cliente/login" element={<CustomerLogin />} />
          <Route path="/minha-conta" element={<CustomerDashboard />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
          <Route path="/termos-de-uso" element={<TermsOfUse />} />
          <Route path="/contato" element={<ContactPage />} />
          <Route path="/pagar/:slug" element={<PaymentLinkCheckout />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="produtos" element={<ProductList />} />
            <Route path="produtos/novo" element={<ProductForm />} />
            <Route path="produtos/:id" element={<ProductForm />} />
            <Route path="depoimentos" element={<TestimonialList />} />
            <Route path="banners" element={<BannerList />} />
            <Route path="popups" element={<PopupList />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="avaliacoes" element={<AdminReviewsPage />} />
            <Route path="suporte" element={<AdminSupportPage />} />
            <Route path="falhas-pagamento" element={<PaymentLogsPage />} />
            <Route path="carrinho-abandonado" element={<CartAbandonmentLogsPage />} />
            <Route path="links-pagamento" element={<PaymentLinksPage />} />
            <Route path="configuracoes" element={<SettingsIndex />} />
            <Route path="configuracoes/design" element={<SettingsDesign />} />
            <Route path="configuracoes/cores" element={<SettingsColors />} />
            <Route path="configuracoes/fontes" element={<SettingsFonts />} />
            <Route path="configuracoes/css" element={<SettingsCSS />} />
            <Route path="configuracoes/pagina-inicial" element={<SettingsHomePage />} />
            <Route path="configuracoes/pagamento" element={<SettingsPayment />} />
            <Route path="configuracoes/logistica" element={<SettingsShipping />} />
            <Route path="configuracoes/comunicacao" element={<SettingsCommunication />} />
            <Route path="configuracoes/rodape" element={<SettingsFooter />} />
            <Route path="configuracoes/avancado" element={<SettingsAdvanced />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </CartProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
