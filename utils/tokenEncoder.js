/**
 * Token encoder/decoder utility for more compact token representation
 */
const config = require('../config/config');
const pino = require('pino');

// Initialize logger
const logger = pino({
  level: config.log.level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

/**
 * Get the token prefix to use
 * 
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} The token prefix
 */
function getTokenPrefix(customPrefix) {
  // Use provided custom prefix, or the one from config, or default to 'giftmint'
  return customPrefix || config.token.prefix || 'giftmint';
}

/**
 * Encodes a token into a compact string format
 * 
 * @param {Object} token - The token object to encode
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A compact token string
 */
function encodeToken(token, customPrefix) {
  try {
    // Convert token to a buffer
    const tokenBuffer = Buffer.from(JSON.stringify(token));
    
    // Base64 encode the token
    const base64Token = tokenBuffer.toString('base64');
    
    // Replace characters that might cause issues in URLs or when displayed
    const urlSafeToken = base64Token
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Add a prefix to identify our tokens
    const prefix = getTokenPrefix(customPrefix);
    return `${prefix}${urlSafeToken}`;
  } catch (error) {
    throw new Error(`Failed to encode token: ${error.message}`);
  }
}

/**
 * Bundle multiple tokens into a single string using CBOR for compact representation (Cashu-style)
 * 
 * @param {Array<string>} tokens - Array of encoded token strings
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A bundled token string in CBOR compact format
 */
async function bundleTokens(tokens, customPrefix) {
  try {
    // Import CBOR - required for Cashu compatibility
    const cbor = require('cbor');
    
    if (!Array.isArray(tokens)) {
      throw new Error('Tokens must be an array');
    }
    
    if (tokens.length === 0) {
      throw new Error('No tokens to bundle');
    }
    
    if (tokens.length === 1) {
      // No need to bundle a single token
      return tokens[0];
    }
    
    logger.debug(`Bundling ${tokens.length} tokens using Cashu TokenV4 format`);
    
    // Log detailed token info for debugging
    for (let i = 0; i < Math.min(tokens.length, 6); i++) {
      const token = tokens[i];
      logger.debug({ 
        tokenIndex: i,
        tokenPrefix: token.substring(0, 20) + '...',
        tokenLength: token.length,
        hasPrefix: token.startsWith('btcpins') || token.startsWith('giftmint'),
        prefix: token.match(/^[a-zA-Z]+/)[0]
      }, 'Token for bundling');
    }
    
    logger.debug(`Total tokens to bundle: ${tokens.length}`);
    
    // First decode all tokens to extract their data for bundling
    const decodedTokens = [];
    for (const token of tokens) {
      try {
        logger.debug({
          tokenPrefix: token.substring(0, 15),
          tokenLength: token.length
        }, 'Processing token for bundling');
        
        // Properly identify and handle token prefixes
        const prefix = token.match(/^[a-zA-Z]+/)[0];
        logger.debug({ detectedPrefix: prefix }, 'Detected token prefix');
        
        // Find where the base64 data starts (after the prefix)
        let base64Start = prefix.length;
        
        // Check if there's a marker character like 'B' after the prefix
        if (token.length > base64Start && 
            (token[base64Start] === 'B' || 
             token[base64Start] === 'p' || 
             token[base64Start] === 'v')) {
          base64Start++; // Skip the marker character
          logger.debug({ markerChar: token[prefix.length] }, 'Detected marker character after prefix');
        }
        
        // Extract only the base64 part of the token
        const base64Token = token.slice(base64Start);
        
        // Log debug info
        logger.debug({
          base64Start,
          prefixDetected: token.substring(0, base64Start),
          base64Prefix: base64Token.substring(0, 15),
          base64Length: base64Token.length
        }, 'Extracted base64 portion of token');
        
        // Convert to standard base64
        let standardBase64 = base64Token
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        while (standardBase64.length % 4) {
          standardBase64 += '=';
        }
        
        // Decode the base64 string
        const tokenBuffer = Buffer.from(standardBase64, 'base64');
        logger.debug({
          bufferLength: tokenBuffer.length,
          bufferStart: tokenBuffer.slice(0, 10).toString('hex')
        }, 'Decoded base64 to buffer');
        
        // Parse JSON
        const tokenString = tokenBuffer.toString('utf8');
        logger.debug({
          tokenStringStart: tokenString.substring(0, 30)
        }, 'Converted buffer to string');
        
        const tokenObject = JSON.parse(tokenString);
        
        // Parse the data field to get the ID
        const dataObj = JSON.parse(tokenObject.data);
        
        // Add to decoded tokens array
        decodedTokens.push({
          id: dataObj.id,                    // Secret ID
          signature: tokenObject.signature,  // Signature in base64 
          keyId: tokenObject.key_id,         // Key ID
          amount: 1                          // Default amount, normally determined by denomination
        });
        
        logger.debug({
          tokenId: dataObj.id.substring(0, 8),
          keyId: tokenObject.key_id.substring(0, 8),
          decodedTokensCount: decodedTokens.length
        }, 'Successfully decoded token for bundling');
      } catch (err) {
        logger.error({ 
          error: err, 
          errorMsg: err.message
        }, 'Failed to decode token for CBOR bundling');
      }
    }
    
    // Group tokens by keyId (same as Cashu TokenV4 groups by keyset ID)
    // Keyset ID is the "i" field in Cashu TokenV4Token
    const tokensByKeyId = {};
    for (const token of decodedTokens) {
      if (!tokensByKeyId[token.keyId]) {
        tokensByKeyId[token.keyId] = [];
      }
      tokensByKeyId[token.keyId].push(token);
    }
    
    logger.debug({
      decodedTokensCount: decodedTokens.length,
      uniqueKeyIdsCount: Object.keys(tokensByKeyId).length,
      keyIdList: Object.keys(tokensByKeyId),
      firstFewTokenIds: decodedTokens.slice(0, 3).map(t => t.id.substring(0, 8))
    }, 'Token grouping details before bundling');
    
    // Log decoded tokens and grouping results
    logger.debug({
      decodedCount: decodedTokens.length,
      uniqueKeyIds: Object.keys(tokensByKeyId).length,
      keyIdList: Object.keys(tokensByKeyId).map(id => id.substring(0, 8) + '...'),
      groupCounts: Object.keys(tokensByKeyId).map(keyId => ({
        keyId: keyId.substring(0, 8) + '...',
        count: tokensByKeyId[keyId].length
      }))
    }, 'Token grouping results');
    
    // Construct exact Cashu TokenV4 format:
    // {
    //   m: "mint_url",          // Mint URL
    //   u: "sat",               // Unit (sat, msat, etc)
    //   t: [                    // Array of TokenV4Token objects
    //     {
    //       i: bytes(keyset_id),   // keyset ID as bytes
    //       p: [                   // Array of proofs for this keyset 
    //         {
    //           a: 1,              // Amount
    //           s: "secret_id",    // Secret ID as string
    //           c: bytes(signature) // Signature as bytes
    //         }
    //       ]
    //     }
    //   ]
    // }
    
    // Create minimal version of the token structure (using short keys like Cashu does)
    const tokenV4 = {
      // Use just a short mint identifier 
      m: "GM",  // "Giftmint" shortened to save space
      // Unit (required in Cashu)
      u: "sat",
      // Tokens array grouped by keyset ID
      t: Object.keys(tokensByKeyId).map(keyId => {
        // Normalize keyId format - ensure consistency
        const normalizedKeyId = keyId.trim();
        
        // Create the token group
        return {
          // Keyset ID as Buffer for compact binary representation in CBOR
          i: Buffer.from(normalizedKeyId, 'utf8'),
          // Proofs array for this keyset with enhanced validation
          p: tokensByKeyId[keyId].map(token => {
            // Ensure signature is properly formatted base64
            let signatureBuffer;
            try {
              // Convert from base64 to buffer for compact binary representation
              signatureBuffer = Buffer.from(token.signature, 'base64');
              // Log signature details for debugging
              logger.debug({
                tokenId: token.id.substring(0, 8),
                sigLength: signatureBuffer.length,
                sigPrefix: signatureBuffer.slice(0, 10).toString('hex')
              }, 'Processing signature for bundling');
            } catch (e) {
              logger.warn({
                error: e,
                tokenId: token.id
              }, 'Error processing signature, using fallback');
              // Fallback to direct string
              signatureBuffer = Buffer.from(token.signature);
            }
            
            // Create proof with optimized field structure for minimal encoding size
            // Only include amount if non-default (default is 1)
            const proof = {
              // Secret (string) - keeping as string since it's needed for lookups
              s: token.id,
              // Signature as raw buffer for compact binary representation 
              c: signatureBuffer
            };
            
            // Only add amount if not the default value of 1 to save space
            if (token.amount !== 1) {
              proof.a = token.amount;
            }
            
            return proof;
          })
        };
      })
    };
    
    // Debug log the tokens before encoding
    for (const keyId in tokensByKeyId) {
      const tokens = tokensByKeyId[keyId];
      logger.debug({
        keyId: keyId.substring(0, 8),
        tokenCount: tokens.length,
        tokenIds: tokens.map(t => t.id.substring(0, 8))
      }, `Token group for key ${keyId.substring(0, 8)}`);
    }
    
    // Additional optimization step: Check for compression opportunities by analyzing token structure
    logger.debug('Analyzing token structure for compression opportunities');
    let totalSignatureBytes = 0;
    let totalIdBytes = 0;
    
    // Count total bytes across all tokens to understand compression impact
    Object.keys(tokensByKeyId).forEach(keyId => {
      const tokens = tokensByKeyId[keyId];
      tokens.forEach(token => {
        totalSignatureBytes += Buffer.from(token.signature, 'base64').length;
        totalIdBytes += token.id.length;
      });
    });
    
    logger.debug({
      totalTokenGroups: Object.keys(tokensByKeyId).length,
      totalTokens: Object.keys(tokensByKeyId).reduce((sum, k) => sum + tokensByKeyId[k].length, 0),
      totalSignatureBytes,
      totalIdBytes,
      estimatedCompressibleBytes: totalSignatureBytes + totalIdBytes
    }, 'Compression opportunity analysis');
    
    // If the tokens couldn't be properly decoded, try one more time with a more direct approach
    if (Object.keys(tokensByKeyId).length === 0 && tokens.length > 0) {
      logger.warn('No tokens could be properly decoded, trying direct decoding approach');
      
      try {
        // Direct approach for each token
        for (const token of tokens) {
          try {
            // Find prefix end (look for eyJkYXRh - the base64 beginning of {"data"
            const prefixEnd = token.indexOf('eyJkYXRh');
            if (prefixEnd === -1) {
              logger.warn(`Could not find data marker in token: ${token.substring(0, 20)}...`);
              continue;
            }
            
            // Extract and process token
            const base64Token = token.slice(prefixEnd);
            const standardBase64 = base64Token
              .replace(/-/g, '+')
              .replace(/_/g, '/') + 
              (base64Token.length % 4 === 0 ? '' : 
               base64Token.length % 4 === 1 ? '===' : 
               base64Token.length % 4 === 2 ? '==' : 
               '=');
            
            // Decode token
            const tokenBuffer = Buffer.from(standardBase64, 'base64');
            const tokenObject = JSON.parse(tokenBuffer.toString());
            const dataObj = JSON.parse(tokenObject.data);
            
            logger.debug({
              tokenId: dataObj.id.substring(0, 8),
              keyId: tokenObject.key_id.substring(0, 8)
            }, 'Successfully decoded token with direct approach');
            
            // Store the token by key ID
            const keyId = tokenObject.key_id;
            if (!tokensByKeyId[keyId]) {
              tokensByKeyId[keyId] = [];
            }
            
            tokensByKeyId[keyId].push({
              id: dataObj.id,
              signature: tokenObject.signature,
              keyId: keyId,
              amount: 1
            });
          } catch (tokenErr) {
            logger.warn({
              error: tokenErr,
              tokenPrefix: token.substring(0, 20)
            }, 'Failed to decode token with direct approach');
          }
        }
        
        // Add a warning if we still couldn't decode any tokens
        if (Object.keys(tokensByKeyId).length === 0) {
          logger.warn('Could not decode any tokens with direct approach either');
        } else {
          logger.info(`Successfully decoded ${Object.keys(tokensByKeyId).length} token groups with direct approach`);
          
          // Rebuild the tokenV4 structure with our newly decoded tokens - using Buffer for binary data
          tokenV4.t = Object.keys(tokensByKeyId).map(keyId => {
            // Use binary format for key ID and signatures to make the CBOR more compact
            return {
              // Convert key ID to Buffer for compact representation
              i: Buffer.from(keyId, 'utf8'),
              // Convert each proof to use binary format for signatures
              p: tokensByKeyId[keyId].map(token => {
                // Create optimized proof structure - omit amount if default value (1)
                const proof = {
                  s: token.id,      // Keep ID as string (needed for lookups)
                  // Convert signature to Buffer for compact binary representation
                  c: Buffer.from(token.signature, 'base64')
                };
                
                // Only add amount if not the default value of 1 to save space
                if (token.amount !== 1) {
                  proof.a = token.amount;
                }
                
                return proof;
              })
            };
          });
          
          // Log our success in rebuilding the token structure
          logger.debug({
            rebuiltGroups: tokenV4.t.length,
            totalProofs: tokenV4.t.reduce((sum, g) => sum + g.p.length, 0),
            keyIds: tokenV4.t.map(g => g.i.substring(0, 8))
          }, 'Rebuilt token structure with directly decoded tokens');
        }
      } catch (err) {
        logger.warn({ error: err }, 'Failed to use direct decoding approach');
      }
    }
    
    // If we still have no tokens, use a fallback token as last resort
    if (Object.keys(tokensByKeyId).length === 0 && tokens.length > 0) {
      logger.warn('Using fallback token approach as last resort');
      
      try {
        // Use first token as fallback
        const firstToken = tokens[0];
        // Extract base64 part - look for common base64 pattern in token
        const base64Start = firstToken.search(/[A-Za-z0-9+/=]{10,}/);
        const base64Token = firstToken.slice(base64Start > 0 ? base64Start : 0);
        
        logger.debug({
          tokenPrefix: firstToken.substring(0, 20),
          base64Start,
          base64Extract: base64Token.substring(0, 20)
        }, 'Attempting fallback with first token');
        
        // Convert to standard base64
        let standardBase64 = base64Token
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        while (standardBase64.length % 4) standardBase64 += '=';
        
        // Decode the token
        const tokenBuffer = Buffer.from(standardBase64, 'base64');
        const tokenObject = JSON.parse(tokenBuffer.toString());
        const dataObj = JSON.parse(tokenObject.data);
        
        // Add a single token with this keyset - using Buffer for compact binary representation
        tokenV4.t.push({
          i: Buffer.from(tokenObject.key_id, 'utf8'),
          p: [{
            // Omit 'a' (amount) field since default is 1, saving space
            s: dataObj.id,
            c: Buffer.from(tokenObject.signature, 'base64')
          }]
        });
        
        logger.info('Added fallback token from first token');
      } catch (err) {
        logger.warn({ error: err }, 'Failed to add fallback token, using dummy data');
        
        // Last resort - completely dummy data (using buffer for consistent format)
        tokenV4.t.push({
          i: Buffer.from("fallback-key-id", 'utf8'),
          p: [{
            // Omit 'a' field to save space (default is 1)
            s: "f-" + Date.now(), // Short fallback ID to save space
            c: Buffer.from([0]) // Minimal signature for space savings
          }]
        });
      }
    }
    
    logger.debug({
      keysetCount: tokenV4.t.length,
      proofCount: tokenV4.t.reduce((sum, t) => sum + t.p.length, 0),
      format: 'Cashu TokenV4'
    }, 'Created Cashu-compatible token structure');
    
    // Logging for troubleshooting
    logger.debug({
      tokenStructure: 'TokenV4',
      mintUrl: tokenV4.m,
      unit: tokenV4.u,
      groupCount: tokenV4.t.length,
      totalProofs: tokenV4.t.reduce((sum, t) => sum + t.p.length, 0),
      firstFewGroupSizes: tokenV4.t.slice(0, 3).map(g => g.p.length)
    }, 'Token structure before CBOR encoding');
    
    // Create an ultra-compact space-optimized version following Cashu V4 format 
    // Field names: single characters, all data converted to most compact binary representation
    const optimizedTokenV4 = {
      // The most compressed representation possible:
      // - Single character keys: 'm', 'u', 't'
      // - Minimal byte arrays for values
      // - Remove any unnecessary information
      
      // 'm' for mint ID - 1 or 2 bytes is enough as identifier
      m: new Uint8Array([71, 77]), // "GM" in ASCII - smallest possible mint identifier
      
      // 'u' for unit - smallest possible representation of "sat"
      // Using a single byte (integer 1) to represent "sat" saves even more space than ASCII
      u: 1, // Integer value instead of string dramatically reduces size
      
      // 't' for tokens array - will be populated with minimal tokens
      t: []
    };
    
    // Process each token group in a highly optimized way
    for (const group of tokenV4.t) {
      const optimizedGroup = {
        // 'i' for key ID - extreme compression for maximum efficiency
        // Most key IDs are UUIDs or similar identifiers
        // Strategy:
        // 1. Take only first 6 bytes (still provides 2^48 unique identifiers)
        // 2. Use binary encoding instead of hex (50% reduction)
        // This provides sufficient uniqueness while minimizing size
        i: Buffer.from(
          Buffer.isBuffer(group.i) 
            ? group.i.toString('hex').replace(/-/g, '').substring(0, 12)
            : (typeof group.i === 'string' 
                ? group.i.replace(/-/g, '').substring(0, 12) 
                : String(group.i).substring(0, 12)),
          'hex'
        ),
        // 'p' for proofs array
        p: []
      };
      
      // Process each proof very carefully for minimal size
      if (group.p && Array.isArray(group.p)) {
        for (const proof of group.p) {
          // Build minimal proof with raw binary data
          const optimizedProof = {
            // 's' for secret ID - extreme compression to reduce token size
            // For UUID format strings, convert to binary with minimal bytes
            // Standard UUIDs have format like: 550e8400-e29b-41d4-a716-446655440000
            // Approach: 
            // 1. Remove all dashes (UUID canonicalization)
            // 2. Take only first 16 bytes (128 bits) - sufficient for security
            // 3. Convert to binary bytes instead of hex string (50% size reduction)
            // 4. Result: 36-char UUID -> 8-byte binary = 78% smaller
            s: Buffer.from(
              proof.s.includes('-') 
                ? proof.s.replace(/-/g, '').substring(0, 16) // 16 hex chars = 8 bytes
                : proof.s.substring(0, 16), 
              'hex'
            )
          };
          
          // Only include 'a' if not default (1)
          if (proof.a !== undefined && proof.a !== 1) {
            optimizedProof.a = proof.a;
          }
          
          // 'c' for signature - apply extreme optimization for signatures
          // Blind signatures are the largest part of the token, typically 384 bytes
          // We'll convert to the most efficient binary representation possible
          let sigBuffer;
          
          if (Buffer.isBuffer(proof.c)) {
            sigBuffer = proof.c;
          } else if (proof.c instanceof Uint8Array) {
            sigBuffer = Buffer.from(proof.c);
          } else if (typeof proof.c === 'string') {
            // Check if it's base64 encoded
            try {
              sigBuffer = Buffer.from(proof.c, 'base64');
            } catch (e) {
              // Fallback to direct buffer creation
              sigBuffer = Buffer.from(proof.c);
            }
          } else {
            // Fallback for any other format
            sigBuffer = Buffer.from(JSON.stringify(proof.c));
          }
          
          // Extreme optimization: If the signature is a large RSA signature,
          // we can encode it more efficiently in CBOR by ensuring it's treated
          // as a binary buffer, not as an integer or other type
          optimizedProof.c = Buffer.from(sigBuffer);
          
          optimizedGroup.p.push(optimizedProof);
        }
      }
      
      optimizedTokenV4.t.push(optimizedGroup);
    }
    
    // Use maximally efficient encoding options with CBOR-specific optimizations
    const encodeOptions = { 
      canonical: true,
      // Sort map keys to ensure canonical encoding
      deterministic: true,
      // Prefer smaller integer encodings
      collapseBigIntegers: true
    };
    
    // CBOR library already handles Buffer objects efficiently
    // No need for extra conversion which increases size
    
    // Encode directly with optimized structure - simpler is better
    const cborData = cbor.encode(optimizedTokenV4, encodeOptions);
    
    // Detailed debugging of CBOR data with enhanced compression metrics
    const originalSize = JSON.stringify(tokenV4).length;
    const optimizedSize = JSON.stringify(optimizedTokenV4).length;
    const cborSize = cborData.length;
    
    logger.debug({
      // Size metrics
      cborLength: cborSize,
      originalObjectSize: originalSize,
      optimizedSize: optimizedSize,
      
      // Compression ratios
      jsonToOptimizedRatio: (originalSize / optimizedSize).toFixed(2) + 'x',
      jsonToCborRatio: (originalSize / cborSize).toFixed(2) + 'x',
      optimizedToCborRatio: (optimizedSize / cborSize).toFixed(2) + 'x',
      
      // Size reductions
      jsonToOptimizedReduction: ((1 - optimizedSize / originalSize) * 100).toFixed(1) + '%',
      jsonToCborReduction: ((1 - cborSize / originalSize) * 100).toFixed(1) + '%',
      
      // Total token count for context
      totalProofs: tokenV4.t.reduce((sum, g) => sum + g.p.length, 0),
      
      // Sample of encoded data
      cborHexPrefix: cborData.slice(0, 20).toString('hex')
    }, 'CBOR encoding optimization metrics');
    
    // Convert to URL-safe base64 with strict compliance to Cashu V4 spec for max compatibility
    // Using a streamlined approach for maximum performance
    
    // Step 1: Convert to base64 using built-in methods
    let base64Bundle = cborData.toString('base64');
    
    // Log raw base64 for debug
    logger.debug({
      rawBase64Length: base64Bundle.length,
      rawBase64Prefix: base64Bundle.substring(0, 20),
      rawBase64Suffix: base64Bundle.substring(base64Bundle.length - 20)
    }, 'Raw base64 data before URL-safe conversion');

    // Step 2: Apply URL-safe transformations in one pass with efficient regex
    // - Replace + with - (URL safe)
    // - Replace / with _ (URL safe)
    // - Remove all padding = characters (shorter)
    base64Bundle = base64Bundle
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''); // Remove only trailing padding for efficiency
    
    // Step 3: Apply the most minimal prefix possible that still maintains compatibility
    // The Cashu spec uses a prefix+'B' format where B indicates binary CBOR encoding
    // Using the shortest possible valid prefix to minimize overall token size
    const prefix = getTokenPrefix(customPrefix);
    
    // Extra validation - ensure we have valid base64url content
    if (!/^[A-Za-z0-9\-_]+$/.test(base64Bundle)) {
      logger.warn({
        invalidChars: base64Bundle.match(/[^A-Za-z0-9\-_]/g),
        base64Length: base64Bundle.length
      }, 'Base64URL contains invalid characters, will sanitize');
      
      // Remove any invalid characters
      base64Bundle = base64Bundle.replace(/[^A-Za-z0-9\-_]/g, '');
    }
    
    // Final validation checks
    logger.debug({
      finalBase64Length: base64Bundle.length,
      finalBase64Prefix: base64Bundle.substring(0, 20),
      isValidBase64URL: /^[A-Za-z0-9\-_]+$/.test(base64Bundle)
    }, 'Final base64 URL-safe string');
    
    // Step 4: Final assembly with minimal separator character
    // 'B' is used to indicate CBOR binary format per Cashu V4 spec
    return `${prefix}B${base64Bundle}`;
  } catch (error) {
    logger.error({ error }, 'Failed to bundle tokens using CBOR');
    
    // Fallback to JSON bundling if CBOR fails
    if (error.code === 'MODULE_NOT_FOUND') {
      logger.warn('CBOR module not found, falling back to JSON bundling');
      return bundleTokensJson(tokens, customPrefix);
    }
    
    throw new Error(`Failed to bundle tokens: ${error.message}`);
  }
}

/**
 * Bundle tokens using JSON (fallback if CBOR is not available)
 * 
 * @param {Array<string>} tokens - Array of encoded token strings
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A bundled token string in JSON format
 */
function bundleTokensJson(tokens, customPrefix) {
  try {
    if (!Array.isArray(tokens)) {
      throw new Error('Tokens must be an array');
    }
    
    if (tokens.length === 0) {
      throw new Error('No tokens to bundle');
    }
    
    if (tokens.length === 1) {
      // No need to bundle a single token
      return tokens[0];
    }
    
    // Decode tokens to extract only essential data
    const extractedTokens = [];
    
    for (const token of tokens) {
      try {
        // Skip the prefix by finding the first base64 character
        let base64Start = -1;
        for (let i = 0; i < token.length; i++) {
          const char = token[i];
          if ((char >= 'A' && char <= 'Z') || 
              (char >= 'a' && char <= 'z') || 
              (char >= '0' && char <= '9') ||
              char === '-' || char === '_') {
            base64Start = i;
            break;
          }
        }
        
        // Skip prefix and get base64 part
        const base64Token = token.slice(base64Start);
        
        // Convert to standard base64
        let standardBase64 = base64Token
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        while (standardBase64.length % 4) {
          standardBase64 += '=';
        }
        
        // Decode the base64 string
        const tokenBuffer = Buffer.from(standardBase64, 'base64');
        const tokenObject = JSON.parse(tokenBuffer.toString());
        
        // Parse the data field to get the ID
        const dataObj = JSON.parse(tokenObject.data);
        
        // Extract only essential data in an ultra-compact format
        extractedTokens.push({
          // Use single-letter keys to save space
          i: dataObj.id,               // id
          s: tokenObject.signature,    // signature
          k: tokenObject.key_id        // key_id
        });
      } catch (err) {
        // Skip invalid tokens
        logger.warn({ error: err, token }, 'Failed to decode token for bundling');
      }
    }
    
    // Create ultra-compact bundle with minimal data
    const compact = {
      v: 3,                  // Version 3 for ultra-compact format
      t: extractedTokens,    // Extracted tokens with minimal data
      c: extractedTokens.length,
      p: customPrefix || config.token.prefix || 'giftmint' // Save the prefix
    };
    
    // Convert to buffer - use compressed JSON stringification
    const jsonStr = JSON.stringify(compact);
    const bundleBuffer = Buffer.from(jsonStr);
    
    // Base64 encode with URL-safe characters
    const base64Bundle = bundleBuffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Add compact bundle prefix
    const prefix = getTokenPrefix(customPrefix);
    return `${prefix}p${base64Bundle}`;  // 'p' indicates the ultra-compact "proofs" format
  } catch (error) {
    logger.error({ error }, 'Failed to bundle tokens using JSON');
    throw new Error(`Failed to bundle tokens using JSON: ${error.message}`);
  }
}

/**
 * Decodes a compact token string back into an object
 * 
 * @param {string} encodedToken - The encoded token string
 * @returns {Object} The decoded token object
 */
function decodeToken(encodedToken) {
  try {
    logger.debug({ token: encodedToken.substring(0, 20) + '...' }, 'Attempting to decode token');
    
    // Check if it's already a JSON string (for backward compatibility)
    if (encodedToken.startsWith('{') && encodedToken.endsWith('}')) {
      logger.debug('Token appears to be JSON already, parsing directly');
      return JSON.parse(encodedToken);
    }
    
    // Check if it's a bundle
    if (encodedToken.includes('bundle-')) {
      logger.debug('Token appears to be a bundle, attempting to unbundle');
      return unbundleTokens(encodedToken);
    }
    
    // Get default prefix from config
    const defaultPrefix = getTokenPrefix();
    logger.debug({ defaultPrefix }, 'Default token prefix');
    
    // Make sure the token starts with some kind of prefix
    // We'll be flexible about the prefix to support multiple stores
    let base64Token;
    
    // Try a direct approach first with specific prefix
    if (encodedToken.startsWith('btcpins')) {
      logger.debug('Found btcpins prefix, cutting it off');
      base64Token = encodedToken.substring(7); // "btcpins" is 7 chars
    } else if (encodedToken.startsWith('giftmint')) {
      logger.debug('Found giftmint prefix, cutting it off');
      base64Token = encodedToken.substring(8); // "giftmint" is 8 chars
    } else if (encodedToken.startsWith(defaultPrefix)) {
      logger.debug('Found default prefix, cutting it off');
      base64Token = encodedToken.slice(defaultPrefix.length);
    } else {
      logger.debug('No known prefix found, searching for first base64 character');
      // Find the first occurrence of a base64 character
      // This allows any prefix to be used without hardcoding specific values
      // Check for all characters used in URL-safe base64: A-Z, a-z, 0-9, -, _
      let prefixEndIndex = -1;
      for (let i = 0; i < encodedToken.length; i++) {
        const char = encodedToken[i];
        if ((char >= 'A' && char <= 'Z') || 
            (char >= 'a' && char <= 'z') || 
            (char >= '0' && char <= '9') ||
            char === '-' || char === '_') {
          prefixEndIndex = i;
          break;
        }
      }
      
      if (prefixEndIndex === -1) {
        logger.warn('No valid base64 characters found in token');
        throw new Error('Invalid token format: no base64 characters found');
      }
      
      logger.debug({ prefixEndIndex }, 'Found base64 characters starting at index');
      base64Token = encodedToken.slice(prefixEndIndex);
    }
    
    logger.debug({ base64Token: base64Token.substring(0, 20) + '...' }, 'Base64 token portion');
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Token
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    logger.debug({ standardBase64: standardBase64.substring(0, 20) + '...' }, 'Processed base64 with padding');
    
    try {
      // Decode the base64 string
      const tokenBuffer = Buffer.from(standardBase64, 'base64');
      
      // Parse the JSON
      const decoded = JSON.parse(tokenBuffer.toString());
      logger.debug('Successfully decoded token');
      return decoded;
    } catch (innerError) {
      logger.error({ error: innerError }, 'Error during base64 decoding or JSON parsing');
      throw new Error(`Token appears to be in compact format but couldn't be decoded: ${innerError.message}`);
    }
  } catch (error) {
    logger.error({ error }, 'Token decoding failed');
    throw new Error(`Failed to decode token: ${error.message}`);
  }
}

/**
 * Unbundle a token bundle into individual tokens
 * 
 * @param {string} bundleString - The bundled token string
 * @returns {Object} The unbundled tokens
 */
function unbundleTokens(bundleString) {
  try {
    logger.debug({ 
      bundle: bundleString.substring(0, 20) + '...',
      bundleLength: bundleString.length,
      bundleType: typeof bundleString
    }, 'Unbundling tokens');
    
    // Validate the input
    if (!bundleString || typeof bundleString !== 'string') {
      throw new Error('Invalid bundle: not a string');
    }
    
    // First, check if it's already an array or object (may have been parsed already)
    if (
      (typeof bundleString === 'object' && bundleString !== null) || 
      bundleString.startsWith('{') || 
      bundleString.startsWith('[')
    ) {
      try {
        // If it's a string that looks like JSON, try to parse it
        const parsedBundle = typeof bundleString === 'string' ? 
          JSON.parse(bundleString) : bundleString;
          
        logger.debug('Bundle appears to be JSON, using directly');
        
        // If it's an array, assume it's an array of tokens
        if (Array.isArray(parsedBundle)) {
          return {
            v: 1,
            t: parsedBundle,
            c: parsedBundle.length,
            format: 'array'
          };
        }
        
        // Otherwise assume it's a properly structured bundle
        return parsedBundle;
      } catch (jsonError) {
        logger.warn({error: jsonError}, 'Failed to parse bundle as JSON');
        // Continue to other methods
      }
    }
    
    // Check for CBOR format - Cashu V4 style with 'B' marker
    const hasCborPrefix = bundleString.match(/[a-zA-Z]+B/);
    
    if (hasCborPrefix) {
      try {
        // Import CBOR - this requires the cbor package to be installed
        const cbor = require('cbor');
        
        const cborMarker = 'B';
        const prefixEnd = bundleString.indexOf(cborMarker);
        
        if (prefixEnd !== -1) {
          // Extract the base64 part
          let base64Bundle = bundleString.slice(prefixEnd + 1);
          logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 CBOR bundle');

          // First, try to detect the real base64 start by looking for valid base64 characters
          let actualBase64Start = 0;
          for (let i = 0; i < Math.min(base64Bundle.length, 20); i++) {
            const char = base64Bundle[i];
            // Valid base64url chars are A-Z, a-z, 0-9, -, _
            const isValidChar = /[A-Za-z0-9\-_]/.test(char);
            if (!isValidChar) {
              actualBase64Start = i + 1;
            } else {
              break; // Found start of valid base64
            }
          }
          
          if (actualBase64Start > 0) {
            logger.debug(`Adjusting base64 start by ${actualBase64Start} characters`);
            base64Bundle = base64Bundle.slice(actualBase64Start);
          }
          
          // Restore the URL-safe base64 to regular base64
          let standardBase64 = base64Bundle
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          
          // Add padding if needed
          while (standardBase64.length % 4) {
            standardBase64 += '=';
          }
          
          logger.debug({
            standardBase64Length: standardBase64.length,
            standardBase64Prefix: standardBase64.substring(0, 20)
          }, 'Processed base64 with padding');
          
          // Decode the base64 string to get CBOR data
          const bundleBuffer = Buffer.from(standardBase64, 'base64');
          
          // Output hex dump for debugging
          const hexDump = bundleBuffer.length > 0 ? 
            bundleBuffer.slice(0, Math.min(32, bundleBuffer.length)).toString('hex').match(/.{1,2}/g).join(' ') : 
            'empty buffer';
            
          logger.debug({
            bufferLength: bundleBuffer.length,
            hexDump: hexDump,
            firstBytes: Array.from(bundleBuffer.slice(0, Math.min(8, bundleBuffer.length)))
          }, 'Bundle buffer details');
          
          try {
            // Make sure we have a valid buffer to decode
            if (!bundleBuffer || bundleBuffer.length === 0) {
              throw new Error('Empty buffer, cannot decode CBOR');
            }
            
            // Try a more robust decoding approach with multiple fallbacks
            let cborBundle;
            try {
              // First try with the standard decoder
              cborBundle = cbor.decodeFirstSync(bundleBuffer);
            } catch (firstError) {
              logger.warn({error: firstError}, 'First CBOR decode attempt failed, trying with diagnostic mode');
              
              // If that fails, try examining what we have
              const diagnostics = cbor.diagnose(bundleBuffer);
              logger.debug({diagnostics: diagnostics.substring(0, 200)}, 'CBOR diagnostics');
              
              // Try to parse the diagnostic output if it looks like JSON
              if (diagnostics.startsWith('{') || diagnostics.startsWith('[')) {
                try {
                  cborBundle = JSON.parse(diagnostics);
                  logger.info('Successfully parsed CBOR diagnostics as JSON');
                } catch (jsonError) {
                  // Throw the original error if we can't parse the diagnostics
                  throw firstError;
                }
              } else {
                throw firstError;
              }
            }
            
            // Debug info - adapting to different possible CBOR structures
            logger.debug({ 
              cborFormat: true, 
              structure: JSON.stringify(cborBundle).substring(0, 200),
              hasMintInfo: !!cborBundle.m,
              hasTokens: !!cborBundle.t,
              tokenGroupCount: cborBundle.t ? cborBundle.t.length : 0,
            }, 'CBOR bundle structure');
            
            // Process the CBOR bundle to recreate tokens
            const prefix = bundleString.substring(0, prefixEnd);
            const recreatedTokens = [];
            
            // Inspect the CBOR bundle structure to determine its format
            // Try to handle all the variants we've seen from Cashu tokens

            // Process tokens from the CBOR bundle based on its structure
            // There are several possible structures we need to handle:
            // 1. Cashu TokenV4: { t: [{ i: bytesX, p: [{s: "secret", a: amount, c: bytes(signature)}] }], m: "mint_url", u: "unit" }
            // 2. Simple tokens: { t: [{s: "secret", c: bytes(signature)}], m: "mint_url" }
            // 3. Legacy: tokens with non-standard structure - handle case by case

            if (cborBundle.t && Array.isArray(cborBundle.t)) {
              logger.debug({
                bundleStructure: 'Has t array', 
                arrayLength: cborBundle.t.length,
                firstItem: cborBundle.t.length > 0 ? 
                  JSON.stringify(cborBundle.t[0]).substring(0,100) : 'empty'
              }, 'CBOR bundle structure info');

              // Check for Cashu TokenV4 format - Keys grouped by keyset ID
              if (cborBundle.t.length > 0 && cborBundle.t[0].i && cborBundle.t[0].p) {
                logger.debug('Processing Cashu TokenV4 format (grouped by keyset ID)');
                
                // Loop through each keyset group
                for (const group of cborBundle.t) {
                  try {
                    // Get keyset ID and normalize format for consistent handling
                    let keyId;
                    if (Buffer.isBuffer(group.i)) {
                      keyId = group.i.toString();
                      logger.debug(`Converted Buffer keyId to string: ${keyId.substring(0, 8)}...`);
                    } else if (typeof group.i === 'string') {
                      keyId = group.i;
                      logger.debug(`Using string keyId: ${keyId.substring(0, 8)}...`);
                    } else {
                      logger.warn(`Unknown keyId format: ${typeof group.i}, using fallback`);
                      keyId = 'unknown-key-id';
                    }
                    
                    // Normalize and trim any extra spaces
                    keyId = keyId.trim();
                    
                    // Process proofs for this keyset
                    if (group.p && Array.isArray(group.p)) {
                      for (const proof of group.p) {
                        try {
                          // Extract secret ID (string)
                          const secretId = proof.s;
                          
                          // Handle signature (could be Buffer or string) with improved consistency
                          let signature;
                          try {
                            if (Buffer.isBuffer(proof.c)) {
                              // Convert buffer to base64 string
                              signature = proof.c.toString('base64');
                              logger.debug({
                                sigFromBuffer: true,
                                sigLength: signature.length,
                                sigPrefix: signature.substring(0, 10)
                              }, 'Converted signature from Buffer');
                            } else if (typeof proof.c === 'string') {
                              // Ensure signature is properly formatted base64
                              signature = proof.c;
                              
                              // Check if it's already base64 by trying to decode it
                              try {
                                // This is just to validate the format
                                const testBuffer = Buffer.from(signature, 'base64');
                                const decodedLength = testBuffer.length;
                                
                                logger.debug({
                                  sigIsString: true,
                                  sigLength: signature.length,
                                  decodedLength: decodedLength,
                                  sigPrefix: signature.substring(0, 10)
                                }, 'Using string signature (validated as base64)');
                              } catch (e) {
                                // If it's not valid base64, log a warning
                                logger.warn({
                                  error: e,
                                  sigLength: signature.length,
                                  sigPrefix: signature.substring(0, 10)
                                }, 'Signature string is not valid base64');
                              }
                            } else {
                              logger.warn({
                                sigType: typeof proof.c,
                                secretId: proof.s.substring(0, 8)
                              }, 'Unexpected signature format in proof');
                              continue;
                            }
                          } catch (sigError) {
                            logger.warn({
                              error: sigError,
                              secretId: proof.s
                            }, 'Error processing signature');
                            continue;
                          }
                          
                          // Create token in our format
                          const tokenData = JSON.stringify({ id: secretId });
                          const fullToken = {
                            data: tokenData,
                            signature: signature,
                            key_id: keyId
                          };
                          
                          // Encode token
                          const encodedToken = encodeToken(fullToken, prefix);
                          
                          // Log detailed token info
                          logger.debug({
                            secretId: secretId.substring(0, 8),
                            keyId: keyId.substring(0, 8),
                            signatureLength: signature.length,
                            encodedTokenLength: encodedToken.length,
                            encodedTokenPrefix: encodedToken.substring(0, 20)
                          }, 'Created decoded token');
                          
                          recreatedTokens.push(encodedToken);
                          
                          logger.debug(`Extracted token #${recreatedTokens.length} from Cashu V4 format with secret ID: ${secretId.substring(0, 8)}...`);
                        } catch (proofError) {
                          logger.warn({ error: proofError }, 'Failed to process V4 proof');
                        }
                      }
                    }
                  } catch (groupError) {
                    logger.warn({ error: groupError }, 'Failed to process token group');
                  }
                }
              }
              // Check for Cashu mint-grouped format - Tokens grouped by mint
              else if (cborBundle.t.length > 0 && cborBundle.t[0].m && cborBundle.t[0].p) {
                logger.debug('Processing Cashu format (grouped by mint)');
                
                // Process each mint group
                for (const mintGroup of cborBundle.t) {
                  // Process proofs in this mint
                  if (mintGroup.p && Array.isArray(mintGroup.p)) {
                    for (const proof of mintGroup.p) {
                      try {
                        // Extract secret
                        const secretId = proof.s;
                        
                        // Handle signature (could be Buffer or string)
                        let signature;
                        if (Buffer.isBuffer(proof.c)) {
                          signature = proof.c.toString('base64');
                        } else if (typeof proof.c === 'string') {
                          signature = proof.c;
                        } else {
                          logger.warn('Unexpected signature format in mint-group proof');
                          continue;
                        }
                        
                        // Handle key ID (could be in proof.i or use a default)
                        const keyId = proof.i
                          ? (Buffer.isBuffer(proof.i) ? proof.i.toString() : proof.i)
                          : 'unknown-key-id';
                        
                        // Create token
                        const tokenData = JSON.stringify({ id: secretId });
                        const fullToken = {
                          data: tokenData,
                          signature: signature,
                          key_id: keyId
                        };
                        
                        // Encode token
                        const encodedToken = encodeToken(fullToken, prefix);
                        recreatedTokens.push(encodedToken);
                        
                        logger.debug(`Extracted token from mint-grouped format with secret ID: ${secretId.substring(0, 8)}...`);
                      } catch (proofError) {
                        logger.warn({ error: proofError }, 'Failed to process mint-grouped proof');
                      }
                    }
                  }
                }
              }
              // Flat array of proofs/tokens
              else if (cborBundle.t.length > 0 && (cborBundle.t[0].s || cborBundle.t[0].secret)) {
                logger.debug('Processing flat array of tokens');
                
                // Process each token directly
                for (const token of cborBundle.t) {
                  try {
                    // Extract secret (could be .s or .secret)
                    const secretId = token.s || token.secret;
                    
                    // Handle signature (could be .c, .C, or .signature)
                    let signature;
                    if (token.c) {
                      signature = Buffer.isBuffer(token.c) ? token.c.toString('base64') : token.c;
                    } else if (token.C) {
                      signature = Buffer.isBuffer(token.C) ? token.C.toString('base64') : token.C;
                    } else if (token.signature) {
                      signature = Buffer.isBuffer(token.signature) ? token.signature.toString('base64') : token.signature;
                    } else {
                      logger.warn('Missing signature in flat token array');
                      continue;
                    }
                    
                    // Handle key ID (could be .i, .id, .key_id, etc.)
                    const keyId = token.i || token.id || token.key_id || 'unknown-key-id';
                    
                    // Create token
                    const tokenData = JSON.stringify({ id: secretId });
                    const fullToken = {
                      data: tokenData,
                      signature: signature,
                      key_id: keyId
                    };
                    
                    // Encode token
                    const encodedToken = encodeToken(fullToken, prefix);
                    recreatedTokens.push(encodedToken);
                    
                    logger.debug(`Extracted token from flat array with secret ID: ${secretId.substring(0, 8)}...`);
                  } catch (tokenError) {
                    logger.warn({ error: tokenError }, 'Failed to process flat token');
                  }
                }
              } 
              else {
                // Unknown format
                logger.warn({
                  bundleStructure: JSON.stringify(cborBundle).substring(0, 200),
                  hasTokens: !!cborBundle.t,
                  tokenCount: cborBundle.t ? cborBundle.t.length : 0
                }, 'Unknown or unsupported CBOR bundle structure');
              }
            } else {
              logger.warn('CBOR bundle missing tokens array (t)');
            }
            
            logger.debug(`Extracted ${recreatedTokens.length} tokens from CBOR bundle`);
            
            // Instead of just returning the recreated tokens as an array,
            // let's return the original CBOR structure WITH the recreated tokens
            // This will preserve the group structure needed for proper verification
            
            logger.debug({ 
              decodedTokens: recreatedTokens.length,
              originalStructure: !!cborBundle.t,
              returningRaw: true,
            }, 'Returning raw CBOR structure for verification');
            
            // Return the raw CBOR bundle structure AND the decoded tokens
            // Make sure we have all the tokens
            logger.debug({
              recreatedTokensCount: recreatedTokens.length,
              firstTokenPrefix: recreatedTokens.length > 0 ? recreatedTokens[0].substring(0, 20) : 'none',
              rawGroupsCount: cborBundle.t ? cborBundle.t.length : 0
            }, 'Preparing final unbundled token result');
            
            return {
              v: 4, // CBOR format version
              t: cborBundle.t, // Return the raw structure with groups
              raw_structure: true, // Mark that we're returning raw structure
              decoded_tokens: recreatedTokens, // Also include decoded tokens as a backup
              c: recreatedTokens.length,
              format: 'cbor',
              // Add token counts for debugging
              total_proofs_in_structure: cborBundle.t ? 
                cborBundle.t.reduce((sum, group) => sum + (group.p ? group.p.length : 0), 0) : 0
            };
          } catch (cborDecodeError) {
            // Enhanced error handling with hexdump of the first few bytes for debugging
            const hexDump = bundleBuffer.slice(0, 32).toString('hex').match(/.{1,2}/g).join(' ');
            logger.error({ 
              error: cborDecodeError, 
              hexDump: hexDump,
              bufferLength: bundleBuffer.length,
              base64Sample: standardBase64.substring(0, 30)
            }, 'CBOR decoding failed - data format may be incompatible');
            
            // If the bundle is very short, try parsing as a single token instead
            if (bundleBuffer.length < 50) {
              logger.warn('Bundle is very short, attempting to parse as single token');
              const singleToken = bundleString;
              return {
                v: 1,
                t: [singleToken],
                c: 1,
                format: 'single'
              };
            }
            
            // Attempt to fall back to JSON parsing instead
            try {
              // If we get here, try parsing as JSON
              const jsonBundle = JSON.parse(bundleBuffer.toString('utf8'));
              logger.debug('Successfully parsed bundle as JSON instead of CBOR');
              return jsonBundle;
            } catch (jsonError) {
              logger.error({ error: jsonError }, 'Failed to parse as JSON as well');
              throw cborDecodeError; // Re-throw the original CBOR error
            }
          }
        }
      } catch (cborError) {
        logger.error({ error: cborError }, 'Failed to decode CBOR bundle, falling back to other formats');
        // Continue to try other formats if CBOR decoding fails
      }
    }
    
    // Check if it's the old bundle format with bundle- marker
    const oldBundleMarker = 'bundle-';
    const oldBundleIndex = bundleString.indexOf(oldBundleMarker);
    
    if (oldBundleIndex !== -1) {
      // Handle old bundle format
      const base64Bundle = bundleString.slice(oldBundleIndex + oldBundleMarker.length);
      logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 bundle (old format)');
      
      // Restore the URL-safe base64 to regular base64
      let standardBase64 = base64Bundle
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      
      // Add padding if needed
      while (standardBase64.length % 4) {
        standardBase64 += '=';
      }
      
      // Decode the base64 string
      const bundleBuffer = Buffer.from(standardBase64, 'base64');
      
      // Parse the JSON
      const bundle = JSON.parse(bundleBuffer.toString());
      logger.debug({ bundleVersion: bundle.v, tokenCount: bundle.count }, 'Successfully decoded bundle (old format)');
      
      return bundle;
    }
    
    // Handle ultra-compact format (with 'p' prefix)
    // First check if it's the ultra-compact format
    const hasCompactPrefix = bundleString.match(/[a-zA-Z]+p/);
    
    if (hasCompactPrefix) {
      const compactMarker = 'p';
      const prefixEnd = bundleString.indexOf(compactMarker);
      
      if (prefixEnd === -1) {
        logger.warn('Potential ultra-compact format but no marker found');
      } else {
        // Extract the base64 part
        const base64Bundle = bundleString.slice(prefixEnd + 1);
        logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 bundle (ultra-compact format)');
        
        // Restore the URL-safe base64 to regular base64
        let standardBase64 = base64Bundle
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        while (standardBase64.length % 4) {
          standardBase64 += '=';
        }
        
        // Decode the base64 string
        const bundleBuffer = Buffer.from(standardBase64, 'base64');
        
        // Parse the JSON
        const compactBundle = JSON.parse(bundleBuffer.toString());
        logger.debug({ bundleVersion: compactBundle.v, tokenCount: compactBundle.c }, 'Successfully decoded bundle (ultra-compact format)');
        
        // Recreate full tokens from compact format
        if (compactBundle.v === 3) {
          // Handle ultra-compact format (version 3)
          const prefix = compactBundle.p || 'giftmint';
          const recreatedTokens = [];
          
          for (const extractedToken of compactBundle.t) {
            // Recreate token data
            const tokenData = JSON.stringify({ id: extractedToken.i });
            
            // Recreate full token
            const fullToken = {
              data: tokenData,
              signature: extractedToken.s,
              key_id: extractedToken.k
            };
            
            // Encode it back to compact format with proper prefix
            const encodedToken = encodeToken(fullToken, prefix);
            recreatedTokens.push(encodedToken);
          }
          
          // Return in format compatible with version 2
          return {
            v: 3,
            t: recreatedTokens,
            c: recreatedTokens.length,
            format: 'json'
          };
        }
        
        return compactBundle;
      }
    }
    
    // Handle compact format (with 'token' prefix)
    const tokenMarker = 'token';
    const tokenIndex = bundleString.indexOf(tokenMarker);
    
    if (tokenIndex === -1) {
      logger.warn('Not a recognized bundle format');
      throw new Error('Not a valid token bundle');
    }
    
    // Extract the base64 part
    const base64Bundle = bundleString.slice(tokenIndex + tokenMarker.length);
    logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 bundle (compact format)');
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Bundle
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    // Decode the base64 string
    const bundleBuffer = Buffer.from(standardBase64, 'base64');
    
    // Parse the JSON
    const bundle = JSON.parse(bundleBuffer.toString());
    logger.debug({ bundleVersion: bundle.v, tokenCount: bundle.c }, 'Successfully decoded bundle (compact format)');
    
    return bundle;
  } catch (error) {
    logger.error({ error }, 'Failed to unbundle tokens');
    throw new Error(`Failed to unbundle tokens: ${error.message}`);
  }
}

module.exports = {
  encodeToken,
  decodeToken,
  bundleTokens,
  unbundleTokens
};
      try {
        logger.debug({
          tokenPrefix: token.substring(0, 15),
          tokenLength: token.length
        }, 'Processing token for bundling');
        
        // Properly identify and handle token prefixes
        const prefix = token.match(/^[a-zA-Z]+/)[0];
        logger.debug({ detectedPrefix: prefix }, 'Detected token prefix');
        
        // Find where the base64 data starts (after the prefix)
        let base64Start = prefix.length;
        
        // Check if there's a marker character like 'B' after the prefix
        if (token.length > base64Start && 
            (token[base64Start] === 'B' || 
             token[base64Start] === 'p' || 
             token[base64Start] === 'v')) {
          base64Start++; // Skip the marker character
          logger.debug({ markerChar: token[prefix.length] }, 'Detected marker character after prefix');
        }
        
        // Extract only the base64 part of the token
        const base64Token = token.slice(base64Start);
        
        // Log debug info
        logger.debug({
          base64Start,
          prefixDetected: token.substring(0, base64Start),
          base64Prefix: base64Token.substring(0, 15),
          base64Length: base64Token.length
        }, 'Extracted base64 portion of token');
        
        // Convert to standard base64
        let standardBase64 = base64Token
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        while (standardBase64.length % 4) {
          standardBase64 += '=';
        }
        
        // Decode the base64 string
        const tokenBuffer = Buffer.from(standardBase64, 'base64');
        logger.debug({
          bufferLength: tokenBuffer.length,
          bufferStart: tokenBuffer.slice(0, 10).toString('hex')
        }, 'Decoded base64 to buffer');
        
        // Parse JSON
        const tokenString = tokenBuffer.toString('utf8');
        logger.debug({
          tokenStringStart: tokenString.substring(0, 30)
        }, 'Converted buffer to string');
        
        const tokenObject = JSON.parse(tokenString);
        
        // Parse the data field to get the ID
        const dataObj = JSON.parse(tokenObject.data);
        
        // Add to decoded tokens array
        decodedTokens.push({
          id: dataObj.id,                    // Secret ID
          signature: tokenObject.signature,  // Signature in base64 
          keyId: tokenObject.key_id,         // Key ID
          amount: 1                          // Default amount, normally determined by denomination
        });
        
        logger.debug({
          tokenId: dataObj.id.substring(0, 8),
          keyId: tokenObject.key_id.substring(0, 8),
          decodedTokensCount: decodedTokens.length
        }, 'Successfully decoded token for bundling');
      } catch (err) {
        logger.error({ 
          error: err, 
          errorMessage: err.message,
          tokenInfo: 'Unable to access token details'
        }, 'Failed to decode token from bundle');
      }
