export type HeadMeta = { title: string; description: string; canonicalPath?: string; noindex?: boolean; notFound?: boolean; ogImage?: string; ogType?: "website" | "product"; jsonLd?: Record<string, unknown> };
export type SsrPrefetch = {
  catalogList: () => Promise<unknown>;
  productById: (productId: number) => Promise<unknown>;
};
