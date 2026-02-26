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
export const fetchProducts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variations(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
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
  subtitle?: string;
  description?: string;
  active_ingredient?: string;
  pharma_form?: string;
  administration_route?: string;
  frequency?: string;
  images?: string[];
  variations?: { dosage: string; price: number; in_stock: boolean; is_offer: boolean; image_url?: string; images?: string[] }[];
}) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { variations, ...productData } = product;
  
  const { data, error } = await supabase
    .from('products')
    .insert({ ...productData, user_id: user.id })
    .select()
    .single();
  if (error) throw error;

  if (variations && variations.length > 0) {
    const { error: vError } = await supabase
      .from('product_variations')
      .insert(variations.map((v) => ({ ...v, product_id: data.id })));
    if (vError) throw vError;
  }

  return data;
};

export const updateProduct = async (
  id: string,
  product: {
    name?: string;
    subtitle?: string;
    description?: string;
    active_ingredient?: string;
    pharma_form?: string;
    administration_route?: string;
    frequency?: string;
    images?: string[];
    variations?: { id?: string; dosage: string; price: number; in_stock: boolean; is_offer: boolean; image_url?: string; images?: string[] }[];
  }
) => {
  const { variations, ...productData } = product;

  const { error } = await supabase.from('products').update(productData).eq('id', id);
  if (error) throw error;

  if (variations) {
    // Delete existing variations and re-insert
    await supabase.from('product_variations').delete().eq('product_id', id);
    if (variations.length > 0) {
      const { error: vError } = await supabase
        .from('product_variations')
        .insert(variations.map((v) => ({ dosage: v.dosage, price: v.price, in_stock: v.in_stock, is_offer: v.is_offer, image_url: v.image_url || '', images: v.images || [], product_id: id })));
      if (vError) throw vError;
    }
  }
};

export const deleteProduct = async (id: string) => {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
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

export const upsertSetting = async (key: string, value: string) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data: existing } = await supabase
    .from('site_settings' as any)
    .select('id')
    .eq('key', key)
    .maybeSingle();
  
  if ((existing as any)?.id) {
    const { error } = await supabase
      .from('site_settings' as any)
      .update({ value, user_id: user.id } as any)
      .eq('id', (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('site_settings' as any)
      .insert({ key, value, user_id: user.id } as any);
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
