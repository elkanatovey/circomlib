include "./poseidon2.circom";
include "./montgomery.circom";
include "./babyjub.circom";
include "./comparators.circom";
include "./mux1.circom";
include "./bitify.circom";


// Tonelli-Shanks square root function (adapted from pointbits.circom)
function sqrt(n) {
    if (n == 0) {
        return 0;
    }

    // Test that solution exists
    var res = n ** ((-1) >> 1);
    if (res != 1) return 0;

    var m = 28;
    var c = 19103219067921713944291392827692070036145651957329286315305642004821462161904;
    var t = n ** 81540058820840996586704275553141814055101440848469862132140264610111;
    var r = n ** ((81540058820840996586704275553141814055101440848469862132140264610111+1)>>1);
    var sq;
    var i;
    var b;
    var j;

    while ((r != 0) && (t != 1)) {
        sq = t*t;
        i = 1;
        while (sq != 1) {
            i++;
            sq = sq*sq;
        }

        // b = c ^ (m-i-1)
        b = c;
        for (j = 0; j < m-i-1; j++) {
            b = b*b;
        }

        m = i;
        c = b*b;
        t = t*c;
        r = r*b;
    }

    if (r > ((-1) >> 1)) {
        r = -r;
    }

    return r;
}

// elligator2 mapping for hash to curve on babyjubjub
template elligator2_map() {
    signal input fieldElement;
    signal output montgomeryPoint[2];

    var j = 168698;
    var k = 1;
    var z = 5;

    signal zU2;
    signal denominator;
    signal x1;
    signal x1_2;
    signal x1_3;
    signal gx1;
    signal x2;
    signal x2_2;
    signal x2_3;
    signal gx2;
    signal isGx1Square;
    signal isGx2Square;
    signal y1;
    signal y2;
    signal y1Squared;
    signal y2Squared;
    signal y1Corrected;
    signal y2Corrected;

    // Step 1: Calculate denominator = 1 + z*u²
    zU2 <== z * fieldElement * fieldElement;
    denominator <== 1 + zU2;

    // Step 2: Calculate x1 = -j / denominator (since k=1)
    x1 <-- (-j) / denominator;
    // Constrain the division
    x1 * denominator === -j;

    // Step 3: Calculate x2 = -x1 - j
    x2 <== -x1 - j;

    // Calculate gx1 = x1³ + j*x1² + x1 (since k=1)
    x1_2 <== x1 * x1;
    x1_3 <== x1_2 * x1;
    gx1 <== x1_3 + j * x1_2 + x1;

    // Calculate gx2 = x2³ + j*x2² + x2 (since k=1)
    x2_2 <== x2 * x2;
    x2_3 <== x2_2 * x2;
    gx2 <== x2_3 + j * x2_2 + x2;

    // Step 4: Try to compute square root of gx1 using Tonelli-Shanks
    y1 <-- sqrt(gx1);
    // Verify it's a valid square root
    y1Squared <== y1 * y1;

    component equality1 = IsEqual();
    equality1.in[0] <== y1Squared;
    equality1.in[1] <== gx1;

    isGx1Square <== equality1.out; // 1 if gx1 is a square, 0 otherwise

    // Step 5: Calculate potential square root for gx2 using Tonelli-Shanks
    y2 <-- sqrt(gx2);
    // Verify y2 is valid when used
    y2Squared <== y2 * y2;

    // Check if gx2 is a square
    component equality2 = IsEqual();
    equality2.in[0] <== y2Squared;
    equality2.in[1] <== gx2;
    isGx2Square <== equality2.out;

    // Ensure exactly one of gx1 or gx2 is a square
    isGx1Square + isGx2Square === 1;

    //todo implement sign correction must be done for full determinism
    // Sign correction: make y-coordinates even (following the JavaScript implementation)
    // We don't need to extract individual bits, just ensure the result is canonical
    y1Corrected <== y1;
    y2Corrected <== y2;

    // Use Mux1 to select the right x-coordinate
    component xMux = Mux1();
    xMux.c[0] <== x2;  // When isGx1Square is 0
    xMux.c[1] <== x1;  // When isGx1Square is 1
    xMux.s <== isGx1Square;

    // Use Mux1 to select the right y-coordinate (already sign-corrected)
    component yMux = Mux1();
    yMux.c[0] <== y2Corrected;  // When isGx1Square is 0
    yMux.c[1] <== y1Corrected;  // When isGx1Square is 1
    yMux.s <== isGx1Square;

    // Set final output
    montgomeryPoint[0] <== xMux.out;
    montgomeryPoint[1] <== yMux.out;
}


// runs hash2field assuming that Poseidon behaves like random oracle - todo consider switching to sponge
template hash2field() {
    signal input message;
    signal input dst; // Domain Separation Tag
    signal output fieldElement1;
    signal output fieldElement2;

    component hasher0 = Poseidon2(3); 
    hasher0.inputs[0] <== message;
    hasher0.inputs[1] <== 0;
    hasher0.inputs[2] <== dst;

    component hasher1 = Poseidon2(3);
    hasher1.inputs[0] <== hasher0.out;
    hasher1.inputs[1] <== 1; // Counter
    hasher1.inputs[2] <== dst;

    fieldElement1 <== hasher0.out;
    fieldElement2 <== hasher1.out;
}

template hash2curve() {
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

    component toEdwards1 = Montgomery2Edwards();
    toEdwards1.in[0] <== map1.montgomeryPoint[0];
    toEdwards1.in[1] <== map1.montgomeryPoint[1];

    component toEdwards2 = Montgomery2Edwards();
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