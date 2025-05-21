include "./poseidon2.circom";
include "./montgomery.circom";
include "./babyjub.circom";
include "./comparators.circom";
include "./mux1.circom";


// elligator2 mapping for hash to curve on babyjubjub
template elligator2_map()
{
    signal input fieldElement;
    signal output montgomeryPoint[2];

    var j = 16898;
    var k = 1;
    var z = 5;

    var exponentiator = ((21888242871839275222246405745257275088548364400416034343698204186575808495617+1)/4); // p+1/4 used due to congruence of F_p with 3mod4

    signal zU2;
    signal safeDenominator;
    signal x1;
    signal x1_2;
    signal x1_3;
    signal gx1;
    signal x2;
    signal x2_2;
    signal x2_3;
    signal gx2;
    signal isGx1Square;
    signal y1;
    signal y2;
    signal y1Squared;
    signal y1IsOdd;
    signal y2Squared;
    signal y2IsOdd;
    signal y1Corrected;
    signal y2Corrected;


    // Line 1 from rfc x1 = -j/k * 1/(1 + z*u²)
    zU2 <== z * fieldElement * fieldElement;

    // Check for the exceptional case where 1 + Z * u^2 == 0
    component isExceptionalCase = isZero();
    isExceptionalCase.in <== 1 + zU2;

    safeDenominator <== isExceptionalCase.out * 1 + (1 - isExceptionalCase.out) * (1 + zU2);
    x1 <-- (-j/k)/safeDenominator;
    (-j/k) === x1 * safeDenominator;

    (1 + zU2) * x1 + (j/k) === 0;

    // Calculate gx1 = x1³ + (j/k)*x1² + x1/(k²)
    x1_2 <== x1 * x1;
    x1_3 <== x1_2 * x1;
    gx1 <== x1_3 + (j/k) * x1_2 + x1 / (k * k); // k*k unnecessary in this case leaving for furmula completeness

    x2 <== -x1 -(j/k);

    x2_2 <== x2 * x2;
    x2_3 <== x2_2 *x2;
    gx2 <== x2_3 + (j/k) * x2_2 +x2 / (k * k);

    y1 <-- gx1 ** exponentiator;
    // Verify it's a valid square root
    y1Squared <== y1 * y1;

    component equality1 = isEqual();
    equality1.in[0] <== y1Squared;
    equality1.in[1] <== gx1;

    isGx1Square <== equality1.out; // 1 if g1x is a square, 0 otherwise

    component y1Bit = Num2Bits(1); // 1 if odd
    y1Bit.in <== y1;
    y1IsOdd <== y1Bit.out[0];


    // Calculate potential square root for gx2
    y2 <-- gx2 ** exponentiator;



    // Verify y2 is valid when used
    y2Squared <== y2 * y2;

    // Enforce that y2 is the square root of gx2 when gx1 is not a square
    (1 - isGx1Square) * (y2Squared - gx2) === 0;


    // Extract LSB of y2, similar to what's already done for y1
    component y2Bit = Num2Bits(1);
    y2Bit.in <== y2;
    y2IsOdd <== y2Bit.out[0];

    // Correct the sign of y1 and y2 to make them even
    y1Corrected <== y1 * (-1 + 2 * y1IsOdd);

    y2Corrected <== y2 * (1 - 2 * y2IsOdd);

    // Use Mux1 to select the right x-coordinate
    component xMux = Mux1();
    xMux.c[0] <== x2;  // When isGx1Square is 0
    xMux.c[1] <== x1;  // When isGx1Square is 1
    xMux.s <== isGx1Square;

    // Use Mux1 to select the right y-coordinate (already sign-corrected)
    component yMux = Mux1();
    yMux.c[0] <== y2Corrected;  // When isGx1Square is 0
    yMux.c[1] <== y1Corrected;    // When isGx1Square is 1
    yMux.s <== isGx1Square;

    // Set final output
    montgomeryPoint[0] <== xMux.out;
    montgomeryPoint[1] <== yMux.out;

}


// runs expand_message_xmd and hash2field
template hash2field() {
    signal input message;
    signal input dst; // Domain Separation Tag
    signal output fieldElement1;
    signal output fieldElement2;

    // Following RFC 9380's algorithm but using Poseidon2

    // 1. Create b_0 = H(Z_pad || message || l_i_b_str || I2OSP(0, 1) || DST_prime)
    component hasher0 = Poseidon2(3); // Adjust size as needed
    hasher0.inputs[0] <== message;
    hasher0.inputs[1] <== dst;
    hasher0.inputs[2] <== 0; // Counter

    // 2. Create b_1 = H(b_0 || I2OSP(1, 1) || DST_prime)
    component hasher1 = Poseidon2(2);
    hasher1.inputs[0] <== hasher0.outputs[0];
    hasher1.inputs[1] <== 1; // Counter

    // 3. Create b_2 = H(b_0 || I2OSP(2, 1) || DST_prime)
    component hasher2 = Poseidon2(2);
    hasher2.inputs[0] <== hasher0.out;
    hasher2.inputs[1] <== 2; // Counter

    // Use b_1 and b_2 as the two field elements (proper per RFC)
    fieldElement1 <== hasher1.out;
    fieldElement2 <== hasher2.out;
}

template hash2curve()
{
    signal input message;
    signal input dst;
    signal output edwardsPoint[2];


    component hasher = hash2field();
    hasher.message <== message;
    hasher.dst <== dst;

    component map1 = elligator2_map();
    map1.fieldElement <== hasher.fieldElement1;

    component map2 = elligator2_map();
    map2.fieldElement <== hasher.fieldElement2;

    component toEdwards1 = MontgomeryToEdwards();
    toEdwards1.in[0] <== map1.montgomeryPoint[0];
    toEdwards1.in[1] <== map1.montgomeryPoint[1];

    component toEdwards2 = MontgomeryToEdwards();
    toEdwards2.in[0] <== map2.montgomeryPoint[0];
    toEdwards2.in[1] <== map2.montgomeryPoint[1];

    // Add the two points together
    component pointAdder = BabyAdd();
    pointAdder.x1 <== toEdwards1.out[0];
    pointAdder.y1 <== toEdwards1.out[1];
    pointAdder.x2 <== toEdwards2.out[0];
    pointAdder.y2 <== toEdwards2.out[1];

    // Clear the cofactor
    component double1 = BabyDbl();
    double1.x <== pointAdder.xout;
    double1.y <== pointAdder.yout;

    component double2 = BabyDbl();
    double2.x <== double1.xout;
    double2.y <== double1.yout;

    component double3 = BabyDbl();
    double3.x <== double2.xout;
    double3.y <== double2.yout;

    edwardsPoint[0] <== double3.xout;
    edwardsPoint[1] <== double3.yout;

}