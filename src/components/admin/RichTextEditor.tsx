import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus,
  Link2, Link2Off, Undo2, Redo2, Eraser,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 's',
  'a', 'span', 'div', 'section', 'blockquote',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });

const ToolbarButton = ({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={cn(
      'h-8 w-8 p-0 rounded',
      active && 'bg-primary/15 text-primary hover:bg-primary/20',
    )}
  >
    {children}
  </Button>
);

const Toolbar = ({ editor }: { editor: Editor }) => {
  const promptLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL do link (deixe vazio para remover):', previous || 'https://');
    if (url === null) return;
    if (url === '' || url === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    let href = url.trim();
    if (!/^https?:\/\//i.test(href) && !href.startsWith('mailto:') && !href.startsWith('/')) {
      href = `https://${href}`;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/30 px-1 py-1 rounded-t-md">
      <ToolbarButton title="Título 1" active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Título 2" active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Título 3" active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton title="Negrito" active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Itálico" active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Sublinhado" active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Tachado" active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton title="Lista com marcadores" active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Lista numerada" active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Citação" active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Linha horizontal"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton title="Inserir/editar link" active={editor.isActive('link')} onClick={promptLink}>
        <Link2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Remover link" disabled={!editor.isActive('link')}
        onClick={() => editor.chain().focus().unsetLink().run()}>
        <Link2Off className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Limpar formatação"
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <Eraser className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton title="Desfazer" disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Refazer" disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
};

const RichTextEditor = ({ value, onChange, placeholder, minHeight = 280 }: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: cn(
          'tiptap-content prose prose-sm max-w-none focus:outline-none px-4 py-3',
          '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mt-4 [&_h1]:mb-2',
          '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-3 [&_h2]:mb-2',
          '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1',
          '[&_p]:my-2 [&_p]:leading-relaxed',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2',
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2',
          '[&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:italic',
          '[&_a]:text-primary [&_a]:underline',
          '[&_strong]:text-foreground [&_strong]:font-semibold',
        ),
        'aria-label': 'Editor de texto',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(sanitize(html === '<p></p>' ? '' : html));
    },
  });

  // Sync external value updates (e.g., after async load).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || '';
    if (next !== current && next !== '<p></p>') {
      editor.commands.setContent(next || '', { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className="border border-border/60 rounded-md bg-background animate-pulse"
        style={{ minHeight: minHeight + 40 }}
      />
    );
  }

  return (
    <div className="border border-border/60 rounded-md bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/40">
      <Toolbar editor={editor} />
      <div style={{ minHeight }} className="relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder && (
          <div className="pointer-events-none absolute top-3 left-4 text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
};

export default RichTextEditor;