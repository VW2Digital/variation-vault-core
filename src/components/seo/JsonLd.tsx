import { useEffect } from 'react';

/**
 * Injeta um bloco <script type="application/ld+json"> em document.head.
 * Remove ao desmontar para evitar duplicidade entre páginas.
 */
interface JsonLdProps {
  id: string;
  data: Record<string, any> | Array<Record<string, any>>;
}

export const JsonLd = ({ id, data }: JsonLdProps) => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const tagId = `jsonld-${id}`;
    let el = document.getElementById(tagId) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = tagId;
      document.head.appendChild(el);
    }
    try {
      el.textContent = JSON.stringify(data);
    } catch {
      // payload inválido – ignora silenciosamente
    }
    return () => {
      const existing = document.getElementById(tagId);
      if (existing) existing.remove();
    };
  }, [id, JSON.stringify(data)]);

  return null;
};

export default JsonLd;