import { describe, expect, it } from "vitest";
import { displayDeliverySupportMessage, encodeDeliverySupportMessage, isDeliverySupportMessage } from "./deliverySupport";

describe("delivery support messages", () => {
  it("keeps delivery threads separate from customer support messages", () => {
    const stored = encodeDeliverySupportMessage("أنا عند الباب");
    expect(isDeliverySupportMessage(stored)).toBe(true);
    expect(displayDeliverySupportMessage(stored)).toBe("أنا عند الباب");
    expect(isDeliverySupportMessage("رسالة عادية")).toBe(false);
  });
});
