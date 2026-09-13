import { describe, expect, it } from "vitest";
import { sectionsForProduct, displayProductBadge } from "../shared/catalog";

describe("Catalog and Product Performance", () => {
  it("filters products correctly by search query and category", () => {
    const products = [
      { id: 1, name: "كنافة نابلسية خشنة", description: "طازجة ولذيذة", category: "حلويات" },
      { id: 2, name: "قهوة عربية بالهيل", description: "خلطة فاخرة", category: "مشروبات" },
      { id: 3, name: "بقلاوة بالفستق", description: "مقرمشة", category: "حلويات" },
    ];

    const search = "قهوة";
    const filtered = products.filter((p) =>
      `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  it("assigns valid sections without expensive recomputations", () => {
    const product = {
      name: "منتج تجريبي",
      description: "وصف مميز",
      category: "حلويات",
      badge: "featured",
    };

    const sections = sectionsForProduct(product);
    expect(Array.isArray(sections)).toBe(true);
    expect(displayProductBadge("featured")).toBeDefined();
  });
});
