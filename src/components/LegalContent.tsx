import { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface LegalContentProps {
  html: string;
}

/**
 * Renders sanitized HTML for legal pages (Privacy Policy, Terms of Use).
 * Allows a safe subset of tags. If content has no HTML tags, paragraphs
 * are inferred from blank lines.
 */
const LegalContent = ({ html }: LegalContentProps) => {
  const safe = useMemo(() => {
    const hasTags = /<\w+[\s\S]*?>/.test(html);
    const source = hasTags
      ? html
      : html
          .split(/\n{2,}/)
          .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
          .join('\n');
    return DOMPurify.sanitize(source, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'strong', 'em', 'b', 'i', 'u', 's',
        'a', 'span', 'div', 'section', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
    });
  }, [html]);

  return (
    <div
      className="legal-content prose prose-sm max-w-none text-muted-foreground
                 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mt-8 [&_h1]:mb-3
                 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-6 [&_h2]:mb-2
                 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2
                 [&_p]:my-3 [&_p]:leading-relaxed
                 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:my-3
                 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol]:my-3
                 [&_a]:text-primary [&_a]:underline hover:[&_a]:opacity-80
                 [&_strong]:text-foreground [&_strong]:font-semibold"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
};

export default LegalContent;