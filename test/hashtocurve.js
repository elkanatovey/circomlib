const chai = require("chai");
const assert = chai.assert;
const path = require("path");
const snarkjs = require("snarkjs");
const compiler = require("circom");


const h2c = require("../src/hashtocurve.js");

describe("Poseidon Circuit test", function () {
    let circuith2f;
    let circuitElligator;

    this.timeout(100000);

    before( async () => {
        const circuith2fDef = await compiler(path.join(__dirname, "circuits", "hashtofield_test.circom"));

        circuith2f = new snarkjs.Circuit(circuith2fDef);


        // Compile the elligator2_map test circuit
        const circuitElligatorDef = await compiler(path.join(__dirname, "circuits", "elligator2_map_test.circom"));
        circuitElligator = new snarkjs.Circuit(circuitElligatorDef);
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

    it("elligator2_map circuit", async () => {
        // Test input field element
        const fieldElement = "12345678901234567890";
        
        // Calculate curve point using JavaScript implementation
        const jsResult = h2c.elligator2Map(fieldElement);
        
        // Run the circuit with the same input
        const witness = circuitElligator.calculateWitness({
            fieldElement: fieldElement
        });
        
        // Check that circuit execution was successful
        assert(circuitElligator.checkWitness(witness));
        
        // Compare circuit outputs with JavaScript implementation for x-coordinate
        assert.equal(
            witness[circuitElligator.getSignalIdx("main.montgomeryPoint[0]")].toString(), 
            jsResult.x.toString()
        );
        
        // Compare circuit outputs with JavaScript implementation for y-coordinate
        assert.equal(
            witness[circuitElligator.getSignalIdx("main.montgomeryPoint[1]")].toString(), 
            jsResult.y.toString()
        );
    });
});