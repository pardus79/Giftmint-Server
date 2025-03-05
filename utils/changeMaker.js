'use strict';

/**
 * Gets the optimal combination of denominations to represent an amount using a greedy approach
 * @param {number} amount - The amount to represent
 * @param {Array<number>} denominations - The available denominations
 * @returns {Object|null} Object with denominations as keys and counts as values, or null if impossible
 */
function getOptimalCombination(amount, denominations) {
  // Sort denominations in descending order (highest first) for greedy approach
  const sortedDenominations = denominations.slice().sort((a, b) => b - a);
  
  // Use a greedy algorithm to find the solution
  // For power-of-2 denominations, this will always give the optimal solution
  // (equivalent to the binary representation of the number)
  const result = {};
  let remainingAmount = amount;
  
  // Greedy algorithm - take as many of the largest denomination as possible,
  // then move to the next largest denomination
  for (const denomination of sortedDenominations) {
    if (denomination <= remainingAmount) {
      const count = Math.floor(remainingAmount / denomination);
      result[denomination] = count;
      remainingAmount -= count * denomination;
    }
  }
  
  // With power-of-2 denominations, we should always be able to represent any positive integer
  // This is because any number can be represented as a sum of powers of 2 (binary representation)
  // This check should never be true with our power-of-2 denominations, but we'll keep it for safety
  if (remainingAmount > 0) {
    console.warn(`Unexpected: Unable to represent value ${amount} with power-of-2 denominations`);
    return null;
  }
  
  return result;
}

/**
 * Calculates the total value of a combination
 * @param {Object} combination - The denomination combination
 * @returns {number} The total value
 */
function getTotalValue(combination) {
  let total = 0;
  
  for (const [denomination, count] of Object.entries(combination)) {
    total += parseInt(denomination, 10) * count;
  }
  
  return total;
}

/**
 * Gets the total count of tokens in a combination
 * @param {Object} combination - The denomination combination
 * @returns {number} The total count
 */
function getTotalCount(combination) {
  let total = 0;
  
  for (const count of Object.values(combination)) {
    total += count;
  }
  
  return total;
}

/**
 * Splits an amount into approximately equal parts
 * @param {number} amount - The amount to split
 * @param {number} parts - The number of parts
 * @param {Array<number>} denominations - The available denominations
 * @returns {Array<number>|null} Array of amounts, or null if impossible
 */
function splitAmount(amount, parts, denominations) {
  if (parts <= 0) {
    return null;
  }
  
  if (parts === 1) {
    const combination = getOptimalCombination(amount, denominations);
    return combination ? [amount] : null;
  }
  
  // Sort denominations in ascending order for better distribution
  const sortedDenominations = denominations.slice().sort((a, b) => a - b);
  const smallestDenomination = sortedDenominations[0];
  
  // If the amount is too small to split into the requested parts
  if (amount < parts * smallestDenomination) {
    return null;
  }
  
  // Calculate base amount per part (floor division)
  const baseAmount = Math.floor(amount / parts);
  let remainder = amount % parts;
  
  // Create the parts
  const result = [];
  
  for (let i = 0; i < parts; i++) {
    // Add one unit of the smallest denomination to distribute the remainder
    const partAmount = baseAmount + (remainder > 0 ? smallestDenomination : 0);
    remainder -= remainder > 0 ? 1 : 0;
    
    // Verify this part can be represented with available denominations
    if (getOptimalCombination(partAmount, denominations) === null) {
      // If not, try a different algorithm or adjust
      return fallbackSplitAmount(amount, parts, denominations);
    }
    
    result.push(partAmount);
  }
  
  return result;
}

/**
 * Fallback method to split amount when the equal split doesn't work
 * @param {number} amount - The amount to split
 * @param {number} parts - The number of parts
 * @param {Array<number>} denominations - The available denominations
 * @returns {Array<number>|null} Array of amounts, or null if impossible
 */
function fallbackSplitAmount(amount, parts, denominations) {
  // Sort denominations in descending order (highest first) for greedy approach
  const sortedDenominations = denominations.slice().sort((a, b) => b - a);
  
  // Start with empty parts
  const result = new Array(parts).fill(0);
  let remainingAmount = amount;
  
  // Distribute denominations one by one to the part with the smallest current amount
  // Always using the largest possible denomination (greedy approach)
  while (remainingAmount > 0) {
    // Find largest denomination that fits in remaining amount
    const denomination = sortedDenominations.find(d => d <= remainingAmount);
    
    if (!denomination) {
      // With power-of-2 denominations, this should never happen for a positive remainingAmount
      console.warn(`Unexpected: Unable to find denomination for remaining amount ${remainingAmount}`);
      return null;
    }
    
    // Find the part with the smallest current amount
    const minPartIndex = result.indexOf(Math.min(...result));
    
    // Add denomination to that part
    result[minPartIndex] += denomination;
    remainingAmount -= denomination;
  }
  
  return result;
}

/**
 * Merges multiple combinations into a single combination
 * @param {Array<Object>} combinations - Array of denomination combinations
 * @returns {Object} Merged combination
 */
function mergeCombinations(combinations) {
  const result = {};
  
  for (const combination of combinations) {
    for (const [denomination, count] of Object.entries(combination)) {
      if (!result[denomination]) {
        result[denomination] = 0;
      }
      
      result[denomination] += count;
    }
  }
  
  return result;
}

module.exports = {
  getOptimalCombination,
  getTotalValue,
  getTotalCount,
  splitAmount,
  mergeCombinations
};