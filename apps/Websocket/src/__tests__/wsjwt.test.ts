import { describe, expect, it } from "bun:test";
import jwt from "jsonwebtoken";
import { Verifytokenws } from "../utils/wsjwt";

describe("WebSocket JWT Verification (Verifytokenws)", () => {
  const TEST_SECRET = "tradr_super_secret_jwt_key_test_12345";

  it("should return null when token is empty or whitespace", () => {
    process.env.JWT_SECRET = TEST_SECRET;
    expect(Verifytokenws("")).toBeNull();
    expect(Verifytokenws("   ")).toBeNull();
  });

  it("should return null when token is invalid or malformed", () => {
    process.env.JWT_SECRET = TEST_SECRET;
    expect(Verifytokenws("invalid.token.here")).toBeNull();
  });

  it("should verify valid JWT and return userId payload", () => {
    process.env.JWT_SECRET = TEST_SECRET;
    const token = jwt.sign({ userId: "trader_999" }, TEST_SECRET, {
      expiresIn: "1h",
    });

    const payload = Verifytokenws(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("trader_999");
  });

  it("should return null for expired JWT", () => {
    process.env.JWT_SECRET = TEST_SECRET;
    const expiredToken = jwt.sign({ userId: "trader_expired" }, TEST_SECRET, {
      expiresIn: "-1s", // already expired
    });

    const payload = Verifytokenws(expiredToken);
    expect(payload).toBeNull();
  });
});
