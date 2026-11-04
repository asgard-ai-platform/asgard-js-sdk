import type { Element, ElementContent, Root } from 'hast';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import type { defaultRehypePlugins } from 'streamdown';
import { isFileHref } from './file-link';

// BUG-025 — keep `file:` links alive through Streamdown's rehype chain (`raw → katex → sanitize → harden`).
//
// Two plugins in that chain remove them. `rehype-sanitize`'s default schema only allows http(s), irc(s),
// mailto and xmpp hrefs, so it drops the href of a `file:` link. `rehype-harden` then sees an `<a>` with no
// href and swaps it for "text [blocked]"; and even with the href intact it would block it, because `file:`
// sits on a hard-coded list that its `allowedProtocols` option cannot lift.
//
// So sanitize gets a schema that also allows `file`, and right after it a plugin turns every `file:` link
// into a `FILE_LINK_TAG` element, which harden does not look at (it only handles `a` and `img`). Every
// other link still goes through harden unchanged.

type RehypePluggable = (typeof defaultRehypePlugins)[string];

export const FILE_LINK_TAG = 'asgard-file-link';

const fileLinkSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
  },
};

export function rehypeFileLinks(): (tree: Root) => void {
  return tree => replaceFileLinks(tree);
}

function replaceFileLinks(parent: Root | Element): void {
  parent.children = parent.children.map((child): typeof child => {
    if (child.type !== 'element') return child;

    replaceFileLinks(child);

    const href = child.properties.href;
    if (child.tagName !== 'a' || !isFileHref(href)) return child;

    const fileLink: ElementContent = {
      type: 'element',
      tagName: FILE_LINK_TAG,
      properties: { dataHref: href },
      children: child.children,
    };

    return fileLink;
  });
}

/**
 * Streamdown's default rehype plugins with `file:` links preserved. The `rehypePlugins` prop replaces the
 * defaults wholesale, so the result keeps every default in order, swaps in the wider sanitize schema, and
 * runs `rehypeFileLinks` just before harden.
 */
export function withFileLinks(defaults: Record<string, RehypePluggable>): RehypePluggable[] {
  return Object.entries(defaults).flatMap(([name, plugin]): RehypePluggable[] => {
    if (name === 'sanitize') return [[rehypeSanitize, fileLinkSanitizeSchema]];

    if (name === 'harden') return [rehypeFileLinks, plugin];

    return [plugin];
  });
}
