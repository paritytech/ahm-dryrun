
// Account translation maps for sovereign accounts and their derived accounts.
import { hexToU8a } from '@polkadot/util';

export interface TranslationEntry {
  rcAccount: Uint8Array;
  ahAccount: Uint8Array;
}

export interface DerivedTranslationEntry {
  rcAccount: Uint8Array;
  derivationIndex: number;
  ahAccount: Uint8Array;
}

// List of RC para to AH sibl sovereign account translation.
// Note: This data will be sorted by rcAccount for binary search optimization.
const SOV_TRANSLATIONS_RAW: TranslationEntry[] = [
  // para 0
  {
    rcAccount: hexToU8a("7061726100000000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c00000000000000000000000000000000000000000000000000000000"),
  },
  // para 2048
  {
    rcAccount: hexToU8a("7061726100080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c00080000000000000000000000000000000000000000000000000000"),
  },
  // para 2050
  {
    rcAccount: hexToU8a("7061726102080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c02080000000000000000000000000000000000000000000000000000"),
  },
  // para 2051
  {
    rcAccount: hexToU8a("7061726103080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c03080000000000000000000000000000000000000000000000000000"),
  },
  // para 3334
  {
    rcAccount: hexToU8a("70617261060d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c060d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3336
  {
    rcAccount: hexToU8a("70617261080d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c080d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3338
  {
    rcAccount: hexToU8a("706172610a0d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c0a0d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3340
  {
    rcAccount: hexToU8a("706172610c0d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c0c0d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3344
  {
    rcAccount: hexToU8a("70617261100d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c100d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3345
  {
    rcAccount: hexToU8a("70617261110d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c110d0000000000000000000000000000000000000000000000000000"),
  },
  // para 2086
  {
    rcAccount: hexToU8a("7061726126080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c26080000000000000000000000000000000000000000000000000000"),
  },
  // para 2087
  {
    rcAccount: hexToU8a("7061726127080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c27080000000000000000000000000000000000000000000000000000"),
  },
  // para 3367
  {
    rcAccount: hexToU8a("70617261270d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c270d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3369
  {
    rcAccount: hexToU8a("70617261290d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c290d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3370
  {
    rcAccount: hexToU8a("706172612a0d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c2a0d0000000000000000000000000000000000000000000000000000"),
  },
  // para 2091
  {
    rcAccount: hexToU8a("706172612b080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c2b080000000000000000000000000000000000000000000000000000"),
  },
  // para 2092
  {
    rcAccount: hexToU8a("706172612c080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c2c080000000000000000000000000000000000000000000000000000"),
  },
  // para 2094
  {
    rcAccount: hexToU8a("706172612e080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c2e080000000000000000000000000000000000000000000000000000"),
  },
  // para 2101
  {
    rcAccount: hexToU8a("7061726135080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c35080000000000000000000000000000000000000000000000000000"),
  },
  // para 2104
  {
    rcAccount: hexToU8a("7061726138080000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c38080000000000000000000000000000000000000000000000000000"),
  },
  // para 3388
  {
    rcAccount: hexToU8a("706172613c0d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c3c0d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3397
  {
    rcAccount: hexToU8a("70617261450d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c450d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3415
  {
    rcAccount: hexToU8a("70617261570d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c570d0000000000000000000000000000000000000000000000000000"),
  },
  // para 3417
  {
    rcAccount: hexToU8a("70617261590d0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c590d0000000000000000000000000000000000000000000000000000"),
  },
  // para 666
  {
    rcAccount: hexToU8a("706172619a020000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626c9a020000000000000000000000000000000000000000000000000000"),
  },
  // para 4009
  {
    rcAccount: hexToU8a("70617261a90f0000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626ca90f0000000000000000000000000000000000000000000000000000"),
  },
  // para 2000
  {
    rcAccount: hexToU8a("70617261d0070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd0070000000000000000000000000000000000000000000000000000"),
  },
  // para 2001
  {
    rcAccount: hexToU8a("70617261d1070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd1070000000000000000000000000000000000000000000000000000"),
  },
  // para 2002
  {
    rcAccount: hexToU8a("70617261d2070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd2070000000000000000000000000000000000000000000000000000"),
  },
  // para 2004
  {
    rcAccount: hexToU8a("70617261d4070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd4070000000000000000000000000000000000000000000000000000"),
  },
  // para 2006
  {
    rcAccount: hexToU8a("70617261d6070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd6070000000000000000000000000000000000000000000000000000"),
  },
  // para 2007
  {
    rcAccount: hexToU8a("70617261d7070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd7070000000000000000000000000000000000000000000000000000"),
  },
  // para 2008
  {
    rcAccount: hexToU8a("70617261d8070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd8070000000000000000000000000000000000000000000000000000"),
  },
  // para 2011
  {
    rcAccount: hexToU8a("70617261db070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cdb070000000000000000000000000000000000000000000000000000"),
  },
  // para 2012
  {
    rcAccount: hexToU8a("70617261dc070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cdc070000000000000000000000000000000000000000000000000000"),
  },
  // para 2013
  {
    rcAccount: hexToU8a("70617261dd070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cdd070000000000000000000000000000000000000000000000000000"),
  },
  // para 2019
  {
    rcAccount: hexToU8a("70617261e3070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626ce3070000000000000000000000000000000000000000000000000000"),
  },
  // para 2021
  {
    rcAccount: hexToU8a("70617261e5070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626ce5070000000000000000000000000000000000000000000000000000"),
  },
  // para 1000
  {
    rcAccount: hexToU8a("70617261e8030000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626ce8030000000000000000000000000000000000000000000000000000"),
  },
  // para 1001
  {
    rcAccount: hexToU8a("70617261e9030000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626ce9030000000000000000000000000000000000000000000000000000"),
  },
  // para 2025
  {
    rcAccount: hexToU8a("70617261e9070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626ce9070000000000000000000000000000000000000000000000000000"),
  },
  // para 1002
  {
    rcAccount: hexToU8a("70617261ea030000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cea030000000000000000000000000000000000000000000000000000"),
  },
  // para 2026
  {
    rcAccount: hexToU8a("70617261ea070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cea070000000000000000000000000000000000000000000000000000"),
  },
  // para 2030
  {
    rcAccount: hexToU8a("70617261ee070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cee070000000000000000000000000000000000000000000000000000"),
  },
  // para 2031
  {
    rcAccount: hexToU8a("70617261ef070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cef070000000000000000000000000000000000000000000000000000"),
  },
  // para 2032
  {
    rcAccount: hexToU8a("70617261f0070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cf0070000000000000000000000000000000000000000000000000000"),
  },
  // para 2034
  {
    rcAccount: hexToU8a("70617261f2070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cf2070000000000000000000000000000000000000000000000000000"),
  },
  // para 2035
  {
    rcAccount: hexToU8a("70617261f3070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cf3070000000000000000000000000000000000000000000000000000"),
  },
  // para 2037
  {
    rcAccount: hexToU8a("70617261f5070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cf5070000000000000000000000000000000000000000000000000000"),
  },
  // para 2039
  {
    rcAccount: hexToU8a("70617261f7070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cf7070000000000000000000000000000000000000000000000000000"),
  },
  // para 2040
  {
    rcAccount: hexToU8a("70617261f8070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cf8070000000000000000000000000000000000000000000000000000"),
  },
  // para 2043
  {
    rcAccount: hexToU8a("70617261fb070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cfb070000000000000000000000000000000000000000000000000000"),
  },
  // para 2046
  {
    rcAccount: hexToU8a("70617261fe070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cfe070000000000000000000000000000000000000000000000000000"),
  },
];

// Sort the sovereign translations by rcAccount raw bytes for binary search optimization
export const SOV_TRANSLATIONS: TranslationEntry[] = SOV_TRANSLATIONS_RAW.sort((a, b) => {
  // Compare raw bytes directly for better performance
  return compareUint8Arrays(a.rcAccount, b.rcAccount);
});

/// List of RC para to AH sibl derived account translation.
/// Note: This data will be sorted by rcAccount for binary search optimization.
const DERIVED_TRANSLATIONS_RAW: DerivedTranslationEntry[] = [
  // para 2000
  // para 2000 (derivation index 0)
  {
    rcAccount: hexToU8a("d7b8926b326dd349355a9a7cca6606c1e0eb6fd2b506066b518c7155ff0d8297"),
    derivationIndex: 0,
    ahAccount: hexToU8a("50ca9b6bf6c83ca2a918b9861788d6facd26e5fd78a07f9848070697683745b3"),
  },

  // para 2001
  // para 2001 (derivation index 0)
  {
    rcAccount: hexToU8a("5a53736d8e96f1c007cf0d630acf5209b20611617af23ce924c8e25328eb5d28"),
    derivationIndex: 0,
    ahAccount: hexToU8a("290bf94235666a351d9c8082c77e689813a905d0bbffdbd8b4a619ec5303ba27"),
  },
  // para 2001 (derivation index 1)
  {
    rcAccount: hexToU8a("f1c5ca0368e7a567945a59aaea92b9be1e0794fe5e077d017462b7ce8fc1ed7c"),
    derivationIndex: 1,
    ahAccount: hexToU8a("c94f02677ffb78dc23fbd3b95beb2650fe4fa5c466e5aedee74e89d96351800c"),
  },

  // para 2012
  // para 2012 (derivation index 0)
  {
    rcAccount: hexToU8a("f82777e46281c5f5000af5dbb01fa41cdf0ff53ac4167b7297e386d834ff7c0e"),
    derivationIndex: 0,
    ahAccount: hexToU8a("2e007ed75739bb293788b83c94dee3247d1561337b69f593cc044cf11606f573"),
  },
  // para 2012 (derivation index 1)
  {
    rcAccount: hexToU8a("aa006b3de1565c48ade1c1f3b646090be49389327f6b214076e5d2bd2ba0fb02"),
    derivationIndex: 1,
    ahAccount: hexToU8a("26b0b1d07bded0e85c829f664ff9440b3ad0d8855fc7634d547e99ecd70d78cf"),
  },
  // para 2012 (derivation index 2)
  {
    rcAccount: hexToU8a("06926c6bab20739b8d4710e56a9ce6db7b0f67986a4f29664919620653f3a435"),
    derivationIndex: 2,
    ahAccount: hexToU8a("d06990044418b18883108cf323580cc769414ddbee42bcebaf72331c175a9d90"),
  },
  // para 2012 (derivation index 3)
  {
    rcAccount: hexToU8a("fe5326ff816ac945120d53cffdd00919268032f0e478d40c23dea72a69e53660"),
    derivationIndex: 3,
    ahAccount: hexToU8a("ceca601fde11eed1f4c6fe4f0a2ba581b75c1011a94d0426226c79e9f23ca956"),
  },
  // para 2012 (derivation index 4)
  {
    rcAccount: hexToU8a("f60aa184555b35cfcd6dc246424240068da18dd1bfeefccf8d5a26713b9917f7"),
    derivationIndex: 4,
    ahAccount: hexToU8a("0891c74febe45a39b18715a5c4a0f9592203f53efee5c75e648a0388974b2ca7"),
  },
  // para 2012 (derivation index 5)
  {
    rcAccount: hexToU8a("1bba940dce8f85a0088315d47c39f4318a107cff37333206e40f227c90a3f6a0"),
    derivationIndex: 5,
    ahAccount: hexToU8a("0f8f1e28d43adea08631b882277dc53916d872d08ae2410d3721355618ababfe"),
  },

  // para 2019
  // para 2019 (derivation index 0)
  {
    rcAccount: hexToU8a("5640ec97748f5b5da9a2298e830e8971df7908861e1710b957fe06f0703bca7d"),
    derivationIndex: 0,
    ahAccount: hexToU8a("d9c2775f1255eaaf78a22fdebb5471ca6392c2441118caad3f15b58f52686800"),
  },

  // para 2030
  // para 2030 (derivation index 0)
  {
    rcAccount: hexToU8a("adcea185416af2d3e8df8c1c8ee8a634bf1c3275b3820cb6d935300d42c73b2a"),
    derivationIndex: 0,
    ahAccount: hexToU8a("69f880852768f2d00acfa7824533aa4378e48d1b9fbc6b44500e8b98debeaccd"),
  },
  // para 2030 (derivation index 1)
  {
    rcAccount: hexToU8a("96d16ffaae52a6a195b6d9f0b365677aedb77675f423813112c5ef5434523622"),
    derivationIndex: 1,
    ahAccount: hexToU8a("39d0a3c793549eda79b5cd3f8ab1c5879326352eb6583696249e38684b9451c1"),
  },
  // para 2030 (derivation index 2)
  {
    rcAccount: hexToU8a("773d6cf20cfdcbb74194ec6afca483facb3751bfb8933163f2e184f2b1424fb1"),
    derivationIndex: 2,
    ahAccount: hexToU8a("77c1303f053dc000bcacd591d0267f79ef5124a5b1a9207e8e1b29da9270e3a8"),
  },

  // para 3397
  // para 3397 (derivation index 0)
  {
    rcAccount: hexToU8a("950431ba0298ec4f6f5522dec45b9663f82057705a5c3d92b1bed454b64d8fa5"),
    derivationIndex: 0,
    ahAccount: hexToU8a("14ef48f42beb705327d66e011249d4a1bc9318a894ccf2a840c831081de7de0c"),
  },
];

// Sort the derived translations by rcAccount raw bytes for binary search optimization
export const DERIVED_TRANSLATIONS: DerivedTranslationEntry[] = DERIVED_TRANSLATIONS_RAW.sort((a, b) => {
  // Compare raw bytes directly for better performance
  return compareUint8Arrays(a.rcAccount, b.rcAccount);
});

// Secondary list containg the Bifrost soverign accounts on different chains for explicit verification
// GDocs link containing the account mappings: https://docs.google.com/document/d/1DXYWPXEwi0DkDfG8Fb2ZTI4DQBAz87DBCIW7yQIVrj0/edit?tab=t.0
const BIFROST_SOV_TRANSLATIONS_RAW: TranslationEntry[] = [
  // Polkadot/Westend/Paseo - para:2030 (Bifrost sovereign account)
  {
    rcAccount: hexToU8a("70617261ee070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cee070000000000000000000000000000000000000000000000000000"),
  },
  // Kusama/Westend/Paseo - para:2001 (Bifrost derived account)
  {
    rcAccount: hexToU8a("70617261d1070000000000000000000000000000000000000000000000000000"),
    ahAccount: hexToU8a("7369626cd1070000000000000000000000000000000000000000000000000000"),
  },
];

// Secondary list containg the Bifrost derived accounts on different chains for explicit verification
const BIFROST_DERIVED_TRANSLATIONS_RAW: DerivedTranslationEntry[] = [
  // Polkadot/Westend/Paseo - para2030 Utility index 0 (Bifrost derived account)
  {
    rcAccount: hexToU8a("adcea185416af2d3e8df8c1c8ee8a634bf1c3275b3820cb6d935300d42c73b2a"),
    derivationIndex: 0,
    ahAccount: hexToU8a("69f880852768f2d00acfa7824533aa4378e48d1b9fbc6b44500e8b98debeaccd"),
  },
  // Polkadot/Westend/Paseo - para2030 Utility index 1 (Bifrost derived account)
  {
    rcAccount: hexToU8a("96d16ffaae52a6a195b6d9f0b365677aedb77675f423813112c5ef5434523622"),
    derivationIndex: 1,
    ahAccount: hexToU8a("39d0a3c793549eda79b5cd3f8ab1c5879326352eb6583696249e38684b9451c1"),
  },
  // Polkadot/Westend/Paseo - para2030 Utility index 2 (Bifrost derived account)
  {
    rcAccount: hexToU8a("773d6cf20cfdcbb74194ec6afca483facb3751bfb8933163f2e184f2b1424fb1"),
    derivationIndex: 2,
    ahAccount: hexToU8a("77c1303f053dc000bcacd591d0267f79ef5124a5b1a9207e8e1b29da9270e3a8"),
  },
  // Kusama/Westend/Paseo - para2001 Utility index 0 (Bifrost derived account)
  {
    rcAccount: hexToU8a("5a53736d8e96f1c007cf0d630acf5209b20611617af23ce924c8e25328eb5d28"),
    derivationIndex: 0,
    ahAccount: hexToU8a("290bf94235666a351d9c8082c77e689813a905d0bbffdbd8b4a619ec5303ba27"),
  },
  // Kusama/Westend/Paseo - para2001 Utility index 1 (Bifrost derived account)
  {
    rcAccount: hexToU8a("f1c5ca0368e7a567945a59aaea92b9be1e0794fe5e077d017462b7ce8fc1ed7c"),
    derivationIndex: 1,
    ahAccount: hexToU8a("c94f02677ffb78dc23fbd3b95beb2650fe4fa5c466e5aedee74e89d96351800c"),
  },
  // Kusama/Westend/Paseo - para2001 Utility index 2 (Bifrost derived account)
  {
    rcAccount: hexToU8a("1e365411cfd0b0f78466be433a2ec5f7d545c5e28cb2e9a31ce97d4a28447dfc"),
    derivationIndex: 2,
    ahAccount: hexToU8a("a5604357a36f5cbfa6926f05f5c6397a901c373ed1c7249d348c5d13d059b1c6"),
  },
  // Kusama/Westend/Paseo - para2001 Utility index 3 (Bifrost derived account)
  {
    rcAccount: hexToU8a("234744488721d7ff43126a4784abe296de003c08fec5acece4af661eb97b78ed"),
    derivationIndex: 3,
    ahAccount: hexToU8a("92b0105f2681981d7691b31b3569125b9ae0cd0adebb6b37d804788fbbebf5c6"),
  },
  // Kusama/Westend/Paseo - para2001 Utility index 4 (Bifrost derived account)
  {
    rcAccount: hexToU8a("30b32c5f11bc7c29f1e5b24680eab529f7a7b44c6be698f11bc009f4001035b1"),
    derivationIndex: 4,
    ahAccount: hexToU8a("8044838bb093ef30cdae6923760b9f9f92a0817f3812acfb27b26a831acd3848"),
  },
];

// Sort the Bifrost sovereign translations by rcAccount raw bytes for binary search optimization
export const BIFROST_SOV_TRANSLATIONS: TranslationEntry[] = BIFROST_SOV_TRANSLATIONS_RAW.sort((a, b) => {
  // Compare raw bytes directly for better performance
  return compareUint8Arrays(a.rcAccount, b.rcAccount);
});

// Sort the Bifrost derived translations by rcAccount raw bytes for binary search optimization
export const BIFROST_DERIVED_TRANSLATIONS: DerivedTranslationEntry[] = BIFROST_DERIVED_TRANSLATIONS_RAW.sort((a, b) => {
  // Compare raw bytes directly for better performance
  return compareUint8Arrays(a.rcAccount, b.rcAccount);
});

// Helper function to compare Uint8Arrays for sorting
export function compareUint8Arrays(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

// Helper function to convert Uint8Array to hex string for debugging
export function u8aToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
