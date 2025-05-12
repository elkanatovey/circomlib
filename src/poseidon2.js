const poseidonPerm = require("./poseidonPerm");

function poseidon2(inputs) {
    return poseidonPerm([0, ...inputs])[0];
}

module.exports = poseidon2;
