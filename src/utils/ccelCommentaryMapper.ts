/**
 * CCEL Commentary Volume Mapper
 *
 * Maps Bible books to specific Calvin commentary volumes (calcom##).
 * Calvin's "Commentaries—Complete" (calvin/commentaries) is just an index.
 * The actual commentaries are in individual volumes (calcom01-calcom45).
 */

export interface CommentaryVolumeMapping {
  workId: string;
  title: string;
  books: string[];  // Bible books covered
}

/**
 * Calvin's commentary volumes mapping
 */
export const CALVIN_COMMENTARY_VOLUMES: CommentaryVolumeMapping[] = [
  { workId: 'calvin/calcom01', title: 'Commentary on Genesis - Volume 1', books: ['Genesis 1-23'] },
  { workId: 'calvin/calcom02', title: 'Commentary on Genesis - Volume 2', books: ['Genesis 24-50'] },
  { workId: 'calvin/calcom03', title: 'Harmony of the Law - Volume 1', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
  { workId: 'calvin/calcom04', title: 'Harmony of the Law - Volume 2', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
  { workId: 'calvin/calcom05', title: 'Harmony of the Law - Volume 3', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
  { workId: 'calvin/calcom06', title: 'Harmony of the Law - Volume 4', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
  { workId: 'calvin/calcom07', title: 'Commentary on Joshua', books: ['Joshua'] },
  { workId: 'calvin/calcom08', title: 'Commentary on Psalms - Volume 1', books: ['Psalms 1-35'] },
  { workId: 'calvin/calcom09', title: 'Commentary on Psalms - Volume 2', books: ['Psalms 36-66'] },
  { workId: 'calvin/calcom10', title: 'Commentary on Psalms - Volume 3', books: ['Psalms 67-92'] },
  { workId: 'calvin/calcom11', title: 'Commentary on Psalms - Volume 4', books: ['Psalms 93-119'] },
  { workId: 'calvin/calcom12', title: 'Commentary on Psalms - Volume 5', books: ['Psalms 119-150'] },
  { workId: 'calvin/calcom13', title: 'Commentary on Isaiah - Volume 1', books: ['Isaiah 1-16'] },
  { workId: 'calvin/calcom14', title: 'Commentary on Isaiah - Volume 2', books: ['Isaiah 17-32'] },
  { workId: 'calvin/calcom15', title: 'Commentary on Isaiah - Volume 3', books: ['Isaiah 33-48'] },
  { workId: 'calvin/calcom16', title: 'Commentary on Isaiah - Volume 4', books: ['Isaiah 49-66'] },
  { workId: 'calvin/calcom17', title: 'Commentary on Jeremiah and Lamentations - Volume 1', books: ['Jeremiah 1-9', 'Lamentations'] },
  { workId: 'calvin/calcom18', title: 'Commentary on Jeremiah and Lamentations - Volume 2', books: ['Jeremiah 10-19', 'Lamentations'] },
  { workId: 'calvin/calcom19', title: 'Commentary on Jeremiah and Lamentations - Volume 3', books: ['Jeremiah 20-29', 'Lamentations'] },
  { workId: 'calvin/calcom20', title: 'Commentary on Jeremiah and Lamentations - Volume 4', books: ['Jeremiah 30-47', 'Lamentations'] },
  { workId: 'calvin/calcom21', title: 'Commentary on Jeremiah and Lamentations - Volume 5', books: ['Jeremiah 48-52', 'Lamentations'] },
  { workId: 'calvin/calcom22', title: 'Commentary on Ezekiel - Volume 1', books: ['Ezekiel 1-12'] },
  { workId: 'calvin/calcom23', title: 'Commentary on Ezekiel - Volume 2', books: ['Ezekiel 13-20'] },
  { workId: 'calvin/calcom24', title: 'Commentary on Daniel - Volume 1', books: ['Daniel 1-6'] },
  { workId: 'calvin/calcom25', title: 'Commentary on Daniel - Volume 2', books: ['Daniel 7-12'] },
  { workId: 'calvin/calcom26', title: 'Commentary on Hosea', books: ['Hosea'] },
  { workId: 'calvin/calcom27', title: 'Commentary on Joel, Amos, Obadiah', books: ['Joel', 'Amos', 'Obadiah'] },
  { workId: 'calvin/calcom28', title: 'Commentary on Jonah, Micah, Nahum', books: ['Jonah', 'Micah', 'Nahum'] },
  { workId: 'calvin/calcom29', title: 'Commentary on Habakkuk, Zephaniah, Haggai', books: ['Habakkuk', 'Zephaniah', 'Haggai'] },
  { workId: 'calvin/calcom30', title: 'Commentary on Zechariah, Malachi', books: ['Zechariah', 'Malachi'] },
  { workId: 'calvin/calcom31', title: 'Harmony of the Gospels - Volume 1', books: ['Matthew', 'Mark', 'Luke'] },
  { workId: 'calvin/calcom32', title: 'Harmony of the Gospels - Volume 2', books: ['Matthew', 'Mark', 'Luke'] },
  { workId: 'calvin/calcom33', title: 'Harmony of the Gospels - Volume 3', books: ['Matthew', 'Mark', 'Luke'] },
  { workId: 'calvin/calcom34', title: 'Commentary on John - Volume 1', books: ['John 1-11'] },
  { workId: 'calvin/calcom35', title: 'Commentary on John - Volume 2', books: ['John 12-21'] },
  { workId: 'calvin/calcom36', title: 'Commentary on Acts - Volume 1', books: ['Acts 1-13'] },
  { workId: 'calvin/calcom37', title: 'Commentary on Acts - Volume 2', books: ['Acts 14-28'] },
  { workId: 'calvin/calcom38', title: 'Commentary on Romans', books: ['Romans'] },
  { workId: 'calvin/calcom39', title: 'Commentary on Corinthians - Volume 1', books: ['1 Corinthians 1-14'] },
  { workId: 'calvin/calcom40', title: 'Commentary on Corinthians - Volume 2', books: ['1 Corinthians 15-16', '2 Corinthians'] },
  { workId: 'calvin/calcom41', title: 'Commentary on Galatians, Ephesians', books: ['Galatians', 'Ephesians'] },
  { workId: 'calvin/calcom42', title: 'Commentary on Philippians, Colossians, Thessalonians', books: ['Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians'] },
  { workId: 'calvin/calcom43', title: 'Commentary on Timothy, Titus, Philemon', books: ['1 Timothy', '2 Timothy', 'Titus', 'Philemon'] },
  { workId: 'calvin/calcom44', title: 'Commentary on Hebrews', books: ['Hebrews'] },
  { workId: 'calvin/calcom45', title: 'Commentary on Catholic Epistles', books: ['James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'] },
];

/**
 * Find the correct Calvin commentary volume for a Bible book or reference
 *
 * @param query - Bible book name or reference (e.g., "1 Timothy", "Genesis 1:1", "Romans")
 * @returns Matching commentary volume or null
 *
 * @example
 * ```typescript
 * findCalvinCommentaryVolume("1 Timothy 2:14") // Returns calvin/calcom43
 * findCalvinCommentaryVolume("Genesis")        // Returns calvin/calcom01
 * findCalvinCommentaryVolume("Psalms 23")      // Returns calvin/calcom08
 * ```
 */
export function findCalvinCommentaryVolume(query: string): CommentaryVolumeMapping | null {
  const queryLower = query.toLowerCase().trim();

  // Try to extract Bible book from the query
  const book = extractBibleBook(queryLower);
  if (!book) {
    return null;
  }

  // Find matching volume
  const bookLower = book.toLowerCase();

  for (const volume of CALVIN_COMMENTARY_VOLUMES) {
    // Check if any book in this volume matches
    const matches = volume.books.some(b => {
      const volumeBook = b.toLowerCase();

      // Exact match (e.g., "genesis" === "genesis")
      if (volumeBook === bookLower) {
        return true;
      }

      // Volume book starts with the query book (e.g., "1 Timothy" starts with "1 timothy")
      if (volumeBook.startsWith(bookLower)) {
        return true;
      }

      // Volume book contains the query book as a complete word
      // (e.g., "Psalms 1-35" contains "psalms")
      const volumeWords = volumeBook.split(/[\s-]+/);
      const bookWords = bookLower.split(/[\s-]+/);

      // All words from the book query must appear in the volume book
      return bookWords.every(word => volumeWords.includes(word));
    });

    if (matches) {
      return volume;
    }
  }

  return null;
}

/**
 * Extract Bible book name from a query string
 */
function extractBibleBook(query: string): string | null {
  // Try numbered books first (1 Timothy, 2 Corinthians, etc.)
  const numberedMatch = query.match(/\b(1|2|3)\s*(timothy|tim|thessalonians|thess|corinthians|cor|peter|pet|john|jn|kings|kgs|samuel|sam|chronicles|chr)\b/i);
  if (numberedMatch) {
    return `${numberedMatch[1]} ${numberedMatch[2]}`;
  }

  // Try full book names
  const fullMatch = query.match(/\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|song|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation)\b/i);
  if (fullMatch) {
    return fullMatch[1];
  }

  // Try abbreviations
  const abbrevMatch = query.match(/\b(gen|exod|lev|num|deut|josh|judg|ruth|sam|kgs|chr|ezra|neh|esth|ps|prov|eccl|isa|jer|lam|ezek|dan|hos|joel|amos|obad|jon|mic|nah|hab|zeph|hag|zech|mal|matt|mk|lk|jn|rom|cor|gal|eph|phil|col|thess|tim|tit|phlm|heb|jas|pet|rev)\b/i);
  if (abbrevMatch) {
    return abbrevMatch[1];
  }

  return null;
}

/**
 * Check if a work ID is a meta-work that should be routed to a specific volume
 */
export function isCalvinMetaCommentary(workId: string): boolean {
  return workId === 'calvin/commentaries' || workId === 'calvin/calcom';
}
