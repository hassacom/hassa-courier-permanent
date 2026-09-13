export const DELIVERY_SUPPORT_PREFIX = "[دعم التوصيل]";

export function encodeDeliverySupportMessage(body: string) {
  return `${DELIVERY_SUPPORT_PREFIX} ${body.trim()}`;
}

export function isDeliverySupportMessage(body: string | null | undefined) {
  return Boolean(body?.startsWith(DELIVERY_SUPPORT_PREFIX));
}

export function displayDeliverySupportMessage(body: string) {
  return body.replace(new RegExp(`^${DELIVERY_SUPPORT_PREFIX}\\s*`), "").trim();
}
