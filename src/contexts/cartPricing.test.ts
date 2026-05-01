import { describe, it, expect } from 'vitest';
import { getEffectivePrice, type WholesaleTier, type CartItem } from './CartContext';

const tiers: WholesaleTier[] = [
  { min_quantity: 3, price: 90 },
  { min_quantity: 10, price: 75 },
  { min_quantity: 20, price: 60 },
];

const baseItem = (quantity: number): CartItem => ({
  id: 'cart-1',
  product_id: 'p1',
  variation_id: 'v1',
  quantity,
  product_name: 'Produto Teste',
  dosage: '10mg',
  price: 100,
  original_price: 100,
  is_offer: false,
  image_url: '',
  in_stock: true,
  wholesale_prices: tiers,
});

describe('getEffectivePrice — tier matching', () => {
  it('returns base price when below first tier', () => {
    expect(getEffectivePrice(100, 1, tiers)).toBe(100);
    expect(getEffectivePrice(100, 2, tiers)).toBe(100);
  });

  it('returns first tier price when quantity matches first tier', () => {
    expect(getEffectivePrice(100, 3, tiers)).toBe(90);
    expect(getEffectivePrice(100, 9, tiers)).toBe(90);
  });

  it('returns second tier price when quantity matches second tier', () => {
    expect(getEffectivePrice(100, 10, tiers)).toBe(75);
    expect(getEffectivePrice(100, 19, tiers)).toBe(75);
  });

  it('returns third tier price when quantity matches third tier', () => {
    expect(getEffectivePrice(100, 20, tiers)).toBe(60);
    expect(getEffectivePrice(100, 999, tiers)).toBe(60);
  });

  it('returns base price when there are no tiers configured', () => {
    expect(getEffectivePrice(100, 50, [])).toBe(100);
  });

  it('handles unsorted tier input correctly', () => {
    const unsorted: WholesaleTier[] = [
      { min_quantity: 20, price: 60 },
      { min_quantity: 3, price: 90 },
      { min_quantity: 10, price: 75 },
    ];
    expect(getEffectivePrice(100, 5, unsorted)).toBe(90);
    expect(getEffectivePrice(100, 15, unsorted)).toBe(75);
    expect(getEffectivePrice(100, 25, unsorted)).toBe(60);
  });
});

describe('Cart subtotal recalculation when quantity changes', () => {
  // Mirrors the totalPrice logic used in CartContext.fetchCart:
  //   sum(getEffectivePrice(basePrice, q, tiers) * q)
  const subtotalFor = (item: CartItem) => {
    const basePrice = item.is_offer ? item.price : item.original_price;
    return getEffectivePrice(basePrice, item.quantity, item.wholesale_prices) * item.quantity;
  };

  it('uses base price subtotal below first tier', () => {
    const item = baseItem(2);
    expect(subtotalFor(item)).toBe(200); // 2 × R$100
  });

  it('switches to first wholesale tier when quantity reaches threshold', () => {
    const before = subtotalFor(baseItem(2));
    const after = subtotalFor(baseItem(3));
    expect(before).toBe(200);
    expect(after).toBe(270); // 3 × R$90 (first tier kicks in)
    expect(after).toBeLessThan(before * 2); // proves discount applied
  });

  it('switches to second tier at quantity 10', () => {
    expect(subtotalFor(baseItem(9))).toBe(810);   // 9 × 90
    expect(subtotalFor(baseItem(10))).toBe(750);  // 10 × 75
  });

  it('switches to third tier at quantity 20', () => {
    expect(subtotalFor(baseItem(19))).toBe(1425); // 19 × 75
    expect(subtotalFor(baseItem(20))).toBe(1200); // 20 × 60
  });

  it('aggregates total across multiple items, each using its own tier', () => {
    const items: CartItem[] = [
      baseItem(3),  // 3 × 90 = 270
      baseItem(10), // 10 × 75 = 750
      baseItem(25), // 25 × 60 = 1500
    ];
    const total = items.reduce((s, i) => s + subtotalFor(i), 0);
    expect(total).toBe(2520);
  });

  it('decreasing quantity below tier reverts unit price to base', () => {
    const high = subtotalFor(baseItem(10)); // 750 (75 × 10)
    const low = subtotalFor(baseItem(2));   // 200 (100 × 2)
    expect(high).toBe(750);
    expect(low).toBe(200);
    // Unit price reverted from 75 back to 100
    expect(low / 2).toBe(100);
  });
});