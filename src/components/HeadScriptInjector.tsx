import { useEffect } from 'react';
import { fetchSetting } from '@/lib/api';

interface ScriptEntry {
  id: string;
  label: string;
  code: string;
}

const parseScripts = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((e: ScriptEntry) => e.code).filter(Boolean);
  } catch { /* ignore */ }
  if (raw?.trim()) return [raw];
  return [];
};

const injectScripts = (codes: string[], target: 'head' | 'body') => {
  const parent = target === 'head' ? document.head : document.body;

  codes.forEach((code) => {
    const container = document.createElement('div');
    container.innerHTML = code;

    Array.from(container.childNodes).forEach((node) => {
      if (node.nodeName === 'SCRIPT') {
        const original = node as HTMLScriptElement;
        const newScript = document.createElement('script');
        Array.from(original.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });
        if (original.textContent) {
          newScript.textContent = original.textContent;
        }
        parent.appendChild(newScript);
      } else {
        parent.appendChild(node.cloneNode(true));
      }
    });
  });
};

const HeadScriptInjector = () => {
  useEffect(() => {
    Promise.all([
      fetchSetting('head_script'),
      fetchSetting('footer_script'),
    ]).then(([headRaw, footerRaw]) => {
      const headCodes = parseScripts(headRaw || '');
      const footerCodes = parseScripts(footerRaw || '');

      if (headCodes.length) injectScripts(headCodes, 'head');
      if (footerCodes.length) injectScripts(footerCodes, 'body');
    });
  }, []);

  return null;
};

export default HeadScriptInjector;
