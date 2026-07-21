import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { sha256Hex } from './sha256.js';

/**
 * Gate C only. This inert compiler consumes caller-supplied transient reviewed
 * HTML, produces in-memory canonical package bytes, and never reads a source,
 * writes a package, or registers a runtime capability. Raw HTML is stripped
 * before persistence; only source spans and ordinary SHA-256 evidence remain.
 */

export const SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA = 'sectioned-edition-collection-package.v1' as const;
export const SECTIONED_EDITION_COLLECTION_MANIFEST_SCHEMA = 'sectioned-edition-collection-manifest.v1' as const;
export const SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY = 'parse5_pinned_topology_ascii_whitespace_br_lf_reviewed_blocks_nfc_only' as const;
export const SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS = 'brackets_preserved_exactly' as const;
export const SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS = 'mechanical_only_no_silent_correction' as const;

/** Immutable, content-free A1 evidence. No source body or cache locator is embedded here. */
export const AQUINAS_A1_SOURCE_LOCK_SHA256 = 'c5cfdd1edd132bf59968cbabe4c7de2180c42d205735ca6c06aec626104a180b' as const;
export const AQUINAS_A1_LOCAL_RECEIPT_SHA256 = 'bc0dab9ce5dc3672ccf2a81182655c75eaf6ef4f280584a40e079bf82a11719d' as const;
export const AQUINAS_A1_TOPOLOGY_LOCK_SHA256 = 'ce6197ba036ec7200f43513f9e6676ccfd5cb5a4727077a440770416bdf6978b' as const;
export const AQUINAS_A1_DISCREPANCY_LEDGER_SHA256 = 'c8e10cbf29d710b89fe48aa91d18f25489c96039116e53254d0592dfb0b68120' as const;
/** The historical ledger entry hashes are retained as opaque legacy A1 evidence, not recomputed under a new policy. */
export const AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM = 'legacy_a1_canonical_entry_sha256' as const;
export const AQUINAS_A1_PACKAGE_IDENTITY = Object.freeze({ workId: 'thomas-aquinas-summa-theologiae', editionId: 'aquinas-summa-english-dominican-gutenberg-electronic', collectionId: 'aquinas-summa-pg-v1', contentFormat: 'plain_text', availability: 'local_only_inactive' } as const);
export const AQUINAS_A1_SOURCES = Object.freeze([
  { ebookId: 17611, partKey: 'prima', htmlMemberBytes: 3_090_576, htmlMemberSha256: '310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088', intellectualStartByte: 18_414, cutoffEndByte: 3_070_657, rawCoverageSha256: 'ea9b7c7efb5f15dce4b07847983a224ec41b5ff8b8cd6980a84c24cbd8ac2314' },
  { ebookId: 17897, partKey: 'prima-secundae', htmlMemberBytes: 3_088_562, htmlMemberSha256: 'fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb', intellectualStartByte: 17_791, cutoffEndByte: 3_068_631, rawCoverageSha256: 'e038c3dd95c8c60e61745f7226560fc7617f381194cce6bc48dd640b5715f934' },
  { ebookId: 18755, partKey: 'secunda-secundae', htmlMemberBytes: 4_485_696, htmlMemberSha256: 'e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337', intellectualStartByte: 19_082, cutoffEndByte: 4_465_767, rawCoverageSha256: '8be29f08da126b3b3d08eff85248f471d6e4e8e2941d1477d87004512fae942f' },
  { ebookId: 19950, partKey: 'tertia', htmlMemberBytes: 2_927_390, htmlMemberSha256: '12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079', intellectualStartByte: 17_012, cutoffEndByte: 2_907_468, rawCoverageSha256: '62e0f60cb7d5fb6f793f8fb7f7f55d5f2daead136fc3a506b700aa81a706a4f9' },
] as const);
/** Standard SHA-256 of canonical JSON rows `{ type, startByte, endByte, sha256 }`, in source byte order. */
export const AQUINAS_A1_SOURCE_TYPED_RANGE_PROJECTION_ALGORITHM = 'sha256_utf8_canonical_json_content_free_typed_range.v1' as const;
export const AQUINAS_A1_SOURCE_TYPED_RANGES = Object.freeze([
  { artifactId: 'pg-17611', partKey: 'prima', typedRangeCount: 705, typedRangesSha256: 'f88706cdd02f1cf881ec2ccec6fe674be1fb983c84ecb1286c1f9077232212b0' },
  { artifactId: 'pg-17897', partKey: 'prima-secundae', typedRangeCount: 735, typedRangesSha256: '7a4534aaba5cbf85704c6917ac4000aaeea38c4f31f30e85cf196a1f88a84839' },
  { artifactId: 'pg-18755', partKey: 'secunda-secundae', typedRangeCount: 1106, typedRangesSha256: '3890f2669f7ec281be7b27f8dea8d74549b6ba63a61e283af6b5a4b82f9905f0' },
  { artifactId: 'pg-19950', partKey: 'tertia', typedRangeCount: 642, typedRangesSha256: '67beaadad35eda165fcc03ff51b5bf80de17055758dd7a752b010c1c45bf80d6' },
] as const);
export const AQUINAS_A1_TOPOLOGY_VECTOR = Object.freeze({ questionCount: 512, questionVectorSha256: '714b55268d7c2c777a12b17f7a4d3464fecc1eea69d4652568ab670e0a500aa9', questionKeysSha256: '1c3cfe11af52a7e29a09aae6ce64e854eac18bc96e5b05c55f8200e407022049', preambleCount: 512, articleCount: 2_669, articleVectorSha256: '4cb1703d44c2d7563477bd5dff9f7e346f64891b2bad2c59ed01c6c24ed0dfd3', articleKeysSha256: '6cfcf13360da2d30464ab48268c71b4d1b8408d7971ba497b41ddcce30ed79bd', orderedArticleKeysSha256: 'c55f3c3027743f68071f8316842452bf1de99f3ac4b42f2dd98afe1492d8a917', authorialChildRangeCount: 3_184, partPrologues: [{ partKey: 'prima', count: 1 }, { partKey: 'prima-secundae', count: 1 }, { partKey: 'secunda-secundae', count: 0 }, { partKey: 'tertia', count: 1 }], partQuestionPreambles: [{ partKey: 'prima', count: 119 }, { partKey: 'prima-secundae', count: 114 }, { partKey: 'secunda-secundae', count: 189 }, { partKey: 'tertia', count: 90 }], partArticles: [{ partKey: 'prima', count: 584 }, { partKey: 'prima-secundae', count: 619 }, { partKey: 'secunda-secundae', count: 917 }, { partKey: 'tertia', count: 549 }] } as const);
export const AQUINAS_A1_RIGHTS_AND_COVERAGE = Object.freeze({ jurisdiction: 'US-only', rightsStatus: 'public_domain', editionLineageDisclosure: 'English Dominican Province (EDP), Benziger Brothers, Perry/McClamrock transcription, CCEL-lineage electronic edition.', limitations: ['remaining_defects', 'no_pages', 'not_critical', 'diplomatic_not_facsimile'], authorialCoverageThrough: 'tertia.q090', supplement: 'excluded', exclusionKinds: ['source_wrapper', 'gutenberg_license', 'electronic_edition_provenance', 'dedication', 'table_of_contents', 'editorial_interlude', 'structural_metadata', 'supplement'] } as const);
/** Exact content-free A1 ledger projection; its JSON member order is preserved for legacy entry hashes. */
const AQUINAS_A1_DISCREPANCY_PROJECTION_JSON = String.raw`[{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q019","articleKey":"prima.q019.a009","observedLocator":"[I, Q. 19, Art. 8]","observedTagName":"p","evidenceStartByte":601683,"evidenceEndByte":601735,"evidenceSha256":"705012c202e3de9c180a02eaff81fb038d3a2f4a6fcf37380ea205090b6dfa22","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q028","articleKey":"prima.q028.a004","observedLocator":"[I, Q. 28, Art. 3]","observedTagName":"p","evidenceStartByte":820036,"evidenceEndByte":820089,"evidenceSha256":"22e40722d38bfe0b2bceafd6c021883c1fc674ee64a1415378891de2ed6fe00c","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q037","articleKey":"prima.q037.a001","observedLocator":"[I, Q. 37, Art. 2]","observedTagName":"p","evidenceStartByte":1007949,"evidenceEndByte":1008001,"evidenceSha256":"b2f966c5fcfab6533b8074177ca43102e714e358e7af48a5851161a8d478596b","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q042","articleKey":"prima.q042.a004","observedLocator":"[I, Q. 4, Art. 4]","observedTagName":"p","evidenceStartByte":1163063,"evidenceEndByte":1163115,"evidenceSha256":"b18760c3896318b7bac33205f173e5f88af9c13a7057b71a208f493989e940c3","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_question_scope_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q056","articleKey":"prima.q056.a001","observedLocator":"[I, Q. 56, Art 1]","observedTagName":"p","evidenceStartByte":1477150,"evidenceEndByte":1477201,"evidenceSha256":"04daff94251502e4fca3f6b8cabd77b845bc95a8c8069186d0b67016417bbfbe","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q058","articleKey":"prima.q058.a006","observedLocator":"[I, Q. 58, A. 6]","observedTagName":"h5","evidenceStartByte":1540228,"evidenceEndByte":1540280,"evidenceSha256":"f0d634ac3543dc51d11201df754c0d92786ae710e374572d081f1b4bc21a244f","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical","article_heading_tag_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q060","articleKey":"prima.q060.a003","observedLocator":"[I, Q. 60, Art. 4]","observedTagName":"p","evidenceStartByte":1578059,"evidenceEndByte":1578111,"evidenceSha256":"6f444a4f13012f279358048836b3d5dec4543906bb99984603811fd22cedb35a","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q062","articleKey":"prima.q062.a009","observedLocator":"[I, Q. 62, Art. 3]","observedTagName":"p","evidenceStartByte":1640856,"evidenceEndByte":1640908,"evidenceSha256":"34627aa49ee3cab14767d41ee352a48978e4376a496c7b8afd9efdc744d25545","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q071","articleKey":"prima.q071.a001","observedLocator":null,"observedTagName":null,"evidenceStartByte":1854426,"evidenceEndByte":1860858,"evidenceSha256":"734ddc1cce643b98662ed4dd39d59a9199a735552cdbb5de7b914cb002dcda5a","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":1854235,"resolvedPreambleEndByte":1854426,"resolvedArticleStartByte":1854426,"resolvedArticleEndByte":1860858,"codes":["article_heading_absent","article_locator_absent"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q072","articleKey":"prima.q072.a001","observedLocator":null,"observedTagName":null,"evidenceStartByte":1861048,"evidenceEndByte":1868279,"evidenceSha256":"0267507e95bb52b9b0ba79ed8b4db0d77725a7af4c4ce60fcb00cd4e47a5c31c","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":1860858,"resolvedPreambleEndByte":1861048,"resolvedArticleStartByte":1861048,"resolvedArticleEndByte":1868279,"codes":["article_heading_absent","article_locator_absent"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q086","articleKey":"prima.q086.a001","observedLocator":"[I, Q. 86, Art. 4]","observedTagName":"p","evidenceStartByte":2332661,"evidenceEndByte":2332713,"evidenceSha256":"8569388ae433a8d4c583f06bb8d4c850251b7e6cd44ee5e93d33b27da34038f2","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q098","articleKey":"prima.q098.a001","observedLocator":"[Q. 98, Art. 1]","observedTagName":"p","evidenceStartByte":2612052,"evidenceEndByte":2612101,"evidenceSha256":"55a7fe521fba46d7481f7f0f7f4371c97e6d69f5d44e4bf466438d1dca35fead","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_part_prefix_missing"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q111","articleKey":"prima.q111.a002","observedLocator":"[I, Q. 111, Art. 3]","observedTagName":"p","evidenceStartByte":2874347,"evidenceEndByte":2874401,"evidenceSha256":"44051f754fb2f7316a29cc0385ecb2df00ddd9189eb8e7fd9df84c6f2717c845","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17611,"partKey":"prima","htmlMemberSha256":"310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088","questionKey":"prima.q116","articleKey":null,"observedLocator":null,"observedTagName":null,"evidenceStartByte":2990739,"evidenceEndByte":2991147,"evidenceSha256":"ba572b2ce156ada0db2c0846b2584e1ce4bcd1ed1983093bdf4cc9acde7ffffe","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["question_heading_absent"],"resolutionBasis":"ledgered_missing_question_heading_scope"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q002","articleKey":"prima-secundae.q002.a006","observedLocator":"[I-II, Q. 2, Art. 5]","observedTagName":"p","evidenceStartByte":71940,"evidenceEndByte":71994,"evidenceSha256":"0f35bce14a163ad1141d21d585ac5f4e0023f9764da23314cfcf424c8a737f91","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q023","articleKey":"prima-secundae.q023.a001","observedLocator":null,"observedTagName":"h5","evidenceStartByte":606179,"evidenceEndByte":606212,"evidenceSha256":"c6eb07e4f27d7d618f489272134b2ed9724b861d0f103009d3f4c6e8afdb06f4","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":605411,"resolvedPreambleEndByte":606179,"resolvedArticleStartByte":606179,"resolvedArticleEndByte":611349,"codes":["article_locator_absent","question_heading_retyped_article_boundary"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q038","articleKey":null,"observedLocator":null,"observedTagName":null,"evidenceStartByte":930269,"evidenceEndByte":930287,"evidenceSha256":"ece6dcc11994b9dfedb192aaa9a902edac2f464a12139f0066c3cc1a601a7af4","containingElementStartByte":930212,"containingElementEndByte":930297,"containingElementSha256":"e09bb9d88d0b9a10c964bda6275f6dcb43ea559e2874f330e47c9ba74b1df717","observedDeclaredArticleCount":4,"resolvedArticleCount":5,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["declared_article_count_mismatch"],"resolutionBasis":"article_shell_count_and_preamble_evidence"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q050","articleKey":"prima-secundae.q050.a002","observedLocator":"[I-II, Q. 50, art. 2]","observedTagName":"p","evidenceStartByte":1163064,"evidenceEndByte":1163120,"evidenceSha256":"0248864da5f97bd6591d3ec07f857ae495637af9873cc49f4a89982b1b569fc9","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q061","articleKey":"prima-secundae.q061.a002","observedLocator":"[I-II, Q. 61, Art. 5]","observedTagName":"p","evidenceStartByte":1411861,"evidenceEndByte":1411917,"evidenceSha256":"8b46b7ff086e05f98e9cfea8a0422dd29b2a960eed9167dad3dac10de4cabcee","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q080","articleKey":"prima-secundae.q080.a003","observedLocator":"[I-II, Q, 80, Art. 3]","observedTagName":"p","evidenceStartByte":1958016,"evidenceEndByte":1958071,"evidenceSha256":"0b28d6d2d0b2d7853dca30e1215d695b1fd2d4b3290d649a893b73b89eb6b477","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q082","articleKey":null,"observedLocator":null,"observedTagName":null,"evidenceStartByte":1990437,"evidenceEndByte":1990987,"evidenceSha256":"be1a06ea29651f844390214ff1f47c084bab0d5acc14efc8a8b3cfa6419cc087","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":4,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["declared_article_count_absent"],"resolutionBasis":"article_shell_count_and_preamble_evidence"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q098","articleKey":"prima-secundae.q098.a004","observedLocator":"[I-II, Q, 98, Art. 4]","observedTagName":"p","evidenceStartByte":2367091,"evidenceEndByte":2367147,"evidenceSha256":"f1d4ffa1f12e334b39966852b023f5dcecfcc7c5a50ca538326ef0ea47051286","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":17897,"partKey":"prima-secundae","htmlMemberSha256":"fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb","questionKey":"prima-secundae.q109","articleKey":"prima-secundae.q109.a006","observedLocator":"[I, Q. 109, Art. 6]","observedTagName":"p","evidenceStartByte":2885955,"evidenceEndByte":2886008,"evidenceSha256":"cb36d2976ceb3fa94b8470a2df044aeb6dc1fe45c860975ec0a27331a10151ec","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_part_prefix_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q019","articleKey":"secunda-secundae.q019.a007","observedLocator":"[II-II, Q. 19, Art. 6]","observedTagName":"p","evidenceStartByte":479902,"evidenceEndByte":479958,"evidenceSha256":"0a8667507bec62296e4a350e561437a2d5a4db2a65dfdc624926115af5f20ddd","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch","article_ordinal_position_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q019","articleKey":"secunda-secundae.q019.a008","observedLocator":"[II-II, Q. 19, Art. 7]","observedTagName":"p","evidenceStartByte":483858,"evidenceEndByte":483916,"evidenceSha256":"ceb9b93b31c8df04aa32dda948032126a67d53d490e035466c4f61a0ad13a59e","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch","article_ordinal_position_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q024","articleKey":"secunda-secundae.q024.a006","observedLocator":null,"observedTagName":"h5","evidenceStartByte":604271,"evidenceEndByte":604306,"evidenceSha256":"47cc51ca2688c7bc21b6305cb8baaf0ccf0ad2d7f1e94593ece4ecfa8e9016db","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["article_locator_absent","article_heading_tag_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q040","articleKey":"secunda-secundae.q040.a003","observedLocator":"[II-II, Q., 40, Art. 3]","observedTagName":"p","evidenceStartByte":1050110,"evidenceEndByte":1050167,"evidenceSha256":"f9f308a7de9d076821f2c8e73acf1062b7d9d59f1c1e7965d2e8237a4be09c53","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q046","articleKey":"secunda-secundae.q046.a002","observedLocator":"[II-II, Q. 45, Art. 2]","observedTagName":"p","evidenceStartByte":1172642,"evidenceEndByte":1172699,"evidenceSha256":"09ccca01c2403d54625a62170aaa38e2a18f0ec5f223545dfc2cdea51beac790","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_question_scope_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q087","articleKey":"secunda-secundae.q087.a003","observedLocator":"[II-II, Q. 87, Art. 4]","observedTagName":"p","evidenceStartByte":2105360,"evidenceEndByte":2105416,"evidenceSha256":"869399faca17e3f98957e406c83aeadc47c321fd843d978abca0af03fa14d6d7","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q104","articleKey":"secunda-secundae.q104.a002","observedLocator":"[II-II, Q, 104, Art. 2]","observedTagName":"p","evidenceStartByte":2513579,"evidenceEndByte":2513637,"evidenceSha256":"fe74bf5b442950e09859318b54827b089358ad7d73e1cb65bcb75760fd6d8598","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q105","articleKey":"secunda-secundae.q105.a001","observedLocator":"[II-II, Q. 105, Art. 2]","observedTagName":"p","evidenceStartByte":2541951,"evidenceEndByte":2542008,"evidenceSha256":"67accc83c833986c4cb062259eb2a273701c86f37ab6f6aebad2850d9ab0f8c9","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q128","articleKey":null,"observedLocator":null,"observedTagName":null,"evidenceStartByte":2950674,"evidenceEndByte":2950957,"evidenceSha256":"7a851fcd1998d0c7ce6dea66c01c22f11aea7a27c45672c6184af1b3fbf19ae9","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":1,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["declared_article_count_absent"],"resolutionBasis":"article_shell_count_and_preamble_evidence"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q137","articleKey":"secunda-secundae.q137.a003","observedLocator":"[II-II, Q. 137. Art. 3]","observedTagName":"p","evidenceStartByte":3109424,"evidenceEndByte":3109481,"evidenceSha256":"a4bc794650244d7365d2835cd34d218b50912685926bb901eb132ccb28a6b187","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q143","articleKey":null,"observedLocator":null,"observedTagName":null,"evidenceStartByte":3195109,"evidenceEndByte":3195389,"evidenceSha256":"9fab53e513701ce46c8160b06f82c8ea4f8ec97d27f56db0059b6ef36aa53647","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":1,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["declared_article_count_absent"],"resolutionBasis":"article_shell_count_and_preamble_evidence"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q146","articleKey":"secunda-secundae.q146.a002","observedLocator":"[II-II, Q. 146, Art. 1]","observedTagName":"p","evidenceStartByte":3244678,"evidenceEndByte":3244736,"evidenceSha256":"c9de1cb054a04933e9cd92b420a7e5a9bbb7d4c141f26d62bff8616d999b9679","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q154","articleKey":"secunda-secundae.q154.a010","observedLocator":"[II-II, Q. 154, Art. 1]","observedTagName":"p","evidenceStartByte":3459770,"evidenceEndByte":3459827,"evidenceSha256":"45a0faf9baf259852f26160e484cfeff3a5b1ddf00449441c492cd96fb48599f","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q163","articleKey":"secunda-secundae.q163.a003","observedLocator":"[II-II, Q. 163, Art. 7]","observedTagName":"p","evidenceStartByte":3672847,"evidenceEndByte":3672904,"evidenceSha256":"32b5a126dd9318c019b643c1bf1ea691f1616765bfcd4eb56fa2bb42aacc623a","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q174","articleKey":"secunda-secundae.q174.a005","observedLocator":"[II-II, Q. 174, Art. 6]","observedTagName":"p","evidenceStartByte":3903651,"evidenceEndByte":3903708,"evidenceSha256":"f381659e4998db558a1ae063cbd61add7963d1b9d7fe439ad3beea4d4021c55c","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q181","articleKey":"secunda-secundae.q181.a003","observedLocator":"[II-II, Q. 811, Art. 3]","observedTagName":"p","evidenceStartByte":4052584,"evidenceEndByte":4052641,"evidenceSha256":"fc202e5cfca80da3dd5450469c099d37686d8e5d06ec46b386662c2ccd891e56","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_question_scope_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":18755,"partKey":"secunda-secundae","htmlMemberSha256":"e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337","questionKey":"secunda-secundae.q183","articleKey":null,"observedLocator":null,"observedTagName":null,"evidenceStartByte":4083371,"evidenceEndByte":4084111,"evidenceSha256":"ca964f03d2c2adc7a589c3a57cabd7922cfcf2d19e6ad0032a3f9a1a6ff363bb","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["question_heading_absent"],"resolutionBasis":"ledgered_missing_question_heading_scope"},{"ebookId":19950,"partKey":"tertia","htmlMemberSha256":"12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079","questionKey":"tertia.q005","articleKey":"tertia.q005.a004","observedLocator":"[II-II, Q. 5, Art. 4]","observedTagName":"p","evidenceStartByte":202200,"evidenceEndByte":202256,"evidenceSha256":"75473d59c7509c233c90830569d20ff84da092f8ca8ac279c93b789766b169ae","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_part_prefix_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":19950,"partKey":"tertia","htmlMemberSha256":"12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079","questionKey":"tertia.q007","articleKey":"tertia.q007.a004","observedLocator":"[III, Q. 7. Art. 4]","observedTagName":"p","evidenceStartByte":246950,"evidenceEndByte":247004,"evidenceSha256":"7b3a011f557f1f02f412b99dd98d6288385a1259e234b14cda7e79fa75a58632","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_syntax_noncanonical"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":19950,"partKey":"tertia","htmlMemberSha256":"12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079","questionKey":"tertia.q048","articleKey":"tertia.q048.a004","observedLocator":"[III, Q. 48, Art. 3]","observedTagName":"p","evidenceStartByte":1412232,"evidenceEndByte":1412287,"evidenceSha256":"da741974245f5666cbfd64c847d49d4d6084286aa4d2a6850f0a4a00ad460dc4","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":19950,"partKey":"tertia","htmlMemberSha256":"12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079","questionKey":"tertia.q050","articleKey":null,"observedLocator":null,"observedTagName":null,"evidenceStartByte":1452949,"evidenceEndByte":1453661,"evidenceSha256":"65d62b50d9d76c24706abb306d6636fb9e10933bd98b14e3ed492469703505f3","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":6,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["declared_article_count_absent"],"resolutionBasis":"article_shell_count_and_preamble_evidence"},{"ebookId":19950,"partKey":"tertia","htmlMemberSha256":"12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079","questionKey":"tertia.q060","articleKey":"tertia.q060.a006","observedLocator":"[III, Q. 60, Art. 5]","observedTagName":"p","evidenceStartByte":1738884,"evidenceEndByte":1738938,"evidenceSha256":"b78ff85c8a7a1c66986cbdb7d52d1bb6127d4a63adeafb84711ddc3d574f61e6","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_article_ordinal_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"},{"ebookId":19950,"partKey":"tertia","htmlMemberSha256":"12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079","questionKey":"tertia.q089","articleKey":"tertia.q089.a005","observedLocator":"[III, Q. 86, Art. 5]","observedTagName":"p","evidenceStartByte":2882615,"evidenceEndByte":2882669,"evidenceSha256":"a69476e116b6c8ab991b77c6d48f643180abdd9237ff3593312136ea9df0f3d0","containingElementStartByte":null,"containingElementEndByte":null,"containingElementSha256":null,"observedDeclaredArticleCount":null,"resolvedArticleCount":null,"resolvedPreambleStartByte":null,"resolvedPreambleEndByte":null,"resolvedArticleStartByte":null,"resolvedArticleEndByte":null,"codes":["locator_question_scope_mismatch"],"resolutionBasis":"ordinal_position_and_declared_count"}]`;
export const AQUINAS_A1_DISCREPANCY_INVENTORY = Object.freeze(
  (JSON.parse(AQUINAS_A1_DISCREPANCY_PROJECTION_JSON) as A1DiscrepancyLedgerEntry[]).map((entry, index) => Object.freeze({
    ref: `a1-ledger-${String(index + 1).padStart(3, '0')}`,
    canonicalEntrySha256: legacyA1DiscrepancyEntrySha256(entry),
    ...entry,
  })),
);
export const AQUINAS_A1_DISCREPANCY_VECTOR_SHA256 = 'abfcc764d06f5344051fb488a31745b20b189c3c9223dc76aee663bbadfde885' as const;

export const SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS = Object.freeze({
  contentChildUtf8Bytes: 131_072,
  packageContentUtf8Bytes: 4_194_304,
  canonicalSerializedPackageUtf8Bytes: 4_718_592,
  childRawUtf8Bytes: 1_048_576,
  childNodes: 8_192,
  childDepth: 32,
  childAttributes: 128,
  childBlocks: 4_096,
  questionRawUtf8Bytes: 4_194_304,
  questionNodes: 32_768,
  questionDepth: 48,
  questionAttributes: 512,
  questionBlocks: 8_192,
  draftRawUtf8Bytes: 67_108_864,
  draftNodes: 1_000_000,
  draftDepth: 64,
  draftAttributes: 131_072,
  draftBlocks: 131_072,
} as const);

export type AquinasPackagePartKey = 'prima' | 'prima-secundae' | 'secunda-secundae' | 'tertia';
export type SourceStatus = 'verified' | 'discrepancy_ledgered';
export type ExclusionKind = typeof AQUINAS_A1_RIGHTS_AND_COVERAGE.exclusionKinds[number];

export const AQUINAS_PACKAGE_PARTS = Object.freeze([
  { key: 'prima', questions: 119 },
  { key: 'prima-secundae', questions: 114 },
  { key: 'secunda-secundae', questions: 189 },
  { key: 'tertia', questions: 90 },
] as const satisfies readonly Readonly<{ key: AquinasPackagePartKey; questions: number }>[]);

export interface SourceArtifactEvidence {
  artifactId: string;
  partKey: AquinasPackagePartKey;
  htmlMemberBytes: number;
  htmlMemberSha256: string;
  intellectualStartByte: number;
  cutoffEndByte: number;
  rawCoverageSha256: string;
  /** Transient only; omitted from PersistedPackage. */
  html: string;
}

export interface RawSpan {
  startByte: number;
  endByte: number;
  rawSha256: string;
}

export interface ReviewedTopology {
  containerTag: 'p' | 'div' | 'blockquote' | 'h4' | 'h5';
  inlineTags: ('i' | 'em' | 'b' | 'strong' | 'span' | 'sup' | 'sub')[];
}

export interface TransientReviewedBlock {
  span: RawSpan;
  html: string;
  topology: ReviewedTopology;
}

export interface TransientChild {
  kind: 'preamble' | 'article' | 'part_prologue';
  articleKey?: string;
  ordinal?: number;
  source: { artifactId: string; span: RawSpan; blocks: TransientReviewedBlock[] };
  bracketPreservationStatus: typeof SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS;
  correctionStatus: typeof SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS;
}

export interface TransientQuestionEvidence {
  questionKey: string;
  partKey: AquinasPackagePartKey;
  questionNumber: number;
  articleCount: number;
  source: { artifactId: string; span: RawSpan };
  orderedArticleKeysSha256: string;
  bracketStatus: 'mixed_unresolved_preserve_verbatim_in_a2';
  sourceLocatorStatus: SourceStatus;
  sourceStructureStatus: SourceStatus;
}

export interface TransientQuestion extends TransientQuestionEvidence {
  discrepancyRefs: string[];
  preamble: TransientChild;
  articles: TransientChild[];
}

export interface TransientPartPrologue {
  partKey: AquinasPackagePartKey;
  child: TransientChild;
}

export interface TransientExclusion {
  exclusionId: string;
  kind: ExclusionKind;
  artifactId: string;
  span: RawSpan;
  html: string;
}

export interface PersistedExclusion {
  exclusionId: string;
  kind: ExclusionKind;
  artifactId: string;
  span: RawSpan;
}

export type A1ResolutionBasis = 'ordinal_position_and_declared_count' | 'ledgered_missing_question_heading_scope' | 'article_shell_count_and_preamble_evidence';

/** Exact content-free entry schema from the checked-in A1 topology discrepancy ledger. */
export interface A1DiscrepancyLedgerEntry {
  ebookId: number;
  partKey: AquinasPackagePartKey;
  htmlMemberSha256: string;
  questionKey: string;
  articleKey: string | null;
  observedLocator: string | null;
  observedTagName: string | null;
  evidenceStartByte: number;
  evidenceEndByte: number;
  evidenceSha256: string;
  containingElementStartByte: number | null;
  containingElementEndByte: number | null;
  containingElementSha256: string | null;
  observedDeclaredArticleCount: number | null;
  resolvedArticleCount: number | null;
  resolvedPreambleStartByte: number | null;
  resolvedPreambleEndByte: number | null;
  resolvedArticleStartByte: number | null;
  resolvedArticleEndByte: number | null;
  codes: string[];
  resolutionBasis: A1ResolutionBasis;
}

export interface TransientDiscrepancy extends A1DiscrepancyLedgerEntry {
  ref: string;
  canonicalEntrySha256: string;
}

export interface TransientSectionedEditionCollectionDraft {
  mode: 'synthetic_fixture' | 'a1_attested';
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA;
  normalizationPolicy: typeof SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY;
  identity: typeof AQUINAS_A1_PACKAGE_IDENTITY;
  sourceLockSha256: string;
  localReceiptSha256: string;
  topologyLockSha256: string;
  /** Count and domain-separated digest of the ordered prologue/preamble/article source spans. */
  typedRangeCount: number;
  typedRangesSha256: string;
  discrepancyLedgerSha256: string;
  /** Full reviewed source member, retained only while this transient draft is compiled. */
  sourceArtifacts: SourceArtifactEvidence[];
  rightsAndCoverage: typeof AQUINAS_A1_RIGHTS_AND_COVERAGE;
  partPrologues: TransientPartPrologue[];
  exclusions: TransientExclusion[];
  discrepancies: TransientDiscrepancy[];
  questions: TransientQuestion[];
}

export interface PersistedSourceEvidence {
  artifactId: string;
  span: RawSpan;
  outputSha256: string;
  outputUtf8Bytes: number;
  rawStats: RawStats;
}

export interface OutputEvidence {
  startByte: number;
  endByte: number;
  utf8Bytes: number;
  sha256: string;
}

export interface RawStats {
  rawUtf8Bytes: number;
  nodes: number;
  depth: number;
  attributes: number;
  blocks: number;
}

export interface PersistedChild {
  kind: 'preamble' | 'article' | 'part_prologue';
  articleKey?: string;
  ordinal?: number;
  source: PersistedSourceEvidence;
  output: OutputEvidence;
  content: string;
  bracketPreservationStatus: typeof SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS;
  correctionStatus: typeof SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS;
}

export interface PersistedQuestion extends TransientQuestionEvidence {
  discrepancyRefs: string[];
  source: { artifactId: string; span: RawSpan; rawStats: RawStats };
  output: OutputEvidence;
  preamble: PersistedChild;
  articles: PersistedChild[];
}

export interface PersistedPackage {
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA;
  identity: typeof AQUINAS_A1_PACKAGE_IDENTITY;
  normalizationPolicy: typeof SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY;
  sourceLockSha256: string;
  localReceiptSha256: string;
  topologyLockSha256: string;
  typedRangeCount: number;
  typedRangesSha256: string;
  discrepancyLedgerSha256: string;
  discrepancyEntryHashAlgorithm: typeof AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM;
  /** Synthetic fixtures are explicitly non-release; attested packages carry null. */
  fixtureStatus: 'synthetic_fixture_non_release' | null;
  rightsAndCoverage: typeof AQUINAS_A1_RIGHTS_AND_COVERAGE;
  /** Source-member HTML is deliberately absent from persisted package bytes. */
  sourceArtifacts: Omit<SourceArtifactEvidence, 'html'>[];
  exclusions: PersistedExclusion[];
  /** Ledgered observation/resolution spans remain auditable without retaining source HTML. */
  discrepancyInventory: TransientDiscrepancy[];
  shard: {
    shardId: string;
    partKey: AquinasPackagePartKey;
    ordinal: number;
    firstQuestionKey: string;
    lastQuestionKey: string;
    questionKeys: string[];
    orderedArticleKeysSha256: string;
    normalizedContentUtf8Bytes: number;
  };
  partPrologue: PersistedChild | null;
  questions: PersistedQuestion[];
}

export interface PersistedManifest {
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_MANIFEST_SCHEMA;
  identity: typeof AQUINAS_A1_PACKAGE_IDENTITY;
  attestationMode: 'synthetic_fixture' | 'a1_attested';
  fixtureStatus: 'synthetic_fixture_non_release' | null;
  topologyLockSha256: string;
  discrepancyLedgerSha256: string;
  orderedQuestionKeysSha256: string;
  orderedArticleKeysSha256: string;
  shards: {
    shardId: string;
    partKey: AquinasPackagePartKey;
    ordinal: number;
    firstQuestionKey: string;
    lastQuestionKey: string;
    questionKeys: string[];
    normalizedContentUtf8Bytes: number;
    canonicalSerializedPackageUtf8Bytes: number;
    canonicalPackageSha256: string;
  }[];
  aggregateSha256: string;
}

export interface CompiledSectionedEditionCollectionPackage {
  package: PersistedPackage;
  persistedBytes: Uint8Array;
  persistedSha256: string;
}

export interface CompiledSectionedEditionCollectionPackageSet {
  manifest: PersistedManifest;
  packages: CompiledSectionedEditionCollectionPackage[];
}

/** Content-free planner used to prove the same no-split maximal-prefix gate without body fixtures. */
export interface SectionedEditionCollectionPackageMetric {
  questionKey: string;
  normalizedContentUtf8Bytes: number;
  canonicalSerializedPackageUtf8Bytes: number;
}

export class SectionedEditionCollectionPackageValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SectionedEditionCollectionPackageValidationError';
  }
}

export function expectedAquinasPackageQuestionKeys(): readonly string[] {
  return AQUINAS_PACKAGE_PARTS.flatMap(part => Array.from({ length: part.questions }, (_, index) => `${part.key}.q${String(index + 1).padStart(3, '0')}`));
}

export function buildMaximalWithinPartPackagePlan(metrics: readonly SectionedEditionCollectionPackageMetric[]): { partKey: AquinasPackagePartKey; questionKeys: string[]; normalizedContentUtf8Bytes: number; canonicalSerializedPackageUtf8Bytes: number }[] {
  const values = arrayAt(metrics, 'metrics', 512, 512).map((value, index) => {
    const root = objectAt(value, `metrics[${index}]`, ['questionKey', 'normalizedContentUtf8Bytes', 'canonicalSerializedPackageUtf8Bytes']);
    return { questionKey: questionKeyAt(root.questionKey, `metrics[${index}].questionKey`), normalizedContentUtf8Bytes: integerAt(root.normalizedContentUtf8Bytes, `metrics[${index}].normalizedContentUtf8Bytes`, 1), canonicalSerializedPackageUtf8Bytes: integerAt(root.canonicalSerializedPackageUtf8Bytes, `metrics[${index}].canonicalSerializedPackageUtf8Bytes`, 1) };
  });
  equalCanonical(values.map(value => value.questionKey), expectedAquinasPackageQuestionKeys(), 'metrics', 'must preserve exact ordered 512-question coverage');
  return AQUINAS_PACKAGE_PARTS.flatMap(part => {
    const questions = values.filter(value => partForQuestionKey(value.questionKey) === part.key);
    const planned: { partKey: AquinasPackagePartKey; questionKeys: string[]; normalizedContentUtf8Bytes: number; canonicalSerializedPackageUtf8Bytes: number }[] = [];
    let start = 0;
    while (start < questions.length) {
      let end = start; let content = 0; let serialized = 0;
      while (end < questions.length) {
        const next = questions[end]!;
        if (content + next.normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes || serialized + next.canonicalSerializedPackageUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes) break;
        content += next.normalizedContentUtf8Bytes; serialized += next.canonicalSerializedPackageUtf8Bytes; end += 1;
      }
      if (end === start) fail(`metrics[${start}]`, 'one parent question cannot fit package caps without splitting');
      planned.push({ partKey: part.key, questionKeys: questions.slice(start, end).map(value => value.questionKey), normalizedContentUtf8Bytes: content, canonicalSerializedPackageUtf8Bytes: serialized });
      start = end;
    }
    return planned;
  });
}

export function canonicalSectionedEditionCollectionPackageBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(canonicalize(value)));
}

/** Strict transient-input schema validation; raw reviewed HTML never crosses this boundary into persistence. */
export function validateTransientSectionedEditionCollectionPackageDraft(input: unknown): TransientSectionedEditionCollectionDraft {
  return validateTransientDraft(input);
}

export function compileSectionedEditionCollectionPackage(input: unknown): CompiledSectionedEditionCollectionPackageSet {
  return compileValidatedTransientDraft(validateTransientDraft(input));
}

function compileValidatedTransientDraft(draft: TransientSectionedEditionCollectionDraft): CompiledSectionedEditionCollectionPackageSet {
  const compiled = compileTransientDraft(draft);
  const packages = shardCompiledDraft(draft, compiled.questions, compiled.prologues);
  const manifest = buildManifest(packages, draft);
  return { manifest, packages };
}

/** Recompiles from transient reviewed input and performs exact byte-for-byte persisted-file verification. */
export function verifyPersistedPackageBytes(input: unknown, persistedBytes: readonly Uint8Array[], persistedManifest?: PersistedManifest): CompiledSectionedEditionCollectionPackageSet {
  const draft = validateTransientDraft(input);
  if (draft.mode !== 'a1_attested') fail('$.mode', 'release byte verification accepts only a1_attested reviewed input; synthetic fixtures are non-release');
  const compiled = compileValidatedTransientDraft(draft);
  assertReleaseManifestAttestation(compiled.manifest);
  for (const value of compiled.packages) assertReleasePackageAttestation(value.package);
  if (persistedManifest !== undefined) {
    assertReleaseManifestAttestation(persistedManifest);
    if (!sameBytes(canonicalSectionedEditionCollectionPackageBytes(persistedManifest), canonicalSectionedEditionCollectionPackageBytes(compiled.manifest))) fail('persistedManifest', 'does not byte-compare with canonical recompilation from attested reviewed input');
  }
  if (persistedBytes.length !== compiled.packages.length) fail('persistedBytes', 'must contain one canonical file per deterministic shard');
  for (let index = 0; index < compiled.packages.length; index += 1) {
    if (!sameBytes(compiled.packages[index]!.persistedBytes, persistedBytes[index]!)) fail(`persistedBytes[${index}]`, 'does not byte-compare with canonical recompilation from transient input');
  }
  return compiled;
}

/** Release verification rejects a manifest unless it is unambiguously A1-attested. */
export function assertReleaseManifestAttestation(manifest: Pick<PersistedManifest, 'attestationMode' | 'fixtureStatus'>): void {
  if (manifest.attestationMode !== 'a1_attested' || manifest.fixtureStatus !== null) fail('manifest', 'release verification rejects synthetic or unattested manifests');
}

/** Release verification rejects a package unless it is unambiguously A1-attested. */
export function assertReleasePackageAttestation(pkg: Pick<PersistedPackage, 'fixtureStatus'>): void {
  if (pkg.fixtureStatus !== null) fail('package', 'release verification rejects synthetic packages');
}

/** A testable content-free check for the immutable A1 descriptor itself. */
export function validateImmutableA1EvidenceDescriptor(): void {
  if (AQUINAS_A1_SOURCES.length !== 4) fail('A1.sources', 'must enumerate exactly four HTML artifacts');
  if (AQUINAS_A1_TOPOLOGY_VECTOR.questionCount !== 512 || AQUINAS_A1_TOPOLOGY_VECTOR.preambleCount !== 512 || AQUINAS_A1_TOPOLOGY_VECTOR.articleCount !== 2_669) fail('A1.topology', 'must bind 512 questions, 512 preambles, and 2669 articles');
  if (AQUINAS_A1_DISCREPANCY_INVENTORY.length !== 46) fail('A1.discrepancies', 'must bind the ordered 46-entry discrepancy inventory');
  const prologues = AQUINAS_A1_TOPOLOGY_VECTOR.partPrologues.map(value => `${value.partKey}:${value.count}`).join(',');
  if (prologues !== 'prima:1,prima-secundae:1,secunda-secundae:0,tertia:1') fail('A1.prologues', 'must include Prima, I-II, and III only');
  if (AQUINAS_A1_TOPOLOGY_VECTOR.authorialChildRangeCount !== 3_184 || AQUINAS_A1_SOURCE_TYPED_RANGES.reduce((count, source) => count + source.typedRangeCount, 0) !== 3_188) fail('A1.typedRanges', 'must separately bind 3,184 authorial child ranges and the four native source typed-range projections');
  if (AQUINAS_A1_TOPOLOGY_VECTOR.partQuestionPreambles.map(value => value.count).join(',') !== '119,114,189,90' || AQUINAS_A1_TOPOLOGY_VECTOR.partArticles.map(value => value.count).join(',') !== '584,619,917,549') fail('A1.topology', 'must retain exact per-part preamble and article counts');
  if (AQUINAS_A1_RIGHTS_AND_COVERAGE.authorialCoverageThrough !== 'tertia.q090' || AQUINAS_A1_RIGHTS_AND_COVERAGE.supplement !== 'excluded') fail('A1.coverage', 'must stop authorial delivery at III.90 and exclude the Supplement');
}

/** Validates the exact locked per-source typed-range commitments without reading any source member. */
export function validateA1SourceTypedRangeProjection(input: unknown): void {
  const values = arrayAt(input, 'A1.sourceTypedRanges', 4, 4).map((value, index) => {
    const root = objectAt(value, `A1.sourceTypedRanges[${index}]`, ['artifactId', 'partKey', 'typedRangeCount', 'typedRangesSha256']);
    return { artifactId: safeIdAt(root.artifactId, `A1.sourceTypedRanges[${index}].artifactId`), partKey: enumAt(root.partKey, `A1.sourceTypedRanges[${index}].partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key)), typedRangeCount: integerAt(root.typedRangeCount, `A1.sourceTypedRanges[${index}].typedRangeCount`, 1), typedRangesSha256: shaAt(root.typedRangesSha256, `A1.sourceTypedRanges[${index}].typedRangesSha256`) };
  });
  equalCanonical(values, AQUINAS_A1_SOURCE_TYPED_RANGES, 'A1.sourceTypedRanges', 'must exactly bind all four native topology-lock typed-range commitments');
}

/** Validates every field of the checked-in 46-entry content-free A1 discrepancy projection. */
export function validateA1DiscrepancyProjection(input: unknown): void {
  const values = arrayAt(input, 'A1.discrepancies', 46, 46).map((value, index) => validateDiscrepancy(value, `A1.discrepancies[${index}]`));
  equalCanonical(values, AQUINAS_A1_DISCREPANCY_INVENTORY, 'A1.discrepancies', 'must exactly bind every ordered A1 discrepancy projection field');
}

function validateTransientDraft(input: unknown): TransientSectionedEditionCollectionDraft {
  const root = objectAt(input, '$', ['mode', 'schemaVersion', 'normalizationPolicy', 'identity', 'sourceLockSha256', 'localReceiptSha256', 'topologyLockSha256', 'typedRangeCount', 'typedRangesSha256', 'discrepancyLedgerSha256', 'sourceArtifacts', 'rightsAndCoverage', 'partPrologues', 'exclusions', 'discrepancies', 'questions']);
  const mode = enumAt(root.mode, '$.mode', ['synthetic_fixture', 'a1_attested'] as const);
  literalAt(root.schemaVersion, '$.schemaVersion', SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA);
  literalAt(root.normalizationPolicy, '$.normalizationPolicy', SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY);
  const identity = validateExactIdentity(root.identity, '$.identity');
  const sourceArtifacts = arrayAt(root.sourceArtifacts, '$.sourceArtifacts', 1, 4).map((value, index) => validateSourceArtifact(value, `$.sourceArtifacts[${index}]`));
  assertUnique(sourceArtifacts.map(value => value.artifactId), '$.sourceArtifacts');
  const artifacts = new Map(sourceArtifacts.map(value => [value.artifactId, value] as const));
  const sourceLockSha256 = shaAt(root.sourceLockSha256, '$.sourceLockSha256');
  const localReceiptSha256 = shaAt(root.localReceiptSha256, '$.localReceiptSha256');
  const topologyLockSha256 = shaAt(root.topologyLockSha256, '$.topologyLockSha256');
  const typedRangeCount = integerAt(root.typedRangeCount, '$.typedRangeCount', 1);
  const typedRangesSha256 = shaAt(root.typedRangesSha256, '$.typedRangesSha256');
  const discrepancyLedgerSha256 = shaAt(root.discrepancyLedgerSha256, '$.discrepancyLedgerSha256');
  const rightsAndCoverage = validateRightsAndCoverage(root.rightsAndCoverage, '$.rightsAndCoverage');
  const partPrologues = arrayAt(root.partPrologues, '$.partPrologues', 0, 3).map((value, index) => validatePrologue(value, `$.partPrologues[${index}]`, artifacts));
  assertExactPrologueInventory(partPrologues, '$.partPrologues');
  const exclusions = arrayAt(root.exclusions, '$.exclusions', 0, 16_384).map((value, index) => validateExclusion(value, `$.exclusions[${index}]`, artifacts));
  const discrepancies = arrayAt(root.discrepancies, '$.discrepancies', 0, 46).map((value, index) => validateDiscrepancy(value, `$.discrepancies[${index}]`));
  const refs = new Map(discrepancies.map(value => [value.ref, value] as const));
  const questions = arrayAt(root.questions, '$.questions', 1, 512).map((value, index) => validateQuestion(value, `$.questions[${index}]`, artifacts, refs));
  const typedRanges = typedRangeRows(partPrologues, questions);
  if (typedRangeCount !== typedRanges.length) fail('$.typedRangeCount', 'must equal the exact ordered prologue/preamble/article source-range count');
  literalAt(typedRangesSha256, '$.typedRangesSha256', typedRangeDigest(typedRanges));
  assertDraftStats([...partPrologues.map(value => value.child), ...questions.flatMap(question => [question.preamble, ...question.articles])], exclusions);
  assertCoverage(sourceArtifacts, partPrologues, exclusions, questions);
  const draft = { mode, schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA, normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY, identity, sourceLockSha256, localReceiptSha256, topologyLockSha256, typedRangeCount, typedRangesSha256, discrepancyLedgerSha256, sourceArtifacts, rightsAndCoverage, partPrologues, exclusions, discrepancies, questions };
  if (mode === 'a1_attested') assertA1AttestedDraft(draft);
  return draft;
}

function validateExactIdentity(input: unknown, path: string): typeof AQUINAS_A1_PACKAGE_IDENTITY {
  const root = objectAt(input, path, ['workId', 'editionId', 'collectionId', 'contentFormat', 'availability']);
  for (const key of Object.keys(AQUINAS_A1_PACKAGE_IDENTITY) as (keyof typeof AQUINAS_A1_PACKAGE_IDENTITY)[]) literalAt(root[key], `${path}.${key}`, AQUINAS_A1_PACKAGE_IDENTITY[key]);
  return { ...AQUINAS_A1_PACKAGE_IDENTITY };
}

function validateRightsAndCoverage(input: unknown, path: string): typeof AQUINAS_A1_RIGHTS_AND_COVERAGE {
  const root = objectAt(input, path, ['jurisdiction', 'rightsStatus', 'editionLineageDisclosure', 'limitations', 'authorialCoverageThrough', 'supplement', 'exclusionKinds']);
  equalCanonical(root, AQUINAS_A1_RIGHTS_AND_COVERAGE, path, 'must exactly bind the immutable US-only rights, lineage, limitations, and coverage descriptor');
  return structuredClone(AQUINAS_A1_RIGHTS_AND_COVERAGE);
}

function validateSourceArtifact(input: unknown, path: string): SourceArtifactEvidence {
  const root = objectAt(input, path, ['artifactId', 'partKey', 'htmlMemberBytes', 'htmlMemberSha256', 'intellectualStartByte', 'cutoffEndByte', 'rawCoverageSha256', 'html']);
  const start = integerAt(root.intellectualStartByte, `${path}.intellectualStartByte`, 0);
  const end = integerAt(root.cutoffEndByte, `${path}.cutoffEndByte`, start + 1);
  const html = textAt(root.html, `${path}.html`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.draftRawUtf8Bytes);
  const htmlMemberBytes = integerAt(root.htmlMemberBytes, `${path}.htmlMemberBytes`, end);
  if (utf8Length(html) !== htmlMemberBytes || sha256Hex(html) !== root.htmlMemberSha256) fail(path, 'must bind exact full artifact bytes and ordinary SHA-256');
  const coverage = decodeUtf8(utf8Bytes(html).slice(start, end), `${path}.rawCoverage`);
  if (sha256Hex(coverage) !== root.rawCoverageSha256) fail(path, 'must bind the separately scoped intellectual rawCoverage SHA-256');
  return {
    artifactId: safeIdAt(root.artifactId, `${path}.artifactId`),
    partKey: enumAt(root.partKey, `${path}.partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key)),
    htmlMemberBytes,
    htmlMemberSha256: shaAt(root.htmlMemberSha256, `${path}.htmlMemberSha256`),
    intellectualStartByte: start,
    cutoffEndByte: end,
    rawCoverageSha256: shaAt(root.rawCoverageSha256, `${path}.rawCoverageSha256`),
    html,
  };
}

function validatePrologue(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>): TransientPartPrologue {
  const root = objectAt(input, path, ['partKey', 'child']);
  const partKey = enumAt(root.partKey, `${path}.partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key));
  if (partKey === 'secunda-secundae') fail(`${path}.partKey`, 'must not manufacture a II-II prologue');
  const child = validateChild(root.child, `${path}.child`, artifacts, 'part_prologue');
  const source = artifacts.get(child.source.artifactId)!;
  if (source.partKey !== partKey) fail(`${path}.child.source.artifactId`, 'must use its own part artifact');
  return { partKey, child };
}

/** A1 never permits a fabricated II-II prologue or a missing Prima/I-II/III prologue. */
function assertExactPrologueInventory(prologues: readonly TransientPartPrologue[], path: string): void {
  const actual = prologues.map(value => value.partKey);
  equalCanonical(actual, ['prima', 'prima-secundae', 'tertia'], path, 'must contain exactly the ordered Prima, I-II, and III prologues (none for II-II)');
}

type TypedRangeRow = readonly [kind: TransientChild['kind'], partKey: AquinasPackagePartKey, questionKey: string | null, articleKey: string | null, artifactId: string, startByte: number, endByte: number, rawSha256: string];

/** Ordered child-span inventory forbids changing preamble/article boundaries without changing the committed digest. */
function typedRangeRows(prologues: readonly TransientPartPrologue[], questions: readonly TransientQuestion[]): TypedRangeRow[] {
  return [
    ...prologues.map(value => typedRangeRow(value.child, value.partKey, null)),
    ...questions.flatMap(question => [typedRangeRow(question.preamble, question.partKey, question.questionKey), ...question.articles.map(article => typedRangeRow(article, question.partKey, question.questionKey))]),
  ];
}

function typedRangeRow(child: TransientChild, partKey: AquinasPackagePartKey, questionKey: string | null): TypedRangeRow {
  return [child.kind, partKey, questionKey, child.articleKey ?? null, child.source.artifactId, child.source.span.startByte, child.source.span.endByte, child.source.span.rawSha256];
}

function typedRangeDigest(rows: readonly TypedRangeRow[]): string {
  return domainHash('sectioned-edition-collection-package.typed-child-ranges.v1', canonicalSectionedEditionCollectionPackageBytes(rows));
}

function validateExclusion(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>): TransientExclusion {
  const root = objectAt(input, path, ['exclusionId', 'kind', 'artifactId', 'span', 'html']);
  const artifactId = safeIdAt(root.artifactId, `${path}.artifactId`);
  if (!artifacts.has(artifactId)) fail(`${path}.artifactId`, 'must reference a declared source artifact');
  const html = textAt(root.html, `${path}.html`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.childRawUtf8Bytes);
  const span = validateRawSpan(root.span, `${path}.span`);
  if (utf8Length(html) !== span.endByte - span.startByte || sha256Hex(html) !== span.rawSha256) fail(`${path}`, 'must hash-verify its transient excluded bytes against the exact span');
  assertSpanMatchesArtifact(artifacts.get(artifactId)!, span, `${path}.span`);
  return { exclusionId: safeIdAt(root.exclusionId, `${path}.exclusionId`), kind: enumAt(root.kind, `${path}.kind`, AQUINAS_A1_RIGHTS_AND_COVERAGE.exclusionKinds), artifactId, span, html };
}

function validateDiscrepancy(input: unknown, path: string): TransientDiscrepancy {
  const root = objectAt(input, path, ['ref', 'canonicalEntrySha256', 'ebookId', 'partKey', 'htmlMemberSha256', 'questionKey', 'articleKey', 'observedLocator', 'observedTagName', 'evidenceStartByte', 'evidenceEndByte', 'evidenceSha256', 'containingElementStartByte', 'containingElementEndByte', 'containingElementSha256', 'observedDeclaredArticleCount', 'resolvedArticleCount', 'resolvedPreambleStartByte', 'resolvedPreambleEndByte', 'resolvedArticleStartByte', 'resolvedArticleEndByte', 'codes', 'resolutionBasis']);
  const questionKey = questionKeyAt(root.questionKey, `${path}.questionKey`);
  const partKey = enumAt(root.partKey, `${path}.partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key));
  literalAt(partKey, `${path}.partKey`, partForQuestionKey(questionKey));
  const evidenceStartByte = integerAt(root.evidenceStartByte, `${path}.evidenceStartByte`, 0);
  const evidenceEndByte = integerAt(root.evidenceEndByte, `${path}.evidenceEndByte`, evidenceStartByte + 1);
  const containingElementStartByte = nullableInteger(root.containingElementStartByte, `${path}.containingElementStartByte`, 0);
  const containingElementEndByte = nullableInteger(root.containingElementEndByte, `${path}.containingElementEndByte`, 1);
  const containingElementSha256 = root.containingElementSha256 === null ? null : shaAt(root.containingElementSha256, `${path}.containingElementSha256`);
  if ((containingElementStartByte === null) !== (containingElementEndByte === null) || (containingElementStartByte === null) !== (containingElementSha256 === null) || (containingElementStartByte !== null && containingElementEndByte! <= containingElementStartByte)) fail(path, 'must keep containing-element evidence fully present or fully absent');
  const resolvedPreambleStartByte = nullableInteger(root.resolvedPreambleStartByte, `${path}.resolvedPreambleStartByte`, 0);
  const resolvedPreambleEndByte = nullableInteger(root.resolvedPreambleEndByte, `${path}.resolvedPreambleEndByte`, 1);
  const resolvedArticleStartByte = nullableInteger(root.resolvedArticleStartByte, `${path}.resolvedArticleStartByte`, 0);
  const resolvedArticleEndByte = nullableInteger(root.resolvedArticleEndByte, `${path}.resolvedArticleEndByte`, 1);
  const resolvedBoundaries = [resolvedPreambleStartByte, resolvedPreambleEndByte, resolvedArticleStartByte, resolvedArticleEndByte];
  if ((!resolvedBoundaries.every(value => value === null) && !resolvedBoundaries.every(value => value !== null)) || (resolvedPreambleStartByte !== null && (resolvedPreambleEndByte! < resolvedPreambleStartByte || resolvedArticleStartByte! !== resolvedPreambleEndByte || resolvedArticleEndByte! <= resolvedArticleStartByte!))) fail(path, 'must keep resolved preamble/article boundaries complete and contiguous');
  const entry: A1DiscrepancyLedgerEntry = {
    ebookId: integerAt(root.ebookId, `${path}.ebookId`, 1), partKey, htmlMemberSha256: shaAt(root.htmlMemberSha256, `${path}.htmlMemberSha256`), questionKey, articleKey: nullableArticleKey(root.articleKey, `${path}.articleKey`), observedLocator: nullableText(root.observedLocator, `${path}.observedLocator`), observedTagName: nullableText(root.observedTagName, `${path}.observedTagName`), evidenceStartByte, evidenceEndByte, evidenceSha256: shaAt(root.evidenceSha256, `${path}.evidenceSha256`), containingElementStartByte, containingElementEndByte, containingElementSha256, observedDeclaredArticleCount: nullableInteger(root.observedDeclaredArticleCount, `${path}.observedDeclaredArticleCount`, 1), resolvedArticleCount: nullableInteger(root.resolvedArticleCount, `${path}.resolvedArticleCount`, 1), resolvedPreambleStartByte, resolvedPreambleEndByte, resolvedArticleStartByte, resolvedArticleEndByte, codes: arrayAt(root.codes, `${path}.codes`, 1, 16).map((value, index) => discrepancyCodeAt(value, `${path}.codes[${index}]`)), resolutionBasis: enumAt(root.resolutionBasis, `${path}.resolutionBasis`, ['ordinal_position_and_declared_count', 'ledgered_missing_question_heading_scope', 'article_shell_count_and_preamble_evidence'] as const),
  };
  assertUnique(entry.codes, `${path}.codes`);
  if (entry.resolutionBasis === 'article_shell_count_and_preamble_evidence' && entry.resolvedArticleCount === null) fail(`${path}.resolvedArticleCount`, 'is required by article-shell count resolution');
  const canonicalEntrySha256 = shaAt(root.canonicalEntrySha256, `${path}.canonicalEntrySha256`);
  literalAt(canonicalEntrySha256, `${path}.canonicalEntrySha256`, legacyA1DiscrepancyEntrySha256(entry));
  return { ref: safeIdAt(root.ref, `${path}.ref`), canonicalEntrySha256, ...entry };
}

function validateQuestion(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>, discrepancies: ReadonlyMap<string, TransientDiscrepancy>): TransientQuestion {
  const root = objectAt(input, path, ['questionKey', 'partKey', 'questionNumber', 'articleCount', 'source', 'orderedArticleKeysSha256', 'bracketStatus', 'sourceLocatorStatus', 'sourceStructureStatus', 'discrepancyRefs', 'preamble', 'articles']);
  const questionKey = questionKeyAt(root.questionKey, `${path}.questionKey`);
  const partKey = partForQuestionKey(questionKey);
  literalAt(root.partKey, `${path}.partKey`, partKey);
  const questionNumber = integerAt(root.questionNumber, `${path}.questionNumber`, 1);
  literalAt(questionKey, `${path}.questionKey`, `${partKey}.q${String(questionNumber).padStart(3, '0')}`);
  const sourceRoot = objectAt(root.source, `${path}.source`, ['artifactId', 'span']);
  const artifactId = safeIdAt(sourceRoot.artifactId, `${path}.source.artifactId`);
  const artifact = artifacts.get(artifactId);
  if (!artifact || artifact.partKey !== partKey) fail(`${path}.source.artifactId`, 'must use the matching part artifact');
  const source = { artifactId, span: validateRawSpan(sourceRoot.span, `${path}.source.span`) };
  assertSpanMatchesArtifact(artifact, source.span, `${path}.source.span`);
  const articleCount = integerAt(root.articleCount, `${path}.articleCount`, 1);
  const preamble = validateChild(root.preamble, `${path}.preamble`, artifacts, 'preamble');
  const articles = arrayAt(root.articles, `${path}.articles`, articleCount, articleCount).map((value, index) => validateChild(value, `${path}.articles[${index}]`, artifacts, 'article'));
  assertArticleSequence(questionKey, articles, path);
  assertQuestionChildCoverage(source, [preamble, ...articles], `${path}.source`);
  const refs = arrayAt(root.discrepancyRefs, `${path}.discrepancyRefs`, 0, 46).map((value, index) => safeIdAt(value, `${path}.discrepancyRefs[${index}]`));
  assertUnique(refs, `${path}.discrepancyRefs`);
  for (const ref of refs) {
    const discrepancy = discrepancies.get(ref);
    if (!discrepancy || discrepancy.questionKey !== questionKey) fail(`${path}.discrepancyRefs`, 'must reference exactly a discrepancy for this question');
  }
  const sourceLocatorStatus = enumAt(root.sourceLocatorStatus, `${path}.sourceLocatorStatus`, ['verified', 'discrepancy_ledgered'] as const);
  const sourceStructureStatus = enumAt(root.sourceStructureStatus, `${path}.sourceStructureStatus`, ['verified', 'discrepancy_ledgered'] as const);
  if (refs.length === 0 && (sourceLocatorStatus !== 'verified' || sourceStructureStatus !== 'verified')) fail(`${path}`, 'cannot ledger a locator or structure discrepancy without an ordered ref');
  return { questionKey, partKey, questionNumber, articleCount, source, orderedArticleKeysSha256: shaAt(root.orderedArticleKeysSha256, `${path}.orderedArticleKeysSha256`), bracketStatus: literalValue(root.bracketStatus, `${path}.bracketStatus`, 'mixed_unresolved_preserve_verbatim_in_a2'), sourceLocatorStatus, sourceStructureStatus, discrepancyRefs: refs, preamble, articles };
}

function validateChild(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>, expectedKind: TransientChild['kind']): TransientChild {
  const keys = expectedKind === 'article' ? ['kind', 'articleKey', 'ordinal', 'source', 'bracketPreservationStatus', 'correctionStatus'] : ['kind', 'source', 'bracketPreservationStatus', 'correctionStatus'];
  const root = objectAt(input, path, keys);
  literalAt(root.kind, `${path}.kind`, expectedKind);
  literalAt(root.bracketPreservationStatus, `${path}.bracketPreservationStatus`, SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS);
  literalAt(root.correctionStatus, `${path}.correctionStatus`, SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS);
  const sourceRoot = objectAt(root.source, `${path}.source`, ['artifactId', 'span', 'blocks']);
  const artifactId = safeIdAt(sourceRoot.artifactId, `${path}.source.artifactId`);
  if (!artifacts.has(artifactId)) fail(`${path}.source.artifactId`, 'must reference a declared source artifact');
  const span = validateRawSpan(sourceRoot.span, `${path}.source.span`);
  const artifact = artifacts.get(artifactId)!;
  assertSpanMatchesArtifact(artifact, span, `${path}.source.span`);
  const blocks = arrayAt(sourceRoot.blocks, `${path}.source.blocks`, 1, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.childBlocks).map((value, index) => validateBlock(value, `${path}.source.blocks[${index}]`));
  for (let index = 0; index < blocks.length; index += 1) assertSpanMatchesArtifact(artifact, blocks[index]!.span, `${path}.source.blocks[${index}].span`);
  assertBlockCoverage(span, blocks, `${path}.source`);
  const article = expectedKind === 'article' ? { articleKey: articleKeyAt(root.articleKey, `${path}.articleKey`), ordinal: integerAt(root.ordinal, `${path}.ordinal`, 1) } : {};
  return { kind: expectedKind, ...article, source: { artifactId, span, blocks }, bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS, correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS };
}

function validateBlock(input: unknown, path: string): TransientReviewedBlock {
  const root = objectAt(input, path, ['span', 'html', 'topology']);
  const html = textAt(root.html, `${path}.html`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.childRawUtf8Bytes);
  const span = validateRawSpan(root.span, `${path}.span`);
  if (utf8Length(html) !== span.endByte - span.startByte) fail(`${path}.span`, 'must exactly cover transient raw HTML bytes');
  literalAt(span.rawSha256, `${path}.span.rawSha256`, sha256Hex(html));
  return { span, html, topology: validateTopology(root.topology, `${path}.topology`) };
}

function validateTopology(input: unknown, path: string): ReviewedTopology {
  const root = objectAt(input, path, ['containerTag', 'inlineTags']);
  const containerTag = enumAt(root.containerTag, `${path}.containerTag`, ['p', 'div', 'blockquote', 'h4', 'h5'] as const);
  const inlineTags = arrayAt(root.inlineTags, `${path}.inlineTags`, 0, 7).map((value, index) => enumAt(value, `${path}.inlineTags[${index}]`, ['i', 'em', 'b', 'strong', 'span', 'sup', 'sub'] as const));
  assertUnique(inlineTags, `${path}.inlineTags`);
  return { containerTag, inlineTags };
}

function compileTransientDraft(draft: TransientSectionedEditionCollectionDraft): { questions: PersistedQuestion[]; prologues: Map<AquinasPackagePartKey, PersistedChild> } {
  let cursor = 0;
  const prologues = new Map<AquinasPackagePartKey, PersistedChild>();
  const questions: PersistedQuestion[] = [];
  for (const part of AQUINAS_PACKAGE_PARTS) {
    const prologue = draft.partPrologues.find(value => value.partKey === part.key);
    if (prologue) {
      const compiled = compileChild(prologue.child, cursor, `$.partPrologues.${part.key}`);
      cursor = compiled.output.endByte;
      prologues.set(part.key, compiled);
    }
    for (const question of draft.questions.filter(value => value.partKey === part.key)) {
      const preamble = compileChild(question.preamble, cursor, `$.questions.${question.questionKey}.preamble`);
      cursor = preamble.output.endByte;
      const articles = question.articles.map((article, index) => {
        const compiled = compileChild(article, cursor, `$.questions.${question.questionKey}.articles[${index}]`);
        cursor = compiled.output.endByte;
        return compiled;
      });
      const output = outputForChildren([preamble, ...articles], `$.questions.${question.questionKey}.output`);
      questions.push({ ...omitQuestionChildren(question), source: { artifactId: question.source.artifactId, span: question.source.span, rawStats: aggregateStats([question.preamble, ...question.articles]) }, output, preamble, articles });
    }
  }
  return { questions, prologues };
}

function compileChild(child: TransientChild, startByte: number, path: string): PersistedChild {
  const rendered = child.source.blocks.map((block, index) => renderReviewedElement(block, `${path}.source.blocks[${index}]`));
  const content = rendered.map(value => value.content).join('\n\n');
  assertContent(content, `${path}.content`);
  const outputBytes = utf8Length(content);
  if (outputBytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes) fail(`${path}.content`, 'exceeds the per-content-child 131072 UTF-8 byte cap');
  const stats = aggregateRawStats(rendered);
  assertStats(stats, 'child', `${path}.source`);
  const output = { startByte, endByte: startByte + outputBytes, utf8Bytes: outputBytes, sha256: sha256Hex(content) };
  const source: PersistedSourceEvidence = { artifactId: child.source.artifactId, span: child.source.span, outputSha256: output.sha256, outputUtf8Bytes: outputBytes, rawStats: stats };
  const article = child.kind === 'article' ? { articleKey: child.articleKey, ordinal: child.ordinal } : {};
  return { kind: child.kind, ...article, source, output, content, bracketPreservationStatus: child.bracketPreservationStatus, correctionStatus: child.correctionStatus };
}

/** Real-shaped parse5 renderer: one pinned container, explicit inline topology, and br-derived LF only. */
export function renderReviewedElement(block: TransientReviewedBlock, path = 'block'): { content: string; stats: RawStats } {
  assertTextUnicode(block.html, path, true);
  const parserErrors: string[] = [];
  const fragment = parseFragment(block.html, { onParseError: error => parserErrors.push(error.code) });
  if (parserErrors.length > 0) fail(path, `parse5 rejected malformed reviewed markup (${parserErrors[0]})`);
  const meaningful = fragment.childNodes.filter(node => !(node.nodeName === '#text' && 'value' in node && /^[\u0009-\u000d\u0020]*$/.test(node.value)));
  if (meaningful.length !== 1) fail(path, 'must contain one reviewed container plus only separator whitespace');
  const container = meaningful[0]!;
  if (!('tagName' in container) || container.tagName !== block.topology.containerTag) fail(path, 'does not match the pinned reviewed container topology');
  const state = { nodes: 0, depth: 0, attributes: 0 };
  const content = materializeTokens(renderContainer(container, block.topology, state, 1, path)).normalize('NFC');
  assertContent(content, path);
  const stats = { rawUtf8Bytes: utf8Length(block.html), nodes: state.nodes, depth: state.depth, attributes: state.attributes, blocks: 1 };
  assertStats(stats, 'child', path);
  return { content, stats };
}

type RenderToken = { type: 'text'; value: string } | { type: 'br' };
function renderContainer(node: DefaultTreeAdapterTypes.Element, topology: ReviewedTopology, state: { nodes: number; depth: number; attributes: number }, depth: number, path: string): RenderToken[] {
  state.nodes += 1; state.depth = Math.max(state.depth, depth); state.attributes += node.attrs.length;
  validateInertAttributes(node.attrs, path);
  return renderNodes(node.childNodes, topology, state, depth + 1, path);
}

function renderNodes(nodes: readonly DefaultTreeAdapterTypes.ChildNode[], topology: ReviewedTopology, state: { nodes: number; depth: number; attributes: number }, depth: number, path: string): RenderToken[] {
  const content: RenderToken[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    state.nodes += 1; state.depth = Math.max(state.depth, depth);
    if (node.nodeName === '#text' && 'value' in node) { content.push({ type: 'text', value: node.value }); continue; }
    if ('tagName' in node && node.tagName === 'br') { if (node.attrs.length !== 0 || node.childNodes.length !== 0) fail(`${path}[${index}]`, 'br must be attribute-free and empty'); content.push({ type: 'br' }); continue; }
    if ('tagName' in node && topology.inlineTags.includes(node.tagName as ReviewedTopology['inlineTags'][number])) {
      validateInertAttributes(node.attrs, `${path}[${index}]`);
      state.attributes += node.attrs.length;
      content.push(...renderNodes(node.childNodes, topology, state, depth + 1, `${path}[${index}]`));
      continue;
    }
    fail(`${path}[${index}]`, 'contains a node outside the pinned container/inline topology');
  }
  return content;
}

function materializeTokens(tokens: readonly RenderToken[]): string {
  let content = '';
  let pendingAsciiWhitespace = false;
  for (const token of tokens) {
    if (token.type === 'br') {
      pendingAsciiWhitespace = false;
      content += '\n';
      continue;
    }
    for (const character of token.value) {
      if (/[\u0009-\u000d\u0020]/.test(character)) {
        pendingAsciiWhitespace ||= content.length > 0 && !content.endsWith('\n');
        continue;
      }
      if (pendingAsciiWhitespace) content += ' ';
      content += character;
      pendingAsciiWhitespace = false;
    }
  }
  return content;
}
function validateInertAttributes(attrs: readonly { name: string; value: string }[], path: string): void {
  const names = new Set<string>();
  for (const attr of attrs) {
    if (names.has(attr.name)) fail(path, 'contains a duplicate attribute');
    names.add(attr.name);
    if (attr.name === 'style') {
      // Source-only Gutenberg margin hints are permitted because rendering
      // drops every attribute; this closed grammar forbids arbitrary CSS.
      if (!/^(?:margin-top: (?:[1-9]|[1-9][0-9])em|margin-left: (?:0|[1-9][0-9]?)%; margin-right: (?:0|[1-9][0-9]?)%)$/.test(attr.value)) fail(path, 'allows only closed inert id/class or discarded margin-style attributes');
      continue;
    }
    if (!['id', 'class'].includes(attr.name)) fail(path, 'allows only closed inert id/class or discarded margin-style attributes');
    if (attr.name === 'id' && !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(attr.value)) fail(path, 'contains an invalid inert id');
    if (attr.name === 'class' && !/^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/.test(attr.value)) fail(path, 'contains an invalid inert class');
  }
}

function shardCompiledDraft(draft: TransientSectionedEditionCollectionDraft, questions: readonly PersistedQuestion[], prologues: ReadonlyMap<AquinasPackagePartKey, PersistedChild>): CompiledSectionedEditionCollectionPackage[] {
  const packages: CompiledSectionedEditionCollectionPackage[] = [];
  for (const part of AQUINAS_PACKAGE_PARTS) {
    const partQuestions = questions.filter(question => question.partKey === part.key);
    let start = 0; let ordinal = 1;
    while (start < partQuestions.length) {
      let end = start; let contentBytes = ordinal === 1 && prologues.get(part.key) ? prologues.get(part.key)!.output.utf8Bytes : 0; let candidate: PersistedPackage | undefined;
      while (end < partQuestions.length) {
        const next = partQuestions[end]!;
        const candidateContent = contentBytes + next.output.utf8Bytes;
        if (candidateContent > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes) break;
        const packageValue = makePackage(draft, part.key, ordinal, partQuestions.slice(start, end + 1), prologues.get(part.key) ?? null, candidateContent);
        if (canonicalSectionedEditionCollectionPackageBytes(packageValue).byteLength > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes) break;
        contentBytes = candidateContent; candidate = packageValue; end += 1;
      }
      if (!candidate) fail(`$.questions[${start}]`, 'one parent question cannot fit reviewed package caps without splitting');
      const persistedBytes = canonicalSectionedEditionCollectionPackageBytes(candidate);
      packages.push({ package: candidate, persistedBytes, persistedSha256: domainHash('sectioned-edition-collection-package.bytes.v1', persistedBytes) });
      start = end; ordinal += 1;
    }
  }
  return packages;
}

function makePackage(draft: TransientSectionedEditionCollectionDraft, partKey: AquinasPackagePartKey, ordinal: number, questions: readonly PersistedQuestion[], partPrologue: PersistedChild | null, normalizedContentUtf8Bytes: number): PersistedPackage {
  const questionKeys = questions.map(value => value.questionKey);
  const articleKeys = questions.flatMap(question => question.articles.map(article => article.articleKey!));
  return {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    identity: draft.identity,
    normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
    sourceLockSha256: draft.sourceLockSha256,
    localReceiptSha256: draft.localReceiptSha256,
    topologyLockSha256: draft.topologyLockSha256,
    typedRangeCount: draft.typedRangeCount,
    typedRangesSha256: draft.typedRangesSha256,
    discrepancyLedgerSha256: draft.discrepancyLedgerSha256,
    discrepancyEntryHashAlgorithm: AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM,
    fixtureStatus: draft.mode === 'synthetic_fixture' ? 'synthetic_fixture_non_release' : null,
    rightsAndCoverage: draft.rightsAndCoverage,
    sourceArtifacts: draft.sourceArtifacts.map(({ html: _html, ...source }) => structuredClone(source)),
    exclusions: draft.exclusions.map(value => ({ exclusionId: value.exclusionId, kind: value.kind, artifactId: value.artifactId, span: value.span })),
    discrepancyInventory: structuredClone(draft.discrepancies),
    shard: { shardId: `aquinas-summa-pg-v1.${partKey}.shard-${String(ordinal).padStart(4, '0')}`, partKey, ordinal, firstQuestionKey: questionKeys[0]!, lastQuestionKey: questionKeys.at(-1)!, questionKeys, orderedArticleKeysSha256: domainHash('sectioned-edition-collection-package.article-keys.v1', canonicalSectionedEditionCollectionPackageBytes(articleKeys)), normalizedContentUtf8Bytes },
    partPrologue: ordinal === 1 ? partPrologue : null,
    questions: structuredClone([...questions]),
  };
}

function buildManifest(packages: readonly CompiledSectionedEditionCollectionPackage[], draft: TransientSectionedEditionCollectionDraft): PersistedManifest {
  const questionKeys = packages.flatMap(value => value.package.shard.questionKeys);
  const articleKeys = packages.flatMap(value => value.package.questions.flatMap(question => question.articles.map(article => article.articleKey!)));
  const shards = packages.map(value => ({ shardId: value.package.shard.shardId, partKey: value.package.shard.partKey, ordinal: value.package.shard.ordinal, firstQuestionKey: value.package.shard.firstQuestionKey, lastQuestionKey: value.package.shard.lastQuestionKey, questionKeys: value.package.shard.questionKeys, normalizedContentUtf8Bytes: value.package.shard.normalizedContentUtf8Bytes, canonicalSerializedPackageUtf8Bytes: value.persistedBytes.byteLength, canonicalPackageSha256: value.persistedSha256 }));
  const base = { schemaVersion: SECTIONED_EDITION_COLLECTION_MANIFEST_SCHEMA, identity: draft.identity, attestationMode: draft.mode, fixtureStatus: draft.mode === 'synthetic_fixture' ? 'synthetic_fixture_non_release' as const : null, topologyLockSha256: draft.topologyLockSha256, discrepancyLedgerSha256: draft.discrepancyLedgerSha256, orderedQuestionKeysSha256: domainHash('sectioned-edition-collection-package.question-keys.v1', canonicalSectionedEditionCollectionPackageBytes(questionKeys)), orderedArticleKeysSha256: domainHash('sectioned-edition-collection-package.article-keys.v1', canonicalSectionedEditionCollectionPackageBytes(articleKeys)), shards };
  return { ...base, aggregateSha256: domainHash('sectioned-edition-collection-manifest.v1', canonicalSectionedEditionCollectionPackageBytes(base)) };
}

function assertA1AttestedDraft(draft: TransientSectionedEditionCollectionDraft): void {
  validateImmutableA1EvidenceDescriptor();
  literalAt(draft.sourceLockSha256, '$.sourceLockSha256', AQUINAS_A1_SOURCE_LOCK_SHA256);
  literalAt(draft.localReceiptSha256, '$.localReceiptSha256', AQUINAS_A1_LOCAL_RECEIPT_SHA256);
  literalAt(draft.topologyLockSha256, '$.topologyLockSha256', AQUINAS_A1_TOPOLOGY_LOCK_SHA256);
  literalAt(draft.typedRangeCount, '$.typedRangeCount', AQUINAS_A1_TOPOLOGY_VECTOR.authorialChildRangeCount);
  assertA1NativeSourceTypedRangeProjection(draft);
  literalAt(draft.discrepancyLedgerSha256, '$.discrepancyLedgerSha256', AQUINAS_A1_DISCREPANCY_LEDGER_SHA256);
  equalCanonical(
    draft.sourceArtifacts.map(({ html: _html, ...source }) => source),
    AQUINAS_A1_SOURCES.map(({ ebookId, ...source }) => ({ artifactId: `pg-${ebookId}`, ...source })),
    '$.sourceArtifacts',
    'must bind the four exact A0 HTML IDs, bytes, and hashes',
  );
  const questions = draft.questions.map(question => [question.questionKey, question.partKey, question.questionNumber, question.articleCount, question.source.span.startByte, question.source.span.endByte, question.source.span.rawSha256, question.orderedArticleKeysSha256, question.bracketStatus, question.sourceLocatorStatus, question.sourceStructureStatus]);
  literalAt(domainHash('sectioned-edition-collection-package.question-vector.v1', canonicalSectionedEditionCollectionPackageBytes(questions)), '$.questions', AQUINAS_A1_TOPOLOGY_VECTOR.questionVectorSha256);
  const articleKeys = draft.questions.flatMap(question => question.articles.map(article => article.articleKey!));
  literalAt(articleKeys.length, '$.questions.articles', AQUINAS_A1_TOPOLOGY_VECTOR.articleCount);
  literalAt(domainHash('sectioned-edition-collection-package.article-vector.v1', canonicalSectionedEditionCollectionPackageBytes(articleKeys)), '$.questions.articles', AQUINAS_A1_TOPOLOGY_VECTOR.articleVectorSha256);
  equalCanonical(draft.discrepancies, AQUINAS_A1_DISCREPANCY_INVENTORY, '$.discrepancies', 'must bind every exact ordered A1 discrepancy code, basis, observed, and resolved projection field');
  const expectedInventory = AQUINAS_A1_DISCREPANCY_INVENTORY.map(value => [value.ref, value.canonicalEntrySha256, value.questionKey, value.articleKey]);
  literalAt(domainHash('sectioned-edition-collection-package.discrepancy-vector.v1', canonicalSectionedEditionCollectionPackageBytes(expectedInventory)), '$.discrepancies', AQUINAS_A1_DISCREPANCY_VECTOR_SHA256);
  for (const question of draft.questions) {
    const expectedRefs = AQUINAS_A1_DISCREPANCY_INVENTORY.filter(value => value.questionKey === question.questionKey).map(value => value.ref);
    equalCanonical(question.discrepancyRefs, expectedRefs, `$.questions.${question.questionKey}.discrepancyRefs`, 'must contain the exact full locator/structure discrepancy ref set');
  }
}

type NativeA1TypedRangeType = 'authorial_part_prologue' | 'authorial_question_preamble' | 'authorial_article' | Exclude<ExclusionKind, 'supplement'>;
type NativeA1TypedRange = Readonly<{ type: NativeA1TypedRangeType; startByte: number; endByte: number; sha256: string }>;

/** Reproduces the checked-in topology lock's native per-source typed-range projection; it is intentionally not a package-domain hash. */
function assertA1NativeSourceTypedRangeProjection(draft: TransientSectionedEditionCollectionDraft): void {
  for (const expected of AQUINAS_A1_SOURCE_TYPED_RANGES) {
    const source = draft.sourceArtifacts.find(value => value.artifactId === expected.artifactId)!;
    const ranges: NativeA1TypedRange[] = [
      ...draft.partPrologues.filter(value => value.child.source.artifactId === expected.artifactId).map(value => nativeA1TypedRange('authorial_part_prologue', value.child.source.span)),
      ...draft.questions.filter(value => value.source.artifactId === expected.artifactId).flatMap(question => [nativeA1TypedRange('authorial_question_preamble', question.preamble.source.span), ...question.articles.map(article => nativeA1TypedRange('authorial_article', article.source.span))]),
      ...draft.exclusions.filter(value => value.artifactId === expected.artifactId && value.kind !== 'supplement').map(value => nativeA1TypedRange(value.kind as Exclude<ExclusionKind, 'supplement'>, value.span)),
    ].filter(range => range.startByte >= source.intellectualStartByte && range.endByte <= source.cutoffEndByte).sort((left, right) => left.startByte - right.startByte || left.endByte - right.endByte);
    if (ranges.length !== expected.typedRangeCount) fail(`$.sourceArtifacts.${expected.artifactId}`, 'does not retain the A1 native typed-range count');
    const digest = sha256Hex(new TextDecoder().decode(canonicalSectionedEditionCollectionPackageBytes(ranges)));
    literalAt(digest, `$.sourceArtifacts.${expected.artifactId}`, expected.typedRangesSha256);
  }
}

function nativeA1TypedRange(type: NativeA1TypedRangeType, span: RawSpan): NativeA1TypedRange {
  return { type, startByte: span.startByte, endByte: span.endByte, sha256: span.rawSha256 };
}

function assertCoverage(artifacts: readonly SourceArtifactEvidence[], prologues: readonly TransientPartPrologue[], exclusions: readonly TransientExclusion[], questions: readonly TransientQuestion[]): void {
  for (const artifact of artifacts) {
    const ranges = [
      ...prologues.filter(value => value.child.source.artifactId === artifact.artifactId).map(value => value.child.source.span),
      ...questions.filter(value => value.source.artifactId === artifact.artifactId).map(value => value.source.span),
      ...exclusions.filter(value => value.artifactId === artifact.artifactId).map(value => value.span),
    ].sort((left, right) => left.startByte - right.startByte);
    let cursor = 0;
    for (const range of ranges) {
      if (range.startByte !== cursor) fail(`$.coverage.${artifact.artifactId}`, 'included authorial and excluded ranges must have no gaps or overlaps');
      assertSpanMatchesArtifact(artifact, range, `$.coverage.${artifact.artifactId}`);
      cursor = range.endByte;
    }
    if (cursor !== artifact.htmlMemberBytes) fail(`$.coverage.${artifact.artifactId}`, 'must exactly cover full artifact boundaries including prefix and post-cutoff exclusions');
  }
}

/** Binds every persisted raw span to the actual transient source-member bytes, not just to caller-supplied hashes. */
const sourceArtifactUtf8Cache = new WeakMap<SourceArtifactEvidence, Uint8Array>();

function sourceArtifactUtf8(artifact: SourceArtifactEvidence): Uint8Array {
  const cached = sourceArtifactUtf8Cache.get(artifact);
  if (cached !== undefined) return cached;
  const bytes = utf8Bytes(artifact.html);
  sourceArtifactUtf8Cache.set(artifact, bytes);
  return bytes;
}

function assertSpanMatchesArtifact(artifact: SourceArtifactEvidence, span: RawSpan, path: string): void {
  if (span.startByte < 0 || span.endByte > artifact.htmlMemberBytes) fail(path, 'falls outside the declared full artifact member');
  const raw = decodeUtf8(sourceArtifactUtf8(artifact).slice(span.startByte, span.endByte), path);
  if (sha256Hex(raw) !== span.rawSha256) fail(path, 'does not match the raw SHA-256 of the actual full artifact member slice');
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(path, 'must begin and end on exact UTF-8 source-member byte boundaries'); }
}

function assertDraftStats(children: readonly TransientChild[], exclusions: readonly TransientExclusion[]): void {
  const authorial = aggregateStats(children);
  const stats = { ...authorial, rawUtf8Bytes: authorial.rawUtf8Bytes + exclusions.reduce((total, exclusion) => total + utf8Length(exclusion.html), 0), blocks: authorial.blocks + exclusions.length };
  assertStats(stats, 'draft', '$');
  for (const questionChildren of groupQuestionChildren(children)) assertStats(aggregateStats(questionChildren), 'question', '$.questions');
}

function groupQuestionChildren(children: readonly TransientChild[]): readonly TransientChild[][] {
  const groups: TransientChild[][] = []; let current: TransientChild[] = [];
  for (const child of children) { if (child.kind === 'preamble' && current.length > 0) { groups.push(current); current = []; } current.push(child); }
  if (current.length > 0) groups.push(current);
  return groups;
}

function aggregateStats(children: readonly TransientChild[]): RawStats {
  return aggregateRawStats(children.flatMap(child => child.source.blocks.map(block => renderReviewedElement(block))));
}

function aggregateRawStats(values: readonly { stats: RawStats }[]): RawStats {
  return values.reduce((total, value) => ({ rawUtf8Bytes: total.rawUtf8Bytes + value.stats.rawUtf8Bytes, nodes: total.nodes + value.stats.nodes, depth: Math.max(total.depth, value.stats.depth), attributes: total.attributes + value.stats.attributes, blocks: total.blocks + value.stats.blocks }), { rawUtf8Bytes: 0, nodes: 0, depth: 0, attributes: 0, blocks: 0 });
}

function assertStats(stats: RawStats, scope: 'child' | 'question' | 'draft', path: string): void {
  const prefix = scope === 'child' ? 'child' : scope === 'question' ? 'question' : 'draft';
  const limits = SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS;
  const checks: [keyof RawStats, number][] = [["rawUtf8Bytes", limits[`${prefix}RawUtf8Bytes`]], ["nodes", limits[`${prefix}Nodes`]], ["depth", limits[`${prefix}Depth`]], ["attributes", limits[`${prefix}Attributes`]], ["blocks", limits[`${prefix}Blocks`]]];
  for (const [key, maximum] of checks) if (stats[key] > maximum) fail(path, `${scope} ${key} exceeds strict limit ${maximum}`);
}

function assertQuestionChildCoverage(parent: { artifactId: string; span: RawSpan }, children: readonly TransientChild[], path: string): void {
  let cursor = parent.span.startByte; let raw = '';
  for (const child of children) {
    if (child.source.artifactId !== parent.artifactId || child.source.span.startByte !== cursor) fail(path, 'question children must share the parent artifact with no gaps or overlaps');
    cursor = child.source.span.endByte; raw += child.source.blocks.map(block => block.html).join('');
  }
  if (cursor !== parent.span.endByte || sha256Hex(raw) !== parent.span.rawSha256) fail(path, 'must exactly bind contiguous child raw bytes and SHA-256');
}

function assertBlockCoverage(parent: RawSpan, blocks: readonly TransientReviewedBlock[], path: string): void {
  let cursor = parent.startByte; let raw = '';
  for (const block of blocks) { if (block.span.startByte !== cursor) fail(path, 'reviewed blocks must have no gaps or overlaps'); cursor = block.span.endByte; raw += block.html; }
  if (cursor !== parent.endByte || sha256Hex(raw) !== parent.rawSha256) fail(path, 'reviewed blocks must exactly cover the source span and SHA-256');
}

function assertArticleSequence(questionKey: string, articles: readonly TransientChild[], path: string): void {
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index]!; const ordinal = index + 1;
    if (article.ordinal !== ordinal || article.articleKey !== `${questionKey}.a${String(ordinal).padStart(3, '0')}`) fail(`${path}.articles[${index}]`, 'must preserve exact contiguous article key/order');
  }
}

function outputForChildren(children: readonly PersistedChild[], path: string): OutputEvidence {
  let cursor = children[0]!.output.startByte; let bytes = 0; let text = '';
  for (const child of children) { if (child.output.startByte !== cursor) fail(path, 'child output spans must be contiguous'); cursor = child.output.endByte; bytes += child.output.utf8Bytes; text += child.content; }
  return { startByte: children[0]!.output.startByte, endByte: cursor, utf8Bytes: bytes, sha256: sha256Hex(text) };
}

function omitQuestionChildren(question: TransientQuestion): Omit<PersistedQuestion, 'source' | 'output' | 'preamble' | 'articles'> {
  const { preamble: _preamble, articles: _articles, source, ...rest } = question;
  return rest;
}

function assertContent(content: string, path: string): void {
  assertTextUnicode(content, path, true);
  if (content.length === 0 || content !== content.normalize('NFC') || /[\t\v\f\r]/.test(content)) fail(path, 'must be nonempty NFC text with only br-derived LF and normalized ASCII spaces');
}

function validateRawSpan(input: unknown, path: string): RawSpan {
  const root = objectAt(input, path, ['startByte', 'endByte', 'rawSha256']);
  const startByte = integerAt(root.startByte, `${path}.startByte`, 0);
  return { startByte, endByte: integerAt(root.endByte, `${path}.endByte`, startByte + 1), rawSha256: shaAt(root.rawSha256, `${path}.rawSha256`) };
}

/** Legacy A1 digest: SHA-256 over `JSON.stringify(entry)` with the ledger's checked-in insertion order. */
function legacyA1DiscrepancyEntrySha256(entry: A1DiscrepancyLedgerEntry): string {
  const legacyOrderedEntry = {
    ebookId: entry.ebookId,
    partKey: entry.partKey,
    htmlMemberSha256: entry.htmlMemberSha256,
    questionKey: entry.questionKey,
    articleKey: entry.articleKey,
    observedLocator: entry.observedLocator,
    observedTagName: entry.observedTagName,
    evidenceStartByte: entry.evidenceStartByte,
    evidenceEndByte: entry.evidenceEndByte,
    evidenceSha256: entry.evidenceSha256,
    containingElementStartByte: entry.containingElementStartByte,
    containingElementEndByte: entry.containingElementEndByte,
    containingElementSha256: entry.containingElementSha256,
    observedDeclaredArticleCount: entry.observedDeclaredArticleCount,
    resolvedArticleCount: entry.resolvedArticleCount,
    resolvedPreambleStartByte: entry.resolvedPreambleStartByte,
    resolvedPreambleEndByte: entry.resolvedPreambleEndByte,
    resolvedArticleStartByte: entry.resolvedArticleStartByte,
    resolvedArticleEndByte: entry.resolvedArticleEndByte,
    codes: entry.codes,
    resolutionBasis: entry.resolutionBasis,
  };
  return sha256Hex(JSON.stringify(legacyOrderedEntry));
}

function nullableRawSpan(value: unknown, path: string): RawSpan | null { return value === null ? null : validateRawSpan(value, path); }
function nullableText(value: unknown, path: string): string | null { return value === null ? null : textAt(value, path, 4_096); }
function nullableArticleKey(value: unknown, path: string): string | null { return value === null ? null : articleKeyAt(value, path); }
function nullableInteger(value: unknown, path: string, minimum: number): number | null { return value === null ? null : integerAt(value, path, minimum); }

function questionKeyAt(value: unknown, path: string): string {
  const key = safeAsciiAt(value, path, /^[a-z]+(?:-[a-z]+)*\.q\d{3}$/);
  if (!expectedAquinasPackageQuestionKeys().includes(key)) fail(path, 'must be an exact frozen A1 question key');
  return key;
}
function articleKeyAt(value: unknown, path: string): string { return safeAsciiAt(value, path, /^[a-z]+(?:-[a-z]+)*\.q\d{3}\.a\d{3}$/); }
function partForQuestionKey(questionKey: string): AquinasPackagePartKey { return AQUINAS_PACKAGE_PARTS.find(part => questionKey.startsWith(`${part.key}.q`))?.key ?? fail('questionKey', 'does not use a frozen part key'); }
function safeIdAt(value: unknown, path: string): string { return safeAsciiAt(value, path, /^[a-z][a-z0-9-]{0,127}$/); }
function discrepancyCodeAt(value: unknown, path: string): string { return safeAsciiAt(value, path, /^[a-z][a-z0-9_]{0,127}$/); }
function safeAsciiAt(value: unknown, path: string, pattern: RegExp): string { if (typeof value !== 'string' || !pattern.test(value)) fail(path, 'must be an ASCII non-confusable identifier'); return value; }
function shaAt(value: unknown, path: string): string { return safeAsciiAt(value, path, /^[a-f0-9]{64}$/); }
function textAt(value: unknown, path: string, maximum: number): string { if (typeof value !== 'string' || value.length === 0 || value.length > maximum) fail(path, `must be nonempty text of at most ${maximum} UTF-16 code units`); assertTextUnicode(value, path, true); return value; }
function integerAt(value: unknown, path: string, minimum: number): number { if (!Number.isSafeInteger(value) || Object.is(value, -0) || (value as number) < minimum) fail(path, `must be a nonnegative safe integer at least ${minimum}`); return value as number; }
function enumAt<T extends readonly string[]>(value: unknown, path: string, values: T): T[number] { if (typeof value !== 'string' || !values.includes(value)) fail(path, `must be one of ${values.join(', ')}`); return value as T[number]; }
function literalAt(value: unknown, path: string, expected: unknown): void { if (value !== expected) fail(path, `must equal ${JSON.stringify(expected)}`); }
function literalValue<T extends string>(value: unknown, path: string, expected: T): T { literalAt(value, path, expected); return expected; }
function assertUnique(values: readonly string[], path: string): void { if (new Set(values).size !== values.length) fail(path, 'must not contain duplicate values'); }
function equalCanonical(actual: unknown, expected: unknown, path: string, message: string): void { if (!sameBytes(canonicalSectionedEditionCollectionPackageBytes(actual), canonicalSectionedEditionCollectionPackageBytes(expected))) fail(path, message); }

function objectAt(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(path, 'must be a plain object');
  const source = value as Record<string, unknown>; const observed = Object.keys(source).sort(); const expected = [...keys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index]) || Object.getOwnPropertySymbols(source).length !== 0) fail(path, 'must contain exactly reviewed data keys without symbols');
  for (const key of expected) { const descriptor = Object.getOwnPropertyDescriptor(source, key); if (!descriptor || !('value' in descriptor)) fail(`${path}.${key}`, 'must be a data property, not an accessor'); }
  return source;
}
function arrayAt(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0 || value.length < minimum || value.length > maximum) fail(path, `must be a dense plain array with ${minimum}..${maximum} values`);
  const keys = Object.keys(value); if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) fail(path, 'must be a dense plain array without extra properties');
  return Array.from({ length: value.length }, (_, index) => { const descriptor = Object.getOwnPropertyDescriptor(value, String(index)); if (!descriptor || !('value' in descriptor)) fail(`${path}[${index}]`, 'must be a data value, not an accessor'); return descriptor.value; });
}
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) fail('canonical value', 'rejects non-finite, negative, unsafe, and -0 numbers'); return value; }
  if (typeof value === 'undefined' || typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') fail('canonical value', 'rejects undefined, bigint, symbols, and functions');
  if (Array.isArray(value)) return arrayAt(value, 'canonical value', 0, Number.MAX_SAFE_INTEGER).map(canonicalize);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) fail('canonical value', 'must be a plain object');
  const source = value as Record<string, unknown>; const target: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) { const descriptor = Object.getOwnPropertyDescriptor(source, key); if (!descriptor || !('value' in descriptor)) fail(`canonical value.${key}`, 'must be a data property'); target[key] = canonicalize(descriptor.value); }
  return target;
}
function domainHash(domain: string, bytes: Uint8Array): string { return sha256Hex(`${domain}:${new TextDecoder().decode(bytes)}`); }
function sameBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]); }
function utf8Length(value: string): number { return new TextEncoder().encode(value).byteLength; }
function utf8Bytes(value: string): Uint8Array { return new TextEncoder().encode(value); }
function assertTextUnicode(value: string, path: string, allowAsciiWhitespace: boolean): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index); let point = unit;
    if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(index + 1); if (next < 0xdc00 || next > 0xdfff) fail(path, 'contains an unpaired surrogate'); point = 0x1_0000 + ((unit - 0xd800) << 10) + next - 0xdc00; index += 1; }
    else if (unit >= 0xdc00 && unit <= 0xdfff) fail(path, 'contains an unpaired surrogate');
    const asciiWhitespace = point === 0x09 || point === 0x0a || point === 0x0b || point === 0x0c || point === 0x0d;
    if ((point <= 0x1f && !(allowAsciiWhitespace && asciiWhitespace)) || (point >= 0x7f && point <= 0x9f)) fail(path, 'contains a disallowed control character');
    if (point === 0x061c || point === 0x200e || point === 0x200f || (point >= 0x202a && point <= 0x202e) || (point >= 0x2066 && point <= 0x2069)) fail(path, 'contains a bidi control character');
    if (point === 0xfdd0 || point === 0xfdef || (point & 0xfffe) === 0xfffe || point === 0x200c || point === 0x200d || (point >= 0x2060 && point <= 0x2064) || point === 0xfeff) fail(path, 'contains a forbidden Unicode format/noncharacter');
  }
}
function fail(path: string, message: string): never { throw new SectionedEditionCollectionPackageValidationError(path, message); }
