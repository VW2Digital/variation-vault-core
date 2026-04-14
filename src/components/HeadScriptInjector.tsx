import { useEffect } from 'react';
import { fetchSetting } from '@/lib/api';

const HeadScriptInjector = () => {
  useEffect(() => {
    fetchSetting('head_script').then((script) => {
      if (!script?.trim()) return;

      const container = document.createElement('div');
      container.innerHTML = script;

      Array.from(container.childNodes).forEach((node) => {
        if (node.nodeName === 'SCRIPT') {
          const original = node as HTMLScriptElement;
          const newScript = document.createElement('script');
          // Copy attributes
          Array.from(original.attributes).forEach((attr) => {
            newScript.setAttribute(attr.name, attr.value);
          });
          // Copy inline content
          if (original.textContent) {
            newScript.textContent = original.textContent;
          }
          document.head.appendChild(newScript);
        } else {
          document.head.appendChild(node.cloneNode(true));
        }
      });
    });
  }, []);

  return null;
};

export default HeadScriptInjector;
