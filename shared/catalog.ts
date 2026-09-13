export const PRODUCT_CATEGORIES = [
  "البقالة والمواد الغذائية",
  "الإلكترونيات",
  "الأزياء",
  "المنزل",
  "الأطفال",
  "الجمال والعناية الشخصية",
  "الرياضة",
] as const;

export const OFFER_SECTION = "العروض والخصومات" as const;
export const PRODUCT_SECTIONS = [...PRODUCT_CATEGORIES, OFFER_SECTION] as const;
export const OFFER_BADGE_PREFIX = "offer::";

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductSection = (typeof PRODUCT_SECTIONS)[number];

const offerWords = ["عرض", "خصم", "تخفيض", "تنزيل"];

export function isOfferBadge(badge?: string | null) {
  const value = badge?.trim().toLowerCase() || "";
  return value.startsWith(OFFER_BADGE_PREFIX) || offerWords.some((word) => value.includes(word));
}

export function encodeOfferBadge(label?: string | null) {
  const cleanLabel = label?.trim() || "عرض";
  return `${OFFER_BADGE_PREFIX}${cleanLabel}`;
}

export function displayProductBadge(badge?: string | null) {
  const value = badge?.trim() || "";
  return value.startsWith(OFFER_BADGE_PREFIX) ? value.slice(OFFER_BADGE_PREFIX.length) || "عرض" : value;
}

const sectionKeywords: Record<string, string[]> = {
  "البقالة والمواد الغذائية": ["بقال", "غذ", "طعام", "بسكوت", "حلويات", "مشروب", "مطبخ"],
  الإلكترونيات: ["إلكتر", "هاتف", "جوال", "كمبيوتر", "سماعة", "شاحن", "تقنية"],
  الأزياء: ["ملابس", "أزياء", "حذاء", "عباية", "قميص", "شنطة"],
  المنزل: ["منزل", "أثاث", "ديكور", "مفروش", "أدوات منزلية"],
  الأطفال: ["طفل", "أطفال", "لعبة", "ألعاب", "رضيع"],
  "الجمال والعناية الشخصية": ["جمال", "عناية", "بشرة", "شعر", "عطر", "مكياج", "صابون", "كريم"],
  الرياضة: ["رياضة", "رياضي", "تمرين", "لياقة", "كرة", "يوغا"],
  "العروض والخصومات": ["عرض", "خصم", "تخفيض", "تنزيل", "تخفيضات"],
};

export function sectionsForProduct(product: { name: string; description?: string | null; category: string; badge?: string | null }) {
  const category = product.category?.trim() || "";
  const text = `${product.name} ${product.description || ""} ${category} ${product.badge || ""}`.toLowerCase();
  const sections: string[] = [];

  if ((PRODUCT_SECTIONS as readonly string[]).includes(category) && category !== OFFER_SECTION) sections.push(category);
  if (category === OFFER_SECTION || isOfferBadge(product.badge)) sections.push(OFFER_SECTION);

  if (!sections.length) {
    for (const section of PRODUCT_CATEGORIES) {
      if (sectionKeywords[section]?.some((keyword) => text.includes(keyword))) sections.push(section);
    }
    if (sectionKeywords[OFFER_SECTION]?.some((keyword) => text.includes(keyword))) sections.push(OFFER_SECTION);
  }

  return Array.from(new Set(sections));
}
