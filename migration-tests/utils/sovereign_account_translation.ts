
// Account translation maps for sovereign accounts and their derived accounts.
import { hexToU8a } from '@polkadot/util';

export interface TranslationEntry {
  rcAccount: Uint8Array;
  rcAddress: string;
  ahAccount: Uint8Array;
  ahAddress: string;
}

export interface DerivedTranslationEntry {
  rcAccount: Uint8Array;
  rcAddress: string;
  derivationIndex: number;
  ahAccount: Uint8Array;
  ahAddress: string;
}

// List of RC para to AH sibl sovereign account translation.
// Note: This data will be sorted by rcAccount hex values for binary search optimization.
const SOV_TRANSLATIONS_RAW: TranslationEntry[] = [
  // para 0
  {
    rcAccount: hexToU8a("7061726100000000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNmFmpEvbFUqLoWAd68CcvudkegML6YhBEg1keWpPaf",
    ahAccount: hexToU8a("7369626c00000000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsaLW194BydPLkbHGRwT6cDMAhnQyjyx8mAtUg5g6ei",
  },
  // para 2048
  {
    rcAccount: hexToU8a("7061726100080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNmG8sxwXqncL8VfyMnPftV1mJcwwpdokxfDhZ91zK2",
    ahAccount: hexToU8a("7369626c00080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsaLs4s58ZwAL5anchbe9ZnjBMj1bU54iVA6Rahsb2S",
  },
  // para 2050
  {
    rcAccount: hexToU8a("7061726102080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNmfNzKymhQFb5x4LdvawDKJVAs9NGH4yHnQHd5U6Af",
    ahAccount: hexToU8a("7369626c02080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsak7BE7NRYob33AyyjqQtd1uDyD1uiKvpHH1eeKrjD",
  },
  // para 2051
  {
    rcAccount: hexToU8a("7061726103080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNms13WVtdD5DZgFXGzgZsjSr6zF5V6haTLzaf3h7Wo",
    ahAccount: hexToU8a("7369626c03080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsawjEQdVMMdDWmNAcow3Z3AGA6Jj8XxXyqsJgcZ15F",
  },
  // para 3334
  {
    rcAccount: hexToU8a("70617261060d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNnU6NdZqXa9UKymfcVbNTiVSK4uqycnm2XGgKqzkKz",
    ahAccount: hexToU8a("7369626c060d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsbYpZXhSFihUH4tJxJqr92CrNAyVd43iZ29QMQrVbc",
  },
  // para 3336
  {
    rcAccount: hexToU8a("70617261080d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNnsLUzc5PBnjHSA2tdndnYnABK7GRG3yMeTGPnT4K1",
    ahAccount: hexToU8a("7369626c080d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsbx4ftjg7LLjEXGgET37TrVaERAv4hJvt9KzRMJiWL",
  },
  // para 3338
  {
    rcAccount: hexToU8a("706172610a0d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNoGabMeKEoRzEtYQAmyu7P4t3ZJgruKBgmdrTiuDUN",
    ahAccount: hexToU8a("7369626c0a0d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnscMJnFmuxwyzByf3WbENngnJ6fNLWLa9DGWaVHkrJ4",
  },
  // para 3340
  {
    rcAccount: hexToU8a("706172610c0d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNofphigZ6R5FCLvmSvBASDMbuoW7JYaQ1tpSXfMWCr",
    ahAccount: hexToU8a("7369626c0c0d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsckYtcp9pZdF9S3QnjRe7X51xuZkwyqMYPhAZECytb",
  },
  // para 3344
  {
    rcAccount: hexToU8a("70617261100d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNpUJvSm2oeMm7FhW1CZh5sw3eHtxBq6pg9BcfYG6rW",
    ahAccount: hexToU8a("7369626c100d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsdZ37LtdXnum4Lp9M1pAmBeThPxbqGMnCe4Lh77jdD",
  },
  // para 3345
  {
    rcAccount: hexToU8a("70617261110d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNpfvydH9jTBPaytgeGfKkJ5QaQzfQejRqhmuhWV6jh",
    ahAccount: hexToU8a("7369626c110d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsdkfAXQkTbjPY51Kz5uoRbnpdX4K45zPNCedj5LtwL",
  },
  // para 2086
  {
    rcAccount: hexToU8a("7061726126080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNtskxrg56TpEJ8zweU5h4JVUmGgxDqnoE1grqycu6q",
    ahAccount: hexToU8a("7369626c26080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnshxV9kofpcNEFE7azHLAjcCtpNkbsH3kkWZasYUVKs",
  },
  // para 2087
  {
    rcAccount: hexToU8a("7061726127080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNu5P23CC2GdrmsC8HYBKiidqhPnfSfRQPaH9swr2b7",
    ahAccount: hexToU8a("7369626c27080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsiA7CwKnkRBrixJmdMRoQ2MFkVrK66gMv59suWhjKi",
  },
  // para 3367
  {
    rcAccount: hexToU8a("70617261270d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNu5cBchn9DFE6z8ihpoEKTFM77AJGicmU4nNSqTuxN",
    ahAccount: hexToU8a("7369626c270d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsiALNWqNsMoE45FN3e3hzkxmADDwv9sizZf6UQKZd1",
  },
  // para 3369
  {
    rcAccount: hexToU8a("70617261290d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNuUrHyk1zptV4SX5yxzVeHY4yMMiiMsyoBxxWmvVKj",
    ahAccount: hexToU8a("7369626c290d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsiZaUssciySV1XdjKnEyKbFV2TRNMo8wKgqgYLn4RB",
  },
  // para 3370
  {
    rcAccount: hexToU8a("706172612a0d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNugUMAG8vdi7YAiGd368JhgRuUTRwBWaxkZFYk9Pua",
    ahAccount: hexToU8a("7369626c2a0d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsimCY4PjenG7VFpuxrLbz1PqxaX5acmYVFRyaK187n",
  },
  // para 2091
  {
    rcAccount: hexToU8a("706172612b080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNussEmGfjVvNgmxrqpZrNPDHRtBWKwwq3peL1pkeKK",
    ahAccount: hexToU8a("7369626c2b080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsixbRfQGTeUNds5WBdpL3gvhUzF9yPCnaKX43Pc7Dk",
  },
  // para 2092
  {
    rcAccount: hexToU8a("706172612c080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNv5VHwnnfJk1AWA3UtfV2oMeN1HDYmaSDPEd3nyXW4",
    ahAccount: hexToU8a("7369626c2c080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsjADUqvPPTJ17bGgphuxi754R7LsCCqPjt7M5MqVKB",
  },
  // para 2094
  {
    rcAccount: hexToU8a("706172612e080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNvUjQJq2WvPG7xYQm2rkMdeNEFUdzQqeYWRD7jRyfD",
    ahAccount: hexToU8a("7369626c2e080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsjZTbCxdF4wG53f46r7E2wMnHMYHdr6c51Hw9JHShS",
  },
  // para 2101
  {
    rcAccount: hexToU8a("7061726135080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNwt5naTs1a8fU3thEXYAzYetm7AcYAFthSZGMX248D",
    ahAccount: hexToU8a("7369626c35080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnskxoyUbTjigfR91LaLnefrNJpDEGBbWrDwRzP5shQq",
  },
  // para 2104
  {
    rcAccount: hexToU8a("7061726138080000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNxUwx82DnzbYuEUF9jq4yo5yZUTkCd9iC8L9TRhRhW",
    ahAccount: hexToU8a("7369626c38080000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsmZg929pX99YrKatVZ5Yf6oPcaXPr4QfidCsUzZ5Ye",
  },
  // para 3388
  {
    rcAccount: hexToU8a("706172613c0d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhNyHfLRcHdAVS9GBa8JqWECGvhgEDuxsVvsCYACE2sw",
    ahAccount: hexToU8a("7369626c3c0d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnsnNPXKjtMK3S6MJDU85yuVzLknHsZQ8TTN5GBm5PtP",
  },
  // para 3397
  {
    rcAccount: hexToU8a("70617261450d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhP16Fq4HMyRt6SovDswiCBwaB6n7cuMYxQvXBTvFznB",
    ahAccount: hexToU8a("7369626c450d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnspAz1xQxhaS6Pu2sDkxfsFHb9tBGYnouwRPuVV7cdu",
  },
  // para 3415
  {
    rcAccount: hexToU8a("70617261570d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhP4hSpKdWfxfR3uPXPDTa7SAftytQt8usP3AU5NLbyT",
    ahAccount: hexToU8a("7369626c570d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnssnB1Dm7Q7DQzzWAj2i3njt5x5x4XaApuY3C6wC32S",
  },
  // para 3417
  {
    rcAccount: hexToU8a("70617261590d0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhP56gvgfkXaJg1MmtfMeqSGTPmE5qKnB5iAM49Jnii4",
    ahAccount: hexToU8a("7369626c590d0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnstBR7aoMFirfxStY1AuK7aAopL9UyDS3EfDnAsePS4",
  },
  // para 666
  {
    rcAccount: hexToU8a("706172619a020000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPJ7bXbuDmNjwknEi5vCjAugLX1fS53Ah4CsU6xjpNJ",
    ahAccount: hexToU8a("7369626c9a020000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fnt7CKiW2pVXHwhsMMRjTCrDPka7j5iUReahkC8XbV4C",
  },
  // para 4009
  {
    rcAccount: hexToU8a("70617261a90f0000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPM8WadDYPjSjaoaQMvUAfTqGaW7LwVwjL7T361xNHX",
    ahAccount: hexToU8a("7369626ca90f0000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntADEmXM97szjXth3hjieLmYgdcAzawCgrcKm7aox6A",
  },
  // para 2000
  {
    rcAccount: hexToU8a("70617261d0070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPUwPeyTFyuhGuBbD224mY85LKLMSqSSo33JYWCazU4",
    ahAccount: hexToU8a("7369626cd0070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntJ27qsari4FGrGhrMqKFDRnkNSR6UshkZYBGXmSuC8",
  },
  // para 2001
  {
    rcAccount: hexToU8a("70617261d1070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPV91i9yNuiWuNunPf6AQCYDhFTTA4G5QCbtqYApH9E",
    ahAccount: hexToU8a("7369626cd1070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntJDju46yds4uKzu2zuQssqw7JZWohhLMj6mZZjg2pK",
  },
  // para 2002
  {
    rcAccount: hexToU8a("70617261d2070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPVLdmLVVqXLXrdyaJAG2rxN4BaYsH5i1NAV8a93XWr",
    ahAccount: hexToU8a("7369626cd2070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntJRMxEd6ZftXoj6DdyWWYG5UEgcWvWxxtfMrbhu9Bg",
  },
  // para 2004
  {
    rcAccount: hexToU8a("70617261d4070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPVjsshXjh8ynp6MwaJTJBnen3pkHiiyDhHfie5VWkN",
    ahAccount: hexToU8a("7369626cd4070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntJpc4bfLRHXnmBUav7hms6NC6vowNAEBDnYSfeMPCw",
  },
  // para 2006
  {
    rcAccount: hexToU8a("70617261d6070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPW97z4ZyYkd3mYkJrSeZWcwVv4wiANES2QrJi1x17F",
    ahAccount: hexToU8a("7369626cd6070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntKDrAxhaGuB3idrxCFu3BveuyB1MooVPYuj2jaoSsw",
  },
  // para 2007
  {
    rcAccount: hexToU8a("70617261d7070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPWLk3F66UZSgFGwVVWkCB35rrC3RPBs3BySbjzB588",
    ahAccount: hexToU8a("7369626cd7070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntKRUE9DhChzgCN48qKzfrLoGuJ752d7ziUKKmZ2oqx",
  },
  // para 2008
  {
    rcAccount: hexToU8a("70617261d8070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPWYN6RcDQNGJj18g8aqpqTEDnK98c1VeMY2tmxQGnq",
    ahAccount: hexToU8a("7369626cd8070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntKd6HKjp8WpJg6FKUQ6JWkwdqRCnFSkbt2ucoXFitU",
  },
  // para 2011
  {
    rcAccount: hexToU8a("70617261db070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPX9EFyAaBnjCABiE3o8iphfJagSGGUPTrDomss5bxQ",
    ahAccount: hexToU8a("7369626cdb070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntLDxSsJAuwHC7GpsPcPCW1NidnVuuueRNigVuRwREd",
  },
  // para 2012
  {
    rcAccount: hexToU8a("70617261dc070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPXLrK9gh7bYpduuQgsEMV7ofWoXyVJ251nQ4uqJayU",
    ahAccount: hexToU8a("7369626cdc070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntLRaW3pHqk6pb1242gUqARX5Zubd8jH2YHGnwQADmR",
  },
  // para 2013
  {
    rcAccount: hexToU8a("70617261dd070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPXYUNLCp3QNT7e6bKwKz9Xx2Svdgi7egBLzMwoXqcD",
    ahAccount: hexToU8a("7369626cdd070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntLdCZELQmYvT4jDEfkaTpqfSW2hLMYudhqs5yNPMzV",
  },
  // para 2019
  {
    rcAccount: hexToU8a("70617261e3070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPYkChRKXcFJDz1FhAMun82pC3fDx33SKAiY89ctpT9",
    ahAccount: hexToU8a("7369626ce3070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntMpvtKT8LPrDw6NLWBAFoLXc6mHbgUhGhDQrBBkFQ1",
  },
  // para 2021
  {
    rcAccount: hexToU8a("70617261e5070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPZ9SonMmTrwUwTe4SW73Ss6uuuRNUghXVqiiDZM2sh",
    ahAccount: hexToU8a("7369626ce5070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntNEAzgVNC1VUtYkhnKMX8ApKy1V287xV2LbSF8CWXb",
  },
  // para 1000
  {
    rcAccount: hexToU8a("70617261e8030000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPZk8STuex8Wsi9TwDtJQxKqzPJRCH7348Xtcs9vZLJ",
    ahAccount: hexToU8a("7369626ce8030000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntNprdN3FgH4sfEaaZhYtddZQSQUqvYJ1f2mLtinVhV",
  },
  // para 1001
  {
    rcAccount: hexToU8a("70617261e9030000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPZwkVeRmswLWBsf7rxQ3cjzMKRWuVvffJ6Uuu89s1P",
    ahAccount: hexToU8a("7369626ce9030000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntP2UgYZNc5tW8xmmCmeXJ3hmNXaZ9MvcpbMdvh1bBJ",
  },
  // para 2025
  {
    rcAccount: hexToU8a("70617261e9070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPZww2WSFB6DzrNQnznVa6XgMePpDMyDxA65tMSFVpp",
    ahAccount: hexToU8a("7369626ce9070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntP2fDQZquEmzoTXSLbk3mqPmhVss1QUugaxcP174FB",
  },
  // para 1002
  {
    rcAccount: hexToU8a("70617261ea030000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPa9NYpwtokA8fbrJW2VgHA8iFYccikJGTf5Cw6NqFT",
    ahAccount: hexToU8a("7369626cea030000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntPE6jj5VXti8cgxwqqk9xTr8JegGNBZDz9wvxfEaAn",
  },
  // para 2026
  {
    rcAccount: hexToU8a("70617261ea070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPa9Z5gxN6u3dL6bydrbCkwpiaWuvanrZKegBPQUXMk",
    ahAccount: hexToU8a("7369626cea070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntPEHGb5xq3bdHBicyfqgSFY8dcyaEE7Wr9YuQyLLX4",
  },
  // para 2030
  {
    rcAccount: hexToU8a("70617261ee070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPax3JR2qp8L9F1NiC8yjQcQAK1JmU5Nyyu3MXHPCmc",
    ahAccount: hexToU8a("7369626cee070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntQ2mVKASYGt9C6VMXxED5v7aN7NR7WdwWPv5YrEjkb",
  },
  // para 2031
  {
    rcAccount: hexToU8a("70617261ef070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPb9fMbYxjw9mijZtqD5N52YXF8QUgu1b9TdeZFcMRT",
    ahAccount: hexToU8a("7369626cef070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntQEPYVgZU5hmfpgYB2KqkLFwJEU8LLGYfxWNapU21z",
  },
  // para 2032
  {
    rcAccount: hexToU8a("70617261f0070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPbMHQn55fjyQCTm5UHAzjSgtBFWBuieCK2DwbDqGSG",
    ahAccount: hexToU8a("7369626cf0070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntQS1bgCgPtXQ9Ysip6RUQkQJEMZqZ9u9qX6fcnhB4H",
  },
  // para 2034
  {
    rcAccount: hexToU8a("70617261f2070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPbkXX97KXMcf9v9SkRNG4Gyc3VhcMMuQe9QXfAHnrC",
    ahAccount: hexToU8a("7369626cf2070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntQqFi3EvFWAf71G66Ecjjah26bmFzoANAeHFgj9Lia",
  },
  // para 2035
  {
    rcAccount: hexToU8a("70617261f3070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPbx9aKdSTASHdeLdPVTtih7xycoKaBY1ohzph8Wgo9",
    ahAccount: hexToU8a("7369626cf3070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntR2smDm3BJzHajTGjJiNPzqP2iryDcnyLCsYihNQk3",
  },
  // para 2037
  {
    rcAccount: hexToU8a("70617261f5070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPcMPggfgJn5Yb6izfdfA3XQgqrzk1poE8qBQm4y4QU",
    ahAccount: hexToU8a("7369626cf5070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntRS7saoH2vdYYBqe1Sudiq86ty4PfG4BfL48ndpk4X",
  },
  // para 2039
  {
    rcAccount: hexToU8a("70617261f7070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPckdo3hvAPioYZ7MwmrRNMhQi7CATU4STxMzq1RSrA",
    ahAccount: hexToU8a("7369626cf7070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntRqMywqWtYGoVeE1Hb6u3fQpmDFp6uKPzTEiraGrq1",
  },
  // para 2040
  {
    rcAccount: hexToU8a("70617261f8070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPcxFrEE36CYS2HJYaqx42mqmeEHsgHh3dWxHryeNKs",
    ahAccount: hexToU8a("7369626cf8070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntS2z38MdpM6RyNRBvfCXi5ZBhLMXKix1A1q1tYW66u",
  },
  // para 2043
  {
    rcAccount: hexToU8a("70617261fb070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPdZ81mnPsd1KTTt6W4Ex22GrSbb1Lkas8CjAxtKyUX",
    ahAccount: hexToU8a("7369626cfb070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntSdrCfuzbmZKQYzjqsVRhKzGVheezBqpehbtzTBYNj",
  },
  // para 2046
  {
    rcAccount: hexToU8a("70617261fe070000000000000000000000000000000000000000000000000000"),
    rcAddress: "5Ec4AhPe9zBKLkf3UCteTeRGXr1GhwExt91DUgctW44o18mb",
    ahAccount: hexToU8a("7369626cfe070000000000000000000000000000000000000000000000000000"),
    ahAddress: "5Eg2fntTEiNDUMPC2CqjaHm5nKgaRMJ4wneeje9PNn6Ms2cM",
  },
];

// Sort the sovereign translations by rcAccount hex values for binary search optimization
export const SOV_TRANSLATIONS: TranslationEntry[] = SOV_TRANSLATIONS_RAW.sort((a, b) => {
  // Convert Uint8Array to hex string for comparison
  const aHex = Array.from(a.rcAccount).map(b => b.toString(16).padStart(2, '0')).join('');
  const bHex = Array.from(b.rcAccount).map(b => b.toString(16).padStart(2, '0')).join('');
  return aHex.localeCompare(bHex);
});

/// List of RC para to AH sibl derived account translation.
/// Note: This data will be sorted by rcAccount hex values for binary search optimization.
const DERIVED_TRANSLATIONS_RAW: DerivedTranslationEntry[] = [
  // para 2000
  // para 2000 (derivation index 0)
  {
    rcAccount: hexToU8a("d7b8926b326dd349355a9a7cca6606c1e0eb6fd2b506066b518c7155ff0d8297"),
    rcAddress: "5GwYytfmBPBa7VYW1VCnFufZy2kWbQDGiN2CqMh8HvrrW5xs",
    derivationIndex: 0,
    ahAccount: hexToU8a("50ca9b6bf6c83ca2a918b9861788d6facd26e5fd78a07f9848070697683745b3"),
    ahAddress: "5Dtdsh9v7GXYgeLMk6Ze1q2HWF4219ACng1MB6Bdifs5MCGg",
  },

  // para 2001
  // para 2001 (derivation index 0)
  {
    rcAccount: hexToU8a("5a53736d8e96f1c007cf0d630acf5209b20611617af23ce924c8e25328eb5d28"),
    rcAddress: "5E78xTBiaN3nAGYtcNnqTJQJqYAkSDGggKqaDfpNsKyPpbcb",
    derivationIndex: 0,
    ahAccount: hexToU8a("290bf94235666a351d9c8082c77e689813a905d0bbffdbd8b4a619ec5303ba27"),
    ahAddress: "5CzXNqgBZT5yMpMETdfH55saYNKQoJBXsSfnu4d2s1ejYFir",
  },
  // para 2001 (derivation index 1)
  {
    rcAccount: hexToU8a("f1c5ca0368e7a567945a59aaea92b9be1e0794fe5e077d017462b7ce8fc1ed7c"),
    rcAddress: "5HXi9pzWnTQzk7VKzY6VQn92KfWCcA5NbSm53uKHrYU1VsjP",
    derivationIndex: 1,
    ahAccount: hexToU8a("c94f02677ffb78dc23fbd3b95beb2650fe4fa5c466e5aedee74e89d96351800c"),
    ahAddress: "5GcexD4YNqcKTbW1YWDRczQzpxic61byeNeLaHgqQHk8pxQJ",
  },

  // para 2012
  // para 2012 (derivation index 0)
  {
    rcAccount: hexToU8a("f82777e46281c5f5000af5dbb01fa41cdf0ff53ac4167b7297e386d834ff7c0e"),
    rcAddress: "5Hg5TTyFP8NKXXs7rvDNBvDsa23E7kh5Xxr55xoCFkQCmbB9",
    derivationIndex: 0,
    ahAccount: hexToU8a("2e007ed75739bb293788b83c94dee3247d1561337b69f593cc044cf11606f573"),
    ahAddress: "5D72CxkFjKEC9QXDpoAZAxdBn9q8JhJzAdHXqwwTVTALxC7q",
  },
  // para 2012 (derivation index 1)
  {
    rcAccount: hexToU8a("aa006b3de1565c48ade1c1f3b646090be49389327f6b214076e5d2bd2ba0fb02"),
    rcAddress: "5Fuc82fy32ccsRXWyovjsLms4AsPYToHnXuvGjCjYGcPvcEA",
    derivationIndex: 1,
    ahAccount: hexToU8a("26b0b1d07bded0e85c829f664ff9440b3ad0d8855fc7634d547e99ecd70d78cf"),
    ahAddress: "5CwSAaoAnoN3t5Ui15g3xr5SmrEqQj8DJvFPBmXgcKpFYmN4",
  },
  // para 2012 (derivation index 2)
  {
    rcAccount: hexToU8a("06926c6bab20739b8d4710e56a9ce6db7b0f67986a4f29664919620653f3a435"),
    rcAddress: "5CDKe9iak7oYywsYUF37ThPcvAVysueu3TuUAJawZospbwkF",
    derivationIndex: 2,
    ahAccount: hexToU8a("d06990044418b18883108cf323580cc769414ddbee42bcebaf72331c175a9d90"),
    ahAddress: "5GmyB9gUJYn1pyUdRYF9LxWNrRFGc9wC38pb72MfSr2WFZ9e",
  },
  // para 2012 (derivation index 3)
  {
    rcAccount: hexToU8a("fe5326ff816ac945120d53cffdd00919268032f0e478d40c23dea72a69e53660"),
    rcAddress: "5HpAindoSKd56yA1UsAmcv6PvoTbhCgZSy1ah5DY3r4rFYZ6",
    derivationIndex: 3,
    ahAccount: hexToU8a("ceca601fde11eed1f4c6fe4f0a2ba581b75c1011a94d0426226c79e9f23ca956"),
    ahAddress: "5GjqqeHW7am6pbBoD6Afw6Pnytgsm4uP6JzdQHsRpL3FYRFE",
  },
  // para 2012 (derivation index 4)
  {
    rcAccount: hexToU8a("f60aa184555b35cfcd6dc246424240068da18dd1bfeefccf8d5a26713b9917f7"),
    rcAddress: "5HdJo46v12tW24Nveanm1T4qkkVfd6XDD7cvemroTuritRrr",
    derivationIndex: 4,
    ahAccount: hexToU8a("0891c74febe45a39b18715a5c4a0f9592203f53efee5c75e648a0388974b2ca7"),
    ahAddress: "5CFwYbNXv57T58auh8JHGxopJu91cBsDoCNE7tEymkcV1wb3",
  },
  // para 2012 (derivation index 5)
  {
    rcAccount: hexToU8a("1bba940dce8f85a0088315d47c39f4318a107cff37333206e40f227c90a3f6a0"),
    rcAddress: "5Ch4aKsCCxb4S6NvoHC7ykMWj6b3zign7evudainTq3Bqh8R",
    derivationIndex: 5,
    ahAccount: hexToU8a("0f8f1e28d43adea08631b882277dc53916d872d08ae2410d3721355618ababfe"),
    ahAddress: "5CR76C2UsxvQCo7Bh1HXppAj4vxPWNNMfF952UE8Zcz3KEF1",
  },

  // para 2019
  // para 2019 (derivation index 0)
  {
    rcAccount: hexToU8a("5640ec97748f5b5da9a2298e830e8971df7908861e1710b957fe06f0703bca7d"),
    rcAddress: "5E1oG8oYHs9vWmLeVcpRE6tQbjKRiP1cZ4WmVc33fEkYGviY",
    derivationIndex: 0,
    ahAccount: hexToU8a("d9c2775f1255eaaf78a22fdebb5471ca6392c2441118caad3f15b58f52686800"),
    ahAddress: "5GzE1vRVr8nG4WAPmX76RtLWK1XxxBfMwCTcKWQTKkugD2iQ",
  },

  // para 2030
  // para 2030 (derivation index 0)
  {
    rcAccount: hexToU8a("adcea185416af2d3e8df8c1c8ee8a634bf1c3275b3820cb6d935300d42c73b2a"),
    rcAddress: "5FzbXK46dYRXsTaXuUb3uJ1QCNBRf3KV8Tpue2Ec6iAj8nxL",
    derivationIndex: 0,
    ahAccount: hexToU8a("69f880852768f2d00acfa7824533aa4378e48d1b9fbc6b44500e8b98debeaccd"),
    ahAddress: "5ETehspFKFNpBbe5DsfuziN6BWq5Qwp1J8qcTQQoAxwa7BsS",
  },
  // para 2030 (derivation index 1)
  {
    rcAccount: hexToU8a("96d16ffaae52a6a195b6d9f0b365677aedb77675f423813112c5ef5434523622"),
    rcAddress: "5FUTFngRdSAPG4BVXCEs7nV6dAsMk8MV4ZU3CDGvx66nXHnR",
    derivationIndex: 1,
    ahAccount: hexToU8a("39d0a3c793549eda79b5cd3f8ab1c5879326352eb6583696249e38684b9451c1"),
    ahAddress: "5DNWZkkAxLhqF8tevcbRGyARAVM7abukftmqvoDFUN5dDDDz",
  },
  // para 2030 (derivation index 2)
  {
    rcAccount: hexToU8a("773d6cf20cfdcbb74194ec6afca483facb3751bfb8933163f2e184f2b1424fb1"),
    rcAddress: "5Em3oWMRS4UErpb3jn6LkWoYxLmowaKa2q5e51b9UteDsFqS",
    derivationIndex: 2,
    ahAccount: hexToU8a("77c1303f053dc000bcacd591d0267f79ef5124a5b1a9207e8e1b29da9270e3a8"),
    ahAddress: "5EmiwjDYiackJma1GW3aBbQ74rLfWh756UKDb7Cm83XDkUUZ",
  },

  // para 3397
  // para 3397 (derivation index 0)
  {
    rcAccount: hexToU8a("950431ba0298ec4f6f5522dec45b9663f82057705a5c3d92b1bed454b64d8fa5"),
    rcAddress: "5FS6Ekf6QUYYKfaoCZNz7j181pPdDDNdnEe8oat2KzVjaCAZ",
    derivationIndex: 0,
    ahAccount: hexToU8a("14ef48f42beb705327d66e011249d4a1bc9318a894ccf2a840c831081de7de0c"),
    ahAddress: "5CY9tzuRaRxKpFZxdfobKdAUJqyz3GNaM6gYdbH7LrEwcJQw",
  },
];

// Sort the derived translations by rcAccount hex values for binary search optimization
export const DERIVED_TRANSLATIONS: DerivedTranslationEntry[] = DERIVED_TRANSLATIONS_RAW.sort((a, b) => {
  // Convert Uint8Array to hex string for comparison
  const aHex = Array.from(a.rcAccount).map(b => b.toString(16).padStart(2, '0')).join('');
  const bHex = Array.from(b.rcAccount).map(b => b.toString(16).padStart(2, '0')).join('');
  return aHex.localeCompare(bHex);
});

// Helper function to convert Uint8Array to hex string for debugging
export function u8aToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
