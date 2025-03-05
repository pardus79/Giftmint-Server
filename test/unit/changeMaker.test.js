'use strict';

const changeMaker = require('../../utils/changeMaker');
const testConfig = require('../testConfig');

describe('ChangeMaker Utility', () => {
  // Test denominations
  const denominations = testConfig.denominations;
  
  describe('getOptimalCombination', () => {
    it('should return the optimal combination for simple amounts', () => {
      // Test with various amounts
      const testCases = [
        { amount: 1, expected: { 1: 1 } },
        { amount: 2, expected: { 2: 1 } },
        { amount: 3, expected: { 1: 1, 2: 1 } },
        { amount: 7, expected: { 1: 1, 2: 1, 4: 1 } },
        { amount: 8, expected: { 8: 1 } },
        { amount: 15, expected: { 1: 1, 2: 1, 4: 1, 8: 1 } },
        { amount: 16, expected: { 16: 1 } },
        { amount: 42, expected: { 2: 1, 8: 1, 32: 1 } }
      ];
      
      for (const testCase of testCases) {
        const result = changeMaker.getOptimalCombination(testCase.amount, denominations);
        expect(result).toEqual(testCase.expected);
      }
    });
    
    it('should handle larger amounts', () => {
      const amount = 1023; // 2^10 - 1
      const result = changeMaker.getOptimalCombination(amount, denominations);
      
      // For 1023, we expect all denominations from 1 to 512 (full binary representation)
      expect(result).toEqual({ 1: 1, 2: 1, 4: 1, 8: 1, 16: 1, 32: 1, 64: 1, 128: 1, 256: 1, 512: 1 });
      
      // Verify the total is correct
      const total = Object.entries(result).reduce((sum, [denom, count]) => sum + (parseInt(denom) * count), 0);
      expect(total).toBe(amount);
    });
    
    it('should always use the largest denominations first (greedy approach)', () => {
      const amount = 130; // 128 + 2
      const result = changeMaker.getOptimalCombination(amount, denominations);
      
      // With greedy approach, we expect 128 + 2, not 64 + 64 + 2
      expect(result).toEqual({ 2: 1, 128: 1 });
      
      // Another test case
      const amount2 = 192; // 128 + 64
      const result2 = changeMaker.getOptimalCombination(amount2, denominations);
      
      // Should use 128 + 64, not 64 + 64 + 64
      expect(result2).toEqual({ 64: 1, 128: 1 });
    });
    
    it('should handle zero amount', () => {
      const result = changeMaker.getOptimalCombination(0, denominations);
      expect(result).toEqual({});
    });
    
    it('should return null for negative amounts', () => {
      const result = changeMaker.getOptimalCombination(-10, denominations);
      expect(result).toBeNull();
    });
  });
  
  describe('getTotalValue', () => {
    it('should calculate the total value correctly', () => {
      const combinations = [
        { combination: { 1: 1, 2: 1, 4: 1 }, expected: 7 },
        { combination: { 8: 1, 16: 2 }, expected: 40 },
        { combination: { 32: 3, 64: 1, 128: 2 }, expected: 352 },
        { combination: {}, expected: 0 }
      ];
      
      for (const { combination, expected } of combinations) {
        const total = changeMaker.getTotalValue(combination);
        expect(total).toBe(expected);
      }
    });
  });
  
  describe('getTotalCount', () => {
    it('should calculate the total count correctly', () => {
      const combinations = [
        { combination: { 1: 1, 2: 1, 4: 1 }, expected: 3 },
        { combination: { 8: 1, 16: 2 }, expected: 3 },
        { combination: { 32: 3, 64: 1, 128: 2 }, expected: 6 },
        { combination: {}, expected: 0 }
      ];
      
      for (const { combination, expected } of combinations) {
        const count = changeMaker.getTotalCount(combination);
        expect(count).toBe(expected);
      }
    });
  });
  
  describe('splitAmount', () => {
    it('should split amount into equal parts when possible', () => {
      // Test splitting 100 into 4 parts
      const parts = changeMaker.splitAmount(100, 4, denominations);
      expect(parts).toHaveLength(4);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
      
      // Each part should be 25
      expect(parts).toEqual([25, 25, 25, 25]);
    });
    
    it('should handle splits that are not evenly divisible', () => {
      // Test splitting 101 into 4 parts (25, 25, 25, 26)
      const parts = changeMaker.splitAmount(101, 4, denominations);
      expect(parts).toHaveLength(4);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(101);
      
      // The parts should be close to each other in value
      const min = Math.min(...parts);
      const max = Math.max(...parts);
      expect(max - min).toBeLessThanOrEqual(1);
    });
    
    it('should return null for invalid splits', () => {
      // Can't split into 0 parts
      expect(changeMaker.splitAmount(100, 0, denominations)).toBeNull();
      
      // Can't split into negative parts
      expect(changeMaker.splitAmount(100, -1, denominations)).toBeNull();
    });
    
    it('should handle the case of splitting into 1 part', () => {
      const parts = changeMaker.splitAmount(42, 1, denominations);
      expect(parts).toEqual([42]);
    });
  });
  
  describe('mergeCombinations', () => {
    it('should merge combinations correctly', () => {
      const combination1 = { 1: 1, 2: 1, 4: 1 };
      const combination2 = { 4: 2, 8: 1 };
      const combination3 = { 16: 1, 32: 1 };
      
      const merged = changeMaker.mergeCombinations([combination1, combination2, combination3]);
      
      expect(merged).toEqual({
        1: 1,
        2: 1,
        4: 3,
        8: 1,
        16: 1,
        32: 1
      });
    });
    
    it('should handle empty combinations', () => {
      const merged = changeMaker.mergeCombinations([{}, { 1: 1 }, {}]);
      expect(merged).toEqual({ 1: 1 });
    });
    
    it('should handle an empty array', () => {
      const merged = changeMaker.mergeCombinations([]);
      expect(merged).toEqual({});
    });
  });
});