// Meta Graph API (WhatsApp Cloud API). One version for every call; the upgrade happens here.
export const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v18.0';
export const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
