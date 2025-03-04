/**
 * Change-making algorithm utility
 * 
 * This utility helps break down a given amount into the optimal
 * combination of smaller denominations.
 */

/**
 * Find the optimal combination of denominations to make a given amount
 * Uses a greedy algorithm to find the fewest number of tokens
 * 
 * @param {number} amount - The amount to break down
 * @param {Array<Object>} denominations - Available denominations sorted in descending order
 * @param {number} maxDenomination - Optional maximum denomination to use
 * @returns {Array<Object>} Array of denominations that sum to the amount
 */
function makeChange(amount, denominations, maxDenomination = Infinity) {
  // Sort denominations in descending order
  const sortedDenoms = [...denominations]
    .filter(d => d.value <= maxDenomination)
    .sort((a, b) => b.value - a.value);
  
  const result = [];
  let remainingAmount = amount;
  
  // Greedy algorithm - start with largest denomination and work down
  for (const denom of sortedDenoms) {
    while (remainingAmount >= denom.value) {
      result.push(denom);
      remainingAmount -= denom.value;
    }
    
    // If we've made perfect change, break early
    if (remainingAmount === 0) {
      break;
    }
  }
  
  // Check if we've successfully made change for the full amount
  if (remainingAmount > 0) {
    throw new Error(`Cannot make exact change for ${amount}`);
  }
  
  return result;
}

/**
 * Find the optimal combination of denominations to make change using binary representation
 * This is optimized for power-of-2 denominations
 * 
 * @param {number} amount - The amount to break down
 * @param {Array<Object>} denominations - Available denominations
 * @returns {Array<Object>} Array of denominations that sum to the amount
 */
function makeChangeBinary(amount, denominations) {
  // Create a map of values to denomination objects for quick lookup
  const denomMap = {};
  for (const denom of denominations) {
    denomMap[denom.value] = denom;
  }
  
  const result = [];
  let remainingAmount = amount;
  
  // Find largest power of 2 less than or equal to the amount
  let powerOf2 = 1;
  while (powerOf2 * 2 <= remainingAmount) {
    powerOf2 *= 2;
  }
  
  // Work downward through powers of 2
  while (remainingAmount > 0) {
    if (remainingAmount >= powerOf2) {
      // If we have this denomination, add it
      if (denomMap[powerOf2]) {
        result.push(denomMap[powerOf2]);
        remainingAmount -= powerOf2;
      } else {
        // If we don't have this exact power of 2, try to find smaller denominations
        const smallerDenoms = makeChange(powerOf2, denominations, powerOf2 / 2);
        result.push(...smallerDenoms);
        remainingAmount -= powerOf2;
      }
    }
    powerOf2 = Math.floor(powerOf2 / 2);
  }
  
  return result;
}

module.exports = {
  makeChange,
  makeChangeBinary
};