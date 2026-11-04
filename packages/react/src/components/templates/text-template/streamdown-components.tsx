'use client';

import { memo, useEffect, useState, type ReactNode, type JSX } from 'react';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { t } from '../../../i18n';
import { CircleCheckIcon, CopyIcon } from '../../file-explorer/icons';
import { toFileLinkPath } from './file-link';
import { FILE_LINK_TAG } from './rehype-file-links';
import styles from './streamdown.module.scss';

type WithNode<T> = T & {
  node?: unknown;
  children?: ReactNode;
  className?: string;
};

type ElementProps<TTag extends keyof JSX.IntrinsicElements> = WithNode<JSX.IntrinsicElements[TTag]>;

// Headings
const H1 = memo<ElementProps<'h1'>>(({ children, node: _node, ...props }) => (
  <h1 className={styles.h1} data-streamdown="heading-1" {...props}>
    {children}
  </h1>
));
H1.displayName = 'MarkdownH1';

const H2 = memo<ElementProps<'h2'>>(({ children, node: _node, ...props }) => (
  <h2 className={styles.h2} data-streamdown="heading-2" {...props}>
    {children}
  </h2>
));
H2.displayName = 'MarkdownH2';

const H3 = memo<ElementProps<'h3'>>(({ children, node: _node, ...props }) => (
  <h3 className={styles.h3} data-streamdown="heading-3" {...props}>
    {children}
  </h3>
));
H3.displayName = 'MarkdownH3';

const H4 = memo<ElementProps<'h4'>>(({ children, node: _node, ...props }) => (
  <h4 className={styles.h4} data-streamdown="heading-4" {...props}>
    {children}
  </h4>
));
H4.displayName = 'MarkdownH4';

const H5 = memo<ElementProps<'h5'>>(({ children, node: _node, ...props }) => (
  <h5 className={styles.h5} data-streamdown="heading-5" {...props}>
    {children}
  </h5>
));
H5.displayName = 'MarkdownH5';

const H6 = memo<ElementProps<'h6'>>(({ children, node: _node, ...props }) => (
  <h6 className={styles.h6} data-streamdown="heading-6" {...props}>
    {children}
  </h6>
));
H6.displayName = 'MarkdownH6';

// Paragraph
const P = memo<ElementProps<'p'>>(({ children, node: _node, ...props }) => (
  <p className={styles.p} data-streamdown="paragraph" {...props}>
    {children}
  </p>
));
P.displayName = 'MarkdownP';

// Lists
const Ul = memo<ElementProps<'ul'>>(({ children, node: _node, ...props }) => (
  <ul className={styles.ul} data-streamdown="unordered-list" {...props}>
    {children}
  </ul>
));
Ul.displayName = 'MarkdownUl';

const Ol = memo<ElementProps<'ol'>>(({ children, node: _node, ...props }) => (
  <ol className={styles.ol} data-streamdown="ordered-list" {...props}>
    {children}
  </ol>
));
Ol.displayName = 'MarkdownOl';

const Li = memo<ElementProps<'li'>>(({ children, node: _node, ...props }) => (
  <li className={styles.li} data-streamdown="list-item" {...props}>
    {children}
  </li>
));
Li.displayName = 'MarkdownLi';

// Link
type AProps = ElementProps<'a'> & { href?: string };
const A = memo<AProps>(({ children, href, node: _node, ...props }) => (
  <a className={styles.a} data-streamdown="link" href={href} target="_blank" rel="noreferrer" {...props}>
    {children}
  </a>
));
A.displayName = 'MarkdownA';

// BUG-025 — a `file:` link, which `rehypeFileLinks` turns into `FILE_LINK_TAG` so harden leaves it alone.
// Browsers will not open `file://` from an http(s) page, so instead of a dead link the user gets the
// path and a button that copies it.
const COPIED_FEEDBACK_MS = 1500;

interface FileLinkProps {
  children?: ReactNode;
  node?: unknown;
  'data-href'?: string;
}

const FileLink = memo<FileLinkProps>(({ children, 'data-href': href = '' }) => {
  const { locale = 'en-US' } = useAsgardTemplateContext();
  const [copied, setCopied] = useState(false);
  const path = toFileLinkPath(href);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);

    return (): void => clearTimeout(timer);
  }, [copied]);

  const copy = (): void => {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return;

    navigator.clipboard.writeText(path).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const label = t(locale, copied ? 'fileLink.copied' : 'fileLink.copy');
  // An autolink (`<file:///tmp/a.txt>`) has the URL as its text; showing it next to the path says it twice.
  const showText = !(typeof children === 'string' && (children === href || toFileLinkPath(children) === path));

  return (
    <span data-streamdown="file-link">
      {/* A real space, not a margin: with only a margin, the file name and the start of the path form one
          unbreakable word, and the browser wraps that whole run onto the next line too early. */}
      {showText && <span className={styles.fileLinkText}>{children}</span>}
      {showText && ' '}
      <code className={`${styles.code} ${styles.fileLinkPath}`}>{path}</code>
      <button type="button" className={styles.fileLinkCopy} onClick={copy} aria-label={label} title={label}>
        {copied ? <CircleCheckIcon size={14} /> : <CopyIcon size={14} />}
      </button>
    </span>
  );
});
FileLink.displayName = 'MarkdownFileLink';

// Blockquote
const Blockquote = memo<ElementProps<'blockquote'>>(({ children, node: _node, ...props }) => (
  <blockquote className={styles.blockquote} data-streamdown="blockquote" {...props}>
    {children}
  </blockquote>
));
Blockquote.displayName = 'MarkdownBlockquote';

// Horizontal Rule
const Hr = memo<ElementProps<'hr'>>(({ node: _node, ...props }) => (
  <hr className={styles.hr} data-streamdown="horizontal-rule" {...props} />
));
Hr.displayName = 'MarkdownHr';

// Inline elements
const Strong = memo<ElementProps<'strong'>>(({ children, node: _node, ...props }) => (
  <strong className={styles.strong} data-streamdown="strong" {...props}>
    {children}
  </strong>
));
Strong.displayName = 'MarkdownStrong';

const Em = memo<ElementProps<'em'>>(({ children, node: _node, ...props }) => (
  <em className={styles.em} data-streamdown="emphasis" {...props}>
    {children}
  </em>
));
Em.displayName = 'MarkdownEm';

// Code
const Code = memo<ElementProps<'code'>>(({ children, node: _node, ...props }) => (
  <code className={styles.code} data-streamdown="inline-code" {...props}>
    {children}
  </code>
));
Code.displayName = 'MarkdownCode';

const Pre = memo<ElementProps<'pre'>>(({ children, node: _node, ...props }) => (
  <pre className={styles.pre} data-streamdown="code-block" {...props}>
    {children}
  </pre>
));
Pre.displayName = 'MarkdownPre';

// Image
type ImgProps = ElementProps<'img'> & { src?: string; alt?: string };
const Img = memo<ImgProps>(({ src, alt, node: _node, ...props }) => (
  <img className={styles.img} data-streamdown="image" src={src} alt={alt} {...props} />
));
Img.displayName = 'MarkdownImg';

// Table
const Table = memo<ElementProps<'table'>>(({ children, node: _node, ...props }) => (
  <table className={styles.table} data-streamdown="table" {...props}>
    {children}
  </table>
));
Table.displayName = 'MarkdownTable';

const Thead = memo<ElementProps<'thead'>>(({ children, node: _node, ...props }) => (
  <thead className={styles.thead} {...props}>
    {children}
  </thead>
));
Thead.displayName = 'MarkdownThead';

const Tbody = memo<ElementProps<'tbody'>>(({ children, node: _node, ...props }) => (
  <tbody className={styles.tbody} {...props}>
    {children}
  </tbody>
));
Tbody.displayName = 'MarkdownTbody';

const Tr = memo<ElementProps<'tr'>>(({ children, node: _node, ...props }) => (
  <tr className={styles.tr} {...props}>
    {children}
  </tr>
));
Tr.displayName = 'MarkdownTr';

const Th = memo<ElementProps<'th'>>(({ children, node: _node, ...props }) => (
  <th className={styles.th} {...props}>
    {children}
  </th>
));
Th.displayName = 'MarkdownTh';

const Td = memo<ElementProps<'td'>>(({ children, node: _node, ...props }) => (
  <td className={styles.td} {...props}>
    {children}
  </td>
));
Td.displayName = 'MarkdownTd';

export const streamdownComponents = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  p: P,
  ul: Ul,
  ol: Ol,
  li: Li,
  a: A,
  [FILE_LINK_TAG]: FileLink,
  blockquote: Blockquote,
  hr: Hr,
  strong: Strong,
  em: Em,
  code: Code,
  pre: Pre,
  img: Img,
  table: Table,
  thead: Thead,
  tbody: Tbody,
  tr: Tr,
  th: Th,
  td: Td,
};
