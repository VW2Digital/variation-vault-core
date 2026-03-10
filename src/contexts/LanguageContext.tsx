import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Language = 'pt' | 'es' | 'en';

interface LanguageInfo {
  code: Language;
  flag: string;
  short: string;
  label: string;
}

export const languages: LanguageInfo[] = [
  { code: 'pt', flag: '🇧🇷', short: 'BR', label: 'Português' },
  { code: 'es', flag: '🇪🇸', short: 'ES', label: 'Español' },
  { code: 'en', flag: '🇺🇸', short: 'US', label: 'English' },
];

const translations = {
  // Catalog
  catalog: { pt: 'Catálogo', es: 'Catálogo', en: 'Catalog' },
  catalogTitle: { pt: 'Catálogo de Produtos', es: 'Catálogo de Productos', en: 'Product Catalog' },
  catalogSubtitle: {
    pt: 'Explore nossa linha completa de medicamentos com qualidade premium e certificação internacional.',
    es: 'Explore nuestra línea completa de medicamentos con calidad premium y certificación internacional.',
    en: 'Explore our complete line of medications with premium quality and international certification.',
  },
  searchPlaceholder: { pt: 'Buscar por nome, princípio ativo...', es: 'Buscar por nombre, principio activo...', en: 'Search by name, active ingredient...' },
  allForms: { pt: 'Todas as formas', es: 'Todas las formas', en: 'All forms' },
  allRoutes: { pt: 'Todas as vias', es: 'Todas las vías', en: 'All routes' },
  all: { pt: 'Todos', es: 'Todos', en: 'All' },
  inStock: { pt: 'Em estoque', es: 'En stock', en: 'In stock' },
  outOfStock: { pt: 'Esgotado', es: 'Agotado', en: 'Out of stock' },
  newest: { pt: 'Mais recentes', es: 'Más recientes', en: 'Newest' },
  nameAZ: { pt: 'Nome A-Z', es: 'Nombre A-Z', en: 'Name A-Z' },
  priceLow: { pt: 'Menor preço', es: 'Menor precio', en: 'Lowest price' },
  priceHigh: { pt: 'Maior preço', es: 'Mayor precio', en: 'Highest price' },
  productsFound: { pt: 'produtos encontrados', es: 'productos encontrados', en: 'products found' },
  productFound: { pt: 'produto encontrado', es: 'producto encontrado', en: 'product found' },
  loadingProducts: { pt: 'Carregando produtos...', es: 'Cargando productos...', en: 'Loading products...' },
  noProducts: { pt: 'Nenhum produto encontrado com os filtros selecionados.', es: 'No se encontraron productos con los filtros seleccionados.', en: 'No products found with the selected filters.' },
  clearFilters: { pt: 'Limpar filtros', es: 'Limpiar filtros', en: 'Clear filters' },
  activeIngredient: { pt: 'Princípio ativo', es: 'Principio activo', en: 'Active ingredient' },
  consult: { pt: 'Consultar', es: 'Consultar', en: 'Inquire' },
  offer: { pt: 'OFERTA', es: 'OFERTA', en: 'SALE' },
  allRights: { pt: 'Todos os direitos reservados', es: 'Todos los derechos reservados', en: 'All rights reserved' },

  // Product page
  selectDosage: { pt: 'Selecione a Dosagem', es: 'Seleccione la Dosis', en: 'Select Dosage' },
  quantity: { pt: 'Quantidade', es: 'Cantidad', en: 'Quantity' },
  price: { pt: 'Preço', es: 'Precio', en: 'Price' },
  unavailable: { pt: 'Indisponível', es: 'No disponible', en: 'Unavailable' },
  upTo6x: { pt: 'Aceitamos todos os cartões', es: 'Aceptamos todas las tarjetas', en: 'We accept all cards' },
  pixAvailable: { pt: 'PIX disponível', es: 'PIX disponible', en: 'PIX available' },
  buyNow: { pt: 'Comprar Agora', es: 'Comprar Ahora', en: 'Buy Now' },
  soldOut: { pt: 'Produto Esgotado', es: 'Producto Agotado', en: 'Sold Out' },
  productDetails: { pt: 'Detalhes do Produto', es: 'Detalles del Producto', en: 'Product Details' },
  activeIngredientLabel: { pt: 'Princípio Ativo', es: 'Principio Activo', en: 'Active Ingredient' },
  dosageLabel: { pt: 'Dosagem', es: 'Dosis', en: 'Dosage' },
  pharmaForm: { pt: 'Forma Farmacêutica', es: 'Forma Farmacéutica', en: 'Pharmaceutical Form' },
  adminRoute: { pt: 'Via de Administração', es: 'Vía de Administración', en: 'Administration Route' },
  frequency: { pt: 'Frequência de Uso', es: 'Frecuencia de Uso', en: 'Usage Frequency' },
  prescriptionNote: {
    pt: '* Este medicamento requer prescrição médica. Consulte um profissional de saúde antes do uso.',
    es: '* Este medicamento requiere prescripción médica. Consulte a un profesional de salud antes de usarlo.',
    en: '* This medication requires a prescription. Consult a healthcare professional before use.',
  },

  // Trust badges
  certifiedProduct: { pt: 'Produto Certificado', es: 'Producto Certificado', en: 'Certified Product' },
  certifiedDesc: { pt: 'Aprovado por agências regulatórias', es: 'Aprobado por agencias regulatorias', en: 'Approved by regulatory agencies' },
  fastDelivery: { pt: 'Entrega Rápida', es: 'Entrega Rápida', en: 'Fast Delivery' },
  fastDeliveryDesc: { pt: 'Frete grátis para todo Brasil', es: 'Envío gratis a todo Brasil', en: 'Free shipping to all of Brazil' },
  premiumQuality: { pt: 'Qualidade Premium', es: 'Calidad Premium', en: 'Premium Quality' },
  premiumQualityDesc: { pt: 'Padrão internacional de qualidade', es: 'Estándar internacional de calidad', en: 'International quality standard' },
  weeklyUse: { pt: 'Uso Semanal', es: 'Uso Semanal', en: 'Weekly Use' },
  weeklyUseDesc: { pt: 'Aplicação uma vez por semana', es: 'Aplicación una vez por semana', en: 'Once a week application' },

  // Bula
  drugBulletin: { pt: 'Bula do Medicamento', es: 'Prospecto del Medicamento', en: 'Drug Information' },

  // Testimonials
  customerTestimonials: { pt: 'Depoimentos de Clientes', es: 'Testimonios de Clientes', en: 'Customer Testimonials' },
  testimonialSubtitle: {
    pt: 'Veja o que nossos clientes estão dizendo sobre o Liberty Pharma',
    es: 'Vea lo que nuestros clientes dicen sobre Liberty Pharma',
    en: 'See what our customers are saying about Liberty Pharma',
  },

  // Checkout
  backToProduct: { pt: 'Voltar ao produto', es: 'Volver al producto', en: 'Back to product' },
  orderSummary: { pt: 'Resumo do Pedido', es: 'Resumen del Pedido', en: 'Order Summary' },
  qty: { pt: 'Qtd', es: 'Cant', en: 'Qty' },
  buyerData: { pt: 'Dados do Comprador', es: 'Datos del Comprador', en: 'Buyer Information' },
  fullName: { pt: 'Nome completo', es: 'Nombre completo', en: 'Full name' },
  email: { pt: 'E-mail', es: 'Correo electrónico', en: 'Email' },
  cpf: { pt: 'CPF', es: 'CPF', en: 'CPF' },
  phoneLabel: { pt: 'Telefone', es: 'Teléfono', en: 'Phone' },
  continueToPayment: { pt: 'Continuar para pagamento', es: 'Continuar al pago', en: 'Continue to payment' },
  paymentMethod: { pt: 'Forma de Pagamento', es: 'Forma de Pago', en: 'Payment Method' },
  creditCard: { pt: 'Cartão de Crédito', es: 'Tarjeta de Crédito', en: 'Credit Card' },
  cardNumber: { pt: 'Número do cartão', es: 'Número de tarjeta', en: 'Card number' },
  cardName: { pt: 'Nome no cartão', es: 'Nombre en la tarjeta', en: 'Name on card' },
  month: { pt: 'Mês', es: 'Mes', en: 'Month' },
  year: { pt: 'Ano', es: 'Año', en: 'Year' },
  installments: { pt: 'Parcelas', es: 'Cuotas', en: 'Installments' },
  cashPayment: { pt: 'à vista', es: 'al contado', en: 'in full' },
  noInterest: { pt: 'sem juros', es: 'sin intereses', en: 'interest-free' },
  holderData: { pt: 'Dados do titular', es: 'Datos del titular', en: 'Cardholder info' },
  cep: { pt: 'CEP', es: 'Código postal', en: 'ZIP code' },
  addressNumber: { pt: 'Número', es: 'Número', en: 'Number' },
  pay: { pt: 'Pagar', es: 'Pagar', en: 'Pay' },
  generatePix: { pt: 'Gerar PIX', es: 'Generar PIX', en: 'Generate PIX' },
  pixGenerated: { pt: 'Pagamento PIX gerado!', es: '¡Pago PIX generado!', en: 'PIX payment generated!' },
  scanQR: { pt: 'Escaneie o QR Code ou copie o código abaixo', es: 'Escanee el QR Code o copie el código', en: 'Scan the QR code or copy the code below' },
  paymentProcessed: { pt: 'Pagamento processado!', es: '¡Pago procesado!', en: 'Payment processed!' },
  confirmed: { pt: 'Confirmado', es: 'Confirmado', en: 'Confirmed' },
  pending: { pt: 'Pendente', es: 'Pendiente', en: 'Pending' },
  copied: { pt: 'Copiado!', es: '¡Copiado!', en: 'Copied!' },
  value: { pt: 'Valor', es: 'Valor', en: 'Amount' },
  loading: { pt: 'Carregando...', es: 'Cargando...', en: 'Loading...' },
  productNotFound: { pt: 'Produto não encontrado.', es: 'Producto no encontrado.', en: 'Product not found.' },

  // Validation
  nameRequired: { pt: 'Nome é obrigatório', es: 'El nombre es obligatorio', en: 'Name is required' },
  nameMin: { pt: 'Nome deve ter pelo menos 3 caracteres', es: 'El nombre debe tener al menos 3 caracteres', en: 'Name must be at least 3 characters' },
  emailRequired: { pt: 'E-mail é obrigatório', es: 'El correo es obligatorio', en: 'Email is required' },
  emailInvalid: { pt: 'E-mail inválido', es: 'Correo inválido', en: 'Invalid email' },
  cpfRequired: { pt: 'CPF é obrigatório', es: 'CPF es obligatorio', en: 'CPF is required' },
  cpfInvalid: { pt: 'CPF inválido', es: 'CPF inválido', en: 'Invalid CPF' },
  phoneRequired: { pt: 'Telefone é obrigatório', es: 'El teléfono es obligatorio', en: 'Phone is required' },
  phoneInvalid: { pt: 'Telefone inválido', es: 'Teléfono inválido', en: 'Invalid phone' },
  cardNumberInvalid: { pt: 'Número do cartão inválido', es: 'Número de tarjeta inválido', en: 'Invalid card number' },
  cardNameRequired: { pt: 'Nome no cartão é obrigatório', es: 'Nombre en tarjeta obligatorio', en: 'Name on card is required' },
  monthInvalid: { pt: 'Mês inválido', es: 'Mes inválido', en: 'Invalid month' },
  yearInvalid: { pt: 'Ano inválido', es: 'Año inválido', en: 'Invalid year' },
  cvvInvalid: { pt: 'CVV inválido', es: 'CVV inválido', en: 'Invalid CVV' },
  cepInvalid: { pt: 'CEP inválido', es: 'Código postal inválido', en: 'Invalid ZIP code' },
  numberRequired: { pt: 'Número obrigatório', es: 'Número obligatorio', en: 'Number required' },
  error: { pt: 'Erro', es: 'Error', en: 'Error' },
  paymentError: { pt: 'Erro no pagamento', es: 'Error en el pago', en: 'Payment error' },
  status: { pt: 'Status', es: 'Estado', en: 'Status' },
  pixDescription: { pt: 'Ao confirmar, um QR Code PIX será gerado para pagamento imediato.', es: 'Al confirmar, se generará un QR Code PIX para pago inmediato.', en: 'A PIX QR Code will be generated for immediate payment.' },
  backToData: { pt: 'Voltar aos dados pessoais', es: 'Volver a los datos personales', en: 'Back to personal data' },
} as const;

type TranslationKey = keyof typeof translations;

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('language') as Language;
    return saved && ['pt', 'es', 'en'].includes(saved) ? saved : 'pt';
  });

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    localStorage.setItem('language', l);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[key]?.[lang] || key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
};
