import {
  SOV_TRANSLATIONS,
  DERIVED_TRANSLATIONS,
  BIFROST_SOV_TRANSLATIONS,
  BIFROST_DERIVED_TRANSLATIONS,
  TranslationEntry,
  DerivedTranslationEntry,
  u8aToHex,
  compareUint8Arrays,
} from "./sovereign_account_translation.js";
import { hexToU8a } from "@polkadot/util";

export class AccountTranslator {
  constructor() {}
  /**
   * Translates a Relay Chain account to its corresponding Asset Hub account.
   *
   * @param accountStr - Hex-encoded account string (64 characters)
   * @returns Hex-encoded Asset Hub account or original if no translation found
   * @throws Error if account format is invalid
   */
  public translateAccountRcToAh(accountStr: string): string {
    // Input validation
    if (!accountStr || accountStr.length === 0) {
      throw new Error("Account must be a non-empty string");
    }
    // Convert hex string to Uint8Array
    let account: Uint8Array;
    try {
      account = hexToU8a(accountStr);
    } catch (error) {
      throw new Error("Account must be a valid hex string");
    }

    // Try sovereign translation first
    const sovereignResult = this.maybeSovereignTranslate(account);
    if (sovereignResult) {
      return u8aToHex(sovereignResult);
    }

    // Try derived translation if sovereign translation fails
    const derivedResult = this.maybeDerivedTranslate(account);
    if (derivedResult) {
      return u8aToHex(derivedResult.account);
    }

    // Try Bifrost translation if sovereign and derived translation fails
    // This checks both BIFROST_SOV_TRANSLATIONS and BIFROST_DERIVED_TRANSLATIONS
    const bifrostResult = this.maybeBifrostTranslate(account);
    if (bifrostResult) {
      return u8aToHex(bifrostResult);
    }

    // Return original account if no translation found
    return accountStr;
  }

  private maybeSovereignTranslate(account: Uint8Array): Uint8Array | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchSovereign(account);

    if (translation) {
      return translation.ahAccount;
    }

    return undefined;
  }

  // Generic binary search for translation entries
  private binarySearch<T extends { rcAccount: Uint8Array }>(
    account: Uint8Array,
    translations: T[]
  ): T | undefined {
    // Handle edge case: empty array
    if (translations.length === 0) {
      return undefined;
    }

    // For hex search, use binary search since data is sorted by hex
    let left = 0;
    let right = translations.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const entry = translations[mid];

      const compareResult = compareUint8Arrays(account, entry.rcAccount);

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
  private binarySearchSovereign(
    account: Uint8Array
  ): TranslationEntry | undefined {
    return this.binarySearch(account, SOV_TRANSLATIONS);
  }

  private maybeDerivedTranslate(
    account: Uint8Array
  ): { account: Uint8Array; derivationIndex: number } | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchDerived(account);

    if (translation) {
      return {
        account: translation.ahAccount,
        derivationIndex: translation.derivationIndex,
      };
    }

    return undefined;
  }

  // Binary search for derived translations
  private binarySearchDerived(
    account: Uint8Array
  ): DerivedTranslationEntry | undefined {
    return this.binarySearch(account, DERIVED_TRANSLATIONS);
  }

  private maybeBifrostTranslate(account: Uint8Array): Uint8Array | undefined {
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

  private maybeBifrostSovereignTranslate(
    account: Uint8Array
  ): Uint8Array | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchBifrostSovereign(account);

    if (translation) {
      return translation.ahAccount;
    }

    return undefined;
  }

  private maybeBifrostDerivedTranslate(
    account: Uint8Array
  ): { account: Uint8Array; derivationIndex: number } | undefined {
    // Try to find by hex account first using binary search
    let translation = this.binarySearchBifrostDerived(account);

    if (translation) {
      return {
        account: translation.ahAccount,
        derivationIndex: translation.derivationIndex,
      };
    }

    return undefined;
  }

  // Binary search for Bifrost sovereign translations
  private binarySearchBifrostSovereign(
    account: Uint8Array
  ): TranslationEntry | undefined {
    return this.binarySearch(account, BIFROST_SOV_TRANSLATIONS);
  }

  // Binary search for Bifrost derived translations
  private binarySearchBifrostDerived(
    account: Uint8Array
  ): DerivedTranslationEntry | undefined {
    return this.binarySearch(account, BIFROST_DERIVED_TRANSLATIONS);
  }
}

// Convenience function for simple usage without creating a class instance
export function translateAccountRcToAh(account: string): string {
  const translator = new AccountTranslator();
  return translator.translateAccountRcToAh(account);
}
