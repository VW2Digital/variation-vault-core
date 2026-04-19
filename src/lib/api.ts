import { supabase } from '@/integrations/supabase/client';

// Auth helpers
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Products
export const fetchProducts = async (activeOnly = false) => {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variations(*)')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  if (activeOnly) return (data || []).filter((p: any) => p.active !== false);
  return data;
};

export const setProductActive = async (id: string, active: boolean) => {
  const { error } = await supabase.from('products').update({ active } as any).eq('id', id);
  if (error) throw error;
};

export const fetchProduct = async (id: string) => {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variations(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

export const createProduct = async (product: {
  name: string;
  fantasy_name?: string;
  subtitle?: string;
  description?: string;
  active_ingredient?: string;
  pharma_form?: string;
  administration_route?: string;
  frequency?: string;
  images?: string[];
  free_shipping?: boolean;
  free_shipping_min_value?: number;
  is_bestseller?: boolean;
  pix_discount_percent?: number;
  max_installments?: number;
  installments_interest?: string;
  category?: string;
  variations?: { dosage: string; subtitle?: string; price: number; offer_price?: number; in_stock: boolean; is_offer: boolean; image_url?: string; images?: string[]; stock_quantity?: number }[];
}) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { variations, ...productData } = product;
  
  const { data, error } = await supabase
    .from('products')
    .insert({ ...productData, user_id: user.id } as any)
    .select()
    .single();
  if (error) throw error;

  if (variations && variations.length > 0) {
    const { error: vError } = await supabase
      .from('product_variations')
      .insert(variations.map((v) => ({ dosage: v.dosage, subtitle: v.subtitle || '', price: v.price, offer_price: v.offer_price || 0, in_stock: v.in_stock, is_offer: v.is_offer, image_url: v.image_url || '', images: v.images || [], stock_quantity: v.stock_quantity || 0, product_id: data.id } as any)));
    if (vError) throw vError;
  }

  return data;
};

export const updateProduct = async (
  id: string,
  product: {
    name?: string;
    fantasy_name?: string;
    subtitle?: string;
    description?: string;
    active_ingredient?: string;
    pharma_form?: string;
    administration_route?: string;
    frequency?: string;
    images?: string[];
    free_shipping?: boolean;
    free_shipping_min_value?: number;
    is_bestseller?: boolean;
    pix_discount_percent?: number;
    max_installments?: number;
    installments_interest?: string;
    category?: string;
    variations?: { id?: string; dosage: string; subtitle?: string; price: number; offer_price?: number; in_stock: boolean; is_offer: boolean; image_url?: string; images?: string[]; stock_quantity?: number }[];
  }
) => {
  const { variations, ...productData } = product;

  const { error } = await supabase.from('products').update(productData as any).eq('id', id);
  if (error) throw error;

  if (variations) {
    // Fetch existing variation IDs to know which to delete
    const { data: existing } = await supabase
      .from('product_variations')
      .select('id')
      .eq('product_id', id);
    const existingIds = new Set((existing || []).map((e: any) => e.id));
    const incomingIds = new Set(variations.filter(v => v.id).map(v => v.id as string));

    // Delete only variations that were removed
    const toDelete = [...existingIds].filter(eid => !incomingIds.has(eid));
    if (toDelete.length > 0) {
      await supabase.from('product_variations').delete().in('id', toDelete);
    }

    // Upsert: update existing (with id) or insert new (without id)
    if (variations.length > 0) {
      const rows = variations.map((v) => {
        const row: any = {
          dosage: v.dosage,
          subtitle: v.subtitle || '',
          price: v.price,
          offer_price: v.offer_price || 0,
          in_stock: v.in_stock,
          is_offer: v.is_offer,
          image_url: v.image_url || '',
          images: v.images || [],
          stock_quantity: v.stock_quantity || 0,
          product_id: id,
        };
        if (v.id) row.id = v.id;
        return row;
      });
      const { error: vError } = await supabase
        .from('product_variations')
        .upsert(rows as any, { onConflict: 'id' });
      if (vError) throw vError;
    }
  }
};

export const deleteProduct = async (id: string) => {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
};

// Product Upsells
export const fetchProductUpsells = async (productId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('product_upsells' as any)
    .select('upsell_product_id, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return ((data as any[]) || []).map(r => r.upsell_product_id);
};

export const saveProductUpsells = async (productId: string, upsellProductIds: string[]) => {
  // Replace strategy: delete then insert
  const { error: delError } = await supabase
    .from('product_upsells' as any)
    .delete()
    .eq('product_id', productId);
  if (delError) throw delError;
  if (upsellProductIds.length === 0) return;
  const rows = upsellProductIds
    .filter(id => id && id !== productId)
    .map((id, idx) => ({
      product_id: productId,
      upsell_product_id: id,
      sort_order: idx,
    }));
  if (rows.length === 0) return;
  const { error: insError } = await supabase
    .from('product_upsells' as any)
    .insert(rows as any);
  if (insError) throw insError;
};

// Banners
export const fetchBanners = async () => {
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const fetchAllBanners = async () => {
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const createBanner = async (text: string) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('banners')
    .insert({ text, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateBanner = async (id: string, updates: { text?: string; active?: boolean }) => {
  const { error } = await supabase.from('banners').update(updates).eq('id', id);
  if (error) throw error;
};

export const deleteBanner = async (id: string) => {
  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) throw error;
};

// Banner Slides
export const fetchBannerSlides = async (activeOnly = false) => {
  let query = supabase
    .from('banner_slides' as any)
    .select('*')
    .order('sort_order', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as any[];
};

export const createBannerSlide = async (slide: {
  title: string;
  image_desktop: string;
  image_tablet: string;
  image_mobile: string;
  link_url?: string;
  product_id?: string | null;
  sort_order?: number;
}) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('banner_slides' as any)
    .insert({ ...slide, user_id: user.id } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateBannerSlide = async (id: string, updates: any) => {
  const { error } = await supabase
    .from('banner_slides' as any)
    .update(updates as any)
    .eq('id', id);
  if (error) throw error;
};

export const deleteBannerSlide = async (id: string) => {
  const { error } = await supabase
    .from('banner_slides' as any)
    .delete()
    .eq('id', id);
  if (error) throw error;
};

// Testimonials
export const fetchTestimonials = async () => {
  const { data, error } = await supabase
    .from('video_testimonials')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const createTestimonial = async (testimonial: {
  name: string;
  video_url: string;
  thumbnail_url?: string;
}) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('video_testimonials')
    .insert({ ...testimonial, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteTestimonial = async (id: string) => {
  const { error } = await supabase.from('video_testimonials').delete().eq('id', id);
  if (error) throw error;
};

// Site Settings
export const fetchSetting = async (key: string) => {
  const { data, error } = await supabase
    .from('site_settings' as any)
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.value || '';
};

export const upsertSetting = async (key: string, value: string, userId?: string) => {
  let uid = userId;
  if (!uid) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    uid = user.id;
  }
  
  const { data: existing, error: selectError } = await supabase
    .from('site_settings' as any)
    .select('id')
    .eq('key', key)
    .maybeSingle();
  
  if (selectError) throw selectError;

  if ((existing as any)?.id) {
    const { error } = await supabase
      .from('site_settings' as any)
      .update({ value, user_id: uid } as any)
      .eq('id', (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('site_settings' as any)
      .insert({ key, value, user_id: uid } as any);
    if (error) throw error;
  }
};

// Storage helpers
export const uploadFile = async (bucket: string, path: string, file: File) => {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
};

export const deleteFile = async (bucket: string, path: string) => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
};
