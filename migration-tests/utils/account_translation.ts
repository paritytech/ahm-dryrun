import {
  SOV_TRANSLATIONS,
  DERIVED_TRANSLATIONS,
  u8aToHex,
  TranslationEntry,
  DerivedTranslationEntry,
} from "./sovereign_account_translation.js";

export class AccountTranslator {
  constructor() {}

  public translateAccountRcToAh(account: string): string {
    // Input validation
    if (!account || typeof account !== "string") {
      throw new Error("Account must be a non-empty string");
    }

    // Try sovereign translation first
    const sovereignResult = this.maybeSovereignTranslate(account);
    if (sovereignResult) {
      return sovereignResult;
    }

    // Try derived translation if sovereign translation fails
    const derivedResult = this.maybeDerivedTranslate(account);
    if (derivedResult) {
      return derivedResult.account;
    }

    // Return original account if no translation found
    return account;
  }

  private maybeSovereignTranslate(account: string): string | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchSovereign(account);

    // If not found by hex, try by account address using linear search since account addresses are not sorted
    if (!translation) {
      translation = SOV_TRANSLATIONS.find(
        (entry) => entry.rcAddress === account
      );
    }

    if (translation) {
      return translation.ahAddress;
    }

    return undefined;
  }

  // Binary search for sovereign translations
  private binarySearchSovereign(account: string): TranslationEntry | undefined {
    // For hex search, use binary search since data is sorted by hex
    let left = 0;
    let right = SOV_TRANSLATIONS.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const entry = SOV_TRANSLATIONS[mid];

      const searchKey = u8aToHex(entry.rcAccount);
      const compareResult = account.localeCompare(searchKey);

      if (compareResult === 0) {
        return entry;
      } else if (compareResult < 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return undefined;
  }

  private maybeDerivedTranslate(
    account: string
  ): { account: string; derivationIndex: number } | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchDerived(account);

    // If not found by hex, try by account address using linear search since account addresses are not sorted
    if (!translation) {
      translation = DERIVED_TRANSLATIONS.find(
        (entry) => entry.rcAddress === account
      );
    }

    if (translation) {
      return {
        account: translation.ahAddress,
        derivationIndex: translation.derivationIndex,
      };
    }

    return undefined;
  }

  // Binary search for derived translations
  private binarySearchDerived(
    account: string
  ): DerivedTranslationEntry | undefined {
    // For hex search, use binary search since data is sorted by hex
    let left = 0;
    let right = DERIVED_TRANSLATIONS.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const entry = DERIVED_TRANSLATIONS[mid];

      const searchKey = u8aToHex(entry.rcAccount);
      const compareResult = account.localeCompare(searchKey);

      if (compareResult === 0) {
        return entry;
      } else if (compareResult < 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return undefined;
  }
}

// Convenience function for simple usage without creating a class instance
export function translateAccountRcToAh(account: string): string {
  const translator = new AccountTranslator();
  return translator.translateAccountRcToAh(account);
}
