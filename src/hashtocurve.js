// hashtocurve.js
const { ZqField } = require("ffjavascript");
const babyJub = require("./babyjub");
const poseidon = require("./poseidon2");


const j = 168698n;  // Convert to BigInt
const k = 1n;      // Convert to BigInt  
const z = 5n;      // Convert to BigInt (non-square)

function hash2field(message, dst) {
  const fieldElement1 = poseidon([message, 0, dst]);
  const fieldElement2 = poseidon([fieldElement1, 1, dst]);
  return {fieldElement1, fieldElement2};
}

// Tonelli-Shanks square root algorithm for Baby Jubjub field
function sqrt(n, Fr) {
  if (Fr.eq(n, 0n)) {
    return 0n;
  }

  // Test that solution exists (Legendre symbol)
  const legendreExponent = (Fr.p - 1n) / 2n;
  const res = Fr.pow(n, legendreExponent);
  if (!Fr.eq(res, 1n)) {
    return null; // No square root exists
  }

  // Tonelli-Shanks constants for Baby Jubjub
  const m = 28;
  const c = 19103219067921713944291392827692070036145651957329286315305642004821462161904n;
  let t = Fr.pow(n, 81540058820840996586704275553141814055101440848469862132140264610111n);
  let r = Fr.pow(n, (81540058820840996586704275553141814055101440848469862132140264610111n + 1n) / 2n);
  
  let mVar = m;
  let cVar = c;
  
  while (!Fr.eq(r, 0n) && !Fr.eq(t, 1n)) {
    let sq = Fr.mul(t, t);
    let i = 1;
    while (!Fr.eq(sq, 1n)) {
      i++;
      sq = Fr.mul(sq, sq);
    }

    // b = c ^ (m-i-1)
    let b = cVar;
    for (let j = 0; j < mVar - i - 1; j++) {
      b = Fr.mul(b, b);
    }

    mVar = i;
    cVar = Fr.mul(b, b);
    t = Fr.mul(t, cVar);
    r = Fr.mul(r, b);
  }

  // Ensure we return the smaller root (even parity)
  const halfP = Fr.p / 2n;
  if (r > halfP) {
    r = Fr.neg(r);
  }

  return r;
}

function elligator2Map(u) {
  const Fr = new ZqField(babyJub.p);

  // Convert u to field element to ensure proper type
  u = Fr.e(u);

  // z * u^2
  const zU2 = Fr.mul(z, Fr.mul(u, u));
  
  // Handle exceptional case when 1 + z*u^2 == 0
  const denominator = Fr.add(1n, zU2);
  const isExceptional = Fr.eq(denominator, 0n);
  const safeDenominator = isExceptional ? z : denominator;

  // x1 = -j / safeDenominator (since k=1)
  const x1 = Fr.mul(Fr.neg(j), Fr.inv(safeDenominator));

  // x2 = -x1 - j
  const x2 = Fr.sub(Fr.neg(x1), j);

  // Calculate gx1 = x1³ + j*x1² + x1 (since k=1)
  const x1_2 = Fr.mul(x1, x1);
  const x1_3 = Fr.mul(x1_2, x1);
  const gx1 = Fr.add(Fr.add(x1_3, Fr.mul(j, x1_2)), x1);

  // Calculate gx2 = x2³ + j*x2² + x2 (since k=1)
  const x2_2 = Fr.mul(x2, x2);
  const x2_3 = Fr.mul(x2_2, x2);
  const gx2 = Fr.add(Fr.add(x2_3, Fr.mul(j, x2_2)), x2);

  // Try square root of gx1 first
  let y1 = sqrt(gx1, Fr);
  const isGx1Square = y1 !== null;

  if (isGx1Square) {
    // RFC 9380 Step 6: If gx1 is square, use y1 with sgn0(y) == 1 (odd)
    if (y1 % 2n === 0n) {  // If even, negate to make odd
      y1 = Fr.neg(y1);
    }
    return { x: x1, y: y1 };
  } else {
    // RFC 9380 Step 7: If gx2 is square, use y2 with sgn0(y) == 0 (even)
    let y2 = sqrt(gx2, Fr);
    if (y2 === null) {
      throw new Error("Neither gx1 nor gx2 is a square - this should not happen in elligator2Map");
    }
    if (y2 % 2n === 1n) {  // If odd, negate to make even
      y2 = Fr.neg(y2);
    }
    return { x: x2, y: y2 };
  }
}

function montgomeryToEdwards(xM, yM) {
  const Fr = new ZqField(babyJub.p);
  
  // Ensure proper field element conversion
  xM = Fr.e(xM);
  yM = Fr.e(yM);
  
  // Convert from Montgomery (xM, yM) to Edwards (xE, yE)
  // xE = xM / yM
  // yE = (xM - 1) / (xM + 1)
  
  const xE = Fr.div(xM, yM);
  const yE = Fr.div(Fr.sub(xM, 1n), Fr.add(xM, 1n));
  
  return [xE, yE];
}

function hash2curve(message, dst) {
  const fieldElements = hash2field(message, dst);
  const P1 = elligator2Map(fieldElements.fieldElement1);
  const P2 = elligator2Map(fieldElements.fieldElement2);

  // Convert Montgomery points to Edwards coordinates
  const E1 = montgomeryToEdwards(P1.x, P1.y);
  const E2 = montgomeryToEdwards(P2.x, P2.y);
  
  // Add the two Edwards points
  let R = babyJub.addPoint(E1, E2);
  
  // Clear cofactor by multiplying by 8 (doubling three times)
  for (let i = 0; i < 3; i++) {
    R = babyJub.addPoint(R, R);
  }
  
  return R;
}

module.exports = { hash2field, elligator2Map, montgomeryToEdwards, hash2curve };