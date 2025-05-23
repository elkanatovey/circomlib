include "./poseidon_constants2.circom";
include "./comparators.circom";

template Sigma() {
    signal input in;
    signal output out;

    signal in2;
    signal in4;

    in2 <== in*in;
    in4 <== in2*in2;

    out <== in4*in;
}

template Ark(t, C, r) {
    signal input in[t];
    signal output out[t];

    for (var i=0; i<t; i++) {
        out[i] <== in[i] + C[i + r];
    }
}

template Mix(t, M) {
    signal input in[t];
    signal output out[t];

    var lc;
    for (var i=0; i<t; i++) {
        lc = 0;
        for (var j=0; j<t; j++) {
            lc += M[i][j]*in[j];
        }
        out[i] <== lc;
    }
}

template Poseidon2(nInputs) {
    signal input inputs[nInputs];
    signal output out;

    component strategy = PoseidonPerm(nInputs + 1);
    strategy.inputs[0] <== 0;
    for (var i = 0; i < nInputs; i ++) {
        strategy.inputs[i + 1] <== inputs[i];
    }
    out <== strategy.out[0];
}

template PoseidonPerm(t) {
    // Using recommended parameters from whitepaper https://eprint.iacr.org/2019/458.pdf (table 2, table 8)
    // Generated by https://extgit.iaik.tugraz.at/krypto/hadeshash/-/blob/master/code/calc_round_numbers.py
    // And rounded up to nearest integer that divides by t
    var N_ROUNDS_P[8] = [56, 57, 56, 60, 60, 63, 64, 63];
    var nRoundsF = 8;
    var nRoundsP = N_ROUNDS_P[t - 2];
    var C[t*(nRoundsF + nRoundsP)] = POSEIDON_C2(t);
    var M[t][t] = POSEIDON_M2(t);

    signal input inputs[t];
    signal output out[t];

    component ark[nRoundsF + nRoundsP];
    component sigmaF[nRoundsF][t];
    component sigmaP[nRoundsP];
    component mix[nRoundsF + nRoundsP];

    var k;

    for (var i=0; i<nRoundsF + nRoundsP; i++) {
        ark[i] = Ark(t, C, t*i);
        for (var j=0; j<t; j++) {
            if (i==0) {
                ark[i].in[j] <== inputs[j];
            } else {
                ark[i].in[j] <== mix[i-1].out[j];
            }
        }

        if (i < nRoundsF/2 || i >= nRoundsP + nRoundsF/2) {
            k = i < nRoundsF/2 ? i : i - nRoundsP;
            mix[i] = Mix(t, M);
            for (var j=0; j<t; j++) {
                sigmaF[k][j] = Sigma();
                sigmaF[k][j].in <== ark[i].out[j];
                mix[i].in[j] <== sigmaF[k][j].out;
            }
        } else {
            k = i - nRoundsF/2;
            mix[i] = Mix(t, M);
            sigmaP[k] = Sigma();
            sigmaP[k].in <== ark[i].out[0];
            mix[i].in[0] <== sigmaP[k].out;
            for (var j=1; j<t; j++) {
                mix[i].in[j] <== ark[i].out[j];
            }
        }
    }

    // Output the final state.
    for (var i = 0; i < t; i ++) {
        out[i] <== mix[nRoundsF + nRoundsP -1].out[i];
    }
}

template PoseidonDecrypt(l) {
    var decryptedLength = l;
    while (decryptedLength % 3 != 0) {
        decryptedLength += 1;
    }
    // e.g. if l == 4, decryptedLength == 6

    signal private input ciphertext[decryptedLength + 1];
    signal input nonce;
    signal input key[2];
    signal output decrypted[decryptedLength];

    component iterations = PoseidonDecryptIterations(l);
    iterations.nonce <== nonce;
    iterations.key[0] <== key[0];
    iterations.key[1] <== key[1];
    for (var i = 0; i < decryptedLength + 1; i ++) {
        iterations.ciphertext[i] <== ciphertext[i];
    }

    // Check the last ciphertext element
    iterations.decryptedLast === ciphertext[decryptedLength];

    for (var i = 0; i < decryptedLength; i ++) {
        decrypted[i] <== iterations.decrypted[i];
    }

    // If length > 3, check if the last (3 - (l mod 3)) elements of the message
    // are 0
    if (l % 3 > 0) {
        if (l % 3 == 2) {
            decrypted[decryptedLength - 1] === 0;
        } else if (l % 3 == 1) {
            decrypted[decryptedLength - 1] === 0;
            decrypted[decryptedLength - 2] === 0;
        }
    }
}

// Decrypt a ciphertext without checking if the last ciphertext element or
// whether the last 3 - (l mod 3) elements are 0. This is useful in
// applications where you do not want an invalid decryption to prevent the
// generation of a proof.
template PoseidonDecryptWithoutCheck(l) {
    var decryptedLength = l;
    while (decryptedLength % 3 != 0) {
        decryptedLength += 1;
    }
    // e.g. if l == 4, decryptedLength == 6

    signal private input ciphertext[decryptedLength + 1];
    signal input nonce;
    signal input key[2];
    signal output decrypted[decryptedLength];

    component iterations = PoseidonDecryptIterations(l);
    iterations.nonce <== nonce;
    iterations.key[0] <== key[0];
    iterations.key[1] <== key[1];
    for (var i = 0; i < decryptedLength + 1; i ++) {
        iterations.ciphertext[i] <== ciphertext[i];
    }

    for (var i = 0; i < decryptedLength; i ++) {
        decrypted[i] <== iterations.decrypted[i];
    }
}

template PoseidonDecryptIterations(l) {
    var decryptedLength = l;
    while (decryptedLength % 3 != 0) {
        decryptedLength += 1;
    }
    // e.g. if l == 4, decryptedLength == 6

    signal private input ciphertext[decryptedLength + 1];
    signal input nonce;
    signal input key[2];
    signal output decrypted[decryptedLength];
    signal output decryptedLast;

    var two128 = 2 ** 128;

    // The nonce must be less than 2 ^ 128
    component lt = LessThan(252);
    lt.in[0] <== nonce;
    lt.in[1] <== two128;
    lt.out === 1;

    var n = (decryptedLength + 1) \ 3;

    component strategies[n + 1];
    // Iterate Poseidon on the initial state
    strategies[0] = PoseidonPerm(4);
    strategies[0].inputs[0] <== 0;
    strategies[0].inputs[1] <== key[0];
    strategies[0].inputs[2] <== key[1];
    strategies[0].inputs[3] <== nonce + (l * two128);

    for (var i = 0; i < n; i ++) {
        // Release three elements of the message
        for (var j = 0; j < 3; j ++) {
            decrypted[i * 3 + j] <== ciphertext[i * 3 + j] - strategies[i].out[j + 1];
        }

        // Iterate Poseidon on the state
        strategies[i + 1] = PoseidonPerm(4);
        strategies[i + 1].inputs[0] <== strategies[i].out[0];
        for (var j = 0; j < 3; j ++) {
            strategies[i + 1].inputs[j + 1] <== ciphertext[i * 3 + j];
        }
    }
    decryptedLast <== strategies[n].out[1];
}

template PoseidonEncrypt(l) {
    var msgLength = l;
    while (msgLength % 3 != 0) {
        msgLength++;
    }

    signal private input msg[l];
    signal input key[2];
    signal input nonce;
    signal output ciphertext[msgLength + 1];

    // Create internal signals for the padded message
    signal paddedMsg[msgLength];

    // Assign original message values
    for (var i = 0; i < l; i++) {
        paddedMsg[i] <== msg[i];
    }

    // Add padding with zeros
    for (var i = l; i < msgLength; i++) {
        paddedMsg[i] <== 0;
    }

    var two128 = 2 ** 128;
    component lt = LessThan(252);
    lt.in[0] <== nonce;
    lt.in[1] <== two128;
    lt.out === 1;

    var rounds = msgLength / 3;

    // Initial state
    signal state[rounds + 1][4];
    state[0][0] <== 0;
    state[0][1] <== key[0];
    state[0][2] <== key[1];
    state[0][3] <== nonce + (l * two128);

    // For each round
    component perm[rounds + 1];
    signal s[rounds][3];

    for (var i = 0; i < rounds; i++) {
        // Apply Poseidon permutation
        perm[i] = PoseidonPerm(4);
        for (var j = 0; j < 4; j++) {
            perm[i].inputs[j] <== state[i][j];
        }

        // Compute ciphertext directly from permutation output
        s[i][0] <== perm[i].out[1] + paddedMsg[i * 3];
        s[i][1] <== perm[i].out[2] + paddedMsg[i * 3 + 1];
        s[i][2] <== perm[i].out[3] + paddedMsg[i * 3 + 2];

        // Set ciphertext outputs
        ciphertext[i * 3] <== s[i][0];
        ciphertext[i * 3 + 1] <== s[i][1];
        ciphertext[i * 3 + 2] <== s[i][2];

        // Update state for next round
        state[i + 1][0] <== perm[i].out[0];
        state[i + 1][1] <== s[i][0];
        state[i + 1][2] <== s[i][1];
        state[i + 1][3] <== s[i][2];
    }

    // Final permutation
    perm[rounds] = PoseidonPerm(4);
    for (var j = 0; j < 4; j++) {
        perm[rounds].inputs[j] <== state[rounds][j];
    }

    // Final ciphertext element
    ciphertext[msgLength] <== perm[rounds].out[1];
}