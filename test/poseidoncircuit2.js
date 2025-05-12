const chai = require("chai");
const path = require("path");
const snarkjs = require("snarkjs");
const compiler = require("circom");

const poseidon = require("../src/poseidon2.js");
const poseidonPerm = require("../src/poseidonPerm.js");
const poseidonCipher = require("../src/poseidonCipher.js");

const assert = chai.assert;

describe("Poseidon Circuit test", function () {
    let circuit6;
    let circuit3;
    let perm3Circuit;
    let perm6Circuit;
    let decrypt4Circuit;
    let encrypt4Circuit;

    this.timeout(100000);

    before( async () => {
        const circuit3Def = await compiler(path.join(__dirname, "circuits", "poseidon3_test.circom"));
        const circuit6Def = await compiler(path.join(__dirname, "circuits", "poseidon6_test.circom"));
        const perm3CircuitDef = await compiler(path.join(__dirname, "circuits", "poseidonPerm3_test.circom"));
        const perm6CircuitDef = await compiler(path.join(__dirname, "circuits", "poseidonPerm6_test.circom"));
        const decrypt4CircuitDef = await compiler(path.join(__dirname, "circuits", "poseidonDecrypt4_test.circom"));
        const encrypt4CircuitDef = await compiler(path.join(__dirname, "circuits", "poseidonEncrypt4_test.circom"));

        circuit3 = new snarkjs.Circuit(circuit3Def);
        circuit6 = new snarkjs.Circuit(circuit6Def);
        perm3Circuit = new snarkjs.Circuit(perm3CircuitDef);
        perm6Circuit = new snarkjs.Circuit(perm6CircuitDef);
        decrypt4Circuit = new snarkjs.Circuit(decrypt4CircuitDef);
        encrypt4Circuit = new snarkjs.Circuit(encrypt4CircuitDef);


    });

    it("poseidon decryption circuit l=4", async () => {
        const message = [1, 2, 3, 4];
        const key = [123, 456];
        const ciphertext = poseidonCipher.encrypt(message, key, 0);
        const decrypted = poseidonCipher.decrypt(ciphertext, key, 0, message.length);
        const inputs = {
            nonce: 0,
            key,
            ciphertext
        };
        const w = await decrypt4Circuit.calculateWitness(inputs, true);
        const res = [];
        for (let i = 0; i < message.length; i++) {
            const idx = decrypt4Circuit.getSignalIdx(`main.decrypted[${i}]`);
            res.push(w[idx]);
        }

        assert.equal(res.toString(), decrypted.toString());
        await decrypt4Circuit.checkWitness(w);
    });


    it("poseidon encryption circuit l=4", async () => {
        const message = [1, 2, 3, 4];
        const key = [123, 456];
        const ciphertext = poseidonCipher.encrypt(message, key, 0);
        const inputs = {
            msg: [1, 2, 3, 4],
            nonce: 0,
            key
        };
        const w = await encrypt4Circuit.calculateWitness(inputs, true);
        const res = [];
        for (let i = 0; i < ciphertext.length; i++) {
            const idx = encrypt4Circuit.getSignalIdx(`main.ciphertext[${i}]`);
            res.push(w[idx]);
        }
        assert.equal(res.toString(), ciphertext.toString());

        // const decrypted = poseidonCipher.decrypt(ciphertext, key, 0, message.length);
        // const inputs = {
        //     nonce: 0,
        //     key,
        //     ciphertext
        // };
        // const w = await decrypt4Circuit.calculateWitness(inputs, true);
        // const res = [];
        // for (let i = 0; i < message.length; i++) {
        //     const idx = decrypt4Circuit.getSignalIdx(`main.decrypted[${i}]`);
        //     res.push(w[idx]);
        // }
        //
        // assert.equal(res.toString(), decrypted.toString());
        await encrypt4Circuit.checkWitness(w);
    });

    it("poseidonPerm circuit t=3", async () => {
        const inputs = [0, 1, 2];
        const res = poseidonPerm(inputs);

        const w = await perm3Circuit.calculateWitness({inputs}, true);

        await assert.equal(res[0], w[perm3Circuit.getSignalIdx("main.out[0]")]);
        await assert.equal(res[1], w[perm3Circuit.getSignalIdx("main.out[1]")]);
        await assert.equal(res[2], w[perm3Circuit.getSignalIdx("main.out[2]")]);

        await perm3Circuit.checkWitness(w);
    });

    it("poseidonPerm circuit t=6", async () => {
        const inputs = [0, 1, 2, 3, 4];
        const res = poseidonPerm(inputs);

        const w = await perm6Circuit.calculateWitness({inputs}, true);

        await assert.equal(res[0], w[perm6Circuit.getSignalIdx("main.out[0]")]);
        await assert.equal(res[1], w[perm6Circuit.getSignalIdx("main.out[1]")]);
        await assert.equal(res[2], w[perm6Circuit.getSignalIdx("main.out[2]")]);
        await assert.equal(res[3], w[perm6Circuit.getSignalIdx("main.out[3]")]);
        await assert.equal(res[4], w[perm6Circuit.getSignalIdx("main.out[4]")]);

        await perm6Circuit.checkWitness(w);
    });

    it("Should check constrain of hash([1, 2]) t=6", async () => {
        const w = await circuit6.calculateWitness({inputs: [1, 2, 0,0,0]}, true);

        const res2 = poseidon([1,2,0,0,0]);

        assert.equal("1018317224307729531995786483840663576608797660851238720571059489595066344487", res2.toString());

        await assert.equal(res2, w[circuit6.getSignalIdx("main.out")]);
        await circuit6.checkWitness(w);
    });

    it("Should check constrain of hash([3, 4]) t=6", async () => {
        const w = await circuit6.calculateWitness({inputs: [3, 4,5,10,23]});

        const res2 = poseidon([3, 4,5,10,23]);

        assert.equal("13034429309846638789535561449942021891039729847501137143363028890275222221409", res2.toString());
        await assert.equal(res2, w[circuit6.getSignalIdx("main.out")]);
        await circuit6.checkWitness(w);
    });


    it("Should check constrain of hash([1, 2]) t=3", async () => {
        const w = await circuit3.calculateWitness({inputs: [1, 2]});

        const res2 = poseidon([1,2]);

        assert.equal("7853200120776062878684798364095072458815029376092732009249414926327459813530", res2.toString());
        await assert.equal(res2, w[circuit3.getSignalIdx("main.out")]);
        await circuit3.checkWitness(w);
    });

    it("Should check constrain of hash([3, 4]) t=3", async () => {
        const w = await circuit3.calculateWitness({inputs: [3, 4]});

        const res2 = poseidon([3, 4]);

        assert.equal("14763215145315200506921711489642608356394854266165572616578112107564877678998", res2.toString());
        await assert.equal(res2, w[circuit3.getSignalIdx("main.out")]);
        await circuit3.checkWitness(w);
    });
});
