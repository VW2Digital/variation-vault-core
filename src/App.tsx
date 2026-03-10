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
import SettingsPage from "./pages/SettingsPage";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
    <CartProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="produtos" element={<ProductList />} />
            <Route path="produtos/novo" element={<ProductForm />} />
            <Route path="produtos/:id" element={<ProductForm />} />
            <Route path="depoimentos" element={<TestimonialList />} />
            <Route path="banners" element={<BannerList />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="avaliacoes" element={<AdminReviewsPage />} />
            <Route path="suporte" element={<AdminSupportPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
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
