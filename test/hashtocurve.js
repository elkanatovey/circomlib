const chai = require("chai");
const assert = chai.assert;
const path = require("path");
const snarkjs = require("snarkjs");
const compiler = require("circom");


const h2c = require("../src/hashtocurve.js");

describe("Poseidon Circuit test", function () {
    let circuith2f;
    let circuitElligator;
    let circuitHash2Curve;

    this.timeout(100000);

    before( async () => {
        const circuith2fDef = await compiler(path.join(__dirname, "circuits", "hashtofield_test.circom"));

        circuith2f = new snarkjs.Circuit(circuith2fDef);


        // Compile the elligator2_map test circuit
        const circuitElligatorDef = await compiler(path.join(__dirname, "circuits", "elligator2_map_test.circom"));
        circuitElligator = new snarkjs.Circuit(circuitElligatorDef);

        // Compile the hash2curve test circuit
        const circuitHash2CurveDef = await compiler(path.join(__dirname, "circuits", "hash2curve_test.circom"));
        circuitHash2Curve = new snarkjs.Circuit(circuitHash2CurveDef);
    });

    it("hash2field circuit", async () => {
        const message = 123456789n; // Test message as BigInt
        const dst = 42n; // Domain separation tag as BigInt
        
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
        const fieldElement = 12345678901234567890n;
        
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

    it("hash2curve circuit", async () => {
        // Test input parameters
        const message = 123456789n;
        const dst = 42n;
        
        // Calculate curve point using JavaScript implementation
        const jsResult = h2c.hash2curve(message, dst);
        
        // Run the circuit with the same inputs
        const witness = circuitHash2Curve.calculateWitness({
            message: message,
            dst: dst
        });
        
        // Check that circuit execution was successful
        assert(circuitHash2Curve.checkWitness(witness));
        
        // Compare circuit outputs with JavaScript implementation for x-coordinate
        assert.equal(
            witness[circuitHash2Curve.getSignalIdx("main.edwardsPoint[0]")].toString(), 
            jsResult[0].toString()
        );
        
        // Compare circuit outputs with JavaScript implementation for y-coordinate
        assert.equal(
            witness[circuitHash2Curve.getSignalIdx("main.edwardsPoint[1]")].toString(), 
            jsResult[1].toString()
        );
        
        console.log(`    ✓ Circuit and JavaScript implementations match for message=${message}, dst=${dst}`);
    });

    it("hash2curve complete pipeline", async () => {
        const babyJub = require("../src/babyjub.js");
        
        // Test cases with different message and domain separation tag combinations
        const testCases = [
            { message: 42n, dst: 123n },
            { message: 12345n, dst: 67890n },
            { message: 999999999999999999999999999999999n, dst: 1n },
            { message: 0n, dst: 0n }
        ];

        testCases.forEach((testCase, index) => {
            const { message, dst } = testCase;
            
            // Calculate hash2curve result using JavaScript implementation
            const result = h2c.hash2curve(message, dst);
            
            // Verify the result is an array with two elements (x, y coordinates)
            assert.isArray(result, `Test ${index + 1}: Result should be an array`);
            assert.equal(result.length, 2, `Test ${index + 1}: Result should have exactly 2 coordinates`);
            
            const [x, y] = result;
            
            // Verify coordinates are valid field elements
            assert.isTrue(typeof x === 'bigint', `Test ${index + 1}: x coordinate should be BigInt`);
            assert.isTrue(typeof y === 'bigint', `Test ${index + 1}: y coordinate should be BigInt`);
            assert.isTrue(x >= 0n && x < babyJub.p, `Test ${index + 1}: x coordinate should be in field range`);
            assert.isTrue(y >= 0n && y < babyJub.p, `Test ${index + 1}: y coordinate should be in field range`);
            
            // Verify the point is on the Baby Jubjub Edwards curve
            const isOnCurve = babyJub.inCurve(result);
            assert.isTrue(isOnCurve, `Test ${index + 1}: Point should be on the Baby Jubjub curve`);
            
            // Verify the point is in the prime order subgroup (cofactor cleared)
            const isInSubgroup = babyJub.inSubgroup(result);
            assert.isTrue(isInSubgroup, `Test ${index + 1}: Point should be in the prime order subgroup`);
            
            console.log(`    ✓ Test ${index + 1}: message=${message.toString().substring(0, 10)}${message.toString().length > 10 ? '...' : ''}, dst=${dst} -> valid subgroup element`);
        });
        
        // Test deterministic behavior - same input should produce same output
        const message = 12345n;
        const dst = 67890n;
        const result1 = h2c.hash2curve(message, dst);
        const result2 = h2c.hash2curve(message, dst);
        
        assert.equal(result1[0], result2[0], "Hash2curve should be deterministic (x coordinate)");
        assert.equal(result1[1], result2[1], "Hash2curve should be deterministic (y coordinate)");
        
        // Test that different inputs produce different outputs
        const result3 = h2c.hash2curve(message + 1n, dst);
        assert.notEqual(result1[0], result3[0], "Different messages should produce different points");
        
        const result4 = h2c.hash2curve(message, dst + 1n);
        assert.notEqual(result1[0], result4[0], "Different DSTs should produce different points");
        
        console.log("    ✓ Deterministic behavior verified");
        console.log("    ✓ Input sensitivity verified");
    });
});