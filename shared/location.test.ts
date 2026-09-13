import { describe, expect, it } from "vitest";
import { appendCoordinatesToAddress, cleanLocationAddress, extractCoordinatesFromAddress } from "./location";

describe("location address compatibility", () => {
  it("round-trips precise coordinates without exposing the marker in the display address", () => {
    const stored = appendCoordinatesToAddress("شارع الجامعة، عمّان", 31.9631584, 35.9303592);
    expect(stored).toContain("موقع GPS: 31.963158, 35.930359");
    expect(cleanLocationAddress(stored)).toBe("شارع الجامعة، عمّان");
    expect(extractCoordinatesFromAddress(stored)).toEqual({ latitude: 31.963158, longitude: 35.930359 });
  });

  it("keeps the address within the database column limit", () => {
    const stored = appendCoordinatesToAddress("أ".repeat(400), 31.9, 35.9);
    expect(stored.length).toBeLessThanOrEqual(300);
    expect(extractCoordinatesFromAddress(stored)).toEqual({ latitude: 31.9, longitude: 35.9 });
  });
});
