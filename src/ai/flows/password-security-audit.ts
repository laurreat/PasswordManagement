/**
 * @fileOverview Local password security audit agent.
 * 
 * Implements a deterministic local evaluation with no external API dependencies
 * to ensure total privacy and avoid quota limits.
 * 
 * This function runs 100% in the browser client for complete offline operation.
 */

export type PasswordSecurityAuditInput = {
  password: string;
};

export type PasswordSecurityAuditOutput = {
  isCompromised: boolean;
  isCommon: boolean;
  issueCodes: string[];
};

/**
 * Evaluates password robustness locally in the browser.
 * This is a pure client-side function that requires no server or external APIs.
 */
export async function passwordSecurityAudit(input: PasswordSecurityAuditInput): Promise<PasswordSecurityAuditOutput> {
  const { password } = input;
  const issueCodes: string[] = [];
  
  // 1. Length Analysis
  const isShort = password.length < 12;
  const isVeryShort = password.length < 8;

  // 2. Complexity Analysis
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  
  // 3. Common Pattern Analysis
  const commonPatterns = ['123', 'qwerty', 'abc', 'password', 'admin', '123456', '12345678', 'letmein', 'welcome', 'monkey', 'dragon', 'master', 'sunshine', 'princess', 'football', 'iloveyou'];
  const containsCommonPattern = commonPatterns.some(p => password.toLowerCase().includes(p));
  
  // 4. Sequential patterns (e.g., "abc123", "12345")
  const hasSequential = /(012|123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password);
  
  // 5. Repeated characters (e.g., "aaaa", "1111")
  const hasRepeated = /(.)\1{3,}/.test(password);
  
  // State determination
  const isCommon = isShort || !hasUpper || !hasNumber || !hasSymbol;
  const isCompromised = containsCommonPattern || isVeryShort || hasSequential || hasRepeated;

  if (isShort) {
    issueCodes.push("issue_length");
  }

  if (!hasUpper || !hasLower || !hasNumber) {
    issueCodes.push("issue_complexity");
  }

  if (!hasSymbol) {
    issueCodes.push("issue_symbols");
  }

  if (containsCommonPattern || hasSequential || hasRepeated) {
    issueCodes.push("issue_pattern");
  }

  return {
    isCompromised,
    isCommon,
    issueCodes,
  };
}
