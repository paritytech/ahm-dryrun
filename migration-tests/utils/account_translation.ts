import {
  SOV_TRANSLATIONS,
  DERIVED_TRANSLATIONS,
  BIFROST_SOV_TRANSLATIONS,
  BIFROST_DERIVED_TRANSLATIONS,
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

    // Try Bifrost translation if sovereign and derived translation fails
    // This checks both BIFROST_SOV_TRANSLATIONS and BIFROST_DERIVED_TRANSLATIONS
    const bifrostResult = this.maybeBifrostTranslate(account);
    if (bifrostResult) {
      return bifrostResult;
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

  // Generic binary search for translation entries
  private binarySearch<T extends { rcAccount: Uint8Array }>(
    account: string,
    translations: T[]
  ): T | undefined {
    // For hex search, use binary search since data is sorted by hex
    let left = 0;
    let right = translations.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const entry = translations[mid];

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

  // Binary search for sovereign translations
  private binarySearchSovereign(account: string): TranslationEntry | undefined {
    return this.binarySearch(account, SOV_TRANSLATIONS);
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
    return this.binarySearch(account, DERIVED_TRANSLATIONS);
  }

  private maybeBifrostTranslate(account: string): string | undefined {
    // Try Bifrost sovereign translation first
    const bifrostSovereignResult = this.maybeBifrostSovereignTranslate(account);
    if (bifrostSovereignResult) {
      return bifrostSovereignResult;
    }

    // Try Bifrost derived translation if sovereign translation fails
    const bifrostDerivedResult = this.maybeBifrostDerivedTranslate(account);
    if (bifrostDerivedResult) {
      return bifrostDerivedResult.account;
    }

    return undefined;
  }

  private maybeBifrostSovereignTranslate(account: string): string | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchBifrostSovereign(account);

    // If not found by hex, try by account address using linear search since account addresses are not sorted
    if (!translation) {
      translation = BIFROST_SOV_TRANSLATIONS.find(
        (entry) => entry.rcAddress === account
      );
    }

    if (translation) {
      return translation.ahAddress;
    }

    return undefined;
  }

  private maybeBifrostDerivedTranslate(
    account: string
  ): { account: string; derivationIndex: number } | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchBifrostDerived(account);

    // If not found by hex, try by account address using linear search since account addresses are not sorted
    if (!translation) {
      translation = BIFROST_DERIVED_TRANSLATIONS.find(
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

  // Binary search for Bifrost sovereign translations
  private binarySearchBifrostSovereign(account: string): TranslationEntry | undefined {
    return this.binarySearch(account, BIFROST_SOV_TRANSLATIONS);
  }

  // Binary search for Bifrost derived translations
  private binarySearchBifrostDerived(
    account: string
  ): DerivedTranslationEntry | undefined {
    return this.binarySearch(account, BIFROST_DERIVED_TRANSLATIONS);
  }

}

// Convenience function for simple usage without creating a class instance
export function translateAccountRcToAh(account: string): string {
  const translator = new AccountTranslator();
  return translator.translateAccountRcToAh(account);
}
