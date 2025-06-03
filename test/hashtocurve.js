const chai = require("chai");
const assert = chai.assert;
const path = require("path");
const snarkjs = require("snarkjs");
const compiler = require("circom");


const h2c = require("../src/hashtocurve.js");

describe("Poseidon Circuit test", function () {
    let circuith2f;

    this.timeout(100000);

    before( async () => {
        const circuith2fDef = await compiler(path.join(__dirname, "circuits", "hashtofield_test.circom"));

        circuith2f = new snarkjs.Circuit(circuith2fDef);


    });

    it("hash2field circuit", async () => {
        const message = "123456789"; // Test message
        const dst = 42; // Domain separation tag
        
        // Calculate field elements using JavaScript implementation
        const jsResult = h2c.hash2field(message, dst);
        
        // Run the circuit with the same inputs
        const witness = circuith2f.calculateWitness({
            message: message,
            dst: dst
        });
        
        // Check that circuit execution was successful
        assert(circuith2f.checkWitness(witness));
        
        // Compare circuit outputs with JavaScript implementation
        assert.equal(witness[circuith2f.getSignalIdx("main.fieldElement1")].toString(), 
            jsResult.fieldElement1.toString());
        assert.equal(witness[circuith2f.getSignalIdx("main.fieldElement2")].toString(), 
            jsResult.fieldElement2.toString());
    });

});