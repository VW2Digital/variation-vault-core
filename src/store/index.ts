import { create } from 'zustand';

export interface ProductVariation {
  id: string;
  dosage: string;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  isOffer?: boolean;
}

export interface Product {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  activeIngredient: string;
  pharmaForm: string;
  administrationRoute: string;
  frequency: string;
  images: string[];
  variations: ProductVariation[];
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  isAuthenticated: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
}

interface ProductState {
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
}

const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Liberty Pharma 5mg',
    subtitle: 'Tirzepatida Solução para Injeção 20mg/2ml Caneta Pré-preenchida',
    description: 'Uso subcutâneo multidose apenas. Administração semanal para resultados ótimos. Solução farmacêutica de grau profissional.',
    activeIngredient: 'Tirzepatide',
    pharmaForm: 'Solução Injetável',
    administrationRoute: 'Subcutânea',
    frequency: 'Semanal',
    images: [],
    variations: [
      { id: 'v1', dosage: '5mg', price: 861, inStock: true },
      { id: 'v2', dosage: '15mg', price: 1146, inStock: true, isOffer: true },
    ],
    createdAt: '2026-02-20T10:00:00Z',
    updatedAt: '2026-02-25T14:30:00Z',
  },
];

export const useAuth = create<AuthState>((set) => ({
  isAuthenticated: false,
  login: (email, password) => {
    if (email === 'admin@pharma.com' && password === 'admin123') {
      set({ isAuthenticated: true });
      return true;
    }
    return false;
  },
  logout: () => set({ isAuthenticated: false }),
}));

export const useProducts = create<ProductState>((set) => ({
  products: MOCK_PRODUCTS,
  addProduct: (product) =>
    set((state) => ({
      products: [
        ...state.products,
        {
          ...product,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })),
  updateProduct: (id, updates) =>
    set((state) => ({
      products: state.products.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      ),
    })),
  deleteProduct: (id) =>
    set((state) => ({ products: state.products.filter((p) => p.id !== id) })),
}));
