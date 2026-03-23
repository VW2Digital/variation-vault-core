import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';

/**
 * Loads an embeddable chat widget from site_settings.
 * Extracts script tags and injects them into document.body.
 */
const ChatWidgetEmbed = () => {
  const [widgetCode, setWidgetCode] = useState('');
  const location = useLocation();
  const injectedRef = useRef(false);

  useEffect(() => {
    fetchSetting('chat_widget_code').then((code) => {
      if (code) setWidgetCode(code);
    });
  }, []);

  useEffect(() => {
    if (!widgetCode || injectedRef.current) return;

    // Don't render on admin or login pages
    if (location.pathname.startsWith('/admin') || location.pathname === '/login') return;

    injectedRef.current = true;

    // Use a temporary div to parse the HTML and extract scripts
    const temp = document.createElement('div');
    temp.innerHTML = widgetCode;

    // Find all script tags
    const scripts = temp.getElementsByTagName('script');
    
    for (let i = 0; i < scripts.length; i++) {
      const oldScript = scripts[i];
      const newScript = document.createElement('script');
      
      // Copy all attributes
      for (let j = 0; j < oldScript.attributes.length; j++) {
        const attr = oldScript.attributes[j];
        newScript.setAttribute(attr.name, attr.value);
      }
      
      // Copy inline content
      if (oldScript.innerHTML) {
        newScript.innerHTML = oldScript.innerHTML;
      }
      
      newScript.async = true;
      document.body.appendChild(newScript);
    }

    // Also append non-script elements (like divs for widget containers)
    const nonScriptElements = temp.querySelectorAll(':not(script)');
    nonScriptElements.forEach((el) => {
      if (el.parentElement === temp) {
        document.body.appendChild(el.cloneNode(true));
      }
    });
  }, [widgetCode, location.pathname]);

  return null;
};

export default ChatWidgetEmbed;
