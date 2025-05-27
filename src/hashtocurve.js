// hashtocurve.js
const { ZqField } = require("ffjavascript");
const babyJub = require("./babyjub");
const poseidon = require("./poseidon2");


const j = 168698;
const k = 1;
const z = 3;

async function hash2field(message, dst) {
  const b0 = poseidon([message, 0, dst]);
  const b1 = poseidon([b0, 1n]);
  return [b0, b1];
}

function elligator2Map(u) {
  const Fr = new ZqField(babyJub.F.p);
  const exp = (Fr.p + 1n) / 4n;

  // z * u^2
  const zU2 = Fr.mul(z, Fr.mul(u, u));
  // Exceptional case when 1 + z*u^2 == 0
  const isExc = Fr.eq(Fr.add(1n, zU2), 0n);
  // safeDen = isExc ? 1 : 1 + zU2
  const safeDen = isExc ? 1n : Fr.add(1n, zU2);
  const denom = Fr.inv(safeDen);

  const jOverK = Fr.mul(j, Fr.inv(k));
  const negJk = Fr.neg(jOverK);
  // x1 = negJk / safeDen
  const x1Calc = Fr.mul(negJk, denom);
  const x1 = isExc ? negJk : x1Calc;

  // gx1 = x1^3 + (j/k)*x1^2 + x1/(k^2)
  const x1_2 = Fr.mul(x1, x1);
  const x1_3 = Fr.mul(x1_2, x1);
  const gx1 = Fr.add(
      Fr.add(x1_3, Fr.mul(jOverK, x1_2)),
      Fr.mul(x1, Fr.inv(Fr.mul(k, k)))
  );

  // x2 = -x1 - j/k
  const x2 = Fr.neg(Fr.add(x1, jOverK));
  const x2_2 = Fr.mul(x2, x2);
  const x2_3 = Fr.mul(x2_2, x2);
  const gx2 = Fr.add(
      Fr.add(x2_3, Fr.mul(jOverK, x2_2)),
      Fr.mul(x2, Fr.inv(Fr.mul(k, k)))
  );

  // Compute square roots
  const y1 = Fr.pow(gx1, exp);
  const y2 = Fr.pow(gx2, exp);

  // Check which root is valid
  const ok1 = Fr.eq(Fr.mul(y1, y1), gx1);

  // Sign correction to make output even
  const y1Bit = Fr.e(y1) & 1n;
  const y2Bit = Fr.e(y2) & 1n;
  const y1c = Fr.mul(y1, Fr.sub(Fr.mul(2n, y1Bit), 1n));
  const y2c = Fr.mul(y2, Fr.sub(1n, Fr.mul(2n, y2Bit)));

  const x = ok1 ? x1 : x2;
  const y = ok1 ? y1c : y2c;

  return [x, y];
}

async function hash2curve(message, dst) {
  const [u1, u2] = await hash2field(message, dst);
  const P1 = elligator2Map(u1);
  const P2 = elligator2Map(u2);

  const E1 = babyJub.mulPointEscalar(babyJub.Base8, P1);
  const E2 = babyJub.mulPointEscalar(babyJub.Base8, P2);
  let R = babyJub.addPoint(E1, E2);
  // Clear cofactor by doubling three times
  for (let i = 0; i < 3; i++) {
    R = babyJub.addPoint(R, R);
  }
  return babyJub.toAffine(R);
}

module.exports = { hash2field, elligator2Map, hash2curve };