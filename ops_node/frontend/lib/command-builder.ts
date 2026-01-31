/**
 * Command Building Utilities for Frontend
 * 
 * Command Building Logic:
 * 1. StartCharacter - Direct concatenation
 * 2. commandid - Direct concatenation
 * 3. ALL configurable values - Joined with CommandSeparator
 * 4. Add separator at END after last configurable value
 * 5. EndCharacter handling:
 *    - NoComma: Remove trailing separator
 *    - NoComma#: Remove trailing separator, add #
 *    - Any other value: Replace trailing separator with that value
 *    - No EndCharacter: Keep trailing separator
 */

export interface CommandParams {
  command_seprator: string | null;  // Note: typo in DB column name
  command_parameters_json: Array<Record<string, any>> | null;
  command_syntax?: string | null;  // For direct commands without parameters
  command_name?: string | null;    // Fallback for command_syntax
}

/**
 * Build command text from command_parameters_json.
 * 
 * Logic:
 * 1. StartCharacter - Direct concatenation
 * 2. commandid - Direct concatenation
 * 3. ALL configurable values - Joined with CommandSeparator
 * 4. Add separator at END after last value
 * 5. EndCharacter handling
 */
export function buildCommandText(
  params: CommandParams,
  value?: string | string[] | Record<string, string> | null,
  savedValue?: string | null
): string {
  // Get separator (default to comma) - note: typo in DB column name (command_seprator)
  const separator = params.command_seprator || ",";

  // If command_parameters_json exists, use it to build command
  if (params.command_parameters_json && params.command_parameters_json.length > 0) {
    const paramsList = params.command_parameters_json;
    
    // Extract parts by parameter name
    let startCharacter = "";
    let commandId = "";
    let endCharacter = "";
    
    // Track configurable parameters (in order) - ORDER IS CRITICAL for command building
    // CommandParametersJSON is ordered by CommandDetail.ID, and we must preserve this order
    const configurableIndices: number[] = [];
    
    for (let i = 0; i < paramsList.length; i++) {
      const param = paramsList[i];
      if (typeof param !== "object" || param === null) continue;
      
      const paramName = String(param.ParameterName || "").toLowerCase();
      const paramType = String(param.ParameterType || "");
      const defaultValue = param.DefaultValue || "";
      
      if (paramType === "1") {
        // Fixed parameter - extract by name
        if (paramName === "startcharacter") {
          startCharacter = String(defaultValue);
        } else if (paramName === "commandid") {
          commandId = String(defaultValue);
        } else if (paramName === "endcharacter") {
          endCharacter = String(defaultValue);
        }
      } else if (paramType === "2") {
        // Configurable parameter - track index to preserve order from CommandParametersJSON
        configurableIndices.push(i);
      }
    }
    
    // Get ALL values for configurable parameters
    const configurableValues = getConfigurableValues(
      paramsList, configurableIndices, value, savedValue
    );
    
    // Build command:
    // StartCharacter + commandid + configurableValues.join(separator) + separator
    let result = startCharacter + commandId;
    
    if (configurableValues.length > 0) {
      // Join all configurable values with separator
      result += configurableValues.join(separator);
      // Add trailing separator
      result += separator;
    }
    
    // Handle EndCharacter special cases
    if (endCharacter) {
      const endCharLower = endCharacter.toLowerCase().trim();
      if (endCharLower === "nocomma") {
        // Remove last separator
        if (result.endsWith(separator)) {
          result = result.substring(0, result.length - separator.length);
        }
      } else if (endCharLower === "nocomma#") {
        // Remove last separator and add #
        if (result.endsWith(separator)) {
          result = result.substring(0, result.length - separator.length);
        }
        result += "#";
      } else {
        // Replace trailing separator with EndCharacter
        if (result.endsWith(separator)) {
          result = result.substring(0, result.length - separator.length);
        }
        result += endCharacter;
      }
    } else {
      // No EndCharacter - remove trailing separator (matches original backend)
      if (result.endsWith(separator)) {
        result = result.substring(0, result.length - separator.length);
      }
    }
    
    return result.trim();
  }

  // No command_parameters_json - use command_syntax directly (for direct commands)
  // This is how the original system handles commands without parameters
  if (params.command_syntax) {
    return params.command_syntax;
  }
  
  // Fallback to command_name if no syntax available
  if (params.command_name) {
    return params.command_name;
  }

  return "";
}

/**
 * Extract ALL configurable values from user input or saved value.
 * Returns a list of values in order of configurable parameters.
 */
function getConfigurableValues(
  params: Array<Record<string, any>>,
  configurableIndices: number[],
  value: string | string[] | Record<string, string> | null | undefined,
  savedValue: string | null | undefined
): string[] {
  const numConfigurable = configurableIndices.length;
  
  if (numConfigurable === 0) return [];
  
  if (value != null) {
    // User provided value(s)
    if (Array.isArray(value)) {
      // Array: use in order, fill in defaults for missing
      return configurableIndices.map((idx, i) => {
        const param = params[idx];
        return i < value.length ? String(value[i]) : String(param.DefaultValue || "");
      });
    } else if (typeof value === "object") {
      // Object: map by parameter name (case-insensitive)
      return configurableIndices.map(idx => {
        const param = params[idx];
        const paramName = String(param.ParameterName || "").toLowerCase();
        return String(value[paramName] || param.DefaultValue || "");
      });
    } else {
      // Single string value - parse it
      return parseStringValue(String(value), params, configurableIndices);
    }
  } else if (savedValue) {
    // Load from savedValue (JSON array stored)
    return parseStringValue(savedValue, params, configurableIndices);
  } else {
    // Use defaults from parameters
    return configurableIndices.map(idx => String(params[idx].DefaultValue || ""));
  }
}

/**
 * Parse a value string into configurable values.
 * Handles:
 * - JSON array with ParameterID: [{"ParameterID": 123, "Value": "val1"}, ...]
 * - Simple JSON array: ["val1", "val2", "val3"]
 * - Plain string: "val1" (single value for single-param commands)
 * - Comma-separated: "val1,val2,val3" (multiple values for multi-param commands)
 */
function parseStringValue(
  valueStr: string,
  params: Array<Record<string, any>>,
  configurableIndices: number[]
): string[] {
  const numConfigurable = configurableIndices.length;
  
  // First, try to parse as JSON
  try {
    const parsed = JSON.parse(valueStr);
    
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Check if it's the ParameterID format: [{"ParameterID": 123, "Value": "val1"}, ...]
      if (typeof parsed[0] === "object" && parsed[0] !== null && "ParameterID" in parsed[0]) {
        // Build a map by ParameterID for efficient lookup
        const valueMap: Record<number, string> = {};
        parsed.forEach((item: any) => {
          if (typeof item === "object" && item !== null && item.ParameterID !== undefined) {
            valueMap[item.ParameterID] = String(item.Value ?? "");
          }
        });
        
        // Extract values in order of configurable parameters
        return configurableIndices.map((idx) => {
          const param = params[idx];
          const paramId = param.ParameterID;
          if (paramId !== undefined && paramId in valueMap) {
            return valueMap[paramId];
          }
          return String(param.DefaultValue || "");
        });
      }
      
      // Simple array of values: ["val1", "val2", ...]
      return configurableIndices.map((idx, i) => {
        if (i < parsed.length) {
          return String(parsed[i] ?? "");
        }
        return String(params[idx].DefaultValue || "");
      });
    }
    
    // JSON parsed to a scalar (number, boolean, etc.) - use it as single value
    if (typeof parsed !== "object" || parsed === null) {
      // Single value - use it for the first configurable param, defaults for rest
      return configurableIndices.map((idx, i) => {
        if (i === 0) {
          return String(parsed);
        }
        return String(params[idx].DefaultValue || "");
      });
    }
  } catch {
    // Not valid JSON - treat as plain string
  }
  
  // Plain string handling
  // For single-param commands: use the string directly
  // For multi-param commands: try comma-separated (but be careful with values containing commas)
  if (numConfigurable === 1) {
    // Single param: use entire string as the value
    return [valueStr];
  }
  
  // Multi-param: try comma-separated split
  // Note: This is a heuristic - if values contain commas, this won't work correctly
  // The proper format should be JSON array
  const parts = valueStr.split(",");
  return configurableIndices.map((idx, i) => {
    if (i < parts.length) {
      return parts[i].trim();
    }
    return String(params[idx].DefaultValue || "");
  });
}
