import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Language = 'pt' | 'es' | 'en' | 'zh';

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
  { code: 'zh', flag: '🇨🇳', short: 'CN', label: '中文' },
];

const translations = {
  // Catalog
  catalog: { pt: 'Catálogo', es: 'Catálogo', en: 'Catalog', zh: '目录' },
  catalogTitle: { pt: 'Catálogo de Produtos', es: 'Catálogo de Productos', en: 'Product Catalog', zh: '产品目录' },
  catalogSubtitle: {
    pt: 'Explore nossa linha completa de medicamentos com qualidade premium e certificação internacional.',
    es: 'Explore nuestra línea completa de medicamentos con calidad premium y certificación internacional.',
    en: 'Explore our complete line of medications with premium quality and international certification.',
    zh: '探索我们具有优质品质和国际认证的完整药品系列。',
  },
  searchPlaceholder: { pt: 'Buscar por nome, princípio ativo...', es: 'Buscar por nombre, principio activo...', en: 'Search by name, active ingredient...', zh: '按名称、活性成分搜索...' },
  allForms: { pt: 'Todas as formas', es: 'Todas las formas', en: 'All forms', zh: '所有剂型' },
  allRoutes: { pt: 'Todas as vias', es: 'Todas las vías', en: 'All routes', zh: '所有给药途径' },
  all: { pt: 'Todos', es: 'Todos', en: 'All', zh: '全部' },
  inStock: { pt: 'Em estoque', es: 'En stock', en: 'In stock', zh: '有货' },
  outOfStock: { pt: 'Esgotado', es: 'Agotado', en: 'Out of stock', zh: '缺货' },
  newest: { pt: 'Mais recentes', es: 'Más recientes', en: 'Newest', zh: '最新' },
  nameAZ: { pt: 'Nome A-Z', es: 'Nombre A-Z', en: 'Name A-Z', zh: '名称 A-Z' },
  priceLow: { pt: 'Menor preço', es: 'Menor precio', en: 'Lowest price', zh: '最低价' },
  priceHigh: { pt: 'Maior preço', es: 'Mayor precio', en: 'Highest price', zh: '最高价' },
  productsFound: { pt: 'produtos encontrados', es: 'productos encontrados', en: 'products found', zh: '件产品' },
  productFound: { pt: 'produto encontrado', es: 'producto encontrado', en: 'product found', zh: '件产品' },
  loadingProducts: { pt: 'Carregando produtos...', es: 'Cargando productos...', en: 'Loading products...', zh: '正在加载产品...' },
  noProducts: { pt: 'Nenhum produto encontrado com os filtros selecionados.', es: 'No se encontraron productos con los filtros seleccionados.', en: 'No products found with the selected filters.', zh: '未找到符合所选筛选条件的产品。' },
  clearFilters: { pt: 'Limpar filtros', es: 'Limpiar filtros', en: 'Clear filters', zh: '清除筛选' },
  activeIngredient: { pt: 'Princípio ativo', es: 'Principio activo', en: 'Active ingredient', zh: '活性成分' },
  consult: { pt: 'Consultar', es: 'Consultar', en: 'Inquire', zh: '咨询' },
  offer: { pt: 'OFERTA', es: 'OFERTA', en: 'SALE', zh: '促销' },
  allRights: { pt: 'Todos os direitos reservados', es: 'Todos los derechos reservados', en: 'All rights reserved', zh: '版权所有' },

  // Product page
  selectDosage: { pt: 'Selecione a Dosagem', es: 'Seleccione la Dosis', en: 'Select Dosage', zh: '选择剂量' },
  quantity: { pt: 'Quantidade', es: 'Cantidad', en: 'Quantity', zh: '数量' },
  price: { pt: 'Preço', es: 'Precio', en: 'Price', zh: '价格' },
  unavailable: { pt: 'Indisponível', es: 'No disponible', en: 'Unavailable', zh: '不可用' },
  upTo6x: { pt: 'Aceitamos todos os cartões', es: 'Aceptamos todas las tarjetas', en: 'We accept all cards', zh: '接受所有银行卡' },
  pixAvailable: { pt: 'PIX disponível', es: 'PIX disponible', en: 'PIX available', zh: '支持 PIX' },
  buyNow: { pt: 'Comprar Agora', es: 'Comprar Ahora', en: 'Buy Now', zh: '立即购买' },
  soldOut: { pt: 'Produto Esgotado', es: 'Producto Agotado', en: 'Sold Out', zh: '已售罄' },
  productDetails: { pt: 'Detalhes do Produto', es: 'Detalles del Producto', en: 'Product Details', zh: '产品详情' },
  activeIngredientLabel: { pt: 'Princípio Ativo', es: 'Principio Activo', en: 'Active Ingredient', zh: '活性成分' },
  dosageLabel: { pt: 'Dosagem', es: 'Dosis', en: 'Dosage', zh: '剂量' },
  pharmaForm: { pt: 'Forma Farmacêutica', es: 'Forma Farmacéutica', en: 'Pharmaceutical Form', zh: '药剂剂型' },
  adminRoute: { pt: 'Via de Administração', es: 'Vía de Administración', en: 'Administration Route', zh: '给药途径' },
  frequency: { pt: 'Frequência de Uso', es: 'Frecuencia de Uso', en: 'Usage Frequency', zh: '使用频率' },
  prescriptionNote: {
    pt: '* Este medicamento requer prescrição médica. Consulte um profissional de saúde antes do uso.',
    es: '* Este medicamento requiere prescripción médica. Consulte a un profesional de salud antes de usarlo.',
    en: '* This medication requires a prescription. Consult a healthcare professional before use.',
    zh: '* 本药品需要处方。使用前请咨询医疗专业人员。',
  },

  // Trust badges
  certifiedProduct: { pt: 'Produto Certificado', es: 'Producto Certificado', en: 'Certified Product', zh: '认证产品' },
  certifiedDesc: { pt: 'Aprovado por agências regulatórias', es: 'Aprobado por agencias regulatorias', en: 'Approved by regulatory agencies', zh: '获监管机构批准' },
  fastDelivery: { pt: 'Entrega Rápida', es: 'Entrega Rápida', en: 'Fast Delivery', zh: '快速配送' },
  fastDeliveryDesc: { pt: 'Frete grátis para todo Brasil', es: 'Envío gratis a todo Brasil', en: 'Free shipping to all of Brazil', zh: '巴西全境免运费' },
  premiumQuality: { pt: 'Qualidade Premium', es: 'Calidad Premium', en: 'Premium Quality', zh: '优质品质' },
  premiumQualityDesc: { pt: 'Padrão internacional de qualidade', es: 'Estándar internacional de calidad', en: 'International quality standard', zh: '国际品质标准' },
  weeklyUse: { pt: 'Uso Semanal', es: 'Uso Semanal', en: 'Weekly Use', zh: '每周使用' },
  weeklyUseDesc: { pt: 'Aplicação uma vez por semana', es: 'Aplicación una vez por semana', en: 'Once a week application', zh: '每周使用一次' },

  // Bula
  drugBulletin: { pt: 'Bula do Medicamento', es: 'Prospecto del Medicamento', en: 'Drug Information', zh: '药品说明书' },

  // Testimonials
  customerTestimonials: { pt: 'Depoimentos de Clientes', es: 'Testimonios de Clientes', en: 'Customer Testimonials', zh: '客户评价' },
  testimonialSubtitle: {
    pt: 'Veja o que nossos clientes estão dizendo sobre o Liberty Pharma',
    es: 'Vea lo que nuestros clientes dicen sobre Liberty Pharma',
    en: 'See what our customers are saying about Liberty Pharma',
    zh: '看看我们的客户对 Liberty Pharma 的评价',
  },

  // Checkout
  backToProduct: { pt: 'Voltar ao produto', es: 'Volver al producto', en: 'Back to product', zh: '返回产品' },
  orderSummary: { pt: 'Resumo do Pedido', es: 'Resumen del Pedido', en: 'Order Summary', zh: '订单摘要' },
  qty: { pt: 'Qtd', es: 'Cant', en: 'Qty', zh: '数量' },
  buyerData: { pt: 'Dados do Comprador', es: 'Datos del Comprador', en: 'Buyer Information', zh: '买家信息' },
  fullName: { pt: 'Nome completo', es: 'Nombre completo', en: 'Full name', zh: '全名' },
  email: { pt: 'E-mail', es: 'Correo electrónico', en: 'Email', zh: '电子邮箱' },
  cpf: { pt: 'CPF', es: 'CPF', en: 'CPF', zh: 'CPF' },
  phoneLabel: { pt: 'Telefone', es: 'Teléfono', en: 'Phone', zh: '电话' },
  continueToPayment: { pt: 'Continuar para pagamento', es: 'Continuar al pago', en: 'Continue to payment', zh: '继续付款' },
  paymentMethod: { pt: 'Forma de Pagamento', es: 'Forma de Pago', en: 'Payment Method', zh: '付款方式' },
  creditCard: { pt: 'Cartão de Crédito', es: 'Tarjeta de Crédito', en: 'Credit Card', zh: '信用卡' },
  cardNumber: { pt: 'Número do cartão', es: 'Número de tarjeta', en: 'Card number', zh: '卡号' },
  cardName: { pt: 'Nome no cartão', es: 'Nombre en la tarjeta', en: 'Name on card', zh: '持卡人姓名' },
  month: { pt: 'Mês', es: 'Mes', en: 'Month', zh: '月' },
  year: { pt: 'Ano', es: 'Año', en: 'Year', zh: '年' },
  installments: { pt: 'Parcelas', es: 'Cuotas', en: 'Installments', zh: '分期' },
  cashPayment: { pt: 'à vista', es: 'al contado', en: 'in full', zh: '一次性付款' },
  noInterest: { pt: 'sem juros', es: 'sin intereses', en: 'interest-free', zh: '免息' },
  holderData: { pt: 'Dados do titular', es: 'Datos del titular', en: 'Cardholder info', zh: '持卡人信息' },
  cep: { pt: 'CEP', es: 'Código postal', en: 'ZIP code', zh: '邮政编码' },
  addressNumber: { pt: 'Número', es: 'Número', en: 'Number', zh: '门牌号' },
  pay: { pt: 'Pagar', es: 'Pagar', en: 'Pay', zh: '付款' },
  generatePix: { pt: 'Gerar PIX', es: 'Generar PIX', en: 'Generate PIX', zh: '生成 PIX' },
  pixGenerated: { pt: 'Pagamento PIX gerado!', es: '¡Pago PIX generado!', en: 'PIX payment generated!', zh: 'PIX 付款已生成!' },
  scanQR: { pt: 'Escaneie o QR Code ou copie o código abaixo', es: 'Escanee el QR Code o copie el código', en: 'Scan the QR code or copy the code below', zh: '扫描二维码或复制下方代码' },
  paymentProcessed: { pt: 'Pagamento processado!', es: '¡Pago procesado!', en: 'Payment processed!', zh: '付款已处理!' },
  confirmed: { pt: 'Confirmado', es: 'Confirmado', en: 'Confirmed', zh: '已确认' },
  pending: { pt: 'Pendente', es: 'Pendiente', en: 'Pending', zh: '待处理' },
  copied: { pt: 'Copiado!', es: '¡Copiado!', en: 'Copied!', zh: '已复制!' },
  value: { pt: 'Valor', es: 'Valor', en: 'Amount', zh: '金额' },
  loading: { pt: 'Carregando...', es: 'Cargando...', en: 'Loading...', zh: '加载中...' },
  productNotFound: { pt: 'Produto não encontrado.', es: 'Producto no encontrado.', en: 'Product not found.', zh: '未找到产品。' },

  // Validation
  nameRequired: { pt: 'Nome é obrigatório', es: 'El nombre es obligatorio', en: 'Name is required', zh: '姓名为必填项' },
  nameMin: { pt: 'Nome deve ter pelo menos 3 caracteres', es: 'El nombre debe tener al menos 3 caracteres', en: 'Name must be at least 3 characters', zh: '姓名至少需要 3 个字符' },
  emailRequired: { pt: 'E-mail é obrigatório', es: 'El correo es obligatorio', en: 'Email is required', zh: '电子邮箱为必填项' },
  emailInvalid: { pt: 'E-mail inválido', es: 'Correo inválido', en: 'Invalid email', zh: '电子邮箱无效' },
  cpfRequired: { pt: 'CPF é obrigatório', es: 'CPF es obligatorio', en: 'CPF is required', zh: 'CPF 为必填项' },
  cpfInvalid: { pt: 'CPF inválido', es: 'CPF inválido', en: 'Invalid CPF', zh: 'CPF 无效' },
  phoneRequired: { pt: 'Telefone é obrigatório', es: 'El teléfono es obligatorio', en: 'Phone is required', zh: '电话为必填项' },
  phoneInvalid: { pt: 'Telefone inválido', es: 'Teléfono inválido', en: 'Invalid phone', zh: '电话无效' },
  cardNumberInvalid: { pt: 'Número do cartão inválido', es: 'Número de tarjeta inválido', en: 'Invalid card number', zh: '卡号无效' },
  cardNameRequired: { pt: 'Nome no cartão é obrigatório', es: 'Nombre en tarjeta obligatorio', en: 'Name on card is required', zh: '持卡人姓名为必填项' },
  monthInvalid: { pt: 'Mês inválido', es: 'Mes inválido', en: 'Invalid month', zh: '月份无效' },
  yearInvalid: { pt: 'Ano inválido', es: 'Año inválido', en: 'Invalid year', zh: '年份无效' },
  cvvInvalid: { pt: 'CVV inválido', es: 'CVV inválido', en: 'Invalid CVV', zh: 'CVV 无效' },
  cepInvalid: { pt: 'CEP inválido', es: 'Código postal inválido', en: 'Invalid ZIP code', zh: '邮政编码无效' },
  numberRequired: { pt: 'Número obrigatório', es: 'Número obligatorio', en: 'Number required', zh: '门牌号为必填项' },
  error: { pt: 'Erro', es: 'Error', en: 'Error', zh: '错误' },
  paymentError: { pt: 'Erro no pagamento', es: 'Error en el pago', en: 'Payment error', zh: '付款错误' },
  status: { pt: 'Status', es: 'Estado', en: 'Status', zh: '状态' },
  pixDescription: { pt: 'Ao confirmar, um QR Code PIX será gerado para pagamento imediato.', es: 'Al confirmar, se generará un QR Code PIX para pago inmediato.', en: 'A PIX QR Code will be generated for immediate payment.', zh: '确认后将生成 PIX 二维码以便立即付款。' },
  backToData: { pt: 'Voltar aos dados pessoais', es: 'Volver a los datos personales', en: 'Back to personal data', zh: '返回个人资料' },
} as const;

type TranslationKey = keyof typeof translations;

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const SUPPORTED: Language[] = ['pt', 'es', 'en', 'zh'];

const detectBrowserLanguage = (): Language => {
  if (typeof navigator === 'undefined') return 'pt';
  const candidates = [
    ...(navigator.languages || []),
    navigator.language,
  ].filter(Boolean);
  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    if (lower.startsWith('pt')) return 'pt';
    if (lower.startsWith('es')) return 'es';
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('zh')) return 'zh';
  }
  return 'pt';
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('language') as Language;
    if (saved && SUPPORTED.includes(saved)) return saved;
    const detected = detectBrowserLanguage();
    try { localStorage.setItem('language', detected); } catch { /* ignore */ }
    return detected;
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
